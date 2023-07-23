import { IncomingMessage, ServerResponse } from 'http'
import {
  FastifyBaseLogger,
  FastifyInstance,
  FastifyTypeProviderDefault,
  RawServerDefault,
} from 'fastify'
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
