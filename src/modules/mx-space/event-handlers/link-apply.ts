import { LinkState } from "@mx-space/api-client";
import type { BusinessEvents } from "@mx-space/webhook";
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
};
