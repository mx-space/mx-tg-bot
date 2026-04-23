import { Marked } from "marked";
import RemoveMarkdown from "remove-markdown";

import { createNamespaceLogger } from "~/lib/logger";

const logger = createNamespaceLogger("rich-text");

export const escapeHtml = (input: string): string =>
  input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const SAFE_URL_RE = /^(https?:|tg:|mailto:)/i;

const safeHref = (href: string | null | undefined): string | null => {
  if (!href) return null;
  const trimmed = href.trim();
  if (!SAFE_URL_RE.test(trimmed)) return null;
  return escapeHtml(trimmed);
};

const tgMarked = new Marked({
  gfm: true,
  breaks: true,
  async: false,
  mangle: false,
  headerIds: false,
  renderer: {
    code(code, infostring, escaped) {
      const body = escaped ? code : escapeHtml(code);
      const lang = (infostring || "").trim().split(/\s+/)[0];
      if (lang) {
        return `<pre><code class="language-${escapeHtml(lang)}">${body}</code></pre>\n`;
      }
      return `<pre>${body}</pre>\n`;
    },
    blockquote(quote) {
      return `<blockquote>${quote.trim()}</blockquote>\n`;
    },
    html(html) {
      return escapeHtml(html);
    },
    heading(text) {
      return `<b>${text}</b>\n`;
    },
    hr() {
      return "———\n";
    },
    list(body) {
      return `${body}\n`;
    },
    listitem(text) {
      return `• ${text}\n`;
    },
    checkbox(checked) {
      return checked ? "☑ " : "☐ ";
    },
    paragraph(text) {
      return `${text}\n\n`;
    },
    table() {
      return "";
    },
    tablerow() {
      return "";
    },
    tablecell() {
      return "";
    },
    strong(text) {
      return `<b>${text}</b>`;
    },
    em(text) {
      return `<i>${text}</i>`;
    },
    codespan(code) {
      return `<code>${code}</code>`;
    },
    br() {
      return "\n";
    },
    del(text) {
      return `<s>${text}</s>`;
    },
    link(href, _title, text) {
      const safe = safeHref(href);
      if (!safe) return text;
      return `<a href="${safe}">${text}</a>`;
    },
    image(href, _title, text) {
      const alt = text ? escapeHtml(text) : "image";
      const safe = safeHref(href);
      if (!safe) return alt;
      return `<a href="${safe}">${alt}</a>`;
    },
    text(text) {
      return text;
    },
  },
});

export const renderMarkdownToTgHtml = (markdown: string): string => {
  const input = markdown ?? "";
  if (!input.trim()) return "";
  try {
    const rendered = tgMarked.parse(input) as string;
    return rendered.replace(/\n{3,}/g, "\n\n").trim();
  } catch (err) {
    logger.warn("markdown render failed, fallback to plain text", err);
    return escapeHtml(RemoveMarkdown(input));
  }
};
