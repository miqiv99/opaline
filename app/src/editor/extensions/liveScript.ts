import { Node, mergeAttributes } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { invoke } from "@tauri-apps/api/core";
import { loadLiveComponentSettings } from "../liveComponentSettings";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    opalineScript: {
      insertOpalineScript: (options?: { title?: string; language?: string; code?: string }) => ReturnType;
    };
  }
}

export const OpalineScript = Node.create({
  name: "opalineScript",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      title: { default: "实验脚本" },
      language: { default: "javascript" },
      code: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "opaline-script",
        getAttrs: (element) => ({
          title: element.getAttribute("title") || "实验脚本",
          language: element.getAttribute("language") || "javascript",
          code: element.textContent?.trim() || "",
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const title = node.attrs.title as string;
    const language = node.attrs.language as string;
    const code = node.attrs.code as string;
    return [
      "opaline-script",
      mergeAttributes(HTMLAttributes, { title, language }),
      code || "// Script placeholder. Opaline stores this inertly until script notes are explicitly supported.",
    ];
  },

  addNodeView() {
    return ({ node, view, getPos }) => createScriptNodeView(node, view, getPos);
  },

  addCommands() {
    return {
      insertOpalineScript:
        (options = {}) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              title: options.title || "实验脚本",
              language: options.language || "javascript",
              code: options.code || "const status = await opaline.net.fetch('http://192.168.1.1/status');\nopaline.render(status);",
            },
          }),
    };
  },
});

type ScriptAttrs = {
  title: string;
  language: string;
  code: string;
};

type HttpTextResult = {
  url: string;
  status: number;
  ok: boolean;
  contentType?: string | null;
  body: string;
  elapsedMs: number;
};

const createScriptNodeView = (
  initialNode: ProseMirrorNode,
  view: EditorView,
  getPos: (() => number | undefined) | boolean,
) => {
  let node = initialNode;
  let expandedEditor = false;
  let output: HTMLElement | null = null;
  let runToken = 0;
  const timers = new Set<number>();
  const dom = document.createElement("div");
  dom.contentEditable = "false";

  const attrs = (): ScriptAttrs => ({
    title: String(node.attrs.title || "实验脚本"),
    language: String(node.attrs.language || "javascript"),
    code: String(node.attrs.code || ""),
  });

  const clearRuntime = () => {
    runToken += 1;
    for (const timer of timers) {
      window.clearInterval(timer);
      window.clearTimeout(timer);
    }
    timers.clear();
  };

  const updateAttrs = (patch: Partial<ScriptAttrs>) => {
    if (typeof getPos !== "function") return;
    const pos = getPos();
    if (typeof pos !== "number") return;
    view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...patch }));
  };

  const render = () => {
    const settings = loadLiveComponentSettings();
    const current = attrs();
    dom.className = settings.experimentalScriptsEnabled ? "opaline-script-card is-live" : "opaline-script-card is-disabled";
    dom.replaceChildren();

    const toolbar = document.createElement("div");
    toolbar.className = "opaline-live-toolbar";
    const label = document.createElement("span");
    label.textContent = settings.experimentalScriptsEnabled ? "Experimental script note" : "Script note disabled";
    const actions = document.createElement("div");
    const runButton = document.createElement("button");
    runButton.type = "button";
    runButton.textContent = "运行";
    runButton.disabled = !settings.experimentalScriptsEnabled;
    runButton.addEventListener("click", () => void runScript());
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = expandedEditor ? "收起" : "编辑";
    editButton.addEventListener("click", () => {
      expandedEditor = !expandedEditor;
      render();
    });
    actions.append(runButton, editButton);
    toolbar.append(label, actions);

    const title = document.createElement("strong");
    title.textContent = current.title;
    const description = document.createElement("p");
    description.textContent = settings.experimentalScriptsEnabled
      ? "This script runs inside Opaline and can update the card output."
      : "Settings currently disables experimental script notes.";

    const preview = document.createElement("code");
    preview.textContent = `${current.language} · ${current.code.slice(0, 100)}`;

    output = document.createElement("div");
    output.className = "opaline-live-output";
    output.textContent = settings.experimentalScriptsEnabled ? "准备运行脚本..." : "脚本已禁用。";

    dom.append(toolbar, title, description, preview);
    if (expandedEditor) dom.append(createScriptEditor(current, updateAttrs));
    dom.append(output);

    if (settings.experimentalScriptsEnabled) {
      void runScript();
    } else {
      clearRuntime();
    }
  };

  const runScript = async () => {
    const current = attrs();
    const settings = loadLiveComponentSettings();
    if (!settings.experimentalScriptsEnabled || !output) return;
    clearRuntime();
    const token = runToken;
    output.classList.remove("is-error");
    output.classList.add("is-loading");
    output.textContent = "运行中...";

    const api = createOpalineScriptApi(output, timers);
    try {
      const fn = new Function("opaline", `"use strict"; return (async () => {\n${current.code}\n})();`);
      const result = await fn(api);
      if (token !== runToken) return;
      output.classList.remove("is-loading");
      if (typeof result !== "undefined") {
        renderValue(output, result);
      } else if (!output.textContent || output.textContent === "运行中...") {
        output.textContent = "脚本已运行，没有返回内容。";
      }
    } catch (error) {
      if (token !== runToken) return;
      output.classList.add("is-error");
      output.classList.remove("is-loading");
      output.textContent = error instanceof Error ? error.message : "脚本运行失败";
    }
  };

  render();

  return {
    dom,
    update(nextNode: ProseMirrorNode) {
      if (nextNode.type.name !== node.type.name) return false;
      node = nextNode;
      render();
      return true;
    },
    destroy() {
      clearRuntime();
    },
    stopEvent(event: Event) {
      const target = event.target as HTMLElement | null;
      return Boolean(target?.closest("button, input, textarea, select"));
    },
  };
};

