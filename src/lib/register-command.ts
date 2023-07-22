import type TelegramBot from "node-telegram-bot-api";

export async function setTGBotCommands(
  tgBot: TelegramBot,
  commands: (TelegramBot.BotCommand & {
    handler: (
      cmdLine: string,
      msg: TelegramBot.Message,
    ) =>
      | void
      | Promise<void>
      | boolean
      | Promise<boolean>
      | Promise<string>
      | string;
  })[],
) {
  await tgBot.setMyCommands(commands);
  tgBot.on("text", async (msg) => {
    const senderMsg = msg.text;

    if (!senderMsg) return;

    for await (const cmd of commands) {
      const { command, handler } = cmd;

      const matchedCommand = `/${command}`;
      const isMatch = senderMsg.startsWith(matchedCommand);

      if (!isMatch) continue;

      const cmdLine = senderMsg.slice(matchedCommand.length).trim();

      const handled = await handler(cmdLine, msg);
      if (handled === true) break;

      if (typeof handled === "string") {
        await tgBot.sendMessage(msg.chat.id, handled);
        break;
      }
    }
  });
}
