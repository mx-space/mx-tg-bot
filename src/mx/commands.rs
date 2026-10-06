use std::sync::Arc;

use chrono::{DateTime, Utc};
use teloxide::dispatching::UpdateHandler;
use teloxide::prelude::*;
use teloxide::types::{BotCommand, ParseMode, ReplyParameters};
use teloxide::utils::command::BotCommands;

use crate::app::AppState;
use crate::config::OWNER_ID;
use crate::mx::api::{CategoryRef, Doc, Stat, build_url};
use crate::mx::link_audit::{self, HandlerResult, reject_with_reason};
use crate::rich_text::{escape_html, escape_markdown_v2, strip_markdown};
use crate::time::relative_time_from_now;

pub const DETAIL_USAGE: &str = "Usage: /mx_get_detail <type> [offset=1]\n\nType: post, note";

const MX_COMMANDS: [(&str, &str); 4] = [
    ("mx_get_detail", "获取 Post 或 Note 详情"),
    ("mx_get_notes", "获取最新的 Note 列表"),
    ("mx_get_posts", "获取最新的 Post 列表"),
    ("mx_stat", "获取 MX Space 统计信息"),
];

#[derive(BotCommands, Clone, Debug)]
#[command(rename_rule = "snake_case")]
pub enum Command {
    Start,
    Help,
    MxGetDetail(String),
    MxGetNotes(String),
    MxGetPosts(String),
    MxStat,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DetailKind {
    Post,
    Note,
}

pub fn parse_detail_args(args: &str) -> Result<(DetailKind, u32), String> {
    let mut parts = args.split_whitespace();
    let kind = match parts.next() {
        None => return Err(DETAIL_USAGE.to_string()),
        Some("post") => DetailKind::Post,
        Some("note") => DetailKind::Note,
        Some(_) => return Err("type must be one of: post, note".to_string()),
    };
    let offset = match parts.next() {
        None => 1,
        Some(raw) => raw
            .parse::<u32>()
            .ok()
            .filter(|n| *n >= 1)
            .ok_or_else(|| "offset must be a positive integer".to_string())?,
    };
    Ok((kind, offset))
}

pub fn detail_markup(doc: &Doc, url: &str) -> String {
    let title = escape_markdown_v2(doc.title.as_deref().unwrap_or_default());
    let body = escape_markdown_v2(&strip_markdown(doc.text.as_deref().unwrap_or_default()))
        .split("\n\n")
        .take(3)
        .collect::<Vec<_>>()
        .join("\n\n");
    format!(
        "[{title}]({url})\n\n{body}\n\n[阅读全文]({})",
        escape_markdown_v2(url)
    )
}

fn list_markup(docs: &[Doc], now: DateTime<Utc>, url: impl Fn(&Doc) -> String) -> String {
    let lines = docs
        .iter()
        .map(|d| {
            let ago = d
                .created_at
                .map(|c| relative_time_from_now(c, now))
                .unwrap_or_default();
            let title = escape_markdown_v2(d.title.as_deref().unwrap_or_default());
            format!("{ago}前\n[{title}]({})", url(d))
        })
        .collect::<Vec<_>>()
        .join("\n");
    format!("*文章列表*\n\n{lines}")
}

pub fn note_list_markup(notes: &[Doc], web_url: &str, now: DateTime<Utc>) -> String {
    list_markup(notes, now, |n| {
        format!("{web_url}/notes/{}", n.nid.unwrap_or_default())
    })
}

pub fn post_list_markup(posts: &[Doc], web_url: &str, now: DateTime<Utc>) -> String {
    list_markup(posts, now, |p| {
        let category = p
            .category
            .as_ref()
            .and_then(CategoryRef::slug)
            .unwrap_or_default();
        format!(
            "{web_url}/posts/{category}/{}",
            p.slug.as_deref().unwrap_or_default()
        )
    })
}

pub fn stat_text(stat: &Stat) -> String {
    format!(
        "MX Space 统计信息\n\n文章数：{}\n说说数：{}\n友链申请数：{}\n评论数：{}\n今日访问量：{}\n在线总数：{}\n调用次数：{}",
        stat.posts,
        stat.notes,
        stat.link_apply,
        stat.comments,
        stat.today_ip_access_count,
        stat.online,
        stat.call_time
    )
}

pub fn help_html(bot_name: &str) -> String {
    let commands = MX_COMMANDS
        .iter()
        .map(|(cmd, desc)| format!("/{cmd} - {desc}"))
        .collect::<Vec<_>>()
        .join("\n");
    format!(
        "<b>{}の使用方法</b>\n\n<b>mx_space</b>\n{commands}",
        escape_html(bot_name)
    )
}

pub fn welcome_text(identifier: &str, hitokoto: Option<&str>) -> String {
    escape_markdown_v2(&format!(
        "欢迎新大佬 {identifier} \n\n{}",
        hitokoto.unwrap_or_default()
    ))
}

pub fn bot_commands() -> Vec<BotCommand> {
    std::iter::once(BotCommand::new("help", "Get help"))
        .chain(
            MX_COMMANDS
                .iter()
                .map(|(cmd, desc)| BotCommand::new(*cmd, *desc)),
        )
        .collect()
}

fn page_arg(args: &str) -> u32 {
    args.trim().parse().ok().filter(|n| *n >= 1).unwrap_or(1)
}

async fn command_reply(state: &AppState, cmd: Command) -> Result<Option<String>, String> {
    let now = Utc::now();
    let mx = &state.mx;
    let to_string = |e: crate::mx::api::ApiError| e.to_string();
    Ok(match cmd {
        Command::Start | Command::Help => None,
        Command::MxGetDetail(args) => {
            let (kind, offset) = match parse_detail_args(&args) {
                Ok(parsed) => parsed,
                Err(usage) => return Ok(Some(escape_markdown_v2(&usage))),
            };
            let docs = match kind {
                DetailKind::Post => mx.posts(offset, 1).await,
                DetailKind::Note => mx.notes(offset, 1).await,
            }
            .map_err(to_string)?;
            let Some(doc) = docs.first() else {
                return Ok(None);
            };
            let web_url = mx.aggregate().await.map_err(to_string)?.url.web_url;
            let url = build_url(&web_url, doc).unwrap_or(web_url);
            Some(detail_markup(doc, &url))
        }
        Command::MxGetNotes(args) => {
            let notes = mx.notes(page_arg(&args), 10).await.map_err(to_string)?;
            let web_url = mx.aggregate().await.map_err(to_string)?.url.web_url;
            Some(note_list_markup(&notes, &web_url, now))
        }
        Command::MxGetPosts(args) => {
            let posts = mx.posts(page_arg(&args), 10).await.map_err(to_string)?;
            let web_url = mx.aggregate().await.map_err(to_string)?.url.web_url;
            Some(post_list_markup(&posts, &web_url, now))
        }
        Command::MxStat => Some(escape_markdown_v2(&stat_text(
            &mx.stat().await.map_err(to_string)?,
        ))),
    })
}

async fn on_command(bot: Bot, msg: Message, cmd: Command, state: Arc<AppState>) -> HandlerResult {
    match cmd {
        Command::Start => {
            bot.send_message(msg.chat.id, "Hi").await?;
        }
        Command::Help => {
            let me = bot.get_me().await?;
            bot.send_message(msg.chat.id, help_html(&me.first_name))
                .parse_mode(ParseMode::Html)
                .await?;
        }
        cmd => match command_reply(&state, cmd).await {
            Ok(Some(text)) if !text.is_empty() => {
                if let Err(err) = bot
                    .send_message(msg.chat.id, &text)
                    .parse_mode(ParseMode::MarkdownV2)
                    .await
                {
                    tracing::warn!("failed to send message, content:\n{text}\n{err}");
                }
            }
            Ok(_) => {}
            Err(err) => {
                bot.send_message(msg.chat.id, err)
                    .reply_parameters(ReplyParameters::new(msg.id))
                    .await?;
            }
        },
    }
    Ok(())
}

async fn on_new_members(bot: Bot, msg: Message, state: Arc<AppState>) -> HandlerResult {
    let Some(from) = msg.from.as_ref() else {
        return Ok(());
    };
    let identifier = match &from.username {
        Some(username) => format!("@{username}"),
        None => format!("{}({})", from.first_name, from.id),
    };
    let hitokoto = state.mx.hitokoto().await;
    bot.send_message(msg.chat.id, welcome_text(&identifier, hitokoto.as_deref()))
        .parse_mode(ParseMode::MarkdownV2)
        .reply_parameters(ReplyParameters::new(msg.id))
        .await?;
    Ok(())
}

async fn on_owner_text(bot: Bot, msg: Message, state: Arc<AppState>) -> HandlerResult {
    let (Some(text), Some(reply_to)) = (msg.text(), msg.reply_to_message()) else {
        return Ok(());
    };
    let key = (msg.chat.id.0, reply_to.id.0);

    if let Some(target) = state.link_audit.consume(key) {
        let reply = match reject_with_reason(&state, &target, text).await {
            Ok(()) => "已拒绝并告知申请人。".to_string(),
            Err(err) => format!("拒绝失败！{err}"),
        };
        bot.send_message(msg.chat.id, reply).await?;
        return Ok(());
    }

    let Some(comment_id) = state.comment_reply.get(key) else {
        return Ok(());
    };
    let reply = match state.mx.owner_reply(&comment_id, text).await {
        Ok(()) => "回复成功！".to_string(),
        Err(err) => format!("回复失败！{err}"),
    };
    bot.send_message(msg.chat.id, reply).await?;
    Ok(())
}

pub fn handler() -> UpdateHandler<Box<dyn std::error::Error + Send + Sync + 'static>> {
    let commands = Update::filter_message()
        .filter_command::<Command>()
        .endpoint(on_command);
    let new_members = Update::filter_message()
        .filter(|m: Message| m.new_chat_members().is_some())
        .endpoint(on_new_members);
    let owner_text = Update::filter_message()
        .filter(|m: Message| m.chat.id.0 == OWNER_ID && m.text().is_some())
        .endpoint(on_owner_text);
    let callbacks = Update::filter_callback_query().endpoint(link_audit::on_callback);

    dptree::entry()
        .branch(commands)
        .branch(new_members)
        .branch(owner_text)
        .branch(callbacks)
}
