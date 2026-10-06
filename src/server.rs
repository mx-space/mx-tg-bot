use std::sync::Arc;

use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::{Value, json};

use crate::app::AppState;
use crate::{github, mx};

async fn health() -> Json<Value> {
    Json(json!({ "status": true }))
}

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/", get(health))
        .route("/health/check", get(health))
        .route("/mx/webhook", post(mx::webhook::handle))
        .route("/gh/webhook", post(github::handle))
        .with_state(state)
}
