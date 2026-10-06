use axum::http::{HeaderMap, HeaderValue, StatusCode};
use mx_tg_bot::github::{message_for, verify_request};
use serde_json::{json, Value};

fn msg(event: &str, payload: Value) -> Option<String> {
    message_for(event, payload)
}

fn commit(message: &str, author: &str) -> Value {
    json!({"message": message, "author": {"name": author}, "url": "https://gh/c/1"})
}

#[test]
fn push_single_commit_to_main() {
    let p = json!({"pusher":{"name":"Innei"},"repository":{"full_name":"a/b"},"ref":"refs/heads/main","commits":[commit("fix: x\n\nbody","Innei")]});
    assert_eq!(msg("push", p).unwrap(), "Innei 向 a/b 提交了一个更改\n\nfix: x\n\nbody");
}

#[test]
fn push_single_commit_to_branch_with_coauthor() {
    let p = json!({"pusher":{"name":"Innei"},"repository":{"full_name":"a/b"},"ref":"refs/heads/dev","commits":[commit("feat","Bob")]});
    assert_eq!(
        msg("push", p).unwrap(),
        "Innei & Bob 向 a/b 的 dev 分支提交了一个更改\n\nfeat\n\n查看提交更改内容: https://gh/c/1"
    );
}

#[test]
fn push_multiple_commits() {
    let p = json!({"pusher":{"name":"Innei"},"repository":{"full_name":"a/b"},"ref":"refs/heads/main",
        "commits":[commit("one\nmore","Innei"), commit("two","Bob")]});
    assert_eq!(msg("push", p).unwrap(), "Innei 等多人 向 a/b 提交了多个更改\n\none\ntwo");
}

#[test]
fn push_from_bot_or_empty_is_ignored() {
    let bot = json!({"pusher":{"name":"renovate[bot]"},"repository":{"full_name":"a/b"},"ref":"refs/heads/main","commits":[commit("x","r")]});
    assert_eq!(msg("push", bot), None);
    let empty = json!({"pusher":{"name":"Innei"},"repository":{"full_name":"a/b"},"ref":"refs/heads/main","commits":[]});
    assert_eq!(msg("push", empty), None);
}

#[test]
fn issue_opened() {
    let p = json!({"action":"opened","sender":{"login":"u"},"repository":{"name":"b"},"issue":{"number":3,"title":"Bug","html_url":"https://gh/i/3"}});
    assert_eq!(msg("issues", p).unwrap(), "u 向 b 发布了一个 Issue「#3 - Bug\n前往处理：https://gh/i/3");
}

#[test]
fn release_released_only() {
    let p = json!({"action":"released","repository":{"full_name":"a/b"},"release":{"tag_name":"v1","html_url":"https://gh/r"}});
    assert_eq!(msg("release", p).unwrap(), "a/b 发布了一个新版本 v1，前往查看:\nhttps://gh/r");
    let draft = json!({"action":"created","repository":{"full_name":"a/b"},"release":{"tag_name":"v1","html_url":"x"}});
    assert_eq!(msg("release", draft), None);
}

#[test]
fn check_run_failure_on_main() {
    let run = |branch: &str, conclusion: &str| json!({"check_run":{"conclusion":conclusion,"status":"completed","html_url":"https://gh/ci","check_suite":{"head_branch":branch}},"repository":{"full_name":"a/b"}});
    assert_eq!(msg("check_run", run("main", "failure")).unwrap(), " a/b CI 挂了！！！！\n查看原因：https://gh/ci");
    assert_eq!(msg("check_run", run("dev", "failure")), None);
    assert_eq!(msg("check_run", run("main", "success")), None);
}

#[test]
fn pull_request_opened() {
    let p = json!({"action":"opened","pull_request":{"html_url":"https://gh/p/1","title":"T","body":"B",
        "head":{"label":"u:feat"},"user":{"login":"u"},"base":{"label":"a:main","repo":{"full_name":"a/b"}}}});
    assert_eq!(
        msg("pull_request", p).unwrap(),
        "u 向 a/b 提交了一个 Pull Request\n\nT\n\na:main <-- u:feat\n\nB\n\n前往处理：https://gh/p/1"
    );
}

#[test]
fn unknown_event_is_ignored() {
    assert_eq!(msg("ping", json!({})), None);
}

#[test]
fn verify_requires_valid_sha256_header() {
    let body = b"The quick brown fox jumps over the lazy dog";
    let mut headers = HeaderMap::new();
    headers.insert("x-github-event", HeaderValue::from_static("push"));
    assert_eq!(verify_request(&headers, body, "key"), Err(StatusCode::BAD_REQUEST));
    headers.insert(
        "x-hub-signature-256",
        HeaderValue::from_static("sha256=f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8"),
    );
    assert_eq!(verify_request(&headers, body, "key"), Ok("push".to_string()));
    assert_eq!(verify_request(&headers, b"x", "key"), Err(StatusCode::UNAUTHORIZED));
}
