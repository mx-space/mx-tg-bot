import RemoveMarkdown from "remove-markdown";
import type { Telegraf } from "telegraf";
import type { Message, Update } from "telegraf/types";
import { z } from "zod";
import { appConfig } from "~/app.config";
import type { PluginFunction } from "~/lib/plugin";

import { createHandler, type WebhookEventSource } from "@mx-space/webhook";

import { escapeMarkdown } from "~/lib/helper";
import { setTGBotCommands } from "~/lib/register-command";
import { relativeTimeFromNow } from "~/lib/time";

import { apiClient } from "./api-client";
import { fetchHitokoto } from "./api/hitokoto";
import { getCommentReplyTarget } from "./comment-reply-target";
import { getMxSpaceAggregateData } from "./data";
import { handleEvent } from "./event-handler";
import {
  registerLinkAuditActions,
  rejectLinkWithReason,
} from "./link-audit-actions";
import { consumeLinkAuditTarget } from "./link-audit-target";
import { urlBuilder } from "./utils";

export const register: PluginFunction = async (ctx) => {
  const { tgBot } = ctx;
  const dispatchEvent = handleEvent(ctx);

  // const socket = createMxSocket(ctx)

  const handler = createHandler({
    secret: appConfig.mxSpace.webhookSecret,
  });

  ctx.server.post("/mx/webhook", (req, res) => {
    Object.assign(req.raw, {
      body: req.body,
    });
    handler(req.raw as any, res.raw);
  });

  handler.emitter.on("*", (event) => {
    const { payload, type } = event;
    const source =
      (event as { source?: WebhookEventSource }).source ?? "system";

    dispatchEvent(type as any, payload, source);
  });

  // socket.connect()
  await Promise.all([bindEvents(tgBot), bindCommands(tgBot)]);
};

async function bindEvents(tgBot: Telegraf) {
  registerLinkAuditActions(tgBot);

  tgBot.on("new_chat_members", async (ctx) => {
    const { hitokoto } = await fetchHitokoto();
    const identifier = ctx.from.username
      ? `@${ctx.from.username}`
      : `${ctx.from.first_name}(${ctx.from.id})`;
    ctx.sendMessage(`欢迎新大佬 ${identifier} \n\n${hitokoto}`, {
      parse_mode: "MarkdownV2",

      reply_parameters: {
        message_id: ctx.message.message_id,
      },
    });
  });

  tgBot.on("text", async (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId || chatId !== appConfig.ownerId) return;

    const message = ctx.message as Update.New &
      Update.NonChannel &
      Message.TextMessage;
    const text = message.text;
    if (!text) return;

    const replyToMessageId = message.reply_to_message?.message_id;
    if (!replyToMessageId) return;

    const linkAudit = consumeLinkAuditTarget(chatId, replyToMessageId);
    if (linkAudit) {
      await rejectLinkWithReason(tgBot, linkAudit.linkId, text, {
        chatId: linkAudit.originalChatId,
        messageId: linkAudit.originalMessageId,
        isPhoto: linkAudit.originalIsPhoto,
        caption: linkAudit.originalCaption,
      })
        .then(() => {
          ctx.reply("已拒绝并告知申请人。");
        })
        .catch((err) => {
          ctx.reply(`拒绝失败！${err.message}`);
        });
      return;
    }

    const toCommentId = getCommentReplyTarget(chatId, replyToMessageId);
    if (!toCommentId) return;

    await apiClient.comment
      .proxy("owner-reply")(toCommentId)
      .post({
        data: { text },
      })
      .then(() => {
        ctx.reply("回复成功！");
      })
      .catch((err) => {
        ctx.reply(`回复失败！${err.message}`);
      });
  });
}

async function bindCommands(tgBot: Telegraf) {
  await setTGBotCommands(tgBot, [
    {
      command: "mx_get_detail",
      description: "获取 Post 或 Note 详情",
      group: "mx_space",
      handler: async (cmdLine, ctx) => {
        const [type, offset = 1] = cmdLine.split(" ");
        if (!type) {
          return escapeMarkdown(
            "Usage: /mx_get_detail <type> [offset=1]\n\nType: post, note",
          );
        }
        const schema = z.object({
          type: z.enum(["post", "note"]),
          offset: z.number().gt(1).int().safe().optional(),
        });

        const result = schema.safeParse({ type, offset: +offset });
        if (!result.success) {
          ctx.reply(result.error.issues.map((v) => v.message).join("\n"), {
            reply_parameters: {
              message_id: ctx.message.message_id,
            },
          });
          return;
        }

        let markup = "";
        switch (type) {
          case "post": {
            const data = await apiClient.post.getList(+offset, 1);
            if (!data.data.length) {
              break;
            }
            const postDetail = data.data[0];
            const url = await urlBuilder.build(postDetail);

            markup = `[${escapeMarkdown(
              postDetail.title,
            )}](${url})\n\n${escapeMarkdown(
              RemoveMarkdown(postDetail.text || ""),
            )
              .split("\n\n")
              .slice(0, 3)
              .join("\n\n")}\n\n[阅读全文](${escapeMarkdown(url)})`;
            break;
          }
          case "note": {
            const data = await apiClient.note.getList(+offset, 1);
            if (!data.data.length) {
              break;
            }
            const noteDetail = data.data[0];
            const url = await urlBuilder.build(noteDetail);
            markup = `[${escapeMarkdown(
              noteDetail.title,
            )}](${url})\n\n${escapeMarkdown(
              RemoveMarkdown(noteDetail.text || ""),
            )
              .split("\n\n")
              .slice(0, 3)
              .join("\n\n")}\n\n[阅读全文](${escapeMarkdown(url)})`;

            break;
          }
        }

        return markup;
      },
    },
    {
      command: "mx_get_notes",
      description: "获取最新的 Note 列表",
      group: "mx_space",
      handler: async (cmdLine) => {
        const page = Number(cmdLine) || 1;
        const data = await apiClient.note.getList(page, 10);
        const aggregateData = await getMxSpaceAggregateData();
        const { webUrl } = aggregateData.url;
        const text = data.data
          .map(
            (note) =>
              `${relativeTimeFromNow(note.created)}前\n[${escapeMarkdown(
                note.title,
              )}](${webUrl}/notes/${note.nid})`,
          )
          .join("\n");

        const markupText = `*文章列表*\n\n${text}`;

        return markupText;
      },
    },
    {
      command: "mx_get_posts",
      description: "获取最新的 Post 列表",
      group: "mx_space",
      handler: async (cmdLine) => {
        const page = Number(cmdLine) || 1;
        const data = await apiClient.post.getList(page);
        const aggregateData = await getMxSpaceAggregateData();
        const { webUrl } = aggregateData.url;
        const text = data.data
          .map(
            (post) =>
              `${relativeTimeFromNow(post.created)}前\n[${escapeMarkdown(
                post.title,
              )}](${webUrl}/posts/${post.category.slug}/${post.slug})`,
          )
          .join("\n");

        const markupText = `*文章列表*\n\n${text}`;

        return markupText;
      },
    },

    {
      command: "mx_stat",
      description: "获取 MX Space 统计信息",
      group: "mx_space",
      handler: async () => {
        const data = await apiClient.aggregate.getStat();
        const {
          callTime,
          posts,
          notes,
          linkApply,
          comments,
          todayIpAccessCount,
          online,
        } = data;
        return `MX Space 统计信息\n\n文章数：${posts}\n说说数：${notes}\n友链申请数：${linkApply}\n评论数：${comments}\n今日访问量：${todayIpAccessCount}\n在线总数：${online}\n调用次数：${callTime}`;
      },
    },
  ]);
}
