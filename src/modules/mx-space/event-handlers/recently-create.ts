import type { BusinessEvents } from "@mx-space/webhook";

import type { MxEventHandler } from "./types";

export const handleRecentlyCreate: MxEventHandler<
  BusinessEvents.RECENTLY_CREATE
> = async (runtime, payload) => {
  const owner = (await runtime.getAggregateData()).user;
  const message = `${owner.name} 发布一条动态说：\n${payload.content}`;

  await runtime.sendToGroup(message);
};
