import TurndownService from "turndown";

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  hr: "---",
});

turndown.addRule("opalineCallout", {
  filter: (node) => node.nodeName.toLowerCase() === "section" && hasAttribute(node, "data-opaline-callout"),
  replacement: (content) => blockquote(content),
});

turndown.addRule("opalineLayout", {
  filter: (node) => node.nodeName.toLowerCase() === "section" && hasAttribute(node, "data-opaline-layout"),
  replacement: (content, node) => {
    const kind = getAttribute(node, "data-opaline-layout") || "layout";
    return `\n\n<!-- opaline-layout: ${kind} -->\n\n${content.trim()}\n\n<!-- /opaline-layout -->\n\n`;
  },
});

turndown.addRule("opalineColumn", {
  filter: (node) => hasAttribute(node, "data-opaline-column"),
  replacement: (content, node) => {
    const role = getAttribute(node, "data-opaline-column") || "column";
    return `\n\n<!-- opaline-column: ${role} -->\n\n${content.trim()}\n\n`;
  },
});

turndown.addRule("opalineDisclosure", {
  filter: (node) => node.nodeName.toLowerCase() === "details" && hasAttribute(node, "data-opaline-disclosure"),
  replacement: (_content, node) => {
    const element = node as HTMLElement;
    const summary = element.querySelector("summary")?.textContent?.trim() || "折叠内容";
    const body = element.querySelector("[data-opaline-disclosure-content]")?.innerHTML || "";
    const bodyMarkdown = turndown.turndown(body).trim();
    return `\n\n<details>\n<summary>${summary}</summary>\n\n${bodyMarkdown}\n\n</details>\n\n`;
  },
});

turndown.addRule("opalineMathInline", {
  filter: (node) => hasAttributeValue(node, "data-opaline-math", "inline"),
  replacement: (_content, node) => `$${getAttribute(node, "data-opaline-latex") || node.textContent || ""}$`,
});

turndown.addRule("opalineMathBlock", {
  filter: (node) => hasAttributeValue(node, "data-opaline-math", "block"),
  replacement: (_content, node) => {
    const latex = (node as HTMLElement).querySelector("pre")?.textContent?.trim() || getAttribute(node, "data-opaline-latex") || "";
    return `\n\n$$\n${latex}\n$$\n\n`;
  },
});

turndown.addRule("opalineMermaid", {
  filter: (node) => hasAttributeValue(node, "data-opaline-diagram", "mermaid"),
  replacement: (_content, node) => {
    const code = (node as HTMLElement).querySelector("pre")?.textContent?.trim() || node.textContent?.trim() || "";
    return `\n\n\`\`\`mermaid\n${code}\n\`\`\`\n\n`;
  },
});

turndown.addRule("opalineEmbed", {
  filter: (node) => hasAttribute(node, "data-opaline-embed"),
  replacement: (_content, node) => {
    const title = getAttribute(node, "data-opaline-embed-title") || "嵌入笔记";
    const excerpt = (node as HTMLElement).querySelector("p")?.textContent?.trim();
    return `\n\n> [!note] ${title}${excerpt ? `\n> ${excerpt}` : ""}\n\n`;
  },
});

turndown.addRule("taskItem", {
  filter: (node) => node.nodeName.toLowerCase() === "li" && hasAttributeValue(node, "data-type", "taskItem"),
  replacement: (content, node) => {
    const checked = hasAttributeValue(node, "data-checked", "true") || (node as HTMLElement).querySelector("input")?.hasAttribute("checked");
    const text = content.replace(/\n+/g, "\n  ").trim();
    return `- [${checked ? "x" : " "}] ${text}\n`;
  },
});

export function articleHtmlToMarkdown(articleHtml: string): string {
  const trimmed = articleHtml.trim();
  if (!trimmed) return "";
  return `${turndown.turndown(trimmed).trim()}\n`;
}

const hasAttribute = (node: TurndownService.Node, name: string) =>
  node instanceof HTMLElement && node.hasAttribute(name);

const getAttribute = (node: TurndownService.Node, name: string) =>
  node instanceof HTMLElement ? node.getAttribute(name) : null;

const hasAttributeValue = (node: TurndownService.Node, name: string, value: string) =>
  getAttribute(node, name) === value;

const blockquote = (content: string) =>
  `\n\n${content
    .trim()
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n")}\n\n`;
