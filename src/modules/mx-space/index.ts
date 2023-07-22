import type { PluginFunction } from "~/lib/plugin";
import { setTGBotCommands } from "~/lib/register-command";
import { relativeTimeFromNow } from "~/lib/time";
import { apiClient } from "./api-client";
import { getMxSpaceAggregateData } from "./data";

const chatId = -1001570490524;

export const register: PluginFunction = async (ctx) => {
  const { tgBot } = ctx;

  await setTGBotCommands(tgBot, [
    {
      command: "mx_get_posts",
      description: "Get posts from Mix Space",
      handler: async (cmdLine, msg) => {
        console.log(cmdLine);
        const page = Number(cmdLine) || 1;
        const data = await apiClient.post.getList(page);
        const aggregateData = await getMxSpaceAggregateData();
        const { webUrl } = aggregateData.url;
        const text = data.data
          .map(
            (post) =>
              `${relativeTimeFromNow(post.created)}前\n[${
                post.title
              }](${webUrl}/posts/${post.category.slug}/${post.slug})`,
          )
          .join("\n");

        const markupText = `*文章列表*\n\n${text}`;

        await tgBot.sendMessage(msg.chat.id, markupText, {
          parse_mode: "Markdown",
          // reply_markup: {
          //   inline_keyboard: [
          //     [
          //       {
          //         text: "test",
          //
          //       },
          //     ],
          //   ],
          // },
        });
      },
    },
  ]);
};
