use std::sync::Arc;

use teloxide::prelude::*;
use teloxide::types::{ForceReply, MessageId};

use crate::app::{AppState, LinkAuditTarget};
use crate::config::OWNER_ID;

pub type HandlerResult = Result<(), Box<dyn std::error::Error + Send + Sync>>;

pub fn append_result(original: &str, suffix: &str) -> String {
    format!("{original}\n\n{suffix}").trim().to_string()
}

async fn edit_with_result(bot: &Bot, chat_id: ChatId, message_id: MessageId, is_photo: bool, text: String) {
    let edited = if is_photo {
        bot.edit_message_caption(chat_id, message_id).caption(text).await.map(|_| ())
    } else {
        bot.edit_message_text(chat_id, message_id, text).await.map(|_| ())
    };
    if let Err(err) = edited {
        tracing::error!("link-audit: edit message failed: {err}");
    }
    let _ = bot.edit_message_reply_markup(chat_id, message_id).await;
}

pub async fn on_callback(bot: Bot, q: CallbackQuery, state: Arc<AppState>) -> HandlerResult {
    let Some(data) = q.data.as_deref() else { return Ok(()) };
    let (action, link_id) = if let Some(id) = data.strip_prefix("link:pass:") {
        ("pass", id.to_string())
    } else if let Some(id) = data.strip_prefix("link:reject:") {
        ("reject", id.to_string())
    } else {
        return Ok(());
    };

    if q.from.id.0 as i64 != OWNER_ID {
        bot.answer_callback_query(q.id.clone()).text("仅主人可操作").show_alert(true).await?;
        return Ok(());
    }

    let Some(message) = q.regular_message() else {
        bot.answer_callback_query(q.id.clone()).text("消息已失效").show_alert(true).await?;
        return Ok(());
    };
    let is_photo = message.photo().is_some();
    let caption = message.caption().or(message.text()).unwrap_or_default().to_string();

    if action == "pass" {
        match state.mx.link_audit_pass(&link_id).await {
            Ok(()) => {
                bot.answer_callback_query(q.id.clone()).text("已通过").await?;
                edit_with_result(&bot, message.chat.id, message.id, is_photo, append_result(&caption, "✅ 已通过")).await;
            }
            Err(err) => {
                tracing::error!("link-audit: pass failed: {err}");
                bot.answer_callback_query(q.id.clone())
                    .text(format!("失败：{err}"))
                    .show_alert(true)
                    .await?;
            }
        }
        return Ok(());
    }

    let _ = bot.edit_message_reply_markup(message.chat.id, message.id).await;
    let prompt = bot
        .send_message(message.chat.id, "请回复此消息写拒绝理由")
        .reply_markup(ForceReply::new())
        .await?;
    state.link_audit.insert(
        (prompt.chat.id.0, prompt.id.0),
        LinkAuditTarget {
            link_id,
            chat_id: message.chat.id.0,
            message_id: message.id.0,
            is_photo,
            caption,
        },
    );
    bot.answer_callback_query(q.id.clone()).text("请回复理由").await?;
    Ok(())
}

pub async fn reject_with_reason(state: &AppState, target: &LinkAuditTarget, reason: &str) -> Result<(), String> {
    state
        .mx
        .link_audit_reject(&target.link_id, reason)
        .await
        .map_err(|err| err.to_string())?;
    edit_with_result(
        &state.bot,
        ChatId(target.chat_id),
        MessageId(target.message_id),
        target.is_photo,
        append_result(&target.caption, &format!("❌ 已拒绝：{reason}")),
    )
    .await;
    Ok(())
}
