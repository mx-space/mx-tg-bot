# mx-tg-bot Rust 重写设计

日期：2026-10-06
分支：`rust-rewrite`

## 目标与范围

**目标**：降低 Railway 常驻内存（Node 约 100–150 MB → Rust 目标 ≤ 20 MB），同时保持现有 mx-space 与 GitHub 通知行为不变。

**保留**

- mx-space：webhook 事件转发（8 个事件）、评论回复、友链审核按钮、命令 `/start` `/help` `/mx_get_detail` `/mx_get_notes` `/mx_get_posts` `/mx_stat`、新成员欢迎（附一言）
- GitHub webhook：push / issues(opened) / release(released) / check_run(main/master 失败) / pull_request(opened)
- HTTP：`GET /`、`GET /health/check`、`POST /mx/webhook`、`POST /gh/webhook`

**砍掉**

- Bilibili 直播轮询、早晚定时消息
- mx-space WS socket（TS 版已注释停用）及 `MX_SPACE_GATEWAY_ENDPOINT`
- fastify 插件（cors / helmet / etag / multipart / rate-limit / sensible）
- GitHub push 事件中 `commits` 非数组的分支（Gitee 格式）

**成功标准**

1. 上述保留功能在生产环境逐项可用，消息文案与 TS 版一致
2. Railway Metrics 显示常驻内存 ≤ 20 MB
3. `cargo test` 与 `cargo clippy -- -D warnings` 通过

## 技术选型

| 职责        | crate                                             |
| ----------- | ------------------------------------------------- |
| 异步运行时  | `tokio`                                           |
| Telegram    | `teloxide`（long polling + Dispatcher，`rustls`） |
| HTTP 服务   | `axum`                                            |
| HTTP 客户端 | `reqwest`（`rustls-tls`，无 openssl）             |
| Markdown    | `pulldown-cmark`                                  |
| 序列化      | `serde` / `serde_json`                            |
| 签名        | `hmac` + `sha1` + `sha2` + `hex`                  |
| 时间        | `chrono`                                          |
| 日志        | `tracing` + `tracing-subscriber`                  |
| `.env`      | `dotenvy`                                         |

## 结构

```
Cargo.toml
Dockerfile
src/
  main.rs            加载配置；启动 dispatcher、axum、polling 监督任务；SIGTERM 优雅退出
  config.rs          env + 常量（OWNER_ID、MX_WATCH_GROUP_IDS、MX_WATCH_CHANNEL_ID、GH_WATCH_GROUP_IDS、USER_AGENT）
  tg.rs              Sendable：Text / Html / Photo(urls, caption, html) + url 按钮；send(bot, chat_id, &Sendable)
  rich_text.rs       escape_html、md_to_tg_html、truncate_with_ellipsis、escape_markdown_v2、strip_markdown
  time.rs            relative_time_from_now
  ttl_map.rs         TtlMap<V>：key = (chat_id, message_id)，cap 200，TTL 24h，get / consume
  mx/
    mod.rs           /mx/webhook：双签名校验 → 回 200 → spawn 分发
    api.rs           v3 客户端 + aggregate 5s 缓存
    events.rs        8 个事件 payload struct + build_* 纯函数 + handler
    commands.rs      命令 + 文本回复（评论回复 / 友链拒绝理由）+ new_chat_members
    link_audit.rs    callback link:pass:<id> / link:reject:<id>
  github.rs          /gh/webhook：sha256 校验 → 回 200 → spawn；5 个事件
```

每个文件 ≤ 500 行。`AppState`（`Arc`）持有：`Bot`、`MxApi`、`comment_reply: TtlMap<String>`、`link_audit: TtlMap<LinkAuditTarget>`。

### 配置

env：`TG_BOT_TOKEN`、`MX_SPACE_TOKEN`、`MX_SPACE_API_ENDPOINT`、`MX_SPACE_WEBHOOK_SECRET`、`GH_WEBHOOK_SECRET`、`PORT`（默认 3000）、`SERVER_HOSTNAME`（默认 `127.0.0.1`）。默认值与 TS 版 `src/server.ts` 相同，生产 env 无需改动。启动时用 `dotenvy` 读取仓库根目录 `.env`（不存在则忽略）。缺失任一必填项启动即退出并打印缺失项。

