/* eslint-disable import/no-mutable-exports */

import { Telegraf } from 'telegraf'

import { createNamespaceLogger } from '~/lib/logger'
import { gerenateTGBotCommandsUsageDoc } from '~/lib/register-command'

import { appConfig } from '../app.config'

const { bot } = appConfig

let tgBot: Telegraf

async function initTgBot(): Promise<Telegraf> {
  const logger = createNamespaceLogger('Telegram Bot')

  tgBot = new Telegraf(bot.token)

  tgBot.start((ctx) => {
    ctx.reply('Hi')
  })

  tgBot.launch()

  logger.info('Ready!')

  await tgBot.telegram.setMyCommands([
    ...(await tgBot.telegram.getMyCommands()),
    {
      command: 'help',
      description: 'Get help',
    },
  ])
  tgBot.command('help', async (ctx) => {
    ctx.reply(await gerenateTGBotCommandsUsageDoc(), {
      parse_mode: 'HTML',
    })
  })

  // Enable graceful stop
  process.once('SIGINT', () => tgBot.stop('SIGINT'))
  process.once('SIGTERM', () => tgBot.stop('SIGTERM'))

  return tgBot
}
export { tgBot, initTgBot }
