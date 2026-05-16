import { Node, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    opalineWidget: {
      insertOpalineWidget: (options: { type: "query" | "chart" | "local-graph"; title?: string; query?: string }) => ReturnType;
    };
  }
}

const builtInWidgetTypes = new Set(["query", "chart", "local-graph"]);

export const OpalineWidget = Node.create({
  name: "opalineWidget",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      type: { default: "local-graph" },
      title: { default: "" },
      query: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "opaline-widget",
        getAttrs: (element) => {
          const type = element.getAttribute("type") || "local-graph";
          return {
            type: builtInWidgetTypes.has(type) ? type : "unknown",
            title: element.getAttribute("title") || element.textContent?.trim() || "",
            query: element.getAttribute("data-query") || "",
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const type = node.attrs.type as string;
    const title = (node.attrs.title as string) || widgetLabel(type);
    const query = node.attrs.query as string;
    const attrs = query
      ? { type, title, "data-query": query }
      : { type, title };
    return [
      "opaline-widget",
      mergeAttributes(HTMLAttributes, attrs),
      `Opaline widget: ${title}`,
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const type = node.attrs.type as string;
      const title = (node.attrs.title as string) || widgetLabel(type);
      const query = node.attrs.query as string;
      const dom = document.createElement("div");
      dom.className = "opaline-widget-card";
      dom.contentEditable = "false";
      dom.innerHTML = [
        `<span>${escapeHtml(widgetLabel(type))}</span>`,
        `<strong>${escapeHtml(title)}</strong>`,
        `<p>${escapeHtml(widgetDescription(type, query))}</p>`,
      ].join("");
      return { dom };
    };
  },

  addCommands() {
    return {
      insertOpalineWidget:
        (options) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              type: options.type,
              title: options.title || widgetLabel(options.type),
              query: options.query || "",
            },
          }),
    };
  },
});

const widgetLabel = (type: string) => {
  if (type === "query") return "Query";
  if (type === "chart") return "Chart";
  if (type === "local-graph") return "Local graph";
  return "Unsupported widget";
};

const widgetDescription = (type: string, query: string) => {
  if (type === "local-graph") return "Shows the current note's local relationship neighborhood when opened in Opaline.";
  if (type === "query") return query ? `Saved query: ${query}` : "Saved query placeholder.";
  if (type === "chart") return query ? `Chart source: ${query}` : "Chart placeholder.";
  return "This widget is stored as readable HTML and will not run arbitrary scripts.";
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