群组 ID、owner ID 与 TS 版 `app.config.ts` 相同，作为编译期常量。

## 数据流

```
mx-core ─POST /mx/webhook─▶ axum ─验签─▶ 200 ─spawn─▶ handler ─▶ Bot ─▶ TG
GitHub  ─POST /gh/webhook─▶ axum ─验签─▶ 200 ─spawn─▶ handler ─▶ Bot ─▶ TG
TG ─long polling─▶ Dispatcher ─▶ 命令 / 回复文本 / callback ─▶ MxApi ─▶ TG
```

验签通过后立即回 200 再异步处理：mx-core 发送带 `retry: 10`，慢响应或错误会导致重复推送。

### mx webhook 验签

已核实（mx-core `1b526f127`，`apps/core/src/modules/webhook/webhook.service.ts:146`）：core 只 stringify 一次，签名与发送的 body 是同一份字节。

- 头：`X-Webhook-Event`、`X-Webhook-Signature`（sha1 hex）、`X-Webhook-Signature256`（sha256 hex）、`X-Webhook-Source`（缺省 `system`）
- 对**原始 body 字节**计算 HMAC，两个签名都需常量时间比对通过；否则 401 `{"ok":false,"message":"Invalid Signature"}`
- 未处理的事件类型：回 200，只记 debug 日志

### GitHub webhook 验签

- 头：`X-GitHub-Event`、`X-Hub-Signature-256`（`sha256=<hex>`）
- 对原始 body 字节校验；失败 401
- `ping` 回 200 不处理
- bot 过滤：login / pusher 以 `[bot]` 结尾或在 `["renovate[bot]"]` 中则忽略

### 字段命名

- webhook payload：camelCase（来源 `mx-core/packages/webhook/src/models.generated.ts`）→ `#[serde(rename_all = "camelCase")]`
- REST v3 响应：snake_case，包裹 `{"data": T}`；错误 `{"error":{"code","message"}}`
- 所有 struct 只声明用到的字段，未知字段忽略

### mx v3 客户端（`mx/api.rs`）

- base URL：`MX_SPACE_API_ENDPOINT`
- 固定头：`x-api-key: <MX_SPACE_TOKEN>`、浏览器 `user-agent`（core 反爬拒绝默认 UA）、`x-request-id`
- 方法：`posts(page, size)`、`notes(page, size)`、`stat()`、`aggregate()`（5s TTL，`Mutex<Option<(Instant, Aggregate)>>`）、`post(id)`、`note(id)`、`page(id)`、`owner_reply(comment_id, text)`、`link_audit_pass(id)`、`link_audit_reject(id, reason)`、`url_builder(id)`
- 每个方法的路径与请求体在实现时对照 mx-core controller 核对
- 错误类型 `ApiError { code, message }`；网络错误映射为 `message = 错误描述`

### 事件行为（与 TS 版一致）

| 事件              | 行为                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST_CREATE`     | 发群：`{owner} 发布了新文章: {title}\n\n{summary}\n\n前往阅读：{url}`；无 category 记错误日志跳过                                                      |
| `POST_UPDATE`     | 仅当创建超过 90 天时发群，文案「更新了文章」                                                                                                           |
| `NOTE_CREATE`     | 有密码或 `publicAt` 在未来则跳过；含心情/天气、200 字预览；有图片发 media group                                                                        |
| `LINK_APPLY`      | 仅 `state == Audit`；发群（有 avatar 发图片 + caption ≤ 1024，否则 HTML）；再发 owner 带「✅ 通过 / ❌ 拒绝」按钮                                      |
| `COMMENT_CREATE`  | 解析 ref（post/note/page）；`source == admin` 只发 owner；悄悄话发群提示 + 发 owner；否则发群 HTML + 「查看」按钮；发 owner 的消息记入 `comment_reply` |
| `SAY_CREATE`      | 发群纯文本                                                                                                                                             |
| `RECENTLY_CREATE` | enrichment 中按出现位置选最早的可识别分类，按 `CATEGORY_PHRASES` 拼 HTML；无则纯文本                                                                   |
| `ACTIVITY_LIKE`   | `url_builder(ref.id)` 后发 `MX_WATCH_CHANNEL_ID`，带「查看」按钮                                                                                       |

### Telegram 交互

- 文本消息：仅 owner 私聊、且是回复消息时处理。先查 `link_audit.consume`（拒绝理由）→ 调 `link_audit_reject` 并编辑原消息追加「❌ 已拒绝：{reason}」；否则查 `comment_reply.get` → 调 `owner_reply`。成功/失败回复「回复成功！」/「回复失败！{message}」
- callback：非 owner 弹 alert「仅主人可操作」；pass → 调接口、编辑原消息追加「✅ 已通过」、移除按钮；reject → 移除按钮、发 force reply「请回复此消息写拒绝理由」并记入 `link_audit`
- 命令回复使用 MarkdownV2（与 TS 版一致），`/help` 使用 HTML，命令表为静态数组；启动时 `setMyCommands` 一次
- `new_chat_members`：欢迎 + 一言（`https://v1.hitokoto.cn/`，2s 超时，失败则省略一言）

