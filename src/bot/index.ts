/* eslint-disable import/no-mutable-exports */
import TelegramBot from "node-telegram-bot-api";
import { appConfig } from "../app.config";
import { createNamespaceLogger } from "~/lib/logger";

const { bot } = appConfig;

let tgBot: TelegramBot;

function initTgBot() {
  const logger = createNamespaceLogger("TgBot");
  tgBot = new TelegramBot(bot.token, { polling: true });

  logger.info("Ready!");

  tgBot.on("message", (msg) => {
    const chatId = msg.chat.id;

    // send a message to the chat acknowledging receipt of their message
    tgBot.sendMessage(chatId, "Received your message");
  });
}
export { tgBot, initTgBot };
