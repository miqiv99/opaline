import { Node, mergeAttributes } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { invoke } from "@tauri-apps/api/core";
import { isBuiltInWidgetType, loadLiveComponentSettings } from "../liveComponentSettings";
import { findPluginWidgetScript, type PluginWidgetScript } from "../pluginRegistry";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    opalineWidget: {
      insertOpalineWidget: (options: {
        type: string;
        title?: string;
        query?: string;
        target?: string;
        endpoint?: string;
        profile?: string;
        refresh?: string;
        plugin?: string;
      }) => ReturnType;
    };
  }
}

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
      target: { default: "" },
      endpoint: { default: "" },
      profile: { default: "" },
      refresh: { default: "" },
      plugin: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "opaline-widget",
        getAttrs: (element) => {
          const type = element.getAttribute("type") || "local-graph";
          return {
            type,
            title: element.getAttribute("title") || element.textContent?.trim() || "",
            query: element.getAttribute("data-query") || "",
            target: element.getAttribute("target") || "",
            endpoint: element.getAttribute("endpoint") || "",
            profile: element.getAttribute("profile") || "",
            refresh: element.getAttribute("refresh") || "",
            plugin: element.getAttribute("plugin") || "",
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const type = node.attrs.type as string;
    const title = (node.attrs.title as string) || widgetLabel(type);
    const query = node.attrs.query as string;
    const target = node.attrs.target as string;
    const endpoint = node.attrs.endpoint as string;
    const profile = node.attrs.profile as string;
    const refresh = node.attrs.refresh as string;
    const plugin = node.attrs.plugin as string;
    const attrs = {
      type,
      title,
      ...(query ? { "data-query": query } : {}),
      ...(target ? { target } : {}),
      ...(endpoint ? { endpoint } : {}),
      ...(profile ? { profile } : {}),
      ...(refresh ? { refresh } : {}),
      ...(plugin ? { plugin } : {}),
    };
    return [
      "opaline-widget",
      mergeAttributes(HTMLAttributes, attrs),
      `Opaline widget: ${title}`,
    ];
  },

  addNodeView() {
    return ({ node, view, getPos }) => createWidgetNodeView(node, view, getPos);
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
              target: options.target || "",
              endpoint: options.endpoint || "",
              profile: options.profile || "",
              refresh: options.refresh || "",
              plugin: options.plugin || "",
            },
          }),
    };
  },
});

type WidgetAttrs = {
  type: string;
  title: string;
  query: string;
  target: string;
  endpoint: string;
  profile: string;
  refresh: string;
  plugin: string;
};

type HttpTextResult = {
  url: string;
  status: number;
  ok: boolean;
  contentType?: string | null;
  body: string;
  elapsedMs: number;
};

const WORKSPACE_PATH_STORAGE_KEY = "opaline-workspace-path";
const ACTIVE_NOTE_STORAGE_KEY = "opaline-active-note";

