import { appConfig } from 'app.config'
import { CronJob } from 'cron'
import { sample } from 'lodash'
import RemoveMarkdown from 'remove-markdown'
import { z } from 'zod'
import type { CommentModel } from '@mx-space/api-client'
import type { PluginFunction } from '~/lib/plugin'
import type { Telegraf } from 'telegraf'
import type { Context } from 'telegraf/typings/context'
import type { Message, Update } from 'telegraf/typings/core/types/typegram'

import { createHandler } from '@mx-space/webhook'

import { botEventBus } from '~/bot/emitter'
import { escapeMarkdown } from '~/lib/helper'
import { createNamespaceLogger } from '~/lib/logger'
import { setTGBotCommands } from '~/lib/register-command'
import { relativeTimeFromNow } from '~/lib/time'

import { apiClient } from './api-client'
import { fetchHitokoto } from './api/hitokoto'
import { getMxSpaceAggregateData } from './data'
import { handleEvent } from './event-handler'
import { TgQueryType } from './types/tg-query'
import { urlBuilder } from './utils'

export const register: PluginFunction = async (ctx) => {
  const { tgBot } = ctx

  // const socket = createMxSocket(ctx)

  const handler = createHandler({
    secret: appConfig.mxSpace.webhookSecret,
  })

  ctx.server.post('/mx/webhook', (req, res) => {
    Object.assign(req.raw, {
      body: req.body,
    })
    handler(req.raw as any, res.raw)
  })

  handler.emitter.on('*', (event) => {
    const { payload, type } = event

    handleEvent(ctx)(type as any, payload)
  })

  // socket.connect()
  await Promise.all([
    bindEvents(tgBot),
    bindCommands(tgBot),
    bindCronJob(tgBot),
  ])
}

async function bindEvents(tgBot: Telegraf) {
  tgBot.on('new_chat_members', async (ctx) => {
    const { hitokoto } = await fetchHitokoto()
    const identifier = ctx.from.username
      ? `@${ctx.from.username}`
      : `${ctx.from.first_name}(${ctx.from.id})`
    ctx.sendMessage(`欢迎新大佬 ${identifier} \n\n${hitokoto}`, {
      parse_mode: 'MarkdownV2',
      reply_to_message_id: ctx.message.message_id,
    })
  })

  // 只有允许一个
  let toCommentId: string | undefined
  let memoChatId: number | undefined
  tgBot.on('callback_query', async (ctx) => {
    const { data } = ctx.update.callback_query as any
    try {
      const parsedData = JSON.parse(data)
      const { type } = parsedData

      switch (type) {
        case TgQueryType.ReplyComment: {
          const { commentId } = parsedData
          toCommentId = commentId
          if (!ctx.chat) return
          memoChatId = ctx.chat.id

          ctx.answerCbQuery()

          ctx.sendMessage(
            `请回复评论内容。当前记录的引用回复 ID 为：${commentId}`,
          )
        }
      }
    } finally {
      await ctx.answerCbQuery('DONE')
    }
  })

  botEventBus.on('text', async (ctx: Context<Update>) => {
    const chatId = ctx.chat?.id
    if (!chatId) return

    if (chatId !== memoChatId) return

    const message = ctx.message as Update.New &
      Update.NonChannel &
      Message.TextMessage
    const text = message.text
    if (!text) return

    if (!toCommentId) return

    await apiClient.comment.proxy.master
      .reply(toCommentId)
      .post<CommentModel>({
        data: {
          text,
        },
      })
      .then(() => {
        ctx.reply('回复成功！')
      })
      .catch((err) => {
        ctx.reply(`回复失败！${err.message}`)
      })
      .finally(() => {
        memoChatId = undefined
        toCommentId = undefined
      })
  })
}

