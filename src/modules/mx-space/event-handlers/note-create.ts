import dayjs from "dayjs";
import type { BusinessEvents } from "@mx-space/webhook";
import { default as rmd } from "remove-markdown";

import { urlBuilder } from "../utils";

import type { MxEventHandler } from "./types";

const getSimplePreview = (text: string) => {
  const rawText = rmd(text) as string;
  return rawText.length > 200 ? `${rawText.slice(0, 200)}...` : rawText;
};

const checkNoteIsSecret = (publicAt?: string | Date | null) => {
  if (!publicAt) {
    return false;
  }

  return dayjs(publicAt).isAfter(new Date());
};

export const handleNoteCreate: MxEventHandler<
  BusinessEvents.NOTE_CREATE
> = async (runtime, payload) => {
  const owner = (await runtime.getAggregateData()).user;
  const { title, text, mood, weather, images, hasPassword } = payload;
  const isSecret = checkNoteIsSecret(payload.publicAt);

  if (hasPassword || isSecret) {
    return;
  }

  const simplePreview = getSimplePreview(text || "");
  const status = [mood ? `心情: ${mood}` : ""]
    .concat(weather ? `天气: ${weather}` : "")
    .filter(Boolean)
    .join("\t");

  const message = `${owner.name} 发布了新生活观察日记: ${title}\n${
    status ? `\n${status}\n\n` : "\n"
  }${simplePreview}\n\n前往阅读：${await urlBuilder.build(payload)}`;

  if (Array.isArray(images) && images.length > 0) {
    await runtime.sendToGroup([
      {
        type: "photo",
        url: (images as { src?: string }[])
          .map((image) => image.src)
          .filter((src): src is string => Boolean(src)),
        caption: message,
      },
    ]);
    return;
  }

  await runtime.sendToGroup(message);
};
