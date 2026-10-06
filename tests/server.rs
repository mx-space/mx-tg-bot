use std::sync::Arc;

use axum::body::{Body, to_bytes};
use axum::http::{Request, StatusCode};
use mx_tg_bot::app::AppState;
use mx_tg_bot::config::Config;
use mx_tg_bot::server::router;
use mx_tg_bot::watchdog::PendingWatch;
use teloxide::Bot;
use tower::ServiceExt;

fn state() -> Arc<AppState> {
    let config = Config::from_lookup(|k| match k {
        "PORT" | "SERVER_HOSTNAME" => None,
        "MX_SPACE_API_ENDPOINT" => Some("http://127.0.0.1:1".into()),
        _ => Some("x".into()),
    })
    .unwrap();
    Arc::new(AppState::new(config, Bot::new("123:abc")))
}

#[tokio::test]
async fn health_routes_return_status_true() {
    for path in ["/", "/health/check"] {
        let res = router(state())
            .oneshot(Request::get(path).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let body = to_bytes(res.into_body(), 1024).await.unwrap();
        assert_eq!(&body[..], br#"{"status":true}"#);
    }
}

#[tokio::test]
async fn mx_webhook_rejects_unsigned_post() {
    let res = router(state())
        .oneshot(Request::post("/mx/webhook").body(Body::from("{}")).unwrap())
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::BAD_REQUEST);
}

#[test]
fn watchdog_trips_after_consecutive_pending() {
    let mut watch = PendingWatch::new(3);
    assert!(!watch.observe(2));
    assert!(!watch.observe(1));
    assert!(!watch.observe(0));
    assert!(!watch.observe(4));
    assert!(!watch.observe(4));
    assert!(watch.observe(4));
}
