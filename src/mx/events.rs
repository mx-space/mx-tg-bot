use std::sync::Arc;

use chrono::{DateTime, Utc};
use serde::de::DeserializeOwned;
use serde::Deserialize;
use serde_json::Value;

use crate::app::AppState;
use crate::config::{MX_WATCH_CHANNEL_ID, MX_WATCH_GROUP_IDS, OWNER_ID};
use crate::mx::api::{build_url, Aggregate, Doc};
use crate::rich_text::{
    escape_html, md, md_to_tg_html, strip_markdown, take_utf16, truncate_with_ellipsis, utf16_len,
    MD_DEFAULT_MAX, TG_CAPTION_MAX, TG_TEXT_MAX,
};
use crate::tg::{self, Button, Message};
use crate::time::relative_time_from_now;

const LINK_STATE_AUDIT: u8 = 1;
const NOTE_PREVIEW_MAX: usize = 200;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Source {
    Admin,
    Visitor,
    System,
}

impl Source {
    pub fn from_header(value: Option<&str>) -> Self {
        match value {
            Some("admin") => Self::Admin,
            Some("visitor") => Self::Visitor,
            _ => Self::System,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct Image {
    pub src: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotePayload {
    #[serde(flatten)]
    pub doc: Doc,
    pub mood: Option<String>,
    pub weather: Option<String>,
    pub images: Option<Vec<Image>>,
    #[serde(default)]
    pub has_password: bool,
    pub public_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct LinkPayload {
    #[serde(alias = "_id")]
    pub id: Option<String>,
    pub name: String,
    pub url: String,
    pub avatar: Option<String>,
    pub description: Option<String>,
    pub state: u8,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommentPayload {
    pub id: String,
    pub ref_id: Option<String>,
    pub ref_type: Option<String>,
    pub author: Option<String>,
    pub text: String,
    pub parent_comment_id: Option<String>,
    #[serde(default)]
    pub is_whispers: bool,
}

#[derive(Debug, Deserialize)]
pub struct SayPayload {
    pub text: String,
    pub source: Option<String>,
    pub author: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct Enrichment {
    pub title: Option<String>,
    pub category: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RecentlyPayload {
    pub content: Option<String>,
    pub enrichments: Option<serde_json::Map<String, Value>>,
}

fn enrichment_entries(map: &serde_json::Map<String, Value>) -> impl Iterator<Item = (&String, Enrichment)> {
    map.iter()
        .filter_map(|(k, v)| serde_json::from_value::<Enrichment>(v.clone()).ok().map(|e| (k, e)))
}

#[derive(Debug, Deserialize)]
pub struct LikeRef {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Deserialize)]
pub struct Reader {
    pub name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ActivityLikePayload {
    #[serde(rename = "ref")]
    pub reference: LikeRef,
    pub reader: Option<Reader>,
}

#[derive(Debug, PartialEq)]
pub struct LinkApplyOut {
    pub group: Message,
    pub owner: Option<Message>,
}

#[derive(Debug, PartialEq)]
pub struct CommentOut {
    pub group: Option<Message>,
    pub owner: Option<Message>,
}

fn post_message(owner: &str, verb: &str, post: &Doc, web_url: &str) -> Option<Message> {
    post.category.as_ref()?;
    let url = build_url(web_url, post)?;
    let title = post.title.as_deref().unwrap_or_default();
    let summary = post
        .summary
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|s| format!("{s}\n\n"))
        .unwrap_or_default();
    Some(Message::text(format!("{owner} {verb}: {title}\n\n{summary}\n前往阅读：{url}")))
}

pub fn post_create(owner: &str, post: &Doc, web_url: &str) -> Option<Message> {
    post_message(owner, "发布了新文章", post, web_url)
}

pub fn post_update(owner: &str, post: &Doc, web_url: &str, now: DateTime<Utc>) -> Option<Message> {
    let days = post.created_at.map(|c| (now - c).num_days()).unwrap_or(0);
    if days < 90 {
        return None;
    }
    post_message(owner, "更新了文章", post, web_url)
}

pub fn note_create(owner: &str, note: &NotePayload, web_url: &str, now: DateTime<Utc>) -> Option<Message> {
    if note.has_password || note.public_at.is_some_and(|at| at > now) {
        return None;
    }
    let raw = strip_markdown(note.doc.text.as_deref().unwrap_or_default());
    let preview = if utf16_len(&raw) > NOTE_PREVIEW_MAX {
        format!("{}...", take_utf16(&raw, NOTE_PREVIEW_MAX))
    } else {
        raw
    };
    let status = [
        note.mood.as_deref().filter(|m| !m.is_empty()).map(|m| format!("心情: {m}")),
        note.weather.as_deref().filter(|w| !w.is_empty()).map(|w| format!("天气: {w}")),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join("\t");
    let status = if status.is_empty() { "\n".to_string() } else { format!("\n{status}\n\n") };
    let title = note.doc.title.as_deref().unwrap_or_default();
    let url = build_url(web_url, &note.doc).unwrap_or_default();
    let message = format!("{owner} 发布了新生活观察日记: {title}\n{status}{preview}\n\n前往阅读：{url}");

    let images: Vec<String> = note
        .images
        .iter()
        .flatten()
        .filter_map(|i| i.src.clone().filter(|s| !s.is_empty()))
        .collect();
    if images.is_empty() {
        return Some(Message::text(message));
    }
    Some(Message::photos(images, truncate_with_ellipsis(&message, TG_CAPTION_MAX), false))
}

pub fn link_apply(link: &LinkPayload) -> Option<LinkApplyOut> {
    if link.state != LINK_STATE_AUDIT {
        return None;
    }
    let description = link.description.as_deref().unwrap_or_default();
    let head = format!("有新的友链申请了耶！\n{}\n{}\n\n", escape_html(&link.name), escape_html(&link.url));
    let base = match link.avatar.as_deref().filter(|a| !a.is_empty()) {
        Some(avatar) => {
            let caption = format!("{head}{}", md(description, 800));
            Message::photos(vec![avatar.to_string()], truncate_with_ellipsis(&caption, TG_CAPTION_MAX), true)
        }
        None => {
            let text = format!("{head}{}", md(description, MD_DEFAULT_MAX));
            Message::html(truncate_with_ellipsis(&text, TG_TEXT_MAX))
        }
    };
    let owner = link.id.as_ref().map(|id| {
        base.clone()
            .button(Button::Callback("✅ 通过".into(), format!("link:pass:{id}")))
            .button(Button::Callback("❌ 拒绝".into(), format!("link:reject:{id}")))
    });
    Some(LinkApplyOut { group: base, owner })
}

pub fn comment_create(
    comment: &CommentPayload,
    ref_doc: &Doc,
    aggregate: &Aggregate,
    source: Source,
    now: DateTime<Utc>,
) -> CommentOut {
    let author = comment.author.as_deref().unwrap_or_default();
    let owner = &aggregate.user;
    let is_master = author == owner.name || Some(author) == owner.username.as_deref();
    let title = escape_html(ref_doc.title.as_deref().unwrap_or_default());
    let author_html = escape_html(author);
    let text = md(&comment.text, MD_DEFAULT_MAX);
    let html = if is_master && comment.parent_comment_id.is_none() {
        let ago = ref_doc
            .created_at
            .map(|c| relative_time_from_now(c, now))
            .unwrap_or_default();
        format!("{author_html} 在「{title}」发表之后的 {ago}又说：{text}")
    } else {
        format!("{author_html} 在「{title}」发表了评论：{text}")
    };
    let mut message = Message::html(truncate_with_ellipsis(&html, TG_TEXT_MAX));
    if let Some(url) = build_url(&aggregate.url.web_url, ref_doc) {
        message = message.button(Button::Url("查看".into(), url));
    }

    match source {
        Source::Admin => CommentOut { group: None, owner: Some(message) },
        _ if comment.is_whispers => CommentOut {
            group: Some(Message::text(format!(
                "「{}」嘘，有人说了一句悄悄话。是什么呢",
                aggregate.seo.title
            ))),
            owner: Some(message),
        },
        _ => CommentOut { group: Some(message), owner: None },
    }
}

pub fn say_create(owner: &str, say: &SayPayload) -> Message {
    let from = [say.source.as_deref(), say.author.as_deref()]
        .into_iter()
        .flatten()
        .find(|s| !s.is_empty())
        .map(|s| format!("来自: {s}"))
        .unwrap_or_default();
    Message::text(format!("{owner} 发布一条说说：\n{}\n{from}", say.text))
}

fn category_phrase(category: &str) -> Option<(&'static str, &'static str, &'static str)> {
    Some(match category {
        "media" => ("看了", "《", "》"),
        "music" => ("在听", "「", "」"),
        "book" => ("在读", "《", "》"),
        "academic" => ("读了论文", "《", "》"),
        "code" => ("刷了道题", " ", ""),
        "github" => ("分享了", " ", ""),
        _ => return None,
    })
}

pub fn recently_create(owner: &str, recently: &RecentlyPayload) -> Message {
    let content = recently.content.as_deref().unwrap_or_default();
    let picked = recently.enrichments.as_ref().and_then(|map| {
        enrichment_entries(map)
            .filter_map(|(url, e)| {
                let phrase = category_phrase(e.category.as_deref()?)?;
                let title = e.title.filter(|t| !t.is_empty())?;
                let pos = content.find(url.as_str()).unwrap_or(usize::MAX);
                Some((pos, url.clone(), title, phrase))
            })
            .min_by_key(|(pos, ..)| *pos)
    });

    let Some((_, url, title, (verb, open, close))) = picked else {
        return Message::text(format!("{owner} 发布一条动态说：\n{content}"));
    };
    let link = format!("<a href=\"{}\">{}</a>", escape_html(&url), escape_html(&title));
    let rest = md_to_tg_html(content.replacen(&url, "", 1).trim());
    let rest = if rest.is_empty() { rest } else { format!("\n\n{rest}") };
    Message::html(format!("{} {verb}{open}{link}{close}{rest}", escape_html(owner)))
}

pub fn activity_like(like: &ActivityLikePayload, url: Option<String>) -> Message {
    let title = &like.reference.title;
    let reader = like.reader.as_ref().and_then(|r| r.name.as_deref());
    let text = match reader {
        Some(name) => format!("{name} 点赞了「{title}」\n"),
        None => format!("「{title}」有人点赞了哦！\n"),
    };
    let message = Message::text(text);
    match url {
        Some(url) => message.button(Button::Url("查看".into(), url)),
        None => message,
    }
}

fn decode<T: DeserializeOwned>(event: &str, payload: Value) -> Option<T> {
    serde_json::from_value(payload)
        .map_err(|err| tracing::error!("{event}: bad payload: {err}"))
        .ok()
}

async fn resolve_ref(state: &AppState, comment: &CommentPayload) -> Option<Doc> {
    let id = comment.ref_id.as_deref()?;
    let result = match comment.ref_type.as_deref()? {
        "post" => state.mx.post(id).await,
        "note" => state.mx.note(id).await,
        "page" => state.mx.page(id).await,
        _ => return None,
    };
    result.map_err(|err| tracing::error!("comment ref {id}: {err}")).ok()
}

async fn aggregate(state: &AppState) -> Option<Aggregate> {
    state
        .mx
        .aggregate()
        .await
        .map_err(|err| tracing::error!("aggregate: {err}"))
        .ok()
}

async fn send_owner(state: &AppState, msg: &Message) -> Option<i32> {
    tg::send(&state.bot, OWNER_ID, msg)
        .await
        .map_err(|err| tracing::error!("send to owner failed: {err}"))
        .ok()
        .map(|id| id.0)
}

pub async fn dispatch(state: Arc<AppState>, event: String, payload: Value, source: Source) {
    tracing::info!("mx event {event} source={source:?}");
    let groups = &MX_WATCH_GROUP_IDS;
    let now = Utc::now();
    match event.as_str() {
        "post.create" | "post.update" => {
            let (Some(post), Some(agg)) = (decode::<Doc>(&event, payload), aggregate(&state).await) else {
                return;
            };
            let msg = if event == "post.create" {
                post_create(&agg.user.name, &post, &agg.url.web_url)
            } else {
                post_update(&agg.user.name, &post, &agg.url.web_url, now)
            };
            match msg {
                Some(msg) => tg::send_all(&state.bot, groups, &msg).await,
                None if post.category.is_none() => tracing::error!("category not found, post id: {}", post.id),
                None => {}
            }
        }
        "note.create" => {
            let (Some(note), Some(agg)) = (decode::<NotePayload>(&event, payload), aggregate(&state).await) else {
                return;
            };
            if let Some(msg) = note_create(&agg.user.name, &note, &agg.url.web_url, now) {
                tg::send_all(&state.bot, groups, &msg).await;
            }
        }
        "link.apply" => {
            let Some(link) = decode::<LinkPayload>(&event, payload) else { return };
            let Some(out) = link_apply(&link) else { return };
            tg::send_all(&state.bot, groups, &out.group).await;
            match out.owner {
                Some(owner) => {
                    send_owner(&state, &owner).await;
                }
                None => tracing::error!("link.apply: missing link id in payload"),
            }
        }
        "comment.create" => {
            let Some(comment) = decode::<CommentPayload>(&event, payload) else { return };
            let Some(agg) = aggregate(&state).await else { return };
            let Some(ref_doc) = resolve_ref(&state, &comment).await else {
                tracing::error!("comment: ref model not found, refId: {:?}", comment.ref_id);
                return;
            };
            let out = comment_create(&comment, &ref_doc, &agg, source, now);
            if let Some(group) = out.group {
                tg::send_all(&state.bot, groups, &group).await;
            }
            if let Some(owner) = out.owner
                && let Some(message_id) = send_owner(&state, &owner).await
            {
                state.comment_reply.insert((OWNER_ID, message_id), comment.id.clone());
            }
        }
        "say.create" => {
            let (Some(say), Some(agg)) = (decode::<SayPayload>(&event, payload), aggregate(&state).await) else {
                return;
            };
            tg::send_all(&state.bot, groups, &say_create(&agg.user.name, &say)).await;
        }
        "recently.create" => {
            let (Some(recently), Some(agg)) =
                (decode::<RecentlyPayload>(&event, payload), aggregate(&state).await)
            else {
                return;
            };
            tg::send_all(&state.bot, groups, &recently_create(&agg.user.name, &recently)).await;
        }
        "activity.like" => {
            let Some(like) = decode::<ActivityLikePayload>(&event, payload) else { return };
            let url = state
                .mx
                .url_builder(&like.reference.id)
                .await
                .map_err(|err| tracing::error!("url-builder: {err}"))
                .ok()
                .flatten();
            tg::send_all(&state.bot, &[MX_WATCH_CHANNEL_ID], &activity_like(&like, url)).await;
        }
        _ => tracing::debug!("mx event {event} ignored"),
    }
}
