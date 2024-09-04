import { appConfig } from 'app.config'
import chalk from 'chalk'
import type { AxiosResponse } from 'axios'

import { allControllers, createClient } from '@mx-space/api-client'
import { axiosAdaptor } from '@mx-space/api-client/dist/adaptors/axios'

import { userAgent } from '~/constants'
import { createNamespaceLogger } from '~/lib/logger'

const logger = createNamespaceLogger('mx-space-api')

declare module 'axios' {
  interface AxiosRequestConfig {
    __requestStartedAt?: number
    __requestEndedAt?: number
    __requestDuration?: number
  }
}

axiosAdaptor.default.interceptors.request.use((req) => {
  req.headers = {
    ...req.headers,
    'user-agent': userAgent,
    authorization: appConfig.mxSpace.token,
    'x-request-id': Math.random().toString(36).slice(2),
  } as any

  return req
})
axiosAdaptor.default.interceptors.response.use(
  (res: AxiosResponse) => {
    return res
  },
  (err) => {
    const res = err.response

    const error = Promise.reject(err)
    if (!res) {
      return error
    }
    logger.error(
      chalk.red(
        `HTTP Response Failed ${`${res.config.baseURL || ''}${
          res.config.url
        }`}`,
      ),
    )

    return error
  },
)
export const apiClient = createClient(axiosAdaptor)(
  appConfig.mxSpace?.apiEndpoint,
  {
    controllers: allControllers,
  },
)
