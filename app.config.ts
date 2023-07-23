import { z } from 'zod'

const envSchema = z.object({
  MX_SPACE_TOKEN: z.string(),
  TG_BOT_TOKEN: z.string(),
  GH_WEBHOOK_SECRET: z.string(),
})

console.log('env validating...')
const env = envSchema.parse(process.env)

export const appConfig = {
  mxSpace: {
    apiEndpoint: 'https://api.innei.ren/v2',
    gateway: 'https://api.innei.ren/system',
    // gateway: 'http://127.0.0.1:2333/system',
    token: env.MX_SPACE_TOKEN,

    watchGroupIds: ['-1001570490524'],
  },

  bot: {
    token: env.TG_BOT_TOKEN,
  },

  githubHook: {
    secret: env.GH_WEBHOOK_SECRET,
    watchGroupIds: [-1001570490524],
  },
  bilibili: {
    live: {
      id: 1434499,
    },
    watchGroupIds: [-1001570490524],
  },
}
