use std::sync::{Arc, Mutex};

use axum::Router;
use axum::body::Bytes;
use axum::extract::{Path, State};
use mx_tg_bot::tg::{Button, Message, send};
use serde_json::{Value, json};
use teloxide::Bot;

type Log = Arc<Mutex<Vec<(String, String)>>>;

fn ok_message() -> Value {
    json!({"ok":true,"result":{"message_id":7,"date":0,"chat":{"id":1,"type":"private","first_name":"a"},"text":"x"}})
}

async fn fake_telegram(fail: &'static [(&'static str, &'static str)]) -> (Bot, Log) {
    let log: Log = Arc::default();
    let app = Router::new()
        .route(
            "/{token}/{method}",
            axum::routing::post(
                move |State(log): State<Log>,
                      Path((_, method)): Path<(String, String)>,
                      body: Bytes| async move {
                    let body = String::from_utf8_lossy(&body).into_owned();
                    let method = method.to_ascii_lowercase();
                    let attempt = {
                        let mut log = log.lock().unwrap();
                        log.push((method.clone(), body));
                        log.iter().filter(|(m, _)| *m == method).count()
                    };
                    let failure = fail
                        .iter()
                        .find(|(m, _)| m.to_ascii_lowercase() == method)
                        .filter(|_| attempt == 1);
                    let response = match (failure, method.as_str()) {
                        (Some((_, description)), _) => {
                            json!({"ok":false,"error_code":400,"description":description})
                        }
                        (None, "sendmediagroup") => {
                            json!({"ok":true,"result":[ok_message()["result"]]})
                        }
                        _ => ok_message(),
                    };
                    axum::Json(response)
                },
            ),
        )
        .with_state(log.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let bot = Bot::new("123:abc").set_api_url(format!("http://{addr}/").parse().unwrap());
    (bot, log)
}

fn methods(log: &Log) -> Vec<String> {
    log.lock().unwrap().iter().map(|(m, _)| m.clone()).collect()
}

fn body(log: &Log, idx: usize) -> String {
    log.lock().unwrap()[idx].1.clone()
}

#[tokio::test]
async fn failed_photo_falls_back_to_text_with_buttons() {
    let (bot, log) = fake_telegram(&[(
        "sendPhoto",
        "Bad Request: wrong file identifier/HTTP URL specified",
    )])
    .await;
    let msg = Message::photos(vec!["https://av.png".into()], "<b>cap</b>", true)
        .button(Button::Callback("✅ 通过".into(), "link:pass:1".into()));
    send(&bot, 1, &msg).await.unwrap();
    assert_eq!(methods(&log), ["sendphoto", "sendmessage"]);
    let fallback: Value = serde_json::from_str(&body(&log, 1)).unwrap();
    assert_eq!(fallback["text"], "<b>cap</b>");
    assert_eq!(fallback["parse_mode"], "HTML");
    assert_eq!(
        fallback["reply_markup"]["inline_keyboard"][0][0]["callback_data"],
        "link:pass:1"
    );
}

#[tokio::test]
async fn media_group_is_capped_at_ten() {
    let (bot, log) = fake_telegram(&[]).await;
    let urls = (0..12).map(|i| format!("https://img/{i}.png")).collect();
    send(&bot, 1, &Message::photos(urls, "cap", false))
        .await
        .unwrap();
    assert_eq!(methods(&log), ["sendmediagroup"]);
    assert_eq!(body(&log, 0).matches("https://img/").count(), 10);
}

#[tokio::test]
async fn unparsable_html_is_resent_without_parse_mode() {
    let (bot, log) = fake_telegram(&[(
        "sendMessage",
        "Bad Request: can't parse entities: Unclosed start tag at byte offset 3",
    )])
    .await;
    send(&bot, 1, &Message::html("<a href=\"x")).await.unwrap();
    assert_eq!(methods(&log), ["sendmessage", "sendmessage"]);
    let retry: Value = serde_json::from_str(&body(&log, 1)).unwrap();
    assert!(retry.get("parse_mode").is_none());
}

#[tokio::test]
async fn long_text_is_truncated_to_telegram_limit() {
    let (bot, log) = fake_telegram(&[]).await;
    send(&bot, 1, &Message::text("a".repeat(5000)))
        .await
        .unwrap();
    let sent: Value = serde_json::from_str(&body(&log, 0)).unwrap();
    let text = sent["text"].as_str().unwrap();
    assert_eq!(text.encode_utf16().count(), 4096);
    assert!(text.ends_with('…'));
}
