import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    opalineLayout: {
      insertTwoColumnLayout: () => ReturnType;
      insertCompareLayout: () => ReturnType;
      insertSidenoteLayout: () => ReturnType;
      insertDisclosureBlock: () => ReturnType;
    };
  }
}

export const LayoutColumn = Node.create({
  name: "layoutColumn",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      role: { default: "main" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "[data-opaline-column]",
        getAttrs: (element) => ({
          role: (element as HTMLElement).getAttribute("data-opaline-column") || "main",
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const tag = node.attrs.role === "side" || node.attrs.role === "note" ? "aside" : "div";
    return [
      tag,
      mergeAttributes(HTMLAttributes, {
        "data-opaline-column": node.attrs.role as string,
      }),
      0,
    ];
  },
});

export const OpalineLayout = Node.create({
  name: "opalineLayout",
  group: "block",
  content: "layoutColumn+",
  isolating: true,
  defining: true,

  addAttributes() {
    return {
      kind: { default: "two-column" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "section[data-opaline-layout]",
        getAttrs: (element) => ({
          kind: (element as HTMLElement).getAttribute("data-opaline-layout") || "two-column",
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        "data-opaline-layout": node.attrs.kind as string,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      insertTwoColumnLayout:
        () =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { kind: "two-column" },
            content: [
              column("main", "主栏", "在这里写主要内容。"),
              column("side", "侧栏", "在这里放证据、链接或补充说明。"),
            ],
          }),

      insertCompareLayout:
        () =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { kind: "compare" },
            content: [
              column("source", "原文", "粘贴原文、资料或引用。"),
              column("analysis", "理解", "写翻译、理解、批注或结论。"),
            ],
          }),

      insertSidenoteLayout:
        () =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { kind: "sidenote" },
            content: [
              column("main", "正文", "这里写正文段落。"),
              column("note", "旁注", "这里写边注、来源或提醒。"),
            ],
          }),

      insertDisclosureBlock:
        () =>
        ({ commands }) =>
          commands.insertContent({
            type: "disclosureBlock",
            attrs: { open: true },
            content: [
              {
                type: "disclosureSummary",
                content: [{ type: "text", text: "点击这里修改折叠标题" }],
              },
              {
                type: "disclosureContent",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "这里写展开后显示的内容。" }],
                  },
                ],
              },
            ],
          }),
    };
  },
});

export const DisclosureBlock = Node.create({
  name: "disclosureBlock",
  group: "block",
  content: "disclosureSummary disclosureContent",
  isolating: true,
  defining: true,

  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (element) => (element as HTMLDetailsElement).open,
        renderHTML: (attributes) => (attributes.open ? { open: "" } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "details[data-opaline-disclosure]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["details", mergeAttributes(HTMLAttributes, { "data-opaline-disclosure": "" }), 0];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleClickOn: (view, _pos, node, nodePos, event) => {
            if (node.type.name !== this.name) {
              return false;
            }

            const target = event.target as HTMLElement | null;
            if (!target?.closest("summary")) {
              return false;
            }

            event.preventDefault();
            view.dispatch(
              view.state.tr.setNodeMarkup(nodePos, undefined, {
                ...node.attrs,
                open: !node.attrs.open,
              }),
            );
            return true;
          },
        },
      }),
    ];
  },
});

export const DisclosureSummary = Node.create({
  name: "disclosureSummary",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [{ tag: "summary" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["summary", HTMLAttributes, 0];
  },
});

export const DisclosureContent = Node.create({
  name: "disclosureContent",
  content: "block+",
  defining: true,

  parseHTML() {
    return [{ tag: "div[data-opaline-disclosure-content]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-opaline-disclosure-content": "" }), 0];
  },
});

const column = (role: string, title: string, body: string) => ({
  type: "layoutColumn",
  attrs: { role },
  content: [
    {
      type: "heading",
      attrs: { level: 3 },
      content: [{ type: "text", text: title }],
    },
    {
      type: "paragraph",
      content: [{ type: "text", text: body }],
    },
  ],
});
