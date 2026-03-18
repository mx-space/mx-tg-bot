import * as dotenv from "dotenv";
import Fastify from "fastify";

dotenv.config();

const app = Fastify({
  logger: true,
});

void app.register(import("./app"));

void app.listen({
  port: Number(process.env.PORT ?? 3000),
  host: process.env.SERVER_HOSTNAME ?? "127.0.0.1",
});

app.ready((err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }

  app.log.info(`Server listening on port ${Number(process.env.PORT ?? 3000)}`);
});

process.on("uncaughtException", (err) => {
  console.error(err);
});
process.on("unhandledRejection", (err) => {
  console.error(err);
});

export { app };
