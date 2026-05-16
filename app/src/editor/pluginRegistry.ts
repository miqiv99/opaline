export type InstalledPluginWidget = {
  type: string;
  label: string;
  script: string;
  code: string;
};

export type InstalledPlugin = {
  id: string;
  name: string;
  version: string;
  description: string;
  permissions: string[];
  enabled: boolean;
  widgets: InstalledPluginWidget[];
};

export type PluginWidgetScript = InstalledPluginWidget & {
  pluginId: string;
  pluginName: string;
};

export const INSTALLED_PLUGINS_STORAGE_KEY = "opaline-installed-plugins";

export const loadInstalledPluginsFromCache = (): InstalledPlugin[] => {
  if (typeof localStorage === "undefined") return [];

  try {
    const raw = localStorage.getItem(INSTALLED_PLUGINS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? sanitizeInstalledPlugins(parsed) : [];
  } catch {
    return [];
  }
};

export const saveInstalledPluginsToCache = (plugins: InstalledPlugin[]) => {
  localStorage.setItem(INSTALLED_PLUGINS_STORAGE_KEY, JSON.stringify(sanitizeInstalledPlugins(plugins)));
};

export const findPluginWidgetScript = (
  type: string,
  plugins = loadInstalledPluginsFromCache(),
): PluginWidgetScript | null => {
  const cleanType = type.trim();
  if (!cleanType) return null;

  for (const plugin of plugins) {
    if (!plugin.enabled) continue;
    const widget = plugin.widgets.find((item) => item.type === cleanType && item.code.trim());
    if (widget) {
      return {
        ...widget,
        pluginId: plugin.id,
        pluginName: plugin.name,
      };
    }
  }

  return null;
};

const sanitizeInstalledPlugins = (value: unknown[]): InstalledPlugin[] =>
  value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const plugin = item as Partial<InstalledPlugin>;
    const id = stringValue(plugin.id);
    if (!id) return [];
    return [{
      id,
      name: stringValue(plugin.name) || id,
      version: stringValue(plugin.version),
      description: stringValue(plugin.description),
      permissions: Array.isArray(plugin.permissions) ? plugin.permissions.map(stringValue).filter(Boolean) : [],
      enabled: plugin.enabled !== false,
      widgets: Array.isArray(plugin.widgets) ? sanitizePluginWidgets(plugin.widgets) : [],
    }];
  });

const sanitizePluginWidgets = (value: unknown[]): InstalledPluginWidget[] =>
  value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const widget = item as Partial<InstalledPluginWidget>;
    const type = stringValue(widget.type);
    if (!type) return [];
    return [{
      type,
      label: stringValue(widget.label) || type,
      script: stringValue(widget.script),
      code: stringValue(widget.code),
    }];
  });

const stringValue = (value: unknown) => (typeof value === "string" ? value.trim() : "");
