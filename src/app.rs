use std::time::Duration;

use teloxide::Bot;

use crate::config::Config;
use crate::mx::api::MxApi;
use crate::ttl_map::TtlMap;

const TRACK_CAPACITY: usize = 200;
const TRACK_TTL: Duration = Duration::from_secs(60 * 60 * 24);

#[derive(Debug, Clone)]
pub struct LinkAuditTarget {
    pub link_id: String,
    pub chat_id: i64,
    pub message_id: i32,
    pub is_photo: bool,
    pub caption: String,
}

pub struct AppState {
    pub config: Config,
    pub bot: Bot,
    pub mx: MxApi,
    pub comment_reply: TtlMap<String>,
    pub link_audit: TtlMap<LinkAuditTarget>,
}

impl AppState {
    pub fn new(config: Config, bot: Bot) -> Self {
        Self {
            mx: MxApi::new(&config),
            config,
            bot,
            comment_reply: TtlMap::new(TRACK_CAPACITY, TRACK_TTL),
            link_audit: TtlMap::new(TRACK_CAPACITY, TRACK_TTL),
        }
    }
}