const createWidgetNodeView = (
  initialNode: ProseMirrorNode,
  view: EditorView,
  getPos: (() => number | undefined) | boolean,
) => {
  let node = initialNode;
  let refreshTimer: number | null = null;
  let requestToken = 0;
  let expandedEditor = false;
  const timers = new Set<number>();

  const dom = document.createElement("div");
  dom.contentEditable = "false";

  const clearRuntime = () => {
    if (refreshTimer !== null) {
      window.clearInterval(refreshTimer);
      refreshTimer = null;
    }
    for (const timer of timers) {
      window.clearInterval(timer);
      window.clearTimeout(timer);
    }
    timers.clear();
    requestToken += 1;
  };

  const attrs = (): WidgetAttrs => ({
    type: String(node.attrs.type || "local-graph"),
    title: String(node.attrs.title || ""),
    query: String(node.attrs.query || ""),
    target: String(node.attrs.target || ""),
    endpoint: String(node.attrs.endpoint || ""),
    profile: String(node.attrs.profile || ""),
    refresh: String(node.attrs.refresh || ""),
    plugin: String(node.attrs.plugin || ""),
  });

  const updateAttrs = (patch: Partial<WidgetAttrs>) => {
    if (typeof getPos !== "function") return;
    const pos = getPos();
    if (typeof pos !== "number") return;
    view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...patch }));
  };

  const render = () => {
    const current = attrs();
    const settings = loadLiveComponentSettings();
    const builtIn = isBuiltInWidgetType(current.type);
    const enabled = builtIn ? settings.controlledWidgetsEnabled : settings.trustedPluginWidgetsEnabled;
    const pluginScript = builtIn ? undefined : findPluginWidgetScript(current.type);
    dom.className = enabled ? "opaline-widget-card is-live" : "opaline-widget-card is-disabled";
    dom.replaceChildren();

    const toolbar = document.createElement("div");
    toolbar.className = "opaline-live-toolbar";
    const label = document.createElement("span");
    label.textContent = widgetStatus(current.type, enabled, builtIn, pluginScript?.pluginName);
    const actions = document.createElement("div");
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = expandedEditor ? "收起" : "编辑";
    editButton.addEventListener("click", () => {
      expandedEditor = !expandedEditor;
      render();
    });
    actions.append(editButton);
    toolbar.append(label, actions);

    const title = document.createElement("strong");
    title.textContent = current.title || widgetLabel(current.type);
    const description = document.createElement("p");
    description.textContent = widgetDescription(current.type, current.query, current.target, enabled, builtIn);

    dom.append(toolbar, title, description);

    if (expandedEditor) {
      dom.append(createWidgetEditor(current, updateAttrs));
    }

    if (enabled && !builtIn) {
      const output = document.createElement("div");
      output.className = "opaline-live-output";
      output.textContent = pluginScript ? "正在运行扩展组件..." : "没有安装提供这个组件的扩展。请在设置里打开扩展文件夹并导入扩展。";
      dom.append(output);
      if (pluginScript) {
        startPluginWidget(current, pluginScript, output);
      } else {
        clearRuntime();
      }
    } else {
      clearRuntime();
    }
  };

  const startPluginWidget = (current: WidgetAttrs, script: PluginWidgetScript, output: HTMLElement) => {
    clearRuntime();
    const runToken = requestToken;
    output.classList.add("is-loading");
    output.textContent = "运行中...";
    const api = createPluginWidgetApi(output, timers, script, current);
    Promise.resolve()
      .then(async () => {
        const fn = new Function("widget", "opaline", `"use strict"; return (async () => {\n${script.code}\n})();`);
        return await fn(current, api);
      })
      .then((result) => {
        if (runToken !== requestToken) return;
        output.classList.remove("is-loading");
        if (typeof result !== "undefined") {
          renderValue(output, result);
        } else if (output.textContent === "运行中...") {
          output.textContent = "扩展组件已运行，没有返回内容。";
        }
      })
      .catch((error) => {
        if (runToken !== requestToken) return;
        output.classList.add("is-error");
        output.classList.remove("is-loading");
        output.textContent = error instanceof Error ? error.message : "扩展组件运行失败";
      });
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

const createWidgetEditor = (attrs: WidgetAttrs, onSave: (patch: Partial<WidgetAttrs>) => void) => {
  const form = document.createElement("div");
  form.className = "opaline-live-editor";

  const titleInput = field("标题", attrs.title || widgetLabel(attrs.type));
  const typeInput = field("类型", attrs.type);
  const queryInput = field("查询 / 数据源", attrs.query);
  const targetInput = field("目标", attrs.target || "192.168.1.1");
  const endpointInput = field("接口路径", attrs.endpoint || "/status");
  const refreshInput = field("刷新间隔", attrs.refresh || "5s");
  const profileInput = field("Profile", attrs.profile || "onu-readonly");
  const pluginInput = field("扩展", attrs.plugin || "network-tools");

  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "保存组件";
  save.addEventListener("click", () => {
    onSave({
      title: titleInput.input.value.trim(),
      type: typeInput.input.value.trim() || "local-graph",
      query: queryInput.input.value.trim(),
      target: targetInput.input.value.trim(),
      endpoint: endpointInput.input.value.trim(),
      refresh: refreshInput.input.value.trim(),
      profile: profileInput.input.value.trim(),
      plugin: pluginInput.input.value.trim(),
    });
  });

  form.append(titleInput.label, typeInput.label, queryInput.label, targetInput.label, endpointInput.label, refreshInput.label, profileInput.label, pluginInput.label, save);
  return form;
};

const field = (labelText: string, value: string) => {
  const label = document.createElement("label");
  const span = document.createElement("span");
  span.textContent = labelText;
  const input = document.createElement("input");
  input.value = value;
  label.append(span, input);
  return { label, input };
};

const createPluginWidgetApi = (
  output: HTMLElement,
  timers: Set<number>,
  script: PluginWidgetScript,
  currentWidget: WidgetAttrs,
) => {
  const workspacePath = () => {
    const path = localStorage.getItem(WORKSPACE_PATH_STORAGE_KEY);
    if (!path) throw new Error("Opaline workspace is not ready.");
    return path;
  };
  const activeNote = () => {
    const raw = localStorage.getItem(ACTIVE_NOTE_STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as { id: string; path: string; title: string };
    } catch {
      return null;
    }
  };
  const withWorkspace = <T,>(command: string, args: Record<string, unknown> = {}) =>
    invoke<T>(command, { path: workspacePath(), ...args });
  const storageInput = (key: string, value?: unknown) => ({
    pluginId: script.pluginId,
    key,
    value,
  });

  return {
    plugin: {
      id: script.pluginId,
      name: script.pluginName,
      widgetType: script.type,
    },
    widget: currentWidget,
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
          output.textContent = error instanceof Error ? error.message : "定时扩展组件运行失败";
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
          output.textContent = error instanceof Error ? error.message : "延时扩展组件运行失败";
        });
      }, Math.max(0, ms));
      timers.add(timer);
      return timer;
    },
    url: networkStatusUrl,
    refreshMs: parseRefreshMs,
    parseBody(result: HttpTextResult) {
      const body = result.body;
      if ((result.contentType || "").includes("json")) {
        try {
          return JSON.parse(body);
        } catch {
          return body;
        }
      }
      try {
        return JSON.parse(body);
      } catch {
        return body;
      }
    },
    net: {
      fetch: httpGetText,
      ping(host: string, options: { timeoutMs?: number } = {}) {
        return invoke("plugin_ping", { host, timeoutMs: options.timeoutMs });
      },
      tcp(host: string, port: number, options: { timeoutMs?: number } = {}) {
        return invoke("plugin_tcp_connect", { host, port, timeoutMs: options.timeoutMs });
      },
    },
    notes: {
      current: activeNote,
      list() {
        return withWorkspace("list_notes");
      },
      read(notePath: string) {
        return withWorkspace("read_note", { notePath });
      },
      create(input: { title: string; body?: string; lang?: string; directory?: string }) {
        return withWorkspace("create_note", { input });
      },
      save(note: unknown) {
        return withWorkspace("save_note", { note });
      },
      async update(notePath: string, html: string) {
        const note = await withWorkspace<Record<string, unknown>>("read_note", { notePath });
        return withWorkspace("save_note", { note: { ...note, html } });
      },
      search(query: string) {
        return withWorkspace("search_notes", { query });
      },
    },
    links: {
      backlinks(noteId: string) {
        return withWorkspace("list_backlinks", { noteId });
      },
      async outgoing(notePath?: string) {
        const targetPath = notePath || activeNote()?.path;
        if (!targetPath) return [];
        const note = await withWorkspace<{ outgoingLinks?: unknown[] }>("read_note", { notePath: targetPath });
        return note.outgoingLinks || [];
      },
    },
    graph: {
      current() {
        return withWorkspace("graph_data");
      },
      async neighborhood(noteId?: string) {
        const graph = await withWorkspace<{ nodes: Array<{ id: string }>; edges: Array<{ source: string; target: string }> }>("graph_data");
        const center = noteId || activeNote()?.id;
        if (!center) return graph;
        const ids = new Set([center]);
        const edges = graph.edges.filter((edge) => edge.source === center || edge.target === center);
        edges.forEach((edge) => {
          ids.add(edge.source);
          ids.add(edge.target);
        });
        return {
          ...graph,
          nodes: graph.nodes.filter((node) => ids.has(node.id)),
          edges,
        };
      },
    },
    fs: {
      readText(filePath: string) {
        return withWorkspace("plugin_fs_read_text", { filePath });
      },
      writeText(filePath: string, content: string) {
        return withWorkspace("plugin_fs_write_text", { filePath, content });
      },
      listDir(directory = ".") {
        return withWorkspace("plugin_fs_list_dir", { directory });
      },
    },
    storage: {
      get(key: string) {
        return withWorkspace("plugin_storage_get", { input: storageInput(key) });
      },
      set(key: string, value: unknown) {
        return withWorkspace("plugin_storage_set", { input: storageInput(key, value) });
      },
      remove(key: string) {
        return withWorkspace("plugin_storage_remove", { input: storageInput(key) });
      },
    },
    system: {
      openExternal(target: string) {
        return invoke("plugin_system_open_external", { target });
      },
      openPath(target: string) {
        return withWorkspace("plugin_system_open_path", { target });
      },
      async notify(title: string, body = "") {
        if (!("Notification" in window)) {
          globalThis.alert(`${title}${body ? `\n${body}` : ""}`);
          return;
        }
        if (Notification.permission === "default") {
          await Notification.requestPermission();
        }
        if (Notification.permission === "granted") {
          new Notification(title, { body });
        }
      },
    },
    shell: {
      exec(command: string, args: string[] = [], options: { cwd?: string; timeoutMs?: number } = {}) {
        return invoke("plugin_shell_exec", {
          input: {
            command,
            args,
            cwd: options.cwd,
            timeoutMs: options.timeoutMs,
          },
        });
      },
    },
  };
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

