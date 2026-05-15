import type { AiAdapter, AiSettings } from "./adapter";
import { anthropicAdapter } from "./anthropicAdapter";
import { openaiAdapter } from "./openaiAdapter";

export const AI_SETTINGS_STORAGE_KEY = "opaline-ai-settings";

export const AI_ADAPTERS: AiAdapter[] = [openaiAdapter, anthropicAdapter];

export const defaultAiSettings = (): AiSettings => ({
  provider: "openai",
  model: "gpt-4o-mini",
  apiKey: "",
  baseUrl: "",
});

export const loadAiSettings = (): AiSettings => {
  try {
    const raw = localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AiSettings;
  } catch {
    /* ignore invalid local settings */
  }
  return defaultAiSettings();
};

export const saveAiSettings = (settings: AiSettings) => {
  localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
};

export const getAiAdapter = (provider: string): AiAdapter =>
  AI_ADAPTERS.find((adapter) => adapter.id === provider) ?? AI_ADAPTERS[0];
