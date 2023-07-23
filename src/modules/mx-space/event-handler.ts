import { appConfig } from 'app.config'
import type { ModuleContext } from '~/types/context'
import type {
  MxSocketEventTypes,
  MxSystemEventBusEvents,
} from './types/mx-socket-types'

import { createNamespaceLogger } from '~/lib/logger'

import { getMxSpaceAggregateData } from './data'

const logger = createNamespaceLogger('mx-event')

interface TextMessage {
  type: 'text' | 'Markdown' | 'HTML' | 'MarkdownV2'
  content: string
}

interface MediaMessage {
  type: 'media'
}

type IMessage = TextMessage | MediaMessage
type Sendable = string | IMessage[]

export const handleEvent =
  (ctx: ModuleContext) =>
  async (
    type: MxSocketEventTypes | MxSystemEventBusEvents,
    payload: any,
    code?: number,
  ) => {
    logger.debug(type, payload)

    const aggregateData = await getMxSpaceAggregateData()
    const sendToGroup = async (message: Sendable) => {
      const { watchGroupIds } = appConfig.mxSpace

      return await Promise.all(
        watchGroupIds.map((id) => {
          if (message instanceof Array) {
            for (const msg of message) {
              switch (msg.type) {
                case 'text':
                  ctx.tgBot.telegram.sendMessage(id, msg.content)
                  continue
                case 'HTML':
                case 'Markdown':
                case 'MarkdownV2':
                  ctx.tgBot.telegram.sendMessage(id, msg.content, {
                    parse_mode: msg.type,
                  })
                  continue
              }
            }
          } else return ctx.tgBot.telegram.sendMessage(id, message)
        }),
      )
    }
  }
