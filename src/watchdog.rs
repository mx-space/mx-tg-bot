use std::time::Duration;

use teloxide::prelude::*;

const CHECK_INTERVAL: Duration = Duration::from_secs(300);
const STRIKE_LIMIT: u32 = 3;

pub struct PendingWatch {
    strikes: u32,
    limit: u32,
}

impl PendingWatch {
    pub fn new(limit: u32) -> Self {
        Self { strikes: 0, limit }
    }

    pub fn observe(&mut self, pending: u32) -> bool {
        self.strikes = if pending > 0 { self.strikes + 1 } else { 0 };
        self.strikes >= self.limit
    }
}

pub async fn run(bot: Bot) {
    let mut watch = PendingWatch::new(STRIKE_LIMIT);
    let mut interval = tokio::time::interval(CHECK_INTERVAL);
    interval.tick().await;
    loop {
        interval.tick().await;
        match bot.get_webhook_info().await {
            Ok(info) if watch.observe(info.pending_update_count) => {
                tracing::error!(
                    "polling stalled: pending_update_count={} for {STRIKE_LIMIT} checks, exiting for restart",
                    info.pending_update_count
                );
                std::process::exit(1);
            }
            Ok(_) => {}
            Err(err) => tracing::warn!("getWebhookInfo failed: {err}"),
        }
    }
}
