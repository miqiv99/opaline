import { marked } from "marked";
import { sanitizeArticleHtml } from "./htmlProfile";
import { assignBlockIds } from "./extensions/blockId";

export function markdownToOpalineArticle(markdown: string): string {
  const rawHtml = marked.parse(markdown, { async: false }) as string;
  const sanitized = sanitizeArticleHtml(rawHtml);
  return assignBlockIds(sanitized);
}

export function markdownTitle(markdown: string): string {
  const firstLine = markdown.trimStart().split("\n")[0] ?? "";
  const title = firstLine.replace(/^#+\s*/, "").trim();
  return title || "未命名笔记";
}
