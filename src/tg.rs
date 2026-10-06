use teloxide::{ApiError, RequestError};

use crate::rich_text::{TG_TEXT_MAX, truncate_with_ellipsis};
use teloxide::prelude::*;
use teloxide::types::{
    InlineKeyboardButton, InlineKeyboardMarkup, InputFile, InputMedia, InputMediaPhoto, MessageId,
    ParseMode,
};

#[derive(Debug, Clone, PartialEq)]
pub enum Body {
    Text(String),
    Html(String),
    MarkdownV2(String),
    Photos {
        urls: Vec<String>,
        caption: String,
        html: bool,
    },
}

#[derive(Debug, Clone, PartialEq)]
pub enum Button {
    Url(String, String),
    Callback(String, String),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Message {
    pub body: Body,
    pub buttons: Vec<Button>,
}

impl Message {
    pub fn text(content: impl Into<String>) -> Self {
        Self {
            body: Body::Text(content.into()),
            buttons: Vec::new(),
        }
    }

    pub fn html(content: impl Into<String>) -> Self {
        Self {
            body: Body::Html(content.into()),
            buttons: Vec::new(),
        }
    }

    pub fn photos(urls: Vec<String>, caption: impl Into<String>, html: bool) -> Self {
        Self {
            body: Body::Photos {
                urls,
                caption: caption.into(),
                html,
            },
            buttons: Vec::new(),
        }
    }

    pub fn button(mut self, button: Button) -> Self {
        self.buttons.push(button);
        self
    }
}

fn keyboard(buttons: &[Button]) -> Option<InlineKeyboardMarkup> {
    let row: Vec<_> = buttons
        .iter()
        .filter_map(|b| match b {
            Button::Url(label, url) => url
                .parse()
                .ok()
                .map(|u| InlineKeyboardButton::url(label.clone(), u)),
            Button::Callback(label, data) => {
                Some(InlineKeyboardButton::callback(label.clone(), data.clone()))
            }
        })
        .collect();
    (!row.is_empty()).then(|| InlineKeyboardMarkup::new(vec![row]))
}

fn photo_input(url: &str) -> InputFile {
    match url.parse() {
        Ok(u) => InputFile::url(u),
        Err(_) => InputFile::file_id(url.to_string().into()),
    }
}

const MEDIA_GROUP_MAX: usize = 10;

impl Message {
    fn fallback(&self, err: &RequestError) -> Option<Message> {
        let body = match (&self.body, err) {
            (
                Body::Photos {
                    caption,
                    html: true,
                    ..
                },
                RequestError::Api(_),
            ) => Body::Html(caption.clone()),
            (Body::Photos { caption, .. }, RequestError::Api(_)) => Body::Text(caption.clone()),
            (
                Body::Html(text) | Body::MarkdownV2(text),
                RequestError::Api(ApiError::CantParseEntities(_)),
            ) => Body::Text(text.clone()),
            _ => return None,
        };
        Some(Message {
            body,
            buttons: self.buttons.clone(),
        })
    }
}

pub async fn send(bot: &Bot, chat_id: i64, msg: &Message) -> Result<MessageId, RequestError> {
    let mut current = msg.clone();
    loop {
        match send_once(bot, chat_id, &current).await {
            Err(err) => match current.fallback(&err) {
                Some(next) => {
                    tracing::warn!("send to {chat_id} failed ({err}), retrying with fallback");
                    current = next;
                }
                None => return Err(err),
            },
            ok => return ok,
        }
    }
}

async fn send_once(bot: &Bot, chat_id: i64, msg: &Message) -> Result<MessageId, RequestError> {
    let chat = ChatId(chat_id);
    let markup = keyboard(&msg.buttons);
    let sent = match &msg.body {
        Body::Text(text) | Body::Html(text) | Body::MarkdownV2(text) => {
            let mut req = match &msg.body {
                Body::Text(_) => bot.send_message(chat, truncate_with_ellipsis(text, TG_TEXT_MAX)),
                _ => bot.send_message(chat, text),
            };
            req = match &msg.body {
                Body::Html(_) => req.parse_mode(ParseMode::Html),
                Body::MarkdownV2(_) => req.parse_mode(ParseMode::MarkdownV2),
                _ => req,
            };
            if let Some(markup) = markup {
                req = req.reply_markup(markup);
            }
            req.await?.id
        }
        Body::Photos {
            urls,
            caption,
            html,
        } if urls.len() == 1 || markup.is_some() => {
            let mut req = bot.send_photo(chat, photo_input(&urls[0])).caption(caption);
            if *html {
                req = req.parse_mode(ParseMode::Html);
            }
            if let Some(markup) = markup {
                req = req.reply_markup(markup);
            }
            req.await?.id
        }
        Body::Photos {
            urls,
            caption,
            html,
        } => {
            let media = urls
                .iter()
                .take(MEDIA_GROUP_MAX)
                .enumerate()
                .map(|(i, url)| {
                    let mut photo = InputMediaPhoto::new(photo_input(url));
                    if i == 0 {
                        photo = photo.caption(caption);
                        if *html {
                            photo = photo.parse_mode(ParseMode::Html);
                        }
                    }
                    InputMedia::Photo(photo)
                });
            bot.send_media_group(chat, media).await?[0].id
        }
    };
    Ok(sent)
}

pub async fn send_all(bot: &Bot, chat_ids: &[i64], msg: &Message) {
    for &chat_id in chat_ids {
        if let Err(err) = send(bot, chat_id, msg).await {
            tracing::error!("send to {chat_id} failed: {err}");
        }
    }
}
