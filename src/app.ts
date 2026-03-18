import { registerLogger } from "./lib/logger";

import type { FastifyPluginAsync } from "fastify";
import type { ModuleContext } from "./types/context";

import { initTgBot } from "./bot";
import { hook } from "./lib/plugin";
import { registerModules } from "./modules/loader";

import corsPlugin from "./plugins/cors";
import etagPlugin from "./plugins/etag";
import helmetPlugin from "./plugins/helmet";
import multipartPlugin from "./plugins/multipart";
import ratelimitPlugin from "./plugins/ratelimit";
import sensiblePlugin from "./plugins/sensible";

import rootRoutes from "./routes/root";

const app: FastifyPluginAsync = async (fastify): Promise<void> => {
  const tgBot = await initTgBot();

  const moduleContext: ModuleContext = {
    tgBot,
    server: fastify,
  };

  registerLogger();
  registerModules();
  await hook.runAsyncWaterfall(moduleContext);

  // Plugins
  await fastify.register(corsPlugin);
  await fastify.register(etagPlugin);
  await fastify.register(helmetPlugin);
  await fastify.register(multipartPlugin);
  await fastify.register(ratelimitPlugin);
  await fastify.register(sensiblePlugin);

  // Routes
  await fastify.register(rootRoutes);
};

export default app;
