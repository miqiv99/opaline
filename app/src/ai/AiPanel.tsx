import { Brain, Key, Loader2, PlugZap, RefreshCw } from "lucide-react";
import { useCallback, useState } from "react";
import type { AiSettings } from "./adapter";
import { AI_ADAPTERS, getAiAdapter, loadAiSettings, saveAiSettings } from "./settings";
import { useI18n } from "../i18n";

export function AiSettingsPanel() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<AiSettings>(() => loadAiSettings());
  const [savedMessage, setSavedMessage] = useState("");
  const [toolStatus, setToolStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [toolMessage, setToolMessage] = useState("");
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const activeAdapter = getAiAdapter(settings.provider);

  const saveSettings = useCallback((next: AiSettings) => {
    setSettings(next);
  }, []);

  const persistSettings = useCallback(() => {
    saveAiSettings(settings);
    setSavedMessage(t("ai.saved"));
    window.setTimeout(() => setSavedMessage(""), 1800);
  }, [settings, t]);

  const aiOptions = {
    model: settings.model || activeAdapter.defaultModel,
    apiKey: settings.apiKey,
    baseUrl: settings.baseUrl || activeAdapter.defaultBaseUrl,
  };

  const testModel = useCallback(async () => {
    setToolStatus("loading");
    setToolMessage(t("ai.testing"));
    try {
      if (!settings.apiKey.trim()) {
        throw new Error(t("ai.missingKey"));
      }
      if (!aiOptions.model.trim()) {
        throw new Error(t("ai.missingModel"));
      }
      if (activeAdapter.testModel) {
        await activeAdapter.testModel(aiOptions);
      } else {
        await activeAdapter.chat(
          [
            { role: "system", content: "You are a connection test. Reply with OK only." },
            { role: "user", content: "ping" },
          ],
          aiOptions,
        );
      }
      setToolStatus("done");
      setToolMessage(t("ai.modelAvailable", { model: aiOptions.model }));
    } catch (err) {
      setToolStatus("error");
      setToolMessage(err instanceof Error ? err.message : t("ai.testFailed"));
    }
  }, [activeAdapter, aiOptions, settings.apiKey, t]);

  const fetchModels = useCallback(async () => {
    setToolStatus("loading");
    setToolMessage(t("ai.fetchingModels"));
    try {
      if (!settings.apiKey.trim()) {
        throw new Error(t("ai.missingKey"));
      }
      if (!activeAdapter.listModels) {
        throw new Error(t("ai.noListModels"));
      }
      const models = await activeAdapter.listModels({
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl || activeAdapter.defaultBaseUrl,
      });
      if (models.length === 0) {
        throw new Error(t("ai.emptyModels"));
      }
      setFetchedModels(models);
      saveSettings({ ...settings, model: settings.model || models[0] });
      setToolStatus("done");
      setToolMessage(t("ai.fetchedModels", { count: models.length }));
    } catch (err) {
      setToolStatus("error");
      setToolMessage(err instanceof Error ? err.message : t("ai.fetchFailed"));
    }
  }, [activeAdapter, saveSettings, settings, t]);

  return (
    <section className="settings-card">
      <div className="settings-card-header">
        <Brain size={18} />
        <div>
          <h2>{t("ai.settingsTitle")}</h2>
          <p>{t("ai.settingsDesc")}</p>
        </div>
      </div>

      <div className="ai-settings">
        <label>
          <span>{t("ai.provider")}</span>
          <select
            value={settings.provider}
            onChange={(e) => {
              const adapter = AI_ADAPTERS.find((a) => a.id === e.target.value);
              saveSettings({
                ...settings,
                provider: e.target.value,
                model: adapter?.defaultModel ?? "",
                baseUrl: adapter?.defaultBaseUrl ?? "",
              });
            }}
          >
            {AI_ADAPTERS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>{t("ai.apiBase")}</span>
          <input
            type="text"
            value={settings.baseUrl ?? activeAdapter.defaultBaseUrl ?? ""}
            placeholder={activeAdapter.defaultBaseUrl}
            onChange={(e) => saveSettings({ ...settings, baseUrl: e.target.value })}
          />
        </label>

        <label>
          <span>{t("ai.model")}</span>
          <input
            type="text"
            value={settings.model}
            placeholder={activeAdapter.defaultModel}
            list="ai-models"
            onChange={(e) => saveSettings({ ...settings, model: e.target.value })}
          />
          <datalist id="ai-models">
            {[...new Set([...activeAdapter.models, ...fetchedModels])].map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>

        <label>
          <span><Key size={14} /> API Key</span>
          <input
            type="password"
            value={settings.apiKey}
            placeholder="sk-..."
            onChange={(e) => saveSettings({ ...settings, apiKey: e.target.value })}
          />
        </label>
      </div>

      {fetchedModels.length > 0 ? (
        <div className="ai-model-chips" aria-label={t("ai.fetchedModelsAria")}>
          {fetchedModels.slice(0, 8).map((model) => (
            <button key={model} type="button" onClick={() => saveSettings({ ...settings, model })}>
              {model}
            </button>
          ))}
        </div>
      ) : null}

      <div className="ai-tool-actions">
        <button type="button" onClick={persistSettings}>
          <span>{t("ai.save")}</span>
        </button>
        <button type="button" onClick={testModel} disabled={toolStatus === "loading"}>
          <PlugZap size={15} />
          <span>{t("ai.testModel")}</span>
        </button>
        <button type="button" onClick={fetchModels} disabled={toolStatus === "loading"}>
          <RefreshCw size={15} />
          <span>{t("ai.fetchModels")}</span>
        </button>
      </div>

      {savedMessage ? (
        <div className="ai-tool-status">
          <span>{savedMessage}</span>
        </div>
      ) : null}

      {toolMessage ? (
        <div className={toolStatus === "error" ? "ai-tool-status is-error" : "ai-tool-status"}>
          {toolStatus === "loading" ? <Loader2 size={15} className="spinner" /> : null}
          <span>{toolMessage}</span>
        </div>
      ) : null}
    </section>
  );
}
