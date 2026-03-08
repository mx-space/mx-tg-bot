import { appConfig } from "app.config";
import type { BusinessEvents } from "@mx-space/webhook";
import { Markup } from "telegraf";

import { apiClient } from "../api-client";

import type { MxEventHandler } from "./types";

export const handleActivityLike: MxEventHandler<
  BusinessEvents.ACTIVITY_LIKE
> = async (runtime, payload) => {
  const {
    ref: { id, title },
    reader,
  } = payload;

  const refModelUrl = await apiClient.proxy
    .helper("url-builder")(id)
    .get<{
      data: string;
    }>()
    .then((res) => res.data);

  await runtime.ctx.tgBot.telegram.sendMessage(
    appConfig.mxSpace.watchChannelId,
    reader
      ? `${reader.name} 点赞了「${title}」\n`
      : `「${title}」有人点赞了哦！\n`,
    Markup.inlineKeyboard([
      {
        url: refModelUrl,
        text: "查看",
      },
    ]),
  );
};
