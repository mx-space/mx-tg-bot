import { inspect } from "util";
import { appConfig } from "app.config";
import type { BusinessEvents, WebhookEventSource } from "@mx-space/webhook";
import type { Sendable } from "~/lib/sendable";
import type { ModuleContext } from "~/types/context";

import { createNamespaceLogger } from "~/lib/logger";
import { createSendMessageInstance } from "~/lib/sendable";

import { getMxSpaceAggregateData } from "./data";
import { mxEventHandlers } from "./event-handlers";
import type {
  HandledMxEvent,
  MxEventHandler,
  MxEventRuntime,
} from "./event-handlers/types";

const logger = createNamespaceLogger("mx-event");

const isHandledEvent = (type: BusinessEvents): type is HandledMxEvent => {
  return Object.prototype.hasOwnProperty.call(mxEventHandlers, type);
};

const createMxEventRuntime = (
  ctx: ModuleContext,
  source: WebhookEventSource,
): MxEventRuntime => {
  const sender = createSendMessageInstance(ctx.tgBot);
  const aggregateDataPromise = getMxSpaceAggregateData();

  const sendToGroup = (message: Sendable) => {
    const { watchGroupIds } = appConfig.mxSpace;

    return Promise.all(watchGroupIds.map((id) => sender(id, message)));
  };

  const sendToOwner = (message: Sendable) => {
    return sender(appConfig.ownerId, message);
  };

  return {
    ctx,
    logger,
    getAggregateData: () => aggregateDataPromise,
    sendToGroup,
    sendToOwner,
    source,
  };
};

export const handleEvent = (ctx: ModuleContext) => {
  return async (
    type: BusinessEvents,
    payload: unknown,
    source: WebhookEventSource,
  ) => {
    const runtime = createMxEventRuntime(ctx, source);
    logger.log(type, `source: ${source}`, inspect(payload));

    if (!isHandledEvent(type)) {
      return;
    }

    const handler = mxEventHandlers[type] as
      | MxEventHandler<HandledMxEvent>
      | undefined;
    if (!handler) {
      return;
    }

    await handler(runtime, payload as never, type);
  };
};
