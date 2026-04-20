import { LinkState } from "@mx-space/api-client";
import { Markup, type Context, type Telegraf } from "telegraf";
import type { Update } from "telegraf/types";
import { appConfig } from "~/app.config";
import { createNamespaceLogger } from "~/lib/logger";

import { apiClient } from "./api-client";
import { trackLinkAuditTarget } from "./link-audit-target";

const logger = createNamespaceLogger("link-audit");

type ActionCtx = Context<Update.CallbackQueryUpdate> & {
  match: RegExpExecArray;
};

const isPhotoMessage = (message: unknown): boolean => {
  return !!(message as { photo?: unknown[] } | undefined)?.photo?.length;
};

const getOriginalCaption = (message: unknown): string => {
  const msg = message as { caption?: string; text?: string } | undefined;
  return msg?.caption ?? msg?.text ?? "";
};

const editMessageWithResult = async (ctx: ActionCtx, suffix: string) => {
  const message = ctx.callbackQuery.message;
  const originalText = getOriginalCaption(message);
  const nextText = `${originalText}\n\n${suffix}`.trim();

  try {
    if (isPhotoMessage(message)) {
      await ctx.editMessageCaption(nextText);
    } else {
      await ctx.editMessageText(nextText);
    }
  } catch (err) {
    logger.error(
      `[link-audit]: edit message failed: ${(err as Error).message}`,
    );
  }

  try {
    await ctx.editMessageReplyMarkup(undefined);
  } catch {
    // ignore
  }
};

export const registerLinkAuditActions = (tgBot: Telegraf) => {
  tgBot.action(/^link:pass:(.+)$/, async (ctx) => {
    const fromId = ctx.from?.id;
    if (fromId !== appConfig.ownerId) {
      await ctx.answerCbQuery("仅主人可操作", { show_alert: true });
      return;
    }

    const linkId = ctx.match[1];
    try {
      await (apiClient.link as any).proxy.audit(linkId).patch();
      await ctx.answerCbQuery("已通过");
      await editMessageWithResult(ctx, "✅ 已通过");
    } catch (err) {
      logger.error(`[link-audit]: pass failed: ${(err as Error).message}`);
      await ctx.answerCbQuery(`失败：${(err as Error).message}`, {
        show_alert: true,
      });
    }
  });

  tgBot.action(/^link:reject:(.+)$/, async (ctx) => {
    const fromId = ctx.from?.id;
    if (fromId !== appConfig.ownerId) {
      await ctx.answerCbQuery("仅主人可操作", { show_alert: true });
      return;
    }

    const linkId = ctx.match[1];
    const message = ctx.callbackQuery.message;
    if (!message) {
      await ctx.answerCbQuery("消息已失效", { show_alert: true });
      return;
    }

    const originalChatId = message.chat.id;
    const originalMessageId = message.message_id;
    const originalIsPhoto = isPhotoMessage(message);
    const originalCaption = getOriginalCaption(message);

    try {
      await ctx.editMessageReplyMarkup(undefined);
    } catch {
      // ignore
    }

    const prompt = await ctx.reply(
      "请回复此消息写拒绝理由",
      Markup.forceReply(),
    );

    trackLinkAuditTarget(prompt.chat.id, prompt.message_id, {
      linkId,
      originalChatId,
      originalMessageId,
      originalIsPhoto,
      originalCaption,
    });

    await ctx.answerCbQuery("请回复理由");
  });
};

export const rejectLinkWithReason = async (
  tgBot: Telegraf,
  linkId: string,
  reason: string,
  original: {
    chatId: number;
    messageId: number;
    isPhoto: boolean;
    caption: string;
  },
) => {
  await (apiClient.link as any).proxy.audit.reason(linkId).post({
    data: { reason, state: LinkState.Reject },
  });

  const nextText = `${original.caption}\n\n❌ 已拒绝：${reason}`.trim();
  try {
    if (original.isPhoto) {
      await tgBot.telegram.editMessageCaption(
        original.chatId,
        original.messageId,
        undefined,
        nextText,
      );
    } else {
      await tgBot.telegram.editMessageText(
        original.chatId,
        original.messageId,
        undefined,
        nextText,
      );
    }
  } catch (err) {
    logger.error(
      `[link-audit]: edit original message failed: ${(err as Error).message}`,
    );
  }

  try {
    await tgBot.telegram.editMessageReplyMarkup(
      original.chatId,
      original.messageId,
      undefined,
      undefined,
    );
  } catch {
    // ignore
  }
};
