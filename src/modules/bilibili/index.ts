import { appConfig } from 'app.config'
import axios from 'axios'
import { CronJob } from 'cron'
import type { PluginFunction } from '~/lib/plugin'
import type { BLRoom } from './types/room'
import type { BLUser } from './types/user'

import { userAgent } from '~/constants'

const headers = {
  referer: `https://link.bilibili.com/p/center/index?visit_id=22ast2mb9zhc`,
  'User-Agent': userAgent,
}
export const register: PluginFunction = (ctx) => {
  let playStatus = false
  const config = appConfig.bilibili

  const liveId = config.live.id
  const work = async () => {
    const res = await axios
      .get(
        `https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo?room_id=${liveId}&protocol=0,1&format=0,1,2&codec=0,1&qn=0&platform=web&ptype=8&dolby=5`,
        {
          headers,
        },
      )
      .catch(() => null)

    if (!res?.data) {
      return
    }

    if (res?.data?.data.playurl_info) {
      if (playStatus) {
        return
      }

      const userInfo = await axios
        .get(
          `https://api.live.bilibili.com/live_user/v1/UserInfo/get_anchor_in_room?roomid=${liveId}`,
          {
            headers,
          },
        )
        .catch(() => null)

      if (!userInfo?.data) {
        return
      }

      const coverUrl = await axios
        .get(
          ` https://api.live.bilibili.com/xlive/web-room/v1/index/getRoomBaseInfo?room_ids=${liveId}&req_biz=link-center`,
          {
            headers,
          },
        )
        .then((res) => {
          return (res.data as BLRoom).data.by_room_ids[liveId].cover
        })
      const info = (userInfo.data as BLUser).data.info

      const { tgBot } = ctx
      await Promise.all(
        config.watchGroupIds.map(async (groupId) => {
          tgBot.telegram.sendMediaGroup(groupId, [
            {
              type: 'photo',
              media: coverUrl,
              caption: `
📺${info.uname}(${info.uid}) 开播了
前往直播间: https://live.bilibili.com/${liveId}
            `.trim(),
            },
          ])
        }),
      )

      playStatus = true
    } else {
      playStatus = false
    }
  }
  const job = new CronJob('*/1 * * * *', work)
  job.start()
  work()
}
