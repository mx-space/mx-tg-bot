use axum::http::{HeaderMap, HeaderValue, StatusCode};
use mx_tg_bot::mx::events::Source;
use mx_tg_bot::mx::webhook::verify_request;

const BODY: &[u8] = b"The quick brown fox jumps over the lazy dog";

fn headers(pairs: &[(&'static str, &str)]) -> HeaderMap {
    let mut map = HeaderMap::new();
    for (k, v) in pairs {
        map.insert(*k, HeaderValue::from_str(v).unwrap());
    }
    map
}

fn signed(extra: &[(&'static str, &str)]) -> HeaderMap {
    let mut pairs = vec![
        ("x-webhook-event", "post.create"),
        (
            "x-webhook-signature",
            "de7c9b85b8b78aa6bc8a7a36f70a90701c9db4d9",
        ),
        (
            "x-webhook-signature256",
            "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
        ),
    ];
    pairs.extend_from_slice(extra);
    headers(&pairs)
}

#[test]
fn accepts_valid_signatures_and_reads_source() {
    let (event, source) =
        verify_request(&signed(&[("x-webhook-source", "admin")]), BODY, "key").unwrap();
    assert_eq!(event, "post.create");
    assert_eq!(source, Source::Admin);
}

#[test]
fn defaults_source_to_system() {
    let (_, source) = verify_request(&signed(&[]), BODY, "key").unwrap();
    assert_eq!(source, Source::System);
}

#[test]
fn rejects_bad_signature() {
    assert_eq!(
        verify_request(&signed(&[]), b"tampered", "key"),
        Err(StatusCode::UNAUTHORIZED)
    );
}

#[test]
fn rejects_missing_headers() {
    assert_eq!(
        verify_request(&headers(&[]), BODY, "key"),
        Err(StatusCode::BAD_REQUEST)
    );
}
