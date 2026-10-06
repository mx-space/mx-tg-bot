use std::time::Duration;

use chrono::{TimeZone, Utc};
use mx_tg_bot::signature::{verify_github, verify_mx};
use mx_tg_bot::time::relative_time_from_now;
use mx_tg_bot::ttl_map::TtlMap;

const BODY: &[u8] = b"The quick brown fox jumps over the lazy dog";
const SHA1: &str = "de7c9b85b8b78aa6bc8a7a36f70a90701c9db4d9";
const SHA256: &str = "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8";

#[test]
fn mx_signature_requires_both_digests() {
    assert!(verify_mx("key", BODY, SHA1, SHA256));
    assert!(!verify_mx("key", BODY, SHA1, &SHA256.replace('f', "0")));
    assert!(!verify_mx("key", BODY, "nothex", SHA256));
    assert!(!verify_mx("other", BODY, SHA1, SHA256));
}

#[test]
fn github_signature_uses_sha256_prefix() {
    assert!(verify_github("key", BODY, &format!("sha256={SHA256}")));
    assert!(!verify_github("key", BODY, SHA256));
    assert!(!verify_github(
        "key",
        b"tampered",
        &format!("sha256={SHA256}")
    ));
}

#[test]
fn relative_time_buckets_match_ts() {
    let now = Utc.with_ymd_and_hms(2026, 10, 6, 12, 0, 0).unwrap();
    let ago = |secs: i64| relative_time_from_now(now - chrono::Duration::seconds(secs), now);
    assert_eq!(ago(0), "刚刚");
    assert_eq!(ago(-5), "刚刚");
    assert_eq!(ago(30), "30 秒");
    assert_eq!(ago(90), "2 分钟");
    assert_eq!(ago(3600 * 5), "5 小时");
    assert_eq!(ago(86400 * 3), "3 天");
    assert_eq!(ago(86400 * 45), "2 个月");
    assert_eq!(ago(86400 * 800), "2 年");
}

#[test]
fn ttl_map_get_and_consume() {
    let map = TtlMap::new(10, Duration::from_secs(60));
    map.insert((1, 2), "a".to_string());
    assert_eq!(map.get((1, 2)).as_deref(), Some("a"));
    assert_eq!(map.consume((1, 2)).as_deref(), Some("a"));
    assert_eq!(map.get((1, 2)), None);
}

#[test]
fn ttl_map_expires_entries() {
    let map = TtlMap::new(10, Duration::ZERO);
    map.insert((1, 2), 1);
    assert_eq!(map.get((1, 2)), None);
}

#[test]
fn ttl_map_evicts_oldest_at_capacity() {
    let map = TtlMap::new(2, Duration::from_secs(60));
    map.insert((1, 1), 1);
    map.insert((1, 2), 2);
    map.insert((1, 3), 3);
    assert_eq!(map.get((1, 1)), None);
    assert_eq!(map.get((1, 2)), Some(2));
    assert_eq!(map.get((1, 3)), Some(3));
}
