import { LinkState } from "@mx-space/api-client";
import type { BusinessEvents } from "@mx-space/webhook";
import { Markup } from "telegraf";
import { appConfig } from "~/app.config";
import { md, richify, richifyCaption } from "~/lib/rich-text";
import type { Sendable } from "~/lib/sendable";

import type { MxEventHandler } from "./types";

export const handleLinkApply: MxEventHandler<
  BusinessEvents.LINK_APPLY
> = async (runtime, payload) => {
  const { avatar, name, url, description, state } = payload;
  if (state !== LinkState.Audit) {
    return;
  }

  const message = avatar
    ? richifyCaption`有新的友链申请了耶！\n${name}\n${url}\n\n${md(
        description,
        {
          max: 800,
        },
      )}`
    : richify`有新的友链申请了耶！\n${name}\n${url}\n\n${md(description)}`;

  const sendable: Sendable = [];

  if (avatar) {
    sendable.push({
      type: "photo",
      url: [avatar],
      caption: message,
      parseMode: "HTML",
    });
  } else {
    sendable.push({
      type: "HTML",
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
      parse_mode: "HTML",
      ...keyboard,
    });
  } else {
    await telegram.sendMessage(appConfig.ownerId, message, {
      parse_mode: "HTML",
      ...keyboard,
    });
  }
};
