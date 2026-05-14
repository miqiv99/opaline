import { Node } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    noteEmbed: {
      setNoteEmbed: (options: { noteId: string; title: string; excerpt: string }) => ReturnType;
    };
  }
}

export const NoteEmbed = Node.create({
  name: "noteEmbed",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      noteId: { default: "" },
      title: { default: "" },
      excerpt: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure[data-opaline-embed]",
        getAttrs: (el) => ({
          noteId: el.getAttribute("data-opaline-embed") || "",
          title: el.getAttribute("data-opaline-embed-title") || "",
          excerpt: el.querySelector("p")?.textContent?.trim() || "",
        }),
      },
    ];
  },

  renderHTML({ node }) {
    return [
      "figure",
      {
        "data-opaline-embed": node.attrs.noteId as string,
        "data-opaline-embed-title": node.attrs.title as string,
      },
      ["p", {}, node.attrs.excerpt as string],
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div");
      dom.className = "note-embed";
      dom.contentEditable = "false";

      const title = node.attrs.title as string;
      const excerpt = node.attrs.excerpt as string;
      const noteId = node.attrs.noteId as string;

      dom.innerHTML = [
        '<div class="note-embed-card">',
        `<span class="note-embed-label">嵌入笔记</span>`,
        `<strong class="note-embed-title">${escapeHtml(title || "未命名笔记")}</strong>`,
        `<p class="note-embed-excerpt">${escapeHtml(excerpt || "（无内容）")}</p>`,
        `<code class="note-embed-id">${escapeHtml(noteId)}</code>`,
        "</div>",
      ].join("");

      return { dom };
    };
  },

  addCommands() {
    return {
      setNoteEmbed:
        (options) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { noteId: options.noteId, title: options.title, excerpt: options.excerpt },
          }),
    };
  },
});

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
