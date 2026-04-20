import { LinkState } from "@mx-space/api-client";
import type { BusinessEvents } from "@mx-space/webhook";
import { Markup } from "telegraf";
import { appConfig } from "~/app.config";
import type { Sendable } from "~/lib/sendable";

import type { MxEventHandler } from "./types";

export const handleLinkApply: MxEventHandler<
  BusinessEvents.LINK_APPLY
> = async (runtime, payload) => {
  const { avatar, name, url, description, state } = payload;
  if (state !== LinkState.Audit) {
    return;
  }

  const message = `有新的友链申请了耶！\n${name}\n${url}\n\n${description}`;
  const sendable: Sendable = [];

  if (avatar) {
    sendable.push({
      type: "photo",
      url: [avatar],
      caption: message,
    });
  } else {
    sendable.push({
      type: "text",
      content: message,
    });
  }

  await runtime.sendToGroup(sendable);

  const linkId = payload.id || (payload as unknown as { _id?: string })._id;
  if (!linkId) {
    runtime.logger.error("[link-apply]: missing link id in payload");
    return;
  }

  const keyboard = Markup.inlineKeyboard([
    Markup.button.callback("✅ 通过", `link:pass:${linkId}`),
    Markup.button.callback("❌ 拒绝", `link:reject:${linkId}`),
  ]);

  const telegram = runtime.ctx.tgBot.telegram;
  if (avatar) {
    await telegram.sendPhoto(appConfig.ownerId, avatar, {
      caption: message,
      ...keyboard,
    });
  } else {
    await telegram.sendMessage(appConfig.ownerId, message, keyboard);
  }
};
