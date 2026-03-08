import type {
  CommentModel,
  LinkModel,
  NoteModel,
  PostModel,
  RecentlyModel,
  SayModel,
} from "@mx-space/api-client";
import type { IActivityLike, BusinessEvents } from "@mx-space/webhook";
import type { Sendable } from "~/lib/sendable";
import type { createNamespaceLogger } from "~/lib/logger";
import type { ModuleContext } from "~/types/context";

import type { getMxSpaceAggregateData } from "../data";

export type CommentEventPayload = CommentModel & {
  source?: "admin" | "visitor";
};

export interface MxEventRuntime {
  ctx: ModuleContext;
  logger: ReturnType<typeof createNamespaceLogger>;
  getAggregateData: typeof getMxSpaceAggregateData;
  sendToGroup: (message: Sendable) => Promise<unknown>;
  sendToOwner: (message: Sendable) => Promise<unknown>;
}

export type MxEventPayloadMap = {
  [BusinessEvents.POST_CREATE]: PostModel;
  [BusinessEvents.POST_UPDATE]: PostModel;
  [BusinessEvents.NOTE_CREATE]: NoteModel;
  [BusinessEvents.LINK_APPLY]: LinkModel;
  [BusinessEvents.COMMENT_CREATE]: CommentEventPayload;
  [BusinessEvents.SAY_CREATE]: SayModel;
  [BusinessEvents.RECENTLY_CREATE]: RecentlyModel;
  [BusinessEvents.ACTIVITY_LIKE]: IActivityLike;
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
