import { assignBlockIds } from "./extensions/blockId";
import { loadInstalledPluginsFromCache } from "./pluginRegistry";
import { upsertDocumentThemeStyle, type OpalineDocumentStyle } from "./documentStyle";

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
  documentStyle?: OpalineDocumentStyle,
): string => {
  const document = parser.parseFromString(documentHtml, "text/html");
  const article = document.querySelector("[data-opaline-note]");

  const targetArticle = article ?? document.createElement("article");
  targetArticle.setAttribute("data-opaline-note", "");

  const linkedArticleHtml = compileWikiLinks(articleHtml, linkableNotes);
  const cleanArticleHtml = sanitizeArticleHtml(linkedArticleHtml);
  const blockIdArticleHtml = assignBlockIds(cleanArticleHtml);
  targetArticle.innerHTML = blockIdArticleHtml;
  if (documentStyle) {
    upsertDocumentThemeStyle(document, documentStyle);
  }
  syncLiveRuntime(document, blockIdArticleHtml);

  if (!article) {
    document.body.replaceChildren(targetArticle);
  }

  const title = titleFromArticleHtml(cleanArticleHtml, document.title || "未命名笔记");
  document.title = title;
  upsertMeta(document, "opaline:updated", new Date().toISOString());

  return `<!doctype html>\n${document.documentElement.outerHTML}\n`;
};

const syncLiveRuntime = (document: Document, articleHtml: string) => {
  document.querySelectorAll("[data-opaline-live-runtime]").forEach((node) => node.remove());
  if (!articleHtml.includes("opaline-widget") && !articleHtml.includes("opaline-script")) {
    return;
  }

  const style = document.createElement("style");
  style.setAttribute("data-opaline-live-runtime", "");
  style.textContent = liveRuntimeStyle;
  document.head.append(style);

  const script = document.createElement("script");
  script.setAttribute("data-opaline-live-runtime", "");
  const scripts = Object.fromEntries(
    loadInstalledPluginsFromCache().flatMap((plugin) =>
      plugin.enabled ? plugin.widgets.map((item) => [item.type, item.code]) : [],
    ),
  );
  script.textContent = liveRuntimeScript.replace(
    "__OPALINE_PLUGIN_WIDGET_SCRIPTS__",
    safeScriptJson(scripts),
  );
  document.body.append(script);
};

