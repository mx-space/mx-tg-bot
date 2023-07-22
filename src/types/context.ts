import {
  FastifyInstance,
  RawServerDefault,
  FastifyBaseLogger,
  FastifyTypeProviderDefault,
} from "fastify";
import { IncomingMessage, ServerResponse } from "http";
import TelegramBot from "node-telegram-bot-api";

export interface ModuleContext {
  server: FastifyInstance<
    RawServerDefault,
    IncomingMessage,
    ServerResponse<IncomingMessage>,
    FastifyBaseLogger,
    FastifyTypeProviderDefault
  >;

  tgBot: TelegramBot;
}