const httpGetText = async (url: string): Promise<HttpTextResult> => {
  try {
    return await invoke<HttpTextResult>("http_get_text", { url });
  } catch (tauriError) {
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

const networkStatusUrl = (target: string, endpoint: string) => {
  const cleanTarget = target.trim();
  const cleanEndpoint = endpoint.trim() || "/status";
  if (!cleanTarget) return "";
  try {
    const url = cleanTarget.startsWith("http://") || cleanTarget.startsWith("https://")
      ? new URL(cleanTarget)
      : new URL(`http://${cleanTarget}`);
    if ((url.pathname === "/" || !url.pathname) && cleanEndpoint) {
      url.pathname = cleanEndpoint.startsWith("/") ? cleanEndpoint : `/${cleanEndpoint}`;
    }
    return url.toString();
  } catch {
    return "";
  }
};

const parseRefreshMs = (refresh: string) => {
  const value = refresh.trim().toLowerCase();
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number) || number <= 0) return 5000;
  if (value.endsWith("ms")) return Math.max(500, number);
  if (value.endsWith("m")) return Math.max(1000, number * 60_000);
  return Math.max(1000, number * 1000);
};

const networkStatusResultElement = (result: HttpTextResult) => {
  const wrapper = document.createElement("div");
  const meta = document.createElement("div");
  meta.className = "opaline-live-meta";
  meta.textContent = `${result.ok ? "在线" : "响应异常"} · HTTP ${result.status} · ${result.elapsedMs}ms · ${new Date().toLocaleTimeString()}`;
  const url = document.createElement("small");
  url.textContent = result.url;
  const pre = document.createElement("pre");
  pre.textContent = formatBody(result.body, result.contentType || "");
  wrapper.append(meta, url, pre);
  return wrapper;
};