const safeScriptJson = (value: unknown) =>
  JSON.stringify(value).replace(/<\//g, "<\\/");

const liveRuntimeStyle = `
opaline-widget, opaline-script {
  display: block;
  margin: 1.4rem 0;
  border: 1px solid rgba(91, 103, 219, 0.24);
  border-radius: 16px;
  background: rgba(91, 103, 219, 0.07);
  padding: 14px;
}
opaline-script {
  border-color: rgba(203, 86, 59, 0.28);
  background: rgba(255, 247, 242, 0.78);
}
.opaline-live-runtime-label {
  color: #5b67db;
  font-size: 0.76rem;
  font-weight: 760;
  text-transform: uppercase;
}
.opaline-live-runtime-output {
  overflow: auto;
  max-height: 360px;
  margin-top: 10px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
  padding: 11px 12px;
  font: 0.88rem/1.55 system-ui, sans-serif;
}
.opaline-live-runtime-output pre {
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
.opaline-live-runtime-error {
  border-color: rgba(203, 86, 59, 0.34);
  background: rgba(255, 247, 242, 0.82);
  color: #9a3412;
}
`;

const liveRuntimeScript = `
(() => {
  const pluginWidgetScripts = __OPALINE_PLUGIN_WIDGET_SCRIPTS__;
  const text = (value) => {
    if (typeof value === "string") return value;
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
  };
  const outputFor = (element) => {
    let output = element.querySelector(":scope > .opaline-live-runtime-output");
    if (!output) {
      output = document.createElement("div");
      output.className = "opaline-live-runtime-output";
      element.append(output);
    }
    return output;
  };
  const render = (output, value) => {
    output.classList.remove("opaline-live-runtime-error");
    output.replaceChildren();
    const pre = document.createElement("pre");
    pre.textContent = text(value);
    output.append(pre);
  };
  const httpText = async (url) => {
    const started = performance.now();
    const response = await fetch(url, { cache: "no-store" });
    const body = await response.text();
    return {
      url,
      status: response.status,
      ok: response.ok,
      contentType: response.headers.get("content-type"),
      body: body.slice(0, 12000),
      elapsedMs: Math.round(performance.now() - started),
    };
  };
  const urlFor = (target, endpoint) => {
    if (!target) return "";
    const url = target.startsWith("http://") || target.startsWith("https://") ? new URL(target) : new URL("http://" + target);
    const path = endpoint || "/status";
    if ((!url.pathname || url.pathname === "/") && path) url.pathname = path.startsWith("/") ? path : "/" + path;
    return url.toString();
  };
  const refreshMs = (value) => {
    const raw = String(value || "5s").trim().toLowerCase();
    const number = Number.parseFloat(raw);
    if (!Number.isFinite(number) || number <= 0) return 5000;
    if (raw.endsWith("ms")) return Math.max(500, number);
    if (raw.endsWith("m")) return Math.max(1000, number * 60000);
    return Math.max(1000, number * 1000);
  };
  const runWidget = (widget) => {
    const type = widget.getAttribute("type") || "";
    const code = pluginWidgetScripts[type];
    if (!widget.querySelector(":scope > .opaline-live-runtime-label")) {
      const label = document.createElement("div");
      label.className = "opaline-live-runtime-label";
      label.textContent = code ? "Extension widget" : "Opaline widget";
      widget.prepend(label);
    }
    const output = outputFor(widget);
    if (!code) {
      output.textContent = "No installed extension script is embedded for this widget type.";
      return;
    }
    const timers = new Set();
    const attrs = {};
    for (const attr of widget.attributes) attrs[attr.name] = attr.value;
    const api = {
      render: (value) => render(output, value),
      log: (...values) => { output.textContent += values.map(text).join(" ") + "\\n"; },
      every: (ms, callback) => {
        const timer = window.setInterval(() => Promise.resolve(callback()).catch((error) => {
          output.classList.add("opaline-live-runtime-error");
          output.textContent = error instanceof Error ? error.message : "Widget interval failed";
        }), Math.max(500, ms));
        timers.add(timer);
        return timer;
      },
      timeout: (ms, callback) => {
        const timer = window.setTimeout(() => Promise.resolve(callback()).catch((error) => {
          output.classList.add("opaline-live-runtime-error");
          output.textContent = error instanceof Error ? error.message : "Widget timeout failed";
        }), Math.max(0, ms));
        timers.add(timer);
        return timer;
      },
      url: urlFor,
      refreshMs,
      parseBody: (result) => {
        try { return JSON.parse(result.body); } catch { return result.body; }
      },
      net: { fetch: httpText },
    };
    output.textContent = "Running widget...";
    Promise.resolve(new Function("widget", "opaline", '"use strict"; return (async () => {\\n' + code + '\\n})();')(attrs, api))
      .then((result) => {
        if (typeof result !== "undefined") render(output, result);
        else if (output.textContent === "Running widget...") output.textContent = "Widget completed.";
      })
      .catch((error) => {
        output.classList.add("opaline-live-runtime-error");
        output.textContent = error instanceof Error ? error.message : "Widget failed";
      });
  };
  const runScript = (script) => {
    if (!script.querySelector(":scope > .opaline-live-runtime-label")) {
      const label = document.createElement("div");
      label.className = "opaline-live-runtime-label";
      label.textContent = "Experimental script note";
      script.prepend(label);
    }
    const output = outputFor(script);
    const code = Array.from(script.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent || "")
      .join("\\n")
      .trim();
    const timers = new Set();
    const api = {
      render: (value) => render(output, value),
      log: (...values) => { output.textContent += values.map(text).join(" ") + "\\n"; },
      every: (ms, callback) => {
        const timer = window.setInterval(() => Promise.resolve(callback()).catch((error) => {
          output.classList.add("opaline-live-runtime-error");
          output.textContent = error instanceof Error ? error.message : "Script interval failed";
        }), Math.max(500, ms));
        timers.add(timer);
        return timer;
      },
      net: { fetch: httpText },
    };
    output.textContent = "Running...";
    Promise.resolve(new Function("opaline", '"use strict"; return (async () => {\\n' + code + '\\n})();')(api))
      .then((result) => {
        if (typeof result !== "undefined") render(output, result);
        else if (output.textContent === "Running...") output.textContent = "Script completed.";
      })
      .catch((error) => {
        output.classList.add("opaline-live-runtime-error");
        output.textContent = error instanceof Error ? error.message : "Script failed";
      });
  };
  window.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("opaline-widget").forEach(runWidget);
    document.querySelectorAll("opaline-script").forEach(runScript);
  });
})();
`;

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
  "opaline-script",
  "opaline-widget",
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
  "u",
  "ul",
]);

const allowedAttrs = new Set([
  "alt",
  "colspan",
  "dir",
  "endpoint",
  "href",
  "id",
  "lang",
  "language",
  "plugin",
  "profile",
  "refresh",
  "rowspan",
  "src",
  "target",
  "data-query",
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
        link.setAttribute("data-opaline-link-kind", blockId ? "block" : "note");
        if (blockId) {
          link.setAttribute("data-opaline-block-ref", blockId);
        }
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

  if (!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)) {
    return true;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:" || url.protocol === "tel:" || url.protocol === "opaline:";
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
