# Mix Space Telegram Bot

A Telegram Bot service built with Fastify + Telegraf, focused on Mix Space notifications, comment interactions, GitHub webhook forwarding, and Bilibili live alerts.

This project was migrated from [imx-bot](https://github.com/Innei/imx-bot) and continues to evolve.

## Features

- Mix Space webhook subscriptions: forward posts, notes, comments, status updates, likes, and link applications to Telegram groups
- Telegram commands: fetch posts/notes, query statistics, and assist with comment replies
- GitHub webhook integration: Push, Issue, PR, Release, and CI failure notifications
- Bilibili live polling: detect stream start and notify groups
- Scheduled jobs: morning and evening messages
- HTTP service: health checks and webhook endpoints

## Tech Stack

- Runtime: Node.js (>= 16.20.0)
- Language: TypeScript
- Web framework: Fastify
- Telegram SDK: Telegraf
- Data source: `@mx-space/api-client` + `@mx-space/webhook`
- Scheduler: `cron`
- Package manager: pnpm (`pnpm@9.15.9`)

## Project Structure

```text
src/
  app.ts                     # Fastify app composition; initializes bot and modules
  server.ts                  # Entry point; loads .env and starts Fastify
  app.config.ts              # appConfig re-export
  modules/
    loader.ts                # Auto-loads module directories and registers plugins
    mx-space/                # Mix Space logic (webhooks, commands, event forwarding)
    github/                  # GitHub webhook handling
    bilibili/                # Bilibili live polling and notifications
  bot/
    index.ts                 # Telegraf initialization and /help command
  routes/
    root.ts                  # / and /health/check
```

## Local Development

### 1) Install Dependencies

```bash
pnpm install
```

### 2) Configure Environment Variables

The service loads `.env` from the repository root via `dotenv` and validates required values with Zod at startup.

Create `.env`:

```bash
cp .env.example .env
```

If `.env.example` does not exist in the repo, create `.env` manually with:

```bash
MX_SPACE_TOKEN=
TG_BOT_TOKEN=
GH_WEBHOOK_SECRET=
MX_SPACE_API_ENDPOINT=
MX_SPACE_GATEWAY_ENDPOINT=
MX_SPACE_WEBHOOK_SECRET=

# Optional
PORT=3000
SERVER_HOSTNAME=127.0.0.1
```

Variable reference:

- `MX_SPACE_TOKEN`: Mix Space API access token
- `TG_BOT_TOKEN`: Telegram Bot token (from BotFather)
- `GH_WEBHOOK_SECRET`: GitHub webhook secret
- `MX_SPACE_API_ENDPOINT`: Mix Space API endpoint (URL)
- `MX_SPACE_GATEWAY_ENDPOINT`: Mix Space Gateway endpoint (URL)
- `MX_SPACE_WEBHOOK_SECRET`: Mix Space webhook secret
- `PORT`: service port (default `3000`)
- `SERVER_HOSTNAME`: bind host (default `127.0.0.1`)

### 3) Run the Service

Development mode (watch):

```bash
pnpm dev
```

Run directly:

```bash
pnpm start
```

Build and run production:

```bash
pnpm build
pnpm start:prod
```

## NPM Scripts

- `pnpm dev`: development mode (`tsx watch`)
- `pnpm build`: compile TypeScript
- `pnpm typecheck`: type checking
- `pnpm lint`: ESLint with auto-fix
- `pnpm format`: format with Prettier
- `pnpm start`: run `src/server.ts` directly
- `pnpm start:prod`: run compiled output

## Webhook and HTTP Endpoints

Health checks:

- `GET /`
- `GET /health/check`

Webhook callbacks:

- `POST /mx/webhook`: Mix Space webhook (must match `MX_SPACE_WEBHOOK_SECRET`)
- `POST /gh/webhook`: GitHub webhook (must match `GH_WEBHOOK_SECRET`)

## Telegram Behavior

### Built-in Commands

- `/start`: basic greeting
- `/help`: auto-generated command help (grouped by module)

### Mix Space Commands (Registered at Runtime)

- `/mx_get_detail <post|note> [offset]`
- `/mx_get_notes [page]`
- `/mx_get_posts [page]`
- `/mx_stat`

### Automated Messages

- Mix Space event forwarding to configured groups
- GitHub event forwarding to configured groups
- Bilibili live stream alerts
- Scheduled morning (06:00) / evening (22:00) messages

## Deployment Notes

- Deploy in a public environment reachable by Mix Space and GitHub callbacks
- Expose `POST /mx/webhook` and `POST /gh/webhook` through a reverse proxy (Nginx/Caddy)
- Ensure server timezone matches your expected cron schedule
- Keep sensitive variables in secure environment config; never commit `.env`
- Use a process supervisor (systemd / pm2 / container orchestration)

## Troubleshooting

- Startup fails on env validation: check `.env` completeness and URL formats
- Telegram messages not sent: verify `TG_BOT_TOKEN`, group IDs, and bot permissions
- GitHub/Mix Space webhook failures: verify secrets first, then callback URL and proxy logs
- No Bilibili alert: confirm non-development mode (polling is disabled in dev) and live room ID

## License

2023 © [Innei](https://innei.in), MIT License.
