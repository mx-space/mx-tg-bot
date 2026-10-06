use std::collections::HashMap;

use mx_tg_bot::config::Config;
use mx_tg_bot::mx::api::{Aggregate, Doc, build_url, parse_envelope};

fn env(pairs: &[(&str, &str)]) -> HashMap<String, String> {
    pairs
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect()
}

const REQUIRED: [(&str, &str); 5] = [
    ("TG_BOT_TOKEN", "t"),
    ("MX_SPACE_TOKEN", "m"),
    ("MX_SPACE_API_ENDPOINT", "https://mx.innei.in/api/v3/"),
    ("MX_SPACE_WEBHOOK_SECRET", "s"),
    ("GH_WEBHOOK_SECRET", "g"),
];

#[test]
fn config_defaults_match_ts_server() {
    let vars = env(&REQUIRED);
    let config = Config::from_lookup(|k| vars.get(k).cloned()).unwrap();
    assert_eq!(config.port, 3000);
    assert_eq!(config.host, "127.0.0.1");
    assert_eq!(config.mx_api_endpoint, "https://mx.innei.in/api/v3");
}

#[test]
fn config_reports_every_missing_var() {
    let vars = env(&REQUIRED[2..]);
    let err = Config::from_lookup(|k| vars.get(k).cloned()).unwrap_err();
    assert!(
        err.contains("TG_BOT_TOKEN") && err.contains("MX_SPACE_TOKEN"),
        "{err}"
    );
}

#[test]
fn envelope_unwraps_data() {
    let agg: Aggregate = parse_envelope(
        200,
        br#"{"data":{"user":{"name":"Innei","username":"innei"},"seo":{"title":"Innei"},"url":{"web_url":"https://innei.in"}}}"#,
    )
    .unwrap();
    assert_eq!(agg.user.name, "Innei");
    assert_eq!(agg.url.web_url, "https://innei.in");
}

#[test]
fn envelope_maps_error_body() {
    let err = parse_envelope::<Doc>(
        404,
        br#"{"error":{"code":"POST_NOT_FOUND","message":"Post not found"}}"#,
    )
    .unwrap_err();
    assert_eq!(err.code, "POST_NOT_FOUND");
    assert_eq!(err.message, "Post not found");
}

#[test]
fn envelope_falls_back_on_non_json_error() {
    let err = parse_envelope::<Doc>(502, b"Bad Gateway").unwrap_err();
    assert_eq!(err.code, "HTTP_502");
    assert_eq!(err.message, "Bad Gateway");
}

fn doc(json: &str) -> Doc {
    serde_json::from_str(json).unwrap()
}

#[test]
fn build_url_handles_each_shape() {
    let web = "https://innei.in";
    let note = doc(
        r#"{"id":"1","title":"n","nid":220,"slug":"s","createdAt":"2026-10-05T18:51:29.209Z"}"#,
    );
    assert_eq!(
        build_url(web, &note).as_deref(),
        Some("https://innei.in/notes/220")
    );

    let post = doc(r#"{"id":"1","title":"p","slug":"a b","category":{"slug":"tech"}}"#);
    assert_eq!(
        build_url(web, &post).as_deref(),
        Some("https://innei.in/posts/tech/a%20b")
    );

    let post_string_category = doc(r#"{"id":"1","title":"p","slug":"x","category":"tech"}"#);
    assert_eq!(
        build_url(web, &post_string_category).as_deref(),
        Some("https://innei.in/posts/tech/x")
    );

    let post_no_category = doc(r#"{"id":"1","title":"p","slug":"x"}"#);
    assert_eq!(build_url(web, &post_no_category), None);

    let page = doc(r#"{"id":"1","title":"About","slug":"about","order":1}"#);
    assert_eq!(
        build_url(web, &page).as_deref(),
        Some("https://innei.in/about")
    );
}

#[test]
fn doc_accepts_snake_case_created_at() {
    let d = doc(r#"{"id":"1","title":"t","created_at":"2026-02-28T17:05:33.187Z"}"#);
    assert!(d.created_at.is_some());
}
