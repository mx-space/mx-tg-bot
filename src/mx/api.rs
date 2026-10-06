use std::fmt;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use chrono::{DateTime, Utc};
use reqwest::Method;
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};

use crate::config::{Config, USER_AGENT};

const AGGREGATE_TTL: Duration = Duration::from_secs(5);
const LINK_STATE_REJECT: u8 = 4;

#[derive(Debug, Clone)]
pub struct ApiError {
    pub code: String,
    pub message: String,
}

impl fmt::Display for ApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for ApiError {}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum CategoryRef {
    Object { slug: Option<String> },
    Slug(String),
}

impl CategoryRef {
    pub fn slug(&self) -> Option<&str> {
        match self {
            Self::Object { slug } => slug.as_deref(),
            Self::Slug(slug) => Some(slug),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct Doc {
    pub id: String,
    pub title: Option<String>,
    pub slug: Option<String>,
    pub nid: Option<i64>,
    pub order: Option<i64>,
    pub category: Option<CategoryRef>,
    #[serde(alias = "createdAt")]
    pub created_at: Option<DateTime<Utc>>,
    pub text: Option<String>,
    pub summary: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Owner {
    pub name: String,
    pub username: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Seo {
    pub title: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SiteUrls {
    pub web_url: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Aggregate {
    pub user: Owner,
    pub seo: Seo,
    pub url: SiteUrls,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct Stat {
    pub call_time: i64,
    pub posts: i64,
    pub notes: i64,
    pub link_apply: i64,
    pub comments: i64,
    pub today_ip_access_count: i64,
    pub online: i64,
}

#[derive(Deserialize)]
struct Envelope<T> {
    data: T,
}

#[derive(Deserialize)]
struct ErrorEnvelope {
    error: ErrorBody,
}

#[derive(Deserialize)]
struct ErrorBody {
    code: String,
    message: String,
}

fn parse_error(status: u16, body: &[u8]) -> ApiError {
    match serde_json::from_slice::<ErrorEnvelope>(body) {
        Ok(ErrorEnvelope { error }) => ApiError {
            code: error.code,
            message: error.message,
        },
        Err(_) => ApiError {
            code: format!("HTTP_{status}"),
            message: String::from_utf8_lossy(body).into_owned(),
        },
    }
}

pub fn parse_envelope<T: DeserializeOwned>(status: u16, body: &[u8]) -> Result<T, ApiError> {
    if !(200..300).contains(&status) {
        return Err(parse_error(status, body));
    }
    serde_json::from_slice::<Envelope<T>>(body)
        .map(|e| e.data)
        .map_err(|err| ApiError {
            code: "DECODE".to_string(),
            message: err.to_string(),
        })
}

fn encode_uri_component(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for byte in input.bytes() {
        if byte.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&byte) {
            out.push(byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

pub fn build_url(web_url: &str, doc: &Doc) -> Option<String> {
    let web_url = web_url.trim_end_matches('/');
    let path = match (&doc.title, doc.nid, &doc.slug, doc.order) {
        (Some(_), Some(nid), _, _) => format!("/notes/{nid}"),
        (Some(_), None, Some(slug), None) => {
            let category = doc.category.as_ref().and_then(CategoryRef::slug)?;
            format!("/posts/{category}/{}", encode_uri_component(slug))
        }
        (Some(_), None, Some(slug), Some(_)) => format!("/{slug}"),
        _ => "/".to_string(),
    };
    Some(format!("{web_url}{path}"))
}

pub struct MxApi {
    http: reqwest::Client,
    base: String,
    token: String,
    aggregate_cache: Mutex<Option<(Instant, Aggregate)>>,
}

fn network_error(err: reqwest::Error) -> ApiError {
    ApiError {
        code: "NETWORK".to_string(),
        message: err.to_string(),
    }
}

impl MxApi {
    pub fn new(config: &Config) -> Self {
        let http = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .timeout(Duration::from_secs(15))
            .build()
            .expect("reqwest client");
        Self {
            http,
            base: config.mx_api_endpoint.clone(),
            token: config.mx_token.clone(),
            aggregate_cache: Mutex::new(None),
        }
    }

    async fn send(
        &self,
        method: Method,
        path: &str,
        body: Option<Value>,
    ) -> Result<(u16, Vec<u8>), ApiError> {
        let request_id = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| format!("{:x}", d.as_nanos()))
            .unwrap_or_default();
        let mut req = self
            .http
            .request(method, format!("{}{path}", self.base))
            .header("x-api-key", &self.token)
            .header("x-request-id", request_id);
        if let Some(body) = body {
            req = req.json(&body);
        }
        let res = req.send().await.map_err(network_error)?;
        let status = res.status().as_u16();
        let bytes = res.bytes().await.map_err(network_error)?;
        if !(200..300).contains(&status) {
            tracing::error!("mx api {path} failed: {status}");
        }
        Ok((status, bytes.to_vec()))
    }

    async fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T, ApiError> {
        let (status, body) = self.send(Method::GET, path, None).await?;
        parse_envelope(status, &body)
    }

    async fn call(&self, method: Method, path: &str, body: Option<Value>) -> Result<(), ApiError> {
        let (status, body) = self.send(method, path, body).await?;
        if (200..300).contains(&status) {
            Ok(())
        } else {
            Err(parse_error(status, &body))
        }
    }

    pub async fn posts(&self, page: u32, size: u32) -> Result<Vec<Doc>, ApiError> {
        self.get(&format!("/posts?page={page}&size={size}")).await
    }

    pub async fn notes(&self, page: u32, size: u32) -> Result<Vec<Doc>, ApiError> {
        self.get(&format!("/notes?page={page}&size={size}")).await
    }

    pub async fn post(&self, id: &str) -> Result<Doc, ApiError> {
        self.get(&format!("/posts/{id}")).await
    }

    pub async fn note(&self, id: &str) -> Result<Doc, ApiError> {
        self.get(&format!("/notes/{id}")).await
    }

    pub async fn page(&self, id: &str) -> Result<Doc, ApiError> {
        self.get(&format!("/pages/{id}")).await
    }

    pub async fn stat(&self) -> Result<Stat, ApiError> {
        self.get("/aggregate/stat").await
    }

    pub async fn aggregate(&self) -> Result<Aggregate, ApiError> {
        if let Some((at, agg)) = self.aggregate_cache.lock().unwrap().as_ref()
            && at.elapsed() < AGGREGATE_TTL
        {
            return Ok(agg.clone());
        }
        let agg: Aggregate = self.get("/aggregate").await?;
        *self.aggregate_cache.lock().unwrap() = Some((Instant::now(), agg.clone()));
        Ok(agg)
    }

    pub async fn url_builder(&self, id: &str) -> Result<Option<String>, ApiError> {
        self.get(&format!("/helper/url-builder/{id}")).await
    }

    pub async fn hitokoto(&self) -> Option<String> {
        #[derive(Deserialize)]
        struct Hitokoto {
            hitokoto: String,
        }
        let res = self
            .http
            .get("https://v1.hitokoto.cn/")
            .timeout(Duration::from_secs(2))
            .send()
            .await
            .ok()?;
        res.json::<Hitokoto>().await.ok().map(|h| h.hitokoto)
    }

    pub async fn owner_reply(&self, comment_id: &str, text: &str) -> Result<(), ApiError> {
        self.call(
            Method::POST,
            &format!("/comments/owner-reply/{comment_id}"),
            Some(json!({ "text": text })),
        )
        .await
    }

    pub async fn link_audit_pass(&self, id: &str) -> Result<(), ApiError> {
        self.call(Method::PATCH, &format!("/links/audit/{id}"), None)
            .await
    }

    pub async fn link_audit_reject(&self, id: &str, reason: &str) -> Result<(), ApiError> {
        self.call(
            Method::POST,
            &format!("/links/audit/reason/{id}"),
            Some(json!({ "reason": reason, "state": LINK_STATE_REJECT })),
        )
        .await
    }
}
