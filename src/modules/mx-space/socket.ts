import { appConfig } from "app.config";
import type { ModuleContext } from "~/types/context";

import { BusinessEvents } from "@mx-space/webhook";
import type { WsClient, WsClientState } from "@mx-space/ws-client";
import { createWsClient } from "@mx-space/ws-client";

import { createNamespaceLogger } from "~/lib/logger";

import { handleEvent } from "./event-handler";

const logger = createNamespaceLogger("mx-socket");

function toWsOrigin(url: string): string {
  if (url.startsWith("https://"))
    return `wss://${url.slice("https://".length)}`;
  if (url.startsWith("http://")) return `ws://${url.slice("http://".length)}`;
  return url;
}

export function createMxSocket(ctx: ModuleContext): WsClient {
  const dispatchEvent = handleEvent(ctx);
  const client = createWsClient({
    url: `${toWsOrigin(appConfig.mxSpace.gateway)}/ws/admin`,
    query: {
      token: appConfig.mxSpace.token,
    },
  });

  client.on("$state", (state: WsClientState) => {
    switch (state) {
      case "open": {
        logger.info("Socket 已连接");
        break;
      }
      case "reconnecting": {
        logger.info("Socket 重连中");
        break;
      }
      case "closed": {
        logger.info("Socket 已断开");
        break;
      }
    }
  });

  for (const type of Object.values(BusinessEvents)) {
    client.on(type, (payload) => {
      dispatchEvent(type, payload, "system");
    });
  }

  return client;
}