const formatBody = (body: string, contentType: string) => {
  if (contentType.includes("json")) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }
  return body;
};

const widgetLabel = (type: string) => {
  if (type === "query") return "Query";
  if (type === "chart") return "Chart";
  if (type === "local-graph") return "Note map";
  if (type === "network-status") return "Network status";
  return type || "Extension widget";
};

const widgetStatus = (type: string, enabled: boolean, builtIn: boolean, pluginName?: string) => {
  if (!enabled && builtIn) return "Built-in widget disabled";
  if (!enabled) return "Extension widget not enabled";
  if (!builtIn && pluginName) return `Extension widget · ${pluginName}`;
  return builtIn ? "Controlled widget" : "Trusted extension widget";
};

const widgetDescription = (type: string, query: string, target: string, enabled: boolean, builtIn: boolean) => {
  if (!enabled && !builtIn) return "This note declares an extension widget, but trusted extension widgets are disabled in Settings.";
  if (!enabled) return "This built-in widget is stored as readable HTML, but controlled widgets are disabled in Settings.";
  if (type === "local-graph") return "Shows the current note's local relationship neighborhood when opened in Opaline.";
  if (type === "query") return query ? `Saved query: ${query}` : "Saved query placeholder.";
  if (type === "chart") return query ? `Chart source: ${query}` : "Chart placeholder.";
  if (type === "network-status") return target ? `Live LAN request target: ${target}.` : "Edit this widget and fill a LAN device target.";
  return "This widget is stored as readable HTML and requires a trusted extension to render.";
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
