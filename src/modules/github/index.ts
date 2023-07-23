import { appConfig } from 'app.config'
import createHandler from 'github-webhook-handler'
import type { PluginFunction } from '~/lib/plugin'
import type { CheckRun } from './types/check-run'
import type { IssueEvent } from './types/issue'
import type { PullRequestPayload } from './types/pull-request'
import type { PushEvent } from './types/push'

import { createNamespaceLogger } from '~/lib/logger'

import { botList } from './constants/bot'

export const register: PluginFunction = async (ctx) => {
  const { tgBot, server } = ctx

  const logger = createNamespaceLogger('gh-webhook')

  const handler = createHandler({
    path: '/gh/webhook',
    secret: appConfig.githubHook.secret,
  })

  server.post('/gh/webhook', (req, res) => {
    handler(req.raw, res.raw, (err) => {
      res.statusCode = 404
      res.send('no such location')
    })
  })

  handler.on('error', (err) => {
    logger.error('Error:', err.message)
  })

  handler.on('push', async (event) => {
    const {
      pusher: { name: pusherName },
      repository,
      ref,
      commits,
    } = event.payload as PushEvent

    if (
      (pusherName as string).endsWith('[bot]') ||
      botList.includes(pusherName)
    ) {
      return
    }

    const isPushToMain =
      ref === 'refs/heads/main' || ref === 'refs/heads/master'
    if (Array.isArray(commits)) {
      if (!commits.length) {
        return
      }
      const commitMessages = [] as string[]
      const commitAuthors = [] as string[]

      commits.forEach((commit) => {
        commitMessages.push(commit.message.split('\n')[0])

        commitAuthors.push(commit.author.name)
      })
      if (commits.length == 1) {
        const commit = commits[0]
        await sendMessage(
          `${pusherName}${
            commit.author?.name && commit.author?.name !== pusherName
              ? ` & ${commit.author?.name}`
              : ''
          } 向 ${repository.full_name} ${
            !isPushToMain ? `的 ${ref.replace('refs/heads/', '')} 分支` : ''
          }提交了一个更改\n\n${commit.message}${
            isPushToMain ? '' : `\n\n查看提交更改内容: ${commit.url}`
          }`,
        )
      } else {
        const isUniquePusher = new Set(commitAuthors).size === 1
        await sendMessage(
          `${
            isUniquePusher ? commitAuthors[0] : `${commitAuthors[0]} 等多人`
          } 向 ${repository.full_name} 提交了多个更改\n\n${commitMessages.join(
            '\n',
          )}`,
        )
      }
    } else {
      const { message } = commits

      if (typeof message === 'undefined') {
        return
      }

      await sendMessage(
        `${pusherName} 向 ${repository.full_name} 提交了一个更改\n\n${message}` +
          `\n\n查看提交更改内容：${commits.url}`,
      )
    }
  })

  handler.on('issues', async (event) => {
    if (event.payload.action !== 'opened') {
      return
    }

    const payload = event.payload as IssueEvent

    if (
      payload.sender.login.endsWith('[bot]') ||
      botList.includes(payload.sender.login)
    ) {
      return
    }

    await sendMessage(
      `${payload.sender.login} 向 ${payload.repository.name} 发布了一个 Issue「#${event.payload.issue.number} - ${payload.issue.title}` +
        '\n' +
        `前往处理：${payload.issue.html_url}`,
    )
  })

  handler.on('release', async (event) => {
    const { payload } = event
    const {
      action,
      repository: { full_name: name },
      release: { tag_name },
    } = payload
    if (action !== 'released') {
      return
    }
    await sendMessage(
      `${name} 发布了一个新版本 ${tag_name}，前往查看:\n${payload.release.html_url}`,
    )
  })

  handler.on('check_run', async (event) => {
    const { payload } = event
    const {
      check_run: {
        conclusion,
        status,
        html_url,
        check_suite: { head_branch },
      },

      repository: { full_name: name },
    } = payload as CheckRun

    if (!['master', 'main'].includes(head_branch)) {
      return
    }

    if (status !== 'completed') {
      return
    }

    if (conclusion && ['failure', 'timed_out'].includes(conclusion)) {
      // TODO mention
      // [inline mention of a user](tg://user?id=123456789)

      await sendMessage(` ${name} CI 挂了！！！！\n查看原因：${html_url}`)
    }
  })

  handler.on('ping', async () => {})

  handler.on('pull_request', async ({ payload }) => {
    const { action } = payload as PullRequestPayload

    if (action !== 'opened') {
      return
    }

    const {
      pull_request: {
        html_url,
        title,
        body,
        head: { label: headLabel },

        user: { login: userName },
        base: {
          repo: { full_name: repoName },
          label: baseLabel,
        },
      },
    } = payload as PullRequestPayload

    if (userName.endsWith('[bot]') || botList.includes(userName)) {
      return
    }
    await sendMessage(
      `${userName} 向 ${repoName} 提交了一个 Pull Request\n\n${title}\n\n` +
        `${baseLabel} <-- ${headLabel}\n\n` +
        `${body ? `${body}\n\n` : ''}前往处理：${html_url}`,
    )
  })
  // TODO use unniversal senable
  async function sendMessage(message: string) {
    const tasks = appConfig.githubHook.watchGroupIds.map((id) => {
      tgBot.telegram.sendMessage(id, message)
    })

    await Promise.all(tasks)
  }
}
