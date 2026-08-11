import type { BusinessEvents, EnrichmentResult } from "@mx-space/webhook";

import { escapeHtml, renderMarkdownToTgHtml } from "~/lib/rich-text";

import type { MxEventHandler } from "./types";

const CATEGORY_PHRASES: Record<
  string,
  { verb: string; quote: [string, string] }
> = {
  media: { verb: "看了", quote: ["《", "》"] },
  music: { verb: "在听", quote: ["「", "」"] },
  book: { verb: "在读", quote: ["《", "》"] },
  academic: { verb: "读了论文", quote: ["《", "》"] },
  code: { verb: "刷了道题", quote: [" ", ""] },
  github: { verb: "分享了", quote: [" ", ""] },
};

const pickEnriched = (
  content: string,
  enrichments: Record<string, EnrichmentResult> | undefined,
) => {
  if (!enrichments) return null;

  let picked: {
    url: string;
    result: EnrichmentResult;
    phrase: (typeof CATEGORY_PHRASES)[string];
  } | null = null;
  let pickedPos = Infinity;

  for (const [url, result] of Object.entries(enrichments)) {
    const phrase = result?.category && CATEGORY_PHRASES[result.category];
    if (!phrase || !result.title) continue;

    const index = content.indexOf(url);
    const pos = index === -1 ? Number.MAX_SAFE_INTEGER : index;
    if (pos < pickedPos) {
      picked = { url, result, phrase };
      pickedPos = pos;
    }
  }

  return picked;
};

export const handleRecentlyCreate: MxEventHandler<
  BusinessEvents.RECENTLY_CREATE
> = async (runtime, payload) => {
  const owner = (await runtime.getAggregateData()).user;
  const content = payload.content ?? "";
  const picked = pickEnriched(content, payload.enrichments);

  if (!picked) {
    await runtime.sendToGroup(`${owner.name} 发布一条动态说：\n${content}`);
    return;
  }

  const { url, result, phrase } = picked;
  const [open, close] = phrase.quote;
  const title = `<a href="${escapeHtml(url)}">${escapeHtml(result.title)}</a>`;
  const rest = renderMarkdownToTgHtml(content.replace(url, "").trim());

  const message = `${escapeHtml(owner.name)} ${phrase.verb}${open}${title}${close}${
    rest ? `\n\n${rest}` : ""
  }`;

  await runtime.sendToGroup([{ type: "HTML", content: message }]);
};
