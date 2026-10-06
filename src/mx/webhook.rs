use std::sync::Arc;

use axum::Json;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use serde_json::{Value, json};

use crate::app::AppState;
use crate::mx::events::{Source, dispatch};
use crate::signature::verify_mx;

fn header<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers.get(name).and_then(|v| v.to_str().ok())
}

pub fn verify_request(
    headers: &HeaderMap,
    body: &[u8],
    secret: &str,
) -> Result<(String, Source), StatusCode> {
    let (Some(event), Some(sha1), Some(sha256)) = (
        header(headers, "x-webhook-event"),
        header(headers, "x-webhook-signature"),
        header(headers, "x-webhook-signature256"),
    ) else {
        return Err(StatusCode::BAD_REQUEST);
    };
    if !verify_mx(secret, body, sha1, sha256) {
        return Err(StatusCode::UNAUTHORIZED);
    }
    Ok((
        event.to_string(),
        Source::from_header(header(headers, "x-webhook-source")),
    ))
}

pub async fn handle(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: Bytes,
) -> (StatusCode, Json<Value>) {
    let (event, source) = match verify_request(&headers, &body, &state.config.mx_webhook_secret) {
        Ok(ok) => ok,
        Err(status) => {
            tracing::warn!("mx webhook rejected: {status}");
            return (
                status,
                Json(json!({ "ok": false, "message": "Invalid Signature" })),
            );
        }
    };
    let Ok(payload) = serde_json::from_slice::<Value>(&body) else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "ok": false, "message": "Invalid JSON" })),
        );
    };
    tokio::spawn(dispatch(state, event, payload, source));
    (StatusCode::OK, Json(json!({ "ok": true })))
}
