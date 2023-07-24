import { Markup } from 'telegraf'
import type { Telegraf } from 'telegraf'

interface TextMessage {
  type: 'text' | 'Markdown' | 'HTML' | 'MarkdownV2'
  content: string
}
interface MediaMessage {
  type: 'photo'
  url: string[]

  caption?: string
}
export interface URLKeyboardMessage {
  type: 'url'
  label: string
  url: string
}
type IMessage = TextMessage | MediaMessage | URLKeyboardMessage
export type Sendable = string | IMessage[]

export const createSendMessageInstance =
  (tgBot: Telegraf) => (chatId: number, message: Sendable) => {
    if (typeof message === 'string') {
      tgBot.telegram.sendMessage(chatId, message)
      return
    }
    const keyboardMessage = [] as URLKeyboardMessage[]
    const filteredMessage = message.filter((msg) => {
      if (msg.type === 'url') {
        keyboardMessage.push(msg)
        return false
      }
      return true
    })

    console.log(keyboardMessage)
    for (const msg of filteredMessage) {
      switch (msg.type) {
        case 'text':
          tgBot.telegram.sendMessage(
            chatId,
            msg.content,
            Markup.inlineKeyboard([
              ...keyboardMessage.map((msg) => {
                return Markup.button.url(msg.label, msg.url)
              }),
            ]),
          )
          continue
        case 'HTML':
        case 'Markdown':
        case 'MarkdownV2':
          if (keyboardMessage.length > 0) {
            tgBot.telegram.sendMessage(
              chatId,
              msg.content,
              Markup.inlineKeyboard([
                ...keyboardMessage.map((msg) => {
                  return Markup.button.url(msg.label, msg.url)
                }),
              ]),
            )
          } else {
            tgBot.telegram.sendMessage(chatId, msg.content, {
              parse_mode: msg.type,
            })
          }
          continue

        case 'photo': {
          const { url, caption = '' } = msg
          tgBot.telegram.sendMediaGroup(
            chatId,
            url.map((u, i) => {
              return {
                type: 'photo',
                media: u,
                caption: i === 0 ? caption : undefined,
              }
            }),
          )
          break
        }
      }
    }
  }
