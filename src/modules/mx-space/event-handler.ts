import { inspect } from 'util'
import { appConfig } from 'app.config'
import dayjs from 'dayjs'
import { default as RemoveMarkdown, default as rmd } from 'remove-markdown'
import { Markup } from 'telegraf'
import type {
  CommentModel,
  LinkModel,
  NoteModel,
  PageModel,
  PostModel,
  RecentlyModel,
  SayModel,
} from '@mx-space/api-client'
import type { IActivityLike } from '@mx-space/webhook'
import type { Sendable } from '~/lib/sendable'
import type { ModuleContext } from '~/types/context'
import type { InlineKeyboardButton } from 'telegraf/typings/core/types/typegram'

import { CollectionRefTypes, LinkState } from '@mx-space/api-client'
import { BusinessEvents } from '@mx-space/webhook'

import { createNamespaceLogger } from '~/lib/logger'
import { createSendMessageInstance } from '~/lib/sendable'
import { relativeTimeFromNow } from '~/lib/time'

import { apiClient } from './api-client'
import { getMxSpaceAggregateData } from './data'
import { TgQueryType } from './types/tg-query'
import { urlBuilder } from './utils'

const logger = createNamespaceLogger('mx-event')

export const handleEvent =
  (ctx: ModuleContext) => async (type: BusinessEvents, payload: any) => {
    logger.log(type, inspect(payload))

    const aggregateData = await getMxSpaceAggregateData()
    const owner = aggregateData.user
    const sendToGroup = async (message: Sendable) => {
      const { watchGroupIds } = appConfig.mxSpace
      const sender = createSendMessageInstance(ctx.tgBot)
      return await Promise.all(
        watchGroupIds.map((id) => {
          sender(id, message)
        }),
      )
    }

    switch (type) {
      case BusinessEvents.POST_CREATE:
      case BusinessEvents.POST_UPDATE: {
        const isNew = type === BusinessEvents.POST_CREATE
        const publishDescription = isNew ? '发布了新文章' : '更新了文章'
        const { title, category, id, summary, created } = payload as PostModel

        if (type === BusinessEvents.POST_UPDATE) {
          // only emit created date after 90 days
          const createdDate = dayjs(created)
          const now = dayjs()
          const diff = now.diff(createdDate, 'day')
          if (diff < 90) {
            return
          }
        }
        if (!category) {
          logger.error(`category not found, post id: ${id}`)
          return
        }

        const url = await urlBuilder.build(payload as PostModel)
        const message = `${owner.name} ${publishDescription}: ${title}\n\n${
          summary ? `${summary}\n\n` : ''
        }\n前往阅读：${url}`
        await sendToGroup([
          {
            type: 'text',
            content: message,
          },
        ])

        return
      }
      case BusinessEvents.NOTE_CREATE: {
        const publishDescription = '发布了新生活观察日记'
        const { title, text, mood, weather, images, hide, password } =
          payload as NoteModel
        const isSecret = checkNoteIsSecret(payload as NoteModel)

        if (hide || password || isSecret) {
          return
        }
        const simplePreview = getSimplePreview(text)

        const status = [mood ? `心情: ${mood}` : '']
          .concat(weather ? `天气: ${weather}` : '')
          .filter(Boolean)
          .join('\t')
        const message = `${owner.name} ${publishDescription}: ${title}\n${
          status ? `\n${status}\n\n` : '\n'
        }${simplePreview}\n\n前往阅读：${await urlBuilder.build(
          payload as NoteModel,
        )}`

        if (Array.isArray(images) && images.length > 0) {
          await sendToGroup([
            {
              type: 'photo',
              url: images.map((i) => i.src),
              caption: message,
            },
          ])
        } else {
          await sendToGroup(message)
        }

        return
      }

      case BusinessEvents.LINK_APPLY: {
        const { avatar, name, url, description, state } = payload as LinkModel
        if (state !== LinkState.Audit) {
          return
        }

        const message =
          `有新的友链申请了耶！\n` + `${name}\n${url}\n\n` + `${description}`
        const sendable: Sendable = []

        if (avatar) {
          sendable.push({
            type: 'photo',
            url: [avatar],
            caption: message,
          })
        } else {
          sendable.push({
            type: 'text',
            content: message,
          })
        }

        await sendToGroup(sendable)
        return
      }
      case BusinessEvents.COMMENT_CREATE: {
        const { author, text, refType, parent, id, isWhispers } =
          payload as CommentModel
        const siteTitle = aggregateData.seo.title
        if (isWhispers) {
          await sendToGroup(`「${siteTitle}」嘘，有人说了一句悄悄话。是什么呢`)
        }

        const parentIsWhispers = (() => {
          const walk: (parent: any) => boolean = (parent) => {
            if (!parent || typeof parent == 'string') {
              return false
            }
            return parent.isWhispers || walk(parent?.parent)
          }

          return walk(parent)
        })()
        if (parentIsWhispers) {
          logger.warn('[comment]: parent comment is whispers, ignore')
          return
        }

        const refId = payload.ref?.id || payload.ref?._id || payload.ref
        let refModel: PostModel | NoteModel | PageModel | null = null

        switch (refType) {
          case CollectionRefTypes.Post: {
            refModel = await apiClient.post.getPost(refId)
            break
          }

          case CollectionRefTypes.Note: {
            refModel = await apiClient.note.getNoteById(refId as string)

            break
          }
          case CollectionRefTypes.Page: {
            refModel = await apiClient.page.getById(refId)
            break
          }
        }

        if (!refModel) {
          logger.error(`[comment]: ref model not found, refId: ${refId}`)
          return
        }
        const isMaster = author === owner.name || author === owner.username
        let message: string
        if (isMaster && !parent) {
          message = `${author} 在「${
            refModel.title
          }」发表之后的 ${relativeTimeFromNow(refModel.created)}又说：${text}`
        } else {
          message = `${author} 在「${refModel.title}」发表了评论：${text}`
        }

        const uri = (() => {
          switch (refType) {
            case CollectionRefTypes.Post: {
              return `/posts/${(refModel as PostModel).category.slug}/${
                (refModel as PostModel).slug
              }`
            }
            case CollectionRefTypes.Note: {
              return `/notes/${(refModel as NoteModel).nid}`
            }
            case CollectionRefTypes.Page: {
              return `/${(refModel as PageModel).slug}`
            }
          }
        })()

        const webUrl = aggregateData.url.webUrl
        const url = `${webUrl}${uri}`

        if (isWhispers) {
          const buttons: InlineKeyboardButton[] = [
            Markup.button.callback(
              '回复',
              JSON.stringify({
                type: TgQueryType.ReplyComment,
                commentId: id,
              }),
            ),
          ]

          if (uri) {
            buttons.push(Markup.button.url('查看', url))
          }
          await ctx.tgBot.telegram.sendMessage(
            appConfig.ownerId,
            message,
            Markup.keyboard(buttons),
          )
        } else {
          const sendable: Sendable = [
            {
              type: 'text',
              content: RemoveMarkdown(message),
            },
          ]
          if (uri) {
            sendable.push({
              type: 'url',
              url,
              label: '查看',
            })
          }
          await sendToGroup(sendable)
        }
        return
      }
      case BusinessEvents.SAY_CREATE: {
        const { author, source, text } = payload as SayModel

        const message =
          `${owner.name} 发布一条说说：\n` +
          `${text}\n${source || author ? `来自: ${source || author}` : ''}`
        await sendToGroup(message)

        return
      }
      case BusinessEvents.RECENTLY_CREATE: {
        const { content } = payload as RecentlyModel

        const message = `${owner.name} 发布一条动态说：\n${content}`
        await sendToGroup(message)

        return
      }

      case BusinessEvents.ACTIVITY_LIKE: {
        const {
          ref: { id, title },
          reader,
        } = payload as IActivityLike

        // '/url-builder/:id'
        const refModelUrl = await apiClient.proxy
          .helper('url-builder')(id)
          .get<{
            data: string
          }>()
          .then((res) => res.data)

        await ctx.tgBot.telegram.sendMessage(
          appConfig.mxSpace.watchChannelId,
          reader
            ? `${reader.name} 点赞了「${title}」\n`
            : `「${title}」有人点赞了哦！\n`,
          Markup.inlineKeyboard([
            {
              url: refModelUrl,
              text: '查看',
            },
          ]),
        )

        return
      }
      // case MxSystemEventBusEvents.SystemException: {
      //   const { message, stack } = payload as Error
      //   const messageWithStack = `来自 Mix Space 的系统异常：${getShortDateTime(
      //     new Date(),
      //   )}\n${message}\n\n${stack}`
      //   await ctx.tgBot.telegram.sendMessage(
      //     appConfig.ownerId,
      //     messageWithStack,
      //   )
      //   return
      // }
    }
  }

const getSimplePreview = (text: string) => {
  const rawText = rmd(text) as string
  return rawText.length > 200 ? `${rawText.slice(0, 200)}...` : rawText
}

function checkNoteIsSecret(note: NoteModel) {
  if (!note.publicAt) {
    return false
  }
  const isSecret = dayjs(note.publicAt).isAfter(new Date())

  return isSecret
}
