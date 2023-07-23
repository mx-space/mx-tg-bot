/* eslint-disable import/default */
import './lib/logger'

import { join } from 'path'
import type { AutoloadPluginOptions } from '@fastify/autoload'
import type { FastifyPluginAsync } from 'fastify'
import type { ModuleContext } from './types/context'

import AutoLoad from '@fastify/autoload'

import { initTgBot } from './bot'
import { registerLogger } from './lib/logger'
import { hook } from './lib/plugin'
import { registerModules } from './modules/loader'

export type AppOptions = {
  // Place your custom options for app below here.
} & Partial<AutoloadPluginOptions>

const app: FastifyPluginAsync<AppOptions> = async (
  fastify,
  opts,
): Promise<void> => {
  // Place here your custom code!

  const tgBot = await initTgBot()

  const moduleContext: ModuleContext = {
    tgBot,
    server: fastify,
  }

  registerLogger()
  await registerModules()
  await hook.runAsyncWaterfall(moduleContext)

  // Do not touch the following lines

  // This loads all plugins defined in plugins
  // those should be support plugins that are reused
  // through your application
  void fastify.register(AutoLoad, {
    dir: join(__dirname, 'plugins'),
    options: opts,
  })

  // This loads all plugins defined in routes
  // define your routes in one of these
  void fastify.register(AutoLoad, {
    dir: join(__dirname, 'routes'),
    options: opts,
  })
}

export default app
