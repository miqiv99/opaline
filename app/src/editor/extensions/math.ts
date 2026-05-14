import { Node } from "@tiptap/core";
import katex from "katex";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mathInline: {
      setMathInline: (latex: string) => ReturnType;
    };
    mathBlock: {
      setMathBlock: (latex: string) => ReturnType;
    };
  }
}

export const MathInline = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-opaline-math="inline"]',
        getAttrs: (el) => ({
          latex: (el as HTMLElement).getAttribute("data-opaline-latex") || el.textContent || "",
        }),
      },
    ];
  },

  renderHTML({ node }) {
    return ["span", { "data-opaline-math": "inline", "data-opaline-latex": node.attrs.latex as string }];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("span");
      dom.className = "math-inline";
      dom.contentEditable = "false";
      dom.title = (node.attrs.latex as string) || "";
      try {
        katex.render(node.attrs.latex as string, dom, { throwOnError: false });
      } catch {
        dom.textContent = node.attrs.latex as string;
      }
      return { dom };
    };
  },

  addCommands() {
    return {
      setMathInline:
        (latex: string) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { latex } }),
    };
  },

  addInputRules() {
    return [
      {
        find: /(?<!\$)\$(?!\$)([^\$]+)\$(?!\$)/,
        handler: ({ state, range, match }) => {
          const latex = match[1].trim();
          if (!latex) return;
          const { tr } = state;
          tr.replaceRangeWith(range.from, range.to, this.type.create({ latex }));
        },
      },
    ];
  },
});

export const MathBlock = Node.create({
  name: "mathBlock",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'figure[data-opaline-math="block"]',
        getAttrs: (el) => ({
          latex: el.querySelector("pre")?.textContent?.trim() || el.getAttribute("data-opaline-latex") || "",
        }),
      },
    ];
  },

  renderHTML({ node }) {
    return [
      "figure",
      { "data-opaline-math": "block" },
      ["pre", {}, node.attrs.latex as string],
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div");
      dom.className = "math-block";
      dom.contentEditable = "false";
      try {
        katex.render(node.attrs.latex as string, dom, { throwOnError: false, displayMode: true });
      } catch {
        dom.textContent = node.attrs.latex as string;
      }
      return { dom };
    };
  },

  addCommands() {
    return {
      setMathBlock:
        (latex: string) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { latex } }),
    };
  },

  addInputRules() {
    return [
      {
        find: /\$\$([^\$]+)\$\$/,
        handler: ({ state, range, match }) => {
          const latex = match[1].trim();
          if (!latex) return;
          const { tr } = state;
          tr.replaceRangeWith(range.from, range.to, this.type.create({ latex }));
        },
      },
    ];
  },
});
