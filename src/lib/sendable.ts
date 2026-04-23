import { Markup } from "telegraf";
import type { Telegraf } from "telegraf";

interface TextMessage {
  type: "text" | "Markdown" | "HTML" | "MarkdownV2";
  content: string;
}
interface MediaMessage {
  type: "photo";
  url: string[];

  caption?: string;
  parseMode?: "Markdown" | "HTML" | "MarkdownV2";
}
export interface URLKeyboardMessage {
  type: "url";
  label: string;
  url: string;
}
type IMessage = TextMessage | MediaMessage | URLKeyboardMessage;
export type Sendable = string | IMessage[];
type SendMessage = (chatId: number, message: Sendable) => Promise<unknown>;

export const createSendMessageInstance =
  (tgBot: Telegraf): SendMessage =>
  async (chatId: number, message: Sendable) => {
    if (typeof message === "string") {
      return tgBot.telegram.sendMessage(chatId, message);
    }
    const keyboardMessage = [] as URLKeyboardMessage[];
    const filteredMessage = message.filter((msg) => {
      if (msg.type === "url") {
        keyboardMessage.push(msg);
        return false;
      }
      return true;
    });

    const tasks = [] as Promise<unknown>[];

    for (const msg of filteredMessage) {
      switch (msg.type) {
        case "text":
          tasks.push(
            tgBot.telegram.sendMessage(
              chatId,
              msg.content,
              Markup.inlineKeyboard([
                ...keyboardMessage.map((msg) => {
                  return Markup.button.url(msg.label, msg.url);
                }),
              ]),
            ),
          );
          continue;
        case "HTML":
        case "Markdown":
        case "MarkdownV2":
          if (keyboardMessage.length > 0) {
            tasks.push(
              tgBot.telegram.sendMessage(
                chatId,
                msg.content,
                Markup.inlineKeyboard([
                  ...keyboardMessage.map((msg) => {
                    return Markup.button.url(msg.label, msg.url);
                  }),
                ]),
              ),
            );
          } else {
            tasks.push(
              tgBot.telegram.sendMessage(chatId, msg.content, {
                parse_mode: msg.type,
              }),
            );
          }
          continue;

        case "photo": {
          const { url, caption = "", parseMode } = msg;
          tasks.push(
            tgBot.telegram.sendMediaGroup(
              chatId,
              url.map((u, i) => {
                const isFirst = i === 0;
                return {
                  type: "photo",
                  media: u,
                  caption: isFirst ? caption : undefined,
                  parse_mode: isFirst ? parseMode : undefined,
                };
              }),
            ),
          );
          break;
        }
      }
    }

    return Promise.all(tasks);
  };
