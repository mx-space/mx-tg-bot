use chrono::{DateTime, TimeZone, Utc};
use mx_tg_bot::mx::api::{Aggregate, Doc};
use mx_tg_bot::mx::events::*;
use mx_tg_bot::tg::{Body, Button, Message};
use serde::de::DeserializeOwned;

const WEB: &str = "https://innei.in";

fn now() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 6, 12, 0, 0).unwrap()
}

fn parse<T: DeserializeOwned>(json: &str) -> T {
    serde_json::from_str(json).unwrap()
}

fn aggregate() -> Aggregate {
    parse(
        r#"{"user":{"name":"Innei","username":"innei"},"seo":{"title":"静かな森"},"url":{"web_url":"https://innei.in"}}"#,
    )
}

#[test]
fn post_create_formats_like_ts() {
    let post: Doc = parse(
        r#"{"id":"1","title":"T","slug":"s","summary":"Sum","category":{"slug":"tech"},"createdAt":"2026-10-06T00:00:00Z"}"#,
    );
    let msg = post_create("Innei", &post, WEB).unwrap();
    assert_eq!(
        msg,
        Message::text("Innei 发布了新文章: T\n\nSum\n\n\n前往阅读：https://innei.in/posts/tech/s")
    );
}

#[test]
fn post_create_skips_without_category() {
    let post: Doc = parse(r#"{"id":"1","title":"T","slug":"s"}"#);
    assert_eq!(post_create("Innei", &post, WEB), None);
}

#[test]
fn post_update_only_for_posts_older_than_90_days() {
    let fresh: Doc = parse(
        r#"{"id":"1","title":"T","slug":"s","category":{"slug":"c"},"createdAt":"2026-08-01T00:00:00Z"}"#,
    );
    assert_eq!(post_update("Innei", &fresh, WEB, now()), None);
    let old: Doc = parse(
        r#"{"id":"1","title":"T","slug":"s","category":{"slug":"c"},"createdAt":"2026-01-01T00:00:00Z"}"#,
    );
    let msg = post_update("Innei", &old, WEB, now()).unwrap();
    assert_eq!(
        msg,
        Message::text("Innei 更新了文章: T\n\n\n前往阅读：https://innei.in/posts/c/s")
    );
}

#[test]
fn note_create_with_status_and_images() {
    let note: NotePayload = parse(
        r#"{"id":"1","nid":7,"title":"N","text":"**hi**","mood":"开心","weather":"晴","images":[{"src":"https://a.png"},{"src":""}],"hasPassword":false,"publicAt":null}"#,
    );
    let msg = note_create("Innei", &note, WEB, now()).unwrap();
    assert_eq!(
        msg.body,
        Body::Photos {
            urls: vec!["https://a.png".to_string()],
            caption: "Innei 发布了新生活观察日记: N\n\n心情: 开心\t天气: 晴\n\nhi\n\n前往阅读：https://innei.in/notes/7".to_string(),
            html: false,
        }
    );
}

#[test]
fn note_create_skips_secret_or_password() {
    let future: NotePayload =
        parse(r#"{"id":"1","nid":7,"title":"N","text":"x","publicAt":"2027-01-01T00:00:00Z"}"#);
    assert_eq!(note_create("Innei", &future, WEB, now()), None);
    let locked: NotePayload =
        parse(r#"{"id":"1","nid":7,"title":"N","text":"x","hasPassword":true}"#);
    assert_eq!(note_create("Innei", &locked, WEB, now()), None);
}

#[test]
fn note_create_truncates_preview_at_200() {
    let text = "字".repeat(250);
    let note: NotePayload = parse(&format!(
        r#"{{"id":"1","nid":7,"title":"N","text":"{text}"}}"#
    ));
    let Body::Text(content) = note_create("Innei", &note, WEB, now()).unwrap().body else {
        panic!("expected text");
    };
    assert!(content.contains(&format!("{}...", "字".repeat(200))));
}

#[test]
fn link_apply_sends_group_and_owner_with_buttons() {
    let link: LinkPayload =
        parse(r#"{"id":"L1","name":"A&B","url":"https://ab.com","description":"desc","state":1}"#);
    let out = link_apply(&link).unwrap();
    let html = "有新的友链申请了耶！\nA&amp;B\nhttps://ab.com\n\ndesc".to_string();
    assert_eq!(out.group, Message::html(html.clone()));
    let owner = out.owner.unwrap();
    assert_eq!(owner.body, Body::Html(html));
    assert_eq!(
        owner.buttons,
        vec![
            Button::Callback("✅ 通过".into(), "link:pass:L1".into()),
            Button::Callback("❌ 拒绝".into(), "link:reject:L1".into()),
        ]
    );
}

#[test]
fn link_apply_with_avatar_sends_photo() {
    let link: LinkPayload = parse(
        r#"{"_id":"L2","name":"A","url":"u","avatar":"https://av.png","description":"d","state":1}"#,
    );
    let out = link_apply(&link).unwrap();
    assert!(matches!(out.group.body, Body::Photos { html: true, .. }));
    assert_eq!(out.owner.unwrap().buttons.len(), 2);
}

#[test]
fn link_apply_ignores_non_audit_state() {
    let link: LinkPayload = parse(r#"{"id":"L","name":"A","url":"u","state":0}"#);
    assert!(link_apply(&link).is_none());
}

fn post_ref() -> Doc {
    parse(
        r#"{"id":"P","title":"标题","slug":"s","category":{"slug":"c"},"created_at":"2026-10-06T09:00:00Z"}"#,
    )
}

#[test]
fn visitor_comment_goes_to_group_with_button() {
    let c: CommentPayload = parse(
        r#"{"id":"C","refId":"P","refType":"post","author":"guest","text":"<hi>","parentCommentId":null,"isWhispers":false}"#,
    );
    let out = comment_create(&c, &post_ref(), &aggregate(), Source::Visitor, now());
    let group = out.group.unwrap();
    assert_eq!(
        group.body,
        Body::Html("guest 在「标题」发表了评论：&lt;hi&gt;".into())
    );
    assert_eq!(
        group.buttons,
        vec![Button::Url(
            "查看".into(),
            "https://innei.in/posts/c/s".into()
        )]
    );
    assert!(out.owner.is_none());
}

#[test]
fn owner_top_level_comment_uses_elapsed_phrase() {
    let c: CommentPayload =
        parse(r#"{"id":"C","refId":"P","refType":"post","author":"Innei","text":"again"}"#);
    let out = comment_create(&c, &post_ref(), &aggregate(), Source::Visitor, now());
    assert_eq!(
        out.group.unwrap().body,
        Body::Html("Innei 在「标题」发表之后的 3 小时又说：again".into())
    );
}

#[test]
fn whisper_comment_hides_text_in_group_and_notifies_owner() {
    let c: CommentPayload = parse(
        r#"{"id":"C","refId":"P","refType":"post","author":"g","text":"secret","isWhispers":true}"#,
    );
    let out = comment_create(&c, &post_ref(), &aggregate(), Source::Visitor, now());
    assert_eq!(
        out.group.unwrap(),
        Message::text("「静かな森」嘘，有人说了一句悄悄话。是什么呢")
    );
    assert!(out.owner.is_some());
}

#[test]
fn admin_comment_only_goes_to_owner() {
    let c: CommentPayload =
        parse(r#"{"id":"C","refId":"P","refType":"post","author":"g","text":"t"}"#);
    let out = comment_create(&c, &post_ref(), &aggregate(), Source::Admin, now());
    assert!(out.group.is_none());
    assert!(out.owner.is_some());
}

#[test]
fn say_create_appends_source() {
    let say: SayPayload = parse(r#"{"text":"hello","source":"","author":"Bob"}"#);
    assert_eq!(
        say_create("Innei", &say),
        Message::text("Innei 发布一条说说：\nhello\n来自: Bob")
    );
    let bare: SayPayload = parse(r#"{"text":"hello"}"#);
    assert_eq!(
        say_create("Innei", &bare),
        Message::text("Innei 发布一条说说：\nhello\n")
    );
}

#[test]
fn recently_uses_earliest_enrichment_phrase() {
    let r: RecentlyPayload = parse(
        r#"{"content":"see https://b.com and https://a.com **nice**","enrichments":{
            "https://a.com":{"title":"A","category":"book"},
            "https://b.com":{"title":"B <x>","category":"music"},
            "https://c.com":{"title":"C","category":"unknown"}}}"#,
    );
    assert_eq!(
        recently_create("Innei", &r),
        Message::html(
            "Innei 在听「<a href=\"https://b.com\">B &lt;x&gt;</a>」\n\nsee  and <a href=\"https://a.com\">https://a.com</a> <b>nice</b>"
        )
    );
}

#[test]
fn recently_without_enrichment_is_plain() {
    let r: RecentlyPayload = parse(r#"{"content":"just text"}"#);
    assert_eq!(
        recently_create("Innei", &r),
        Message::text("Innei 发布一条动态说：\njust text")
    );
}

#[test]
fn activity_like_with_and_without_reader() {
    let with: ActivityLikePayload =
        parse(r#"{"ref":{"id":"P","title":"T"},"reader":{"name":"Ann"}}"#);
    let msg = activity_like(&with, Some("https://innei.in/x".into()));
    assert_eq!(msg.body, Body::Text("Ann 点赞了「T」\n".into()));
    assert_eq!(
        msg.buttons,
        vec![Button::Url("查看".into(), "https://innei.in/x".into())]
    );
    let anon: ActivityLikePayload = parse(r#"{"ref":{"id":"P","title":"T"}}"#);
    assert_eq!(
        activity_like(&anon, None),
        Message::text("「T」有人点赞了哦！\n")
    );
}
