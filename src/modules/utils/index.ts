import type { PluginFunction } from '~/lib/plugin'

import { escapeMarkdown } from '~/lib/helper'
import { setTGBotCommands } from '~/lib/register-command'

import { fetchHitokoto } from '../mx-space/api/hitokoto'

export const register: PluginFunction = async (ctx) => {
  const { tgBot } = ctx

  await setTGBotCommands(tgBot, [
    {
      group: '其他小功能',
      command: 'hitokoto',
      description: '获取一条一言',
      handler: async () => {
        const { hitokoto } = await fetchHitokoto()
        return escapeMarkdown(hitokoto)
      },
    },
  ])
}
