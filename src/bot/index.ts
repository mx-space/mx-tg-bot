/* eslint-disable import/no-mutable-exports */

import TelegramBot from "node-telegram-bot-api";
import { appConfig } from "../app.config";
import { createNamespaceLogger } from "~/lib/logger";

const { bot } = appConfig;

let tgBot: TelegramBot;

function initTgBot() {
  const logger = createNamespaceLogger("Telegram Bot");
  tgBot = new TelegramBot(bot.token, { polling: true });

  logger.info("Ready!");

  return tgBot;
}
export { tgBot, initTgBot };
