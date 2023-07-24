import { appConfig } from 'app.config'
import { io } from 'socket.io-client'
import type { MxSocketEventTypes } from '~/modules/mx-space/types/mx-socket-types'
import type { ModuleContext } from '~/types/context'
import type { Socket } from 'socket.io-client'

import { simpleCamelcaseKeys } from '@mx-space/api-client'

import { createNamespaceLogger } from '~/lib/logger'

import { handleEvent } from './event-handler'

const logger = createNamespaceLogger('mx-socket')

export function createMxSocket(ctx: ModuleContext): Socket<any, any> {
  const mxSocket = io(appConfig.mxSpace.gateway, {
    transports: ['websocket'],
    timeout: 10000,
    forceNew: true,
    query: {
      token: appConfig.mxSpace.token,
    },

    autoConnect: false,
  })

  mxSocket.io.on('error', () => {
    logger.error('Socket 连接异常')
  })
  mxSocket.io.on('reconnect', () => {
    logger.info('Socket 重连成功')
  })
  mxSocket.io.on('reconnect_attempt', () => {
    logger.info('Socket 重连中')
  })
  mxSocket.io.on('reconnect_failed', () => {
    logger.info('Socket 重连失败')
  })

  mxSocket.on('disconnect', () => {
    const tryReconnect = () => {
      if (mxSocket.connected === false) {
        mxSocket.io.connect()
      } else {
        timer = clearInterval(timer)
      }
    }
    let timer: any = setInterval(tryReconnect, 2000)
  })

  mxSocket.on('connect_error', () => {
    setTimeout(() => {
      mxSocket.connect()
    }, 1000)
  })

  mxSocket.on(
    'message',
    (payload: string | Record<'type' | 'data' | 'code', any>) => {
      if (typeof payload !== 'string') {
        return handleEvent(ctx)(payload.type, simpleCamelcaseKeys(payload.data))
      }
      const { data, type } = JSON.parse(payload) as {
        data: any
        type: MxSocketEventTypes
        code?: number
      }
      handleEvent(ctx)(type, simpleCamelcaseKeys(data))
    },
  )

  return mxSocket
}
