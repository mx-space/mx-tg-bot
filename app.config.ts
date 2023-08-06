import { z } from 'zod'

const envSchema = z.object({
  MX_SPACE_TOKEN: z.string(),
  TG_BOT_TOKEN: z.string(),
  GH_WEBHOOK_SECRET: z.string(),
  MX_SPACE_API_ENDPOINT: z.string().url(),
  MX_SPACE_GATEWAY_ENDPOINT: z.string().url(),
})

console.log('env validating...')
const env = envSchema.parse(process.env)

export const appConfig = {
  mxSpace: {
    apiEndpoint: env.MX_SPACE_API_ENDPOINT,
    gateway: env.MX_SPACE_GATEWAY_ENDPOINT,
    // gateway: 'http://127.0.0.1:2333/system',
    token: env.MX_SPACE_TOKEN,

    watchGroupIds: [-1001570490524, -1001918532532],
    watchChannelId: -1001918532532,
  },

  ownerId: 548935420,

  bot: {
    token: env.TG_BOT_TOKEN,
  },

  githubHook: {
    secret: env.GH_WEBHOOK_SECRET,
    watchGroupIds: [-1001918532532],
  },
  bilibili: {
    live: {
      id: 1434499,
    },
    watchGroupIds: [-1001570490524, -1001918532532],
  },
}
