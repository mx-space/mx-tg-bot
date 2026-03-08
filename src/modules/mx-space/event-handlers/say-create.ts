import type { BusinessEvents } from "@mx-space/webhook";

import type { MxEventHandler } from "./types";

export const handleSayCreate: MxEventHandler<
  BusinessEvents.SAY_CREATE
> = async (runtime, payload) => {
  const owner = (await runtime.getAggregateData()).user;
  const { author, source, text } = payload;

  const message = `${owner.name} 发布一条说说：\n${text}\n${
    source || author ? `来自: ${source || author}` : ""
  }`;

  await runtime.sendToGroup(message);
};
