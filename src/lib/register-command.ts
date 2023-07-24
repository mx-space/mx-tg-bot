import { marked } from 'marked'
import type { Context, NarrowedContext, Telegraf } from 'telegraf'
import type {
  BotCommand,
  Message,
  Update,
} from 'telegraf/typings/core/types/typegram'

import { tgBot } from '~/bot'

import { createNamespaceLogger } from './logger'

interface ICommand {
  command: string
  description: string
  usage?: string
  group?: string
}
const commandMap = {} as Record<string, ICommand>

export const gerenateTGBotCommandsUsageDoc = async () => {
  const me = await tgBot.telegram.getMe()
  let doc = `*${me.first_name}の使用方法` + '\n\n'

  const groups = {} as Record<string, ICommand[]>
  for (const cmd of Object.values(commandMap)) {
    const { group = 'default' } = cmd

    if (!groups[group]) {
      groups[group] = []
    }
    groups[group].push(cmd)
  }

  for (const [group, cmds] of Object.entries(groups)) {
    if (group === 'default') {
      doc += '\n'
    } else {
      doc += `*${group}*\n`
    }
    for (const cmd of cmds) {
      const { command, description, usage } = cmd
      doc += `/${command} - ${description}\n`
      if (usage) {
        doc += `食用方法: ${usage}\n`
      }
    }
    doc += '\n'
  }

  return marked.parseInline(doc, {
    gfm: true,
    headerIds: false,
    mangle: false,
  })
}

const logger = createNamespaceLogger('Telegram Bot Command')
export async function setTGBotCommands(
  tgBot: Telegraf,
  commands: (BotCommand & {
    usage?: string
    group?: string
    handler: (
      cmdLine: string,
      ctx: NarrowedContext<
        Context<Update>,
        {
          message: Update.New & Update.NonChannel & Message.TextMessage
          update_id: number
        }
      >,
    ) =>
      | void
      | Promise<void>
      | boolean
      | Promise<boolean>
      | Promise<string>
      | string
      | undefined
      | null
      | Promise<undefined | null | string>
  })[],

  options: {
    replyPrefix?: string | (() => Promise<string>) | (() => string)
  } = {},
) {
  const { replyPrefix = '' } = options
  await tgBot.telegram
    .setMyCommands(
      await tgBot.telegram.getMyCommands().then((res) => res.concat(commands)),
    )
    .catch((err) => {
      logger.error(err)
    })

  for (const cmd of commands) {
    const { command } = cmd
    commandMap[command] = cmd
  }

  tgBot.on('text', async (ctx) => {
    const senderMsg = ctx.message.text

    if (!senderMsg) return

    for await (const cmd of commands) {
      const { command, handler } = cmd

      const matchedCommand = `/${command}`
      const isMatch = senderMsg.startsWith(matchedCommand)

      if (!isMatch) continue

      const cmdLine = senderMsg.slice(matchedCommand.length).trim()

      const handled = await handler(cmdLine, ctx)
      if (handled === true) break

      if (typeof handled === 'string' && handled) {
        let nextPrefix = ''
        if (typeof replyPrefix === 'function') {
          nextPrefix = await replyPrefix()
        } else {
          nextPrefix = replyPrefix
        }

        await ctx
          .sendMessage(nextPrefix + handled, {
            parse_mode: 'MarkdownV2',
          })
          .catch((err) => {
            logger.warn(
              'Failed to send message, content: \n%s',
              nextPrefix + handled,
            )
            logger.error(err.message)
          })
        break
      }
    }
  })
}
