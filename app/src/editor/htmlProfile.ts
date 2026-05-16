import { assignBlockIds } from "./extensions/blockId";

const parser = new DOMParser();

type LinkableNote = {
  id: string;
  title: string;
  path: string;
};

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

export const replaceArticleInDocument = (
  documentHtml: string,
  articleHtml: string,
  linkableNotes: LinkableNote[] = [],
): string => {
  const document = parser.parseFromString(documentHtml, "text/html");
  const article = document.querySelector("[data-opaline-note]");

  const targetArticle = article ?? document.createElement("article");
  targetArticle.setAttribute("data-opaline-note", "");

  const linkedArticleHtml = compileWikiLinks(articleHtml, linkableNotes);
  const cleanArticleHtml = sanitizeArticleHtml(linkedArticleHtml);
  const blockIdArticleHtml = assignBlockIds(cleanArticleHtml);
  targetArticle.innerHTML = blockIdArticleHtml;

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
  "aside",
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
  "h4",
  "h5",
  "h6",
  "hr",
  "img",
  "input",
  "label",
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
  "type",
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
      const isTaskData = name === "data-type" || name === "data-checked";
      const isInputState = name === "checked" || name === "disabled";

      if (!allowedAttrs.has(name) && !isOpalineData && !isTaskData && !isInputState) {
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

const compileWikiLinks = (articleHtml: string, notes: LinkableNote[]): string => {
  if (!articleHtml.includes("[[")) {
    return articleHtml;
  }

  const noteByTitle = new Map(notes.map((note) => [note.title.trim().toLowerCase(), note]));
  const document = parser.parseFromString(`<article>${articleHtml}</article>`, "text/html");
  const article = document.body.firstElementChild;

  if (!article) {
    return articleHtml;
  }

  walkTextNodes(article, (textNode) => {
    const text = textNode.nodeValue ?? "";
    const pattern = /\[\[([^\]]+)\]\]/g;
    let match: RegExpExecArray | null;
    let lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let changed = false;

    while ((match = pattern.exec(text))) {
      changed = true;
      fragment.append(document.createTextNode(text.slice(lastIndex, match.index)));

      const rawTitle = match[1].trim();
      const [titlePart, blockId] = splitBlockRef(rawTitle);
      const note = noteByTitle.get(titlePart.toLowerCase());

      if (note) {
        const link = document.createElement("a");
        link.href = blockId ? `${relativeHref(note.path)}#${blockId}` : relativeHref(note.path);
        link.setAttribute("data-opaline-link", note.id);
        if (blockId) link.setAttribute("data-opaline-block-ref", blockId);
        link.textContent = rawTitle;
        fragment.append(link);
      } else {
        const span = document.createElement("span");
        span.setAttribute("data-opaline-unresolved", rawTitle);
        span.textContent = `[[${rawTitle}]]`;
        fragment.append(span);
      }

      lastIndex = pattern.lastIndex;
    }

    if (!changed) {
      return;
    }

    fragment.append(document.createTextNode(text.slice(lastIndex)));
    textNode.replaceWith(fragment);
  });

  return article.innerHTML;
};

const walkTextNodes = (root: Node, visitor: (node: Text) => void) => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }
  nodes.forEach(visitor);
};

const splitBlockRef = (raw: string): [string, string | null] => {
  const hashIndex = raw.lastIndexOf("#");
  if (hashIndex === -1) return [raw, null];
  const titlePart = raw.slice(0, hashIndex).trim();
  const blockId = raw.slice(hashIndex + 1).trim();
  return titlePart ? [titlePart, blockId] : [raw, null];
};

const relativeHref = (notePath: string) => notePath.replace(/^notes\//, "");

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
