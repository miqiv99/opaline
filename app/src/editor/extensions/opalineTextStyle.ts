import { Mark, mergeAttributes } from "@tiptap/core";

export type OpalineTextStyleAttrs = {
  fontFamily?: string | null;
  fontSize?: string | null;
  color?: string | null;
};

export const OpalineTextStyle = Mark.create({
  name: "opalineTextStyle",

  addAttributes() {
    return {
      fontFamily: {
        default: null,
        parseHTML: (element) => element.style.fontFamily || null,
      },
      fontSize: {
        default: null,
        parseHTML: (element) => element.style.fontSize || null,
      },
      color: {
        default: null,
        parseHTML: (element) => element.style.color || null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-opaline-text-style]",
      },
      {
        tag: "span[style]",
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) return false;
          return element.style.fontFamily || element.style.fontSize || element.style.color ? {} : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { fontFamily, fontSize, color, ...rest } = HTMLAttributes;
    const style = [
      fontFamily ? `font-family: ${fontFamily}` : "",
      fontSize ? `font-size: ${fontSize}` : "",
      color ? `color: ${color}` : "",
    ].filter(Boolean).join("; ");

    if (!style) {
      return ["span", rest, 0];
    }

    return [
      "span",
      mergeAttributes(
        rest,
        {
          "data-opaline-text-style": "",
          style,
        },
      ),
      0,
    ];
  },
});
