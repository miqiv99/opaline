const parser = new DOMParser();

export const articleFromHtmlDocument = (html: string): string => {
  const document = parser.parseFromString(html, "text/html");
  const article = document.querySelector("[data-opaline-note]");
  const fallbackBody = document.body?.innerHTML.trim() ?? "";
  return sanitizeArticleHtml(article?.innerHTML.trim() ?? fallbackBody);
};

export const titleFromArticleHtml = (articleHtml: string, fallback: string): string => {
  const document = parser.parseFromString(`<article>${articleHtml}</article>`, "text/html");
  return document.querySelector("h1")?.textContent?.trim() || fallback;
};

export const replaceArticleInDocument = (documentHtml: string, articleHtml: string): string => {
  const document = parser.parseFromString(documentHtml, "text/html");
  const article = document.querySelector("[data-opaline-note]");

  const targetArticle = article ?? document.createElement("article");
  targetArticle.setAttribute("data-opaline-note", "");

  const cleanArticleHtml = sanitizeArticleHtml(articleHtml);
  targetArticle.innerHTML = cleanArticleHtml;

  if (!article) {
    document.body.replaceChildren(targetArticle);
  }

  const title = titleFromArticleHtml(cleanArticleHtml, document.title || "未命名笔记");
  document.title = title;
  upsertMeta(document, "opaline:updated", new Date().toISOString());

  return `<!doctype html>\n${document.documentElement.outerHTML}\n`;
};

const allowedTags = new Set([
  "a",
  "blockquote",
  "br",
  "code",
  "colgroup",
  "col",
  "details",
  "div",
  "em",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "hr",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "section",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "ul",
]);

const allowedAttrs = new Set([
  "alt",
  "colspan",
  "dir",
  "href",
  "id",
  "lang",
  "rowspan",
  "src",
  "title",
]);

export const sanitizeArticleHtml = (articleHtml: string): string => {
  const document = parser.parseFromString(`<article>${articleHtml}</article>`, "text/html");
  const article = document.body.firstElementChild;

  if (!article) {
    return "";
  }

  sanitizeElement(article);
  return article.innerHTML.trim();
};

const sanitizeElement = (element: Element) => {
  for (const child of Array.from(element.children)) {
    const tagName = child.tagName.toLowerCase();

    if (tagName === "script" || tagName === "style" || tagName === "iframe") {
      child.remove();
      continue;
    }

    if (!allowedTags.has(tagName)) {
      sanitizeElement(child);
      child.replaceWith(...Array.from(child.childNodes));
      continue;
    }

    for (const attr of Array.from(child.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim();
      const isOpalineData = name.startsWith("data-opaline-");

      if (!allowedAttrs.has(name) && !isOpalineData) {
        child.removeAttribute(attr.name);
        continue;
      }

      if ((name === "href" || name === "src") && !isSafeUrl(value)) {
        child.removeAttribute(attr.name);
      }
    }

    sanitizeElement(child);
  }
};

const isSafeUrl = (value: string): boolean => {
  if (value.startsWith("#") || value.startsWith("./") || value.startsWith("../") || value.startsWith("/")) {
    return true;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
};

const upsertMeta = (document: Document, name: string, content: string) => {
  let meta = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);

  if (!meta) {
    meta = document.createElement("meta");
    meta.name = name;
    document.head.append(meta);
  }

  meta.content = content;
};
