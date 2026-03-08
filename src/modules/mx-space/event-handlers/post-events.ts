import dayjs from "dayjs";
import type { BusinessEvents } from "@mx-space/webhook";

import { urlBuilder } from "../utils";

import type { MxEventHandler } from "./types";

const buildPostMessage = async (
  ownerName: string,
  publishDescription: string,
  payload: Parameters<typeof urlBuilder.build>[0],
  summary?: string | null,
) => {
  const url = await urlBuilder.build(payload);

  return `${ownerName} ${publishDescription}: ${payload.title}\n\n${
    summary ? `${summary}\n\n` : ""
  }\n前往阅读：${url}`;
};

export const handlePostCreate: MxEventHandler<
  BusinessEvents.POST_CREATE
> = async (runtime, payload) => {
  const owner = (await runtime.getAggregateData()).user;
  if (!payload.category) {
    runtime.logger.error(`category not found, post id: ${payload.id}`);
    return;
  }

  const message = await buildPostMessage(
    owner.name,
    "发布了新文章",
    payload,
    payload.summary,
  );

  await runtime.sendToGroup([
    {
      type: "text",
      content: message,
    },
  ]);
};

export const handlePostUpdate: MxEventHandler<
  BusinessEvents.POST_UPDATE
> = async (runtime, payload) => {
  const createdDate = dayjs(payload.created);
  const diff = dayjs().diff(createdDate, "day");
  if (diff < 90) {
    return;
  }

  const owner = (await runtime.getAggregateData()).user;
  if (!payload.category) {
    runtime.logger.error(`category not found, post id: ${payload.id}`);
    return;
  }

  const message = await buildPostMessage(
    owner.name,
    "更新了文章",
    payload,
    payload.summary,
  );

  await runtime.sendToGroup([
    {
      type: "text",
      content: message,
    },
  ]);
};
