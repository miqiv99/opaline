export type LiveComponentSettings = {
  controlledWidgetsEnabled: boolean;
  trustedPluginWidgetsEnabled: boolean;
  experimentalScriptsEnabled: boolean;
  autoCheckPluginUpdates: boolean;
};

export const LIVE_COMPONENT_SETTINGS_STORAGE_KEY = "opaline-live-component-settings";

export const defaultLiveComponentSettings = (): LiveComponentSettings => ({
  controlledWidgetsEnabled: true,
  trustedPluginWidgetsEnabled: false,
  experimentalScriptsEnabled: false,
  autoCheckPluginUpdates: false,
});

export const loadLiveComponentSettings = (): LiveComponentSettings => {
  if (typeof localStorage === "undefined") {
    return defaultLiveComponentSettings();
  }

  try {
    const raw = localStorage.getItem(LIVE_COMPONENT_SETTINGS_STORAGE_KEY);
    if (!raw) return defaultLiveComponentSettings();
    const parsed = JSON.parse(raw) as Partial<LiveComponentSettings>;
    return {
      ...defaultLiveComponentSettings(),
      ...parsed,
    };
  } catch {
    return defaultLiveComponentSettings();
  }
};

export const saveLiveComponentSettings = (settings: LiveComponentSettings) => {
  localStorage.setItem(LIVE_COMPONENT_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
};

export const BUILT_IN_WIDGETS = [
  {
    type: "local-graph",
    label: "本篇关系图",
    description: "显示当前笔记附近的文件、标题、块和概念关系。",
  },
  {
    type: "query",
    label: "查询结果",
    description: "保存一个可读查询声明，后续渲染成本地结果列表。",
  },
  {
    type: "chart",
    label: "图表",
    description: "保存图表数据来源声明，后续渲染成可视化图表。",
  },
] as const;

export const TRUSTED_PLUGIN_EXAMPLES = [
  {
    type: "network-status",
    label: "网络设备状态",
    permissions: ["network:lan", "widget:render"],
    description: "例如 ONU、路由器或内网设备的只读状态面板，会按 refresh 轮询 target + endpoint。",
  },
] as const;

export const isBuiltInWidgetType = (type: string) =>
  BUILT_IN_WIDGETS.some((widget) => widget.type === type);