const createScriptEditor = (attrs: ScriptAttrs, onSave: (patch: Partial<ScriptAttrs>) => void) => {
  const form = document.createElement("div");
  form.className = "opaline-live-editor";
  const titleField = inputField("标题", attrs.title);
  const languageField = inputField("语言", attrs.language);
  const codeLabel = document.createElement("label");
  const codeLabelText = document.createElement("span");
  codeLabelText.textContent = "脚本";
  const codeArea = document.createElement("textarea");
  codeArea.rows = 9;
  codeArea.value = attrs.code;
  codeLabel.append(codeLabelText, codeArea);
  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "保存并运行";
  save.addEventListener("click", () => {
    onSave({
      title: titleField.input.value.trim() || "实验脚本",
      language: languageField.input.value.trim() || "javascript",
      code: codeArea.value,
    });
  });
  form.append(titleField.label, languageField.label, codeLabel, save);
  return form;
};

const inputField = (labelText: string, value: string) => {
  const label = document.createElement("label");
  const span = document.createElement("span");
  span.textContent = labelText;
  const input = document.createElement("input");
  input.value = value;
  label.append(span, input);
  return { label, input };
};

const createOpalineScriptApi = (output: HTMLElement, timers: Set<number>) => ({
  render(value: unknown) {
    renderValue(output, value);
  },
  log(...values: unknown[]) {
    const line = values.map(stringifyValue).join(" ");
    const current = output.textContent && output.textContent !== "运行中..." ? `${output.textContent}\n` : "";
    output.textContent = `${current}${line}`;
  },
  every(ms: number, callback: () => unknown | Promise<unknown>) {
    const timer = window.setInterval(() => {
      void Promise.resolve(callback()).catch((error) => {
        output.classList.add("is-error");
        output.textContent = error instanceof Error ? error.message : "定时脚本运行失败";
      });
    }, Math.max(500, ms));
    timers.add(timer);
    return timer;
  },
  timeout(ms: number, callback: () => unknown | Promise<unknown>) {
    const timer = window.setTimeout(() => {
      timers.delete(timer);
      void Promise.resolve(callback()).catch((error) => {
        output.classList.add("is-error");
        output.textContent = error instanceof Error ? error.message : "延时脚本运行失败";
      });
    }, Math.max(0, ms));
    timers.add(timer);
    return timer;
  },
  net: {
    async fetch(url: string): Promise<HttpTextResult> {
      return httpGetText(url);
    },
  },
});

const httpGetText = async (url: string): Promise<HttpTextResult> => {
  try {
    return await invoke<HttpTextResult>("http_get_text", { url });
  } catch {
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
  }
};

const renderValue = (output: HTMLElement, value: unknown) => {
  output.classList.remove("is-loading");
  output.replaceChildren();
  const pre = document.createElement("pre");
  pre.textContent = stringifyValue(value);
  output.append(pre);
};

const stringifyValue = (value: unknown) => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};
