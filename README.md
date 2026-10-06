# Mix Space Telegram Bot

A Telegram bot written in Rust that forwards Mix Space and GitHub notifications and supports comment replies and friend-link review from Telegram.

This project was migrated from [imx-bot](https://github.com/Innei/imx-bot) and continues to evolve.

## Features

- Mix Space webhook subscriptions: posts, notes, comments, says, recently, likes, and link applications forwarded to Telegram groups
- Telegram commands: fetch posts/notes, query statistics, reply to comments, approve/reject link applications
- GitHub webhook integration: push, issue, PR, release, and CI failure notifications
- HTTP service: health checks and webhook endpoints

## Tech Stack

- Language: Rust (edition 2024)
- Runtime: tokio
- Telegram: teloxide (long polling)
- HTTP server: axum
- HTTP client: reqwest (rustls)
- Markdown: pulldown-cmark

## Project Structure

```text
src/
  main.rs            entry: config, dispatcher, HTTP server, polling watchdog
  app.rs             shared AppState
  config.rs          env vars and chat-id constants
  server.rs          axum router
  github.rs          GitHub webhook
  tg.rs              outbound Telegram message model
  rich_text.rs       Markdown → Telegram HTML / MarkdownV2 escaping
  signature.rs       webhook HMAC verification
  ttl_map.rs         bounded TTL map for reply targets
  watchdog.rs        exits when polling stalls so the platform restarts it
  mx/
    api.rs           Mix Space v3 API client
    events.rs        Mix Space event → Telegram message
    webhook.rs       /mx/webhook
    commands.rs      Telegram commands and owner replies
    link_audit.rs    friend-link approve/reject buttons
tests/               integration tests (fixtures generated from the former TS implementation)
```

## Local Development

1. Copy env: `cp .env.example .env` and fill in values
2. Run: `cargo run`
3. Test: `cargo test`

Use a separate test bot token locally. Two pollers on the same token conflict (HTTP 409) and will kick the production bot.

### Environment Variables

- `TG_BOT_TOKEN`: Telegram bot token (from BotFather)
- `MX_SPACE_API_ENDPOINT`: Mix Space v3 API base, e.g. `https://mx.innei.in/api/v3`
- `MX_SPACE_TOKEN`: Mix Space API key (sent as `x-api-key`)
- `MX_SPACE_WEBHOOK_SECRET`: Mix Space webhook secret
- `GH_WEBHOOK_SECRET`: GitHub webhook secret
- `PORT`: service port (default `3000`)
- `SERVER_HOSTNAME`: bind host (default `127.0.0.1`; use `0.0.0.0` in containers)
- `RUST_LOG`: log filter (default `info`)

## HTTP Endpoints

- `GET /`, `GET /health/check`: health checks
- `POST /mx/webhook`: Mix Space webhook (HMAC sha1 + sha256 over the raw body)
- `POST /gh/webhook`: GitHub webhook (`X-Hub-Signature-256`)

## Telegram Commands

- `/start`, `/help`
- `/mx_get_detail <post|note> [offset]`
- `/mx_get_notes [page]`
- `/mx_get_posts [page]`
- `/mx_stat`

Reply to a forwarded comment in the owner chat to answer it on the site. Link applications arrive with ✅/❌ buttons; ❌ asks for a reason by force-reply.

## Deployment

The `Dockerfile` builds a static musl binary into a `scratch` image (~10 MB). Railway auto-detects the root `Dockerfile`; the service restart policy is set to Always in the Railway dashboard.

If `getWebhookInfo` reports pending updates for 3 checks in a row (5 min apart), the bot exits so Railway restarts it and replays the backlog.

## License

2023 © [Innei](https://innei.in), MIT License.
