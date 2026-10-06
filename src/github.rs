use std::collections::HashSet;
use std::sync::Arc;

use axum::Json;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};

use crate::app::AppState;
use crate::config::GH_WATCH_GROUP_IDS;
use crate::signature::verify_github;
use crate::tg::{self, Message};

const BOT_LIST: [&str; 1] = ["renovate[bot]"];

fn is_bot(login: &str) -> bool {
    login.ends_with("[bot]") || BOT_LIST.contains(&login)
}

#[derive(Deserialize)]
struct Named {
    name: String,
}

#[derive(Deserialize)]
struct Login {
    login: String,
}

#[derive(Deserialize)]
struct FullName {
    full_name: String,
}

#[derive(Deserialize)]
struct Commit {
    message: String,
    author: Option<Named>,
    url: String,
}

#[derive(Deserialize)]
struct Push {
    pusher: Named,
    repository: FullName,
    #[serde(rename = "ref")]
    git_ref: String,
    commits: Vec<Commit>,
}

#[derive(Deserialize)]
struct Issue {
    number: u64,
    title: String,
    html_url: String,
}

#[derive(Deserialize)]
struct IssuesEvent {
    action: String,
    sender: Login,
    repository: Named,
    issue: Issue,
}

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    html_url: String,
}

#[derive(Deserialize)]
struct ReleaseEvent {
    action: String,
    repository: FullName,
    release: Release,
}

#[derive(Deserialize)]
struct CheckSuite {
    head_branch: Option<String>,
}

#[derive(Deserialize)]
struct CheckRun {
    conclusion: Option<String>,
    status: String,
    html_url: String,
    check_suite: CheckSuite,
}

#[derive(Deserialize)]
struct CheckRunEvent {
    check_run: CheckRun,
    repository: FullName,
}

#[derive(Deserialize)]
struct Head {
    label: String,
}

#[derive(Deserialize)]
struct Base {
    label: String,
    repo: FullName,
}

#[derive(Deserialize)]
struct PullRequest {
    html_url: String,
    title: String,
    body: Option<String>,
    head: Head,
    user: Login,
    base: Base,
}

#[derive(Deserialize)]
struct PullRequestEvent {
    action: String,
    pull_request: PullRequest,
}

fn push(p: Push) -> Option<String> {
    let pusher = &p.pusher.name;
    if is_bot(pusher) || p.commits.is_empty() {
        return None;
    }
    let repo = &p.repository.full_name;
    let to_main = p.git_ref == "refs/heads/main" || p.git_ref == "refs/heads/master";
    let author = |c: &Commit| {
        c.author
            .as_ref()
            .map(|a| a.name.clone())
            .unwrap_or_default()
    };

    if let [commit] = p.commits.as_slice() {
        let author = author(commit);
        let coauthor = if !author.is_empty() && &author != pusher {
            format!(" & {author}")
        } else {
            String::new()
        };
        let branch = if to_main {
            String::new()
        } else {
            format!("的 {} 分支", p.git_ref.trim_start_matches("refs/heads/"))
        };
        let link = if to_main {
            String::new()
        } else {
            format!("\n\n查看提交更改内容: {}", commit.url)
        };
        return Some(format!(
            "{pusher}{coauthor} 向 {repo} {branch}提交了一个更改\n\n{}{link}",
            commit.message
        ));
    }

    let authors: Vec<String> = p.commits.iter().map(author).collect();
    let unique = authors.iter().collect::<HashSet<_>>().len() == 1;
    let who = if unique {
        authors[0].clone()
    } else {
        format!("{} 等多人", authors[0])
    };
    let messages = p
        .commits
        .iter()
        .map(|c| c.message.lines().next().unwrap_or_default())
        .collect::<Vec<_>>()
        .join("\n");
    Some(format!("{who} 向 {repo} 提交了多个更改\n\n{messages}"))
}

fn issues(e: IssuesEvent) -> Option<String> {
    if e.action != "opened" || is_bot(&e.sender.login) {
        return None;
    }
    Some(format!(
        "{} 向 {} 发布了一个 Issue「#{} - {}\n前往处理：{}",
        e.sender.login, e.repository.name, e.issue.number, e.issue.title, e.issue.html_url
    ))
}

fn release(e: ReleaseEvent) -> Option<String> {
    (e.action == "released").then(|| {
        format!(
            "{} 发布了一个新版本 {}，前往查看:\n{}",
            e.repository.full_name, e.release.tag_name, e.release.html_url
        )
    })
}

fn check_run(e: CheckRunEvent) -> Option<String> {
    let run = e.check_run;
    let on_main = matches!(
        run.check_suite.head_branch.as_deref(),
        Some("main" | "master")
    );
    let failed = matches!(run.conclusion.as_deref(), Some("failure" | "timed_out"));
    (on_main && run.status == "completed" && failed).then(|| {
        format!(
            " {} CI 挂了！！！！\n查看原因：{}",
            e.repository.full_name, run.html_url
        )
    })
}

fn pull_request(e: PullRequestEvent) -> Option<String> {
    let pr = e.pull_request;
    if e.action != "opened" || is_bot(&pr.user.login) {
        return None;
    }
    let body = pr
        .body
        .filter(|b| !b.is_empty())
        .map(|b| format!("{b}\n\n"))
        .unwrap_or_default();
    Some(format!(
        "{} 向 {} 提交了一个 Pull Request\n\n{}\n\n{} <-- {}\n\n{body}前往处理：{}",
        pr.user.login, pr.base.repo.full_name, pr.title, pr.base.label, pr.head.label, pr.html_url
    ))
}

fn decode<T: DeserializeOwned>(event: &str, payload: Value) -> Option<T> {
    serde_json::from_value(payload)
        .map_err(|err| tracing::error!("gh {event}: bad payload: {err}"))
        .ok()
}

pub fn message_for(event: &str, payload: Value) -> Option<String> {
    match event {
        "push" => push(decode(event, payload)?),
        "issues" => issues(decode(event, payload)?),
        "release" => release(decode(event, payload)?),
        "check_run" => check_run(decode(event, payload)?),
        "pull_request" => pull_request(decode(event, payload)?),
        _ => None,
    }
}

pub fn verify_request(
    headers: &HeaderMap,
    body: &[u8],
    secret: &str,
) -> Result<String, StatusCode> {
    let header = |name: &str| headers.get(name).and_then(|v| v.to_str().ok());
    let (Some(event), Some(signature)) = (header("x-github-event"), header("x-hub-signature-256"))
    else {
        return Err(StatusCode::BAD_REQUEST);
    };
    if !verify_github(secret, body, signature) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    Ok(event.to_string())
}

pub async fn handle(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: Bytes,
) -> (StatusCode, Json<Value>) {
    let event = match verify_request(&headers, &body, &state.config.gh_webhook_secret) {
        Ok(event) => event,
        Err(status) => {
            tracing::warn!("gh webhook rejected: {status}");
            return (status, Json(json!({ "ok": false })));
        }
    };
    let Ok(payload) = serde_json::from_slice::<Value>(&body) else {
        return (StatusCode::BAD_REQUEST, Json(json!({ "ok": false })));
    };
    tokio::spawn(async move {
        if let Some(text) = message_for(&event, payload) {
            tg::send_all(&state.bot, &GH_WATCH_GROUP_IDS, &Message::text(text)).await;
        }
    });
    (StatusCode::OK, Json(json!({ "ok": true })))
}
