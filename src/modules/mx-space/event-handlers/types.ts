import type {
  BusinessEvents,
  EventPayloadMapping,
  WebhookEventSource,
} from "@mx-space/webhook";
import type { Sendable } from "~/lib/sendable";
import type { createNamespaceLogger } from "~/lib/logger";
import type { ModuleContext } from "~/types/context";

import type { getMxSpaceAggregateData } from "../data";

export type CommentEventPayload =
  EventPayloadMapping[BusinessEvents.COMMENT_CREATE];

export interface MxEventRuntime {
  ctx: ModuleContext;
  logger: ReturnType<typeof createNamespaceLogger>;
  getAggregateData: typeof getMxSpaceAggregateData;
  sendToGroup: (message: Sendable) => Promise<unknown>;
  sendToOwner: (message: Sendable) => Promise<unknown>;
  /** 业务方通过 x-webhook-source 或 gateway 消息发送的 source */
  source: WebhookEventSource;
}

export type MxEventPayloadMap = {
  [K in
    | BusinessEvents.POST_CREATE
    | BusinessEvents.POST_UPDATE
    | BusinessEvents.NOTE_CREATE
    | BusinessEvents.LINK_APPLY
    | BusinessEvents.COMMENT_CREATE
    | BusinessEvents.SAY_CREATE
    | BusinessEvents.RECENTLY_CREATE
    | BusinessEvents.ACTIVITY_LIKE]: EventPayloadMapping[K];
};

export type HandledMxEvent = keyof MxEventPayloadMap;

export type MxEventHandler<TEvent extends HandledMxEvent = HandledMxEvent> = (
  runtime: MxEventRuntime,
  payload: MxEventPayloadMap[TEvent],
  event: TEvent,
) => Promise<void>;

export type MxEventHandlerMap = Partial<{
  [K in HandledMxEvent]: MxEventHandler<K>;
}>;
