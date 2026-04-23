import { truncateWithEllipsis, TG_CAPTION_MAX, TG_TEXT_MAX } from "./length";
import { escapeHtml, renderMarkdownToTgHtml } from "./markdown-to-html";

const MD_TAG = Symbol("tg-rich-md");

interface MdSegment {
  readonly [MD_TAG]: true;
  readonly markdown: string;
}

const isMdSegment = (value: unknown): value is MdSegment =>
  typeof value === "object" &&
  value !== null &&
  (value as MdSegment)[MD_TAG] === true;

const DEFAULT_MD_MAX = 3500;

export const md = (
  markdown: string | null | undefined,
  options?: { max?: number },
): MdSegment => {
  const max = options?.max ?? DEFAULT_MD_MAX;
  const input = markdown ?? "";
  const capped = truncateWithEllipsis(input, max);
  return { [MD_TAG]: true, markdown: capped };
};

const stringify = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  return String(value);
};

const makeRichify =
  (max: number) =>
  (strings: TemplateStringsArray, ...values: unknown[]): string => {
    let out = "";
    for (let i = 0; i < strings.length; i += 1) {
      out += escapeHtml(strings[i]);
      if (i < values.length) {
        const v = values[i];
        if (isMdSegment(v)) {
          out += renderMarkdownToTgHtml(v.markdown);
        } else {
          out += escapeHtml(stringify(v));
        }
      }
    }
    return truncateWithEllipsis(out, max);
  };

export const richify = makeRichify(TG_TEXT_MAX);
export const richifyCaption = makeRichify(TG_CAPTION_MAX);
