import { appConfig } from "app.config";
import { io } from "socket.io-client";
import type { ModuleContext } from "~/types/context";
import type { Socket } from "socket.io-client";

import { simpleCamelcaseKeys } from "@mx-space/api-client";

import { createNamespaceLogger } from "~/lib/logger";

import { handleEvent } from "./event-handler";
import type { WebhookEventSource } from "@mx-space/webhook";

const logger = createNamespaceLogger("mx-socket");

export function createMxSocket(ctx: ModuleContext): Socket<any, any> {
  const dispatchEvent = handleEvent(ctx);
  const mxSocket = io(appConfig.mxSpace.gateway, {
    transports: ["websocket"],
    timeout: 10000,
    forceNew: true,
    query: {
      token: appConfig.mxSpace.token,
    },

    autoConnect: false,
  });

  mxSocket.io.on("error", () => {
    logger.error("Socket 连接异常");
  });
  mxSocket.io.on("reconnect", () => {
    logger.info("Socket 重连成功");
  });
  mxSocket.io.on("reconnect_attempt", () => {
    logger.info("Socket 重连中");
  });
  mxSocket.io.on("reconnect_failed", () => {
    logger.info("Socket 重连失败");
  });

  mxSocket.on("disconnect", () => {
    const tryReconnect = () => {
      if (mxSocket.connected === false) {
        mxSocket.io.connect();
      } else {
        timer = clearInterval(timer);
      }
    };
    let timer: any = setInterval(tryReconnect, 2000);
  });

  mxSocket.on("connect_error", () => {
    setTimeout(() => {
      mxSocket.connect();
    }, 1000);
  });

  mxSocket.on(
    "message",
    (payload: string | Record<"type" | "data" | "code" | "source", any>) => {
      const parseMessage = (raw: {
        type: string;
        data?: any;
        source?: WebhookEventSource;
      }) => {
        const data = simpleCamelcaseKeys(raw.data ?? {});
        const source = raw.source ?? "system";
        return dispatchEvent(raw.type as any, data, source);
      };
      if (typeof payload !== "string") {
        return parseMessage(payload);
      }
      return parseMessage(JSON.parse(payload));
    },
  );

  return mxSocket;
}
