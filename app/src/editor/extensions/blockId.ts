import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

const blockIdKey = new PluginKey("opalineBlockId");

const blockTags = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "pre",
  "blockquote",
  "section",
  "figure",
  "table",
  "ul",
  "ol",
  "opaline-widget",
]);

export const BlockId = Extension.create({
  name: "blockId",

  addGlobalAttributes() {
    return [
      {
        types: [
          "paragraph",
          "heading",
          "listItem",
          "codeBlock",
          "blockquote",
          "horizontalRule",
          "table",
          "bulletList",
          "orderedList",
          "opalineLayout",
          "noteEmbed",
          "mermaidBlock",
          "mathBlock",
          "opalineWidget",
        ],
        attributes: {
          opalineBlockId: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-opaline-block-id"),
            renderHTML: (attributes) => {
              if (!attributes.opalineBlockId) return {};
              return { "data-opaline-block-id": attributes.opalineBlockId as string };
            },
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: blockIdKey,
        appendTransaction: (_transactions, oldState, newState) => {
          // Block IDs are assigned at serialization time in htmlProfile.ts
          // This plugin reserves the name but defers ID assignment to save
          return null;
        },
      }),
    ];
  },
});

export const assignBlockIds = (articleHtml: string): string => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<article>${articleHtml}</article>`, "text/html");
  const article = doc.body.firstElementChild;
  if (!article) return articleHtml;

  let counter = 0;
  const seen = new Set<string>();

  walkBlockElements(article, (el) => {
    const existing = el.getAttribute("data-opaline-block-id");
    if (existing) {
      seen.add(existing);
      return;
    }

    const tag = el.tagName.toLowerCase();
    const text = (el.textContent ?? "").trim().slice(0, 40);
    let id = `b-${tag}-${++counter}`;
    if (seen.has(id)) {
      id = `b-${tag}-${counter}-${Math.random().toString(36).slice(2, 6)}`;
    }
    seen.add(id);
    el.setAttribute("data-opaline-block-id", id);
  });

  return article.innerHTML.trim();
};

const walkBlockElements = (root: Element, visitor: (el: Element) => void) => {
  for (const child of Array.from(root.children)) {
    if (blockTags.has(child.tagName.toLowerCase())) {
      visitor(child);
    }
    walkBlockElements(child, visitor);
  }
};

/** Parse block IDs from article HTML, returned as { id, tag, text }[] */
export const listBlockIds = (articleHtml: string): { id: string; tag: string; text: string }[] => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<article>${articleHtml}</article>`, "text/html");
  const article = doc.body.firstElementChild;
  if (!article) return [];

  const blocks: { id: string; tag: string; text: string }[] = [];
  walkBlockElements(article, (el) => {
    const id = el.getAttribute("data-opaline-block-id");
    if (id) {
      blocks.push({ id, tag: el.tagName.toLowerCase(), text: (el.textContent ?? "").trim().slice(0, 60) });
    }
  });
  return blocks;
};
