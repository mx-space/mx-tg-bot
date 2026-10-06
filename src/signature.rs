use hmac::{Hmac, KeyInit, Mac};
use sha1::Sha1;
use sha2::Sha256;

fn verify<M: Mac + KeyInit>(secret: &str, body: &[u8], hex_sig: &str) -> bool {
    let Ok(expected) = hex::decode(hex_sig) else {
        return false;
    };
    let Ok(mut mac) = <M as KeyInit>::new_from_slice(secret.as_bytes()) else {
        return false;
    };
    mac.update(body);
    mac.verify_slice(&expected).is_ok()
}

pub fn verify_mx(secret: &str, body: &[u8], sha1_hex: &str, sha256_hex: &str) -> bool {
    verify::<Hmac<Sha1>>(secret, body, sha1_hex) && verify::<Hmac<Sha256>>(secret, body, sha256_hex)
}

pub fn verify_github(secret: &str, body: &[u8], header: &str) -> bool {
    header
        .strip_prefix("sha256=")
        .is_some_and(|sig| verify::<Hmac<Sha256>>(secret, body, sig))
}
