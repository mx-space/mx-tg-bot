import { IncomingMessage, ServerResponse } from 'http'
import {
  FastifyBaseLogger,
  FastifyInstance,
  FastifyTypeProviderDefault,
  RawServerDefault,
} from 'fastify'
import TelegramBot from 'node-telegram-bot-api'
import { Telegraf } from 'telegraf'

export interface ModuleContext {
  server: FastifyInstance<
    RawServerDefault,
    IncomingMessage,
    ServerResponse<IncomingMessage>,
    FastifyBaseLogger,
    FastifyTypeProviderDefault
  >

  tgBot: Telegraf
}
