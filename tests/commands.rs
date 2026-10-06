use chrono::{TimeZone, Utc};
use mx_tg_bot::mx::api::{Doc, Stat};
use mx_tg_bot::mx::commands::*;
use mx_tg_bot::mx::link_audit::append_result;

fn doc(json: &str) -> Doc {
    serde_json::from_str(json).unwrap()
}

#[test]
fn detail_args_require_type() {
    assert_eq!(parse_detail_args(""), Err(DETAIL_USAGE.to_string()));
}

#[test]
fn detail_args_default_offset_is_one() {
    assert_eq!(parse_detail_args("post"), Ok((DetailKind::Post, 1)));
    assert_eq!(parse_detail_args("note 3"), Ok((DetailKind::Note, 3)));
}

#[test]
fn detail_args_reject_bad_input() {
    assert!(parse_detail_args("page").is_err());
    assert!(parse_detail_args("post 0").is_err());
    assert!(parse_detail_args("post abc").is_err());
}

#[test]
fn detail_markup_escapes_and_keeps_three_paragraphs() {
    let d = doc(r#"{"id":"1","title":"Hello.World","text":"p1\n\np2\n\np3\n\np4"}"#);
    assert_eq!(
        detail_markup(&d, "https://innei.in/notes/1"),
        "[Hello\\.World](https://innei.in/notes/1)\n\np1\n\np2\n\np3\n\n[阅读全文](https://innei\\.in/notes/1)"
    );
}

#[test]
fn note_list_markup_like_ts() {
    let now = Utc.with_ymd_and_hms(2026, 10, 6, 12, 0, 0).unwrap();
    let notes = vec![doc(
        r#"{"id":"1","nid":7,"title":"A-B","created_at":"2026-10-06T10:00:00Z"}"#,
    )];
    assert_eq!(
        note_list_markup(&notes, "https://innei.in", now),
        "*文章列表*\n\n2 小时前\n[A\\-B](https://innei.in/notes/7)"
    );
}

#[test]
fn post_list_markup_like_ts() {
    let now = Utc.with_ymd_and_hms(2026, 10, 6, 12, 0, 0).unwrap();
    let posts = vec![doc(
        r#"{"id":"1","title":"T","slug":"s","category":{"slug":"c"},"created_at":"2026-10-03T12:00:00Z"}"#,
    )];
    assert_eq!(
        post_list_markup(&posts, "https://innei.in", now),
        "*文章列表*\n\n3 天前\n[T](https://innei.in/posts/c/s)"
    );
}

#[test]
fn stat_text_lists_counts() {
    let stat: Stat = serde_json::from_str(
        r#"{"call_time":9,"posts":1,"notes":2,"link_apply":3,"comments":4,"today_ip_access_count":5,"online":6}"#,
    )
    .unwrap();
    assert_eq!(
        stat_text(&stat),
        "MX Space 统计信息\n\n文章数：1\n说说数：2\n友链申请数：3\n评论数：4\n今日访问量：5\n在线总数：6\n调用次数：9"
    );
}

#[test]
fn help_lists_mx_commands() {
    let html = help_html("Bot <1>");
    assert!(html.starts_with("<b>Bot &lt;1&gt;の使用方法</b>"));
    assert!(html.contains("/mx_get_detail - 获取 Post 或 Note 详情"));
    assert!(html.contains("/mx_stat - 获取 MX Space 统计信息"));
}

#[test]
fn welcome_escapes_markdown() {
    assert_eq!(
        welcome_text("@a_b", Some("一言.")),
        "欢迎新大佬 @a\\_b \n\n一言\\."
    );
    assert_eq!(welcome_text("x", None), "欢迎新大佬 x \n\n");
}

#[test]
fn append_result_trims() {
    assert_eq!(append_result("orig", "✅ 已通过"), "orig\n\n✅ 已通过");
    assert_eq!(append_result("", "✅ 已通过"), "✅ 已通过");
}