### Markdown → TG HTML

对齐 `src/lib/rich-text/markdown-to-html.ts` 的渲染规则：gfm + 硬换行；code block `<pre>` / `<pre><code class="language-x">`；heading → `<b>`；列表项 `• `；任务框 `☑ ` / `☐ `；hr `———`；表格丢弃；原始 HTML 转义；链接仅允许 `http(s):` `tg:` `mailto:`，否则保留文字；图片渲染为链接（alt 缺省 `image`）；3 个以上连续换行压成 2 个后 trim。`md(text)` 默认截断 3500 字符，整条消息截断 4096（caption 1024），截断以 `…` 结尾。长度按 UTF-16 code unit 计（与 JS `.length` 及 TG 限制一致）。

## 错误处理

- handler 错误：`tracing::error!` 记录，不 panic，不影响其他事件
- Dispatcher：配置 `error_handler` 记录日志并继续
- polling 活性监督：每 5 分钟调 `getWebhookInfo`，`pending_update_count > 0` 连续 3 次 → `std::process::exit(1)`，由 Railway 重启
- 发群：对每个群独立发送，单个失败不阻止其他群

## 测试

- `tests/fixtures/rich_text.json`：用现有 TS 实现跑约 15 条 markdown 样例（含代码块、列表、任务框、表格、HTML、危险链接、超长文本、中文）生成期望输出；Rust `md_to_tg_html` 逐条一致
- 验签：固定 secret + body，正确与篡改各一例（mx 双签名、GitHub sha256）
- `build_*` 纯函数：每个事件一份 payload fixture，断言输出 `Sendable`
- `ttl_map`（过期、容量淘汰、consume）、`relative_time_from_now`（各区间边界）、url 构建（post / note / page / 缺 category）

不 mock 网络与 Telegram。

## 部署

- Dockerfile：`rust:alpine` 构建 `x86_64-unknown-linux-musl` 静态二进制 → `scratch`；端口由 `PORT` 决定
- `railway.json`：`startCommand` → `/mx-tg-bot`
- 删除：`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`tsconfig.json`、`tsdown.config.ts`、`.eslintrc.cjs`、`.eslintignore`、`.eslintcache`、`.prettierrc.cjs`、`.husky/`、`packages/`、`patches/`、`app.config.ts`、`src/**/*.ts`、`src/bot/raw.json`、`fly.toml`、`docker-compose.yml`、`dist/`
- 保留：`.changie.yaml`、`.changes/`、`renovate.json`、`LICENSE`、`.env.example`（移除 `MX_SPACE_GATEWAY_ENDPOINT` 相关说明）
- README：更新技术栈与本地运行（`cargo run`）

## 切换

1. `rust-rewrite` 分支完成实现，`cargo test` 与 `cargo clippy -- -D warnings` 通过
2. 本地联调使用**独立测试 bot token**（同一 token 双 poller 会 409）；webhook 用 curl 发送带签名的 fixture
3. 合并 main → Railway 自动部署 → 验证：`/health/check`、`/mx_stat`、mx-core 后台测试 webhook、`getWebhookInfo` pending = 0、Metrics 内存
4. 回滚：`git revert` 合并提交，Railway 重新部署 TS 版；env 两版通用

## 估时

实现 1.5–2 天；联调与切换 0.5 天。
