// Require library to exit fastify process, gracefully (if possible)
import * as dotenv from 'dotenv'
// Require the framework
import Fastify from 'fastify'

// Read the .env file.
dotenv.config()

// Instantiate Fastify with some config
const app = Fastify({
  logger: {
    transport: {
      target: '@fastify/one-line-logger',
    },
  },
})

// Register your application as a normal plugin.
void app.register(import('./app'))

// Start listening.
void app.listen({
  port: Number(process.env.PORT ?? 3000),
  host: process.env.SERVER_HOSTNAME ?? '127.0.0.1',
})

app.ready((err) => {
  if (err) {
    app.log.error(err)
    process.exit(1)
  }

  app.log.info(`Server listening on port ${Number(process.env.PORT ?? 3000)}`)
})

process.on('uncaughtException', (err) => {
  console.error(err)
})
process.on('unhandledRejection', (err) => {
  console.error(err)
})

export { app }
