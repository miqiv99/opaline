import { Node } from "@tiptap/core";
import mermaid from "mermaid";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mermaidBlock: {
      setMermaidBlock: (code: string) => ReturnType;
    };
  }
}

let mermaidInitialized = false;

const ensureMermaid = () => {
  if (!mermaidInitialized) {
    mermaid.initialize({ startOnLoad: false, theme: "neutral" });
    mermaidInitialized = true;
  }
};

export const MermaidBlock = Node.create({
  name: "mermaidBlock",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      code: { default: "graph TD\n  A[开始] --> B[结束]" },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'figure[data-opaline-diagram="mermaid"]',
        getAttrs: (el) => ({
          code: el.querySelector("pre")?.textContent?.trim() || el.textContent?.trim() || "",
        }),
      },
    ];
  },

  renderHTML({ node }) {
    return [
      "figure",
      { "data-opaline-diagram": "mermaid" },
      ["pre", {}, node.attrs.code as string],
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div");
      dom.className = "mermaid-block";
      dom.contentEditable = "false";

      const code = node.attrs.code as string;

      const renderDiagram = async () => {
        ensureMermaid();
        try {
          const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;
          const { svg } = await mermaid.render(id, code);
          dom.innerHTML = svg;
        } catch (err) {
          dom.innerHTML = `<pre class="mermaid-error">${escapeHtml(code)}</pre>`;
          console.error("Mermaid render error:", err);
        }
      };

      void renderDiagram();
      return { dom };
    };
  },

  addCommands() {
    return {
      setMermaidBlock:
        (code: string) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { code } }),
    };
  },
});

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
