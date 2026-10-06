pub const OWNER_ID: i64 = 548935420;
pub const MX_WATCH_GROUP_IDS: [i64; 2] = [-1001570490524, -1001918532532];
pub const MX_WATCH_CHANNEL_ID: i64 = -1001918532532;
pub const GH_WATCH_GROUP_IDS: [i64; 1] = [-1001918532532];
pub const USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36 imx<https://github.com/Innei/imx-bot>";

#[derive(Debug, Clone)]
pub struct Config {
    pub tg_bot_token: String,
    pub mx_token: String,
    pub mx_api_endpoint: String,
    pub mx_webhook_secret: String,
    pub gh_webhook_secret: String,
    pub port: u16,
    pub host: String,
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        Self::from_lookup(|k| std::env::var(k).ok().filter(|v| !v.is_empty()))
    }

    pub fn from_lookup(lookup: impl Fn(&str) -> Option<String>) -> Result<Self, String> {
        let mut missing = Vec::new();
        let mut required = |key: &'static str| {
            lookup(key).unwrap_or_else(|| {
                missing.push(key);
                String::new()
            })
        };
        let tg_bot_token = required("TG_BOT_TOKEN");
        let mx_token = required("MX_SPACE_TOKEN");
        let mx_api_endpoint = required("MX_SPACE_API_ENDPOINT").trim_end_matches('/').to_string();
        let mx_webhook_secret = required("MX_SPACE_WEBHOOK_SECRET");
        let gh_webhook_secret = required("GH_WEBHOOK_SECRET");
        if !missing.is_empty() {
            return Err(format!("missing env: {}", missing.join(", ")));
        }
        let port = match lookup("PORT") {
            Some(raw) => raw.parse().map_err(|_| format!("invalid PORT: {raw}"))?,
            None => 3000,
        };
        Ok(Self {
            tg_bot_token,
            mx_token,
            mx_api_endpoint,
            mx_webhook_secret,
            gh_webhook_secret,
            port,
            host: lookup("SERVER_HOSTNAME").unwrap_or_else(|| "127.0.0.1".to_string()),
        })
    }
}