async function bindCommands(tgBot: Telegraf) {
  await setTGBotCommands(
    tgBot,
    [
      {
        command: 'mx_get_detail',
        description: '获取 Post 或 Note 详情',
        group: 'mx_space',
        handler: async (cmdLine, ctx) => {
          const [type, offset = 1] = cmdLine.split(' ')
          if (!type) {
            return escapeMarkdown(
              'Usage: /mx_get_detail <type> [offset=1]\n\nType: post, note',
            )
          }
          const schema = z.object({
            type: z.enum(['post', 'note']),
            offset: z.number().gt(1).int().safe().optional(),
          })

          const result = schema.safeParse({ type, offset: +offset })
          if (!result.success) {
            ctx.reply(result.error.issues.map((v) => v.message).join('\n'), {
              reply_to_message_id: ctx.message.message_id,
            })
            return
          }

          let markup = ''
          switch (type) {
            case 'post': {
              const data = await apiClient.post.getList(+offset, 1)
              if (!data.data.length) {
                break
              }
              const postDetail = data.data[0]
              const url = await urlBuilder.build(postDetail)

              markup = `[${escapeMarkdown(
                postDetail.title,
              )}](${url})\n\n${escapeMarkdown(RemoveMarkdown(postDetail.text))
                .split('\n\n')
                .slice(0, 3)
                .join('\n\n')}\n\n[阅读全文](${escapeMarkdown(url)})`
              break
            }
            case 'note': {
              const data = await apiClient.note.getList(+offset, 1)
              if (!data.data.length) {
                break
              }
              const noteDetail = data.data[0]
              const url = await urlBuilder.build(noteDetail)
              markup = `[${escapeMarkdown(
                noteDetail.title,
              )}](${url})\n\n${escapeMarkdown(RemoveMarkdown(noteDetail.text))
                .split('\n\n')
                .slice(0, 3)
                .join('\n\n')}\n\n[阅读全文](${escapeMarkdown(url)})`

              break
            }
          }

          return markup
        },
      },
      {
        command: 'mx_get_notes',
        description: '获取最新的 Note 列表',
        group: 'mx_space',
        handler: async (cmdLine) => {
          const page = Number(cmdLine) || 1
          const data = await apiClient.note.getList(page, 10)
          const aggregateData = await getMxSpaceAggregateData()
          const { webUrl } = aggregateData.url
          const text = data.data
            .map(
              (note) =>
                `${relativeTimeFromNow(note.created)}前\n[${escapeMarkdown(
                  note.title,
                )}](${webUrl}/notes/${note.nid})`,
            )
            .join('\n')

          const markupText = `*文章列表*\n\n${text}`

          return markupText
        },
      },
      {
        command: 'mx_get_posts',
        description: '获取最新的 Post 列表',
        group: 'mx_space',
        handler: async (cmdLine) => {
          const page = Number(cmdLine) || 1
          const data = await apiClient.post.getList(page)
          const aggregateData = await getMxSpaceAggregateData()
          const { webUrl } = aggregateData.url
          const text = data.data
            .map(
              (post) =>
                `${relativeTimeFromNow(post.created)}前\n[${escapeMarkdown(
                  post.title,
                )}](${webUrl}/posts/${post.category.slug}/${post.slug})`,
            )
            .join('\n')

          const markupText = `*文章列表*\n\n${text}`

          return markupText
        },
      },

      {
        command: 'mx_stat',
        description: '获取 MX Space 统计信息',
        group: 'mx_space',
        handler: async () => {
          const data = await apiClient.aggregate.getStat()
          const {
            callTime,
            posts,
            notes,
            linkApply,
            recently,
            says,
            todayIpAccessCount,
            todayMaxOnline,
            todayOnlineTotal,
            unreadComments,
            comments,
            links,
            online,
          } = data
          return (
            '状态信息：' +
            '\n\n' +
            `当前有文章 ${posts} 篇，生活记录 ${notes} 篇，评论 ${comments} 条，友链 ${links} 条，说说 ${says} 条，速记 ${recently} 条。` +
            '\n' +
            `未读评论 ${unreadComments} 条，友链申请 ${linkApply} 条。` +
            '\n' +
            `今日访问 ${todayIpAccessCount} 次，最高在线 ${todayMaxOnline} 人，总计在线 ${todayOnlineTotal} 人。` +
            '\n' +
            `调用次数 ${callTime} 次，当前在线 ${online} 人。`
          )
        },
      },
    ],
    {
      replyPrefix: async () => {
        const aggregateData = await getMxSpaceAggregateData()
        const {
          seo: { title },
        } = aggregateData

        return `来自${title ? `「${title}」` : ' Mix Space '}的 `
      },
    },
  )
}
async function bindCronJob(tgBot: Telegraf) {
  const logger = createNamespaceLogger('Mix Space CronJob')
  const sayGoodMorning = new CronJob('0 0 6 * * *', async () => {
    const { hitokoto } = await fetchHitokoto()
    const greeting = sample([
      '新的一天也要加油哦',
      '今天也要元气满满哦！',
      '今天也是充满希望的一天',
    ])
    const tasks = appConfig.mxSpace.watchGroupIds.map((id) =>
      tgBot.telegram
        .sendMessage(id, `早上好！${greeting}\n\n${hitokoto || ''}`)
        .catch((err) => {
          logger.error(err)
        }),
    )

    await Promise.all(tasks)
  })

  const sayGoodEvening = new CronJob('0 0 22 * * *', async () => {
    const { hitokoto } = await fetchHitokoto()
    const tasks = appConfig.mxSpace.watchGroupIds.map((id) =>
      tgBot.telegram.sendMessage(id, `晚安，早点睡哦！\n\n${hitokoto || ''}`),
    )

    await Promise.all(tasks)
  })

  sayGoodMorning.start()
  sayGoodEvening.start()
}
