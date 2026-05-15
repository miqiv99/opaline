import { Brain, Key, Loader2, PlugZap, RefreshCw, Sparkles, Tag, TextSearch } from "lucide-react";
import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import type { AiSettings } from "./adapter";
import { SUMMARY_PROMPT, TAG_PROMPT, TITLE_PROMPT } from "./adapter";
import { AI_ADAPTERS, getAiAdapter, loadAiSettings, saveAiSettings } from "./settings";

type AiAction = "summarize" | "title" | "tags";

export function AiPanel() {
  const [settings] = useState<AiSettings>(() => loadAiSettings());

  const [result, setResult] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");

  const activeAdapter = getAiAdapter(settings.provider);

  const runAction = useCallback(
    async (action: AiAction) => {
      setStatus("loading");
      setResult("");
      setError("");

      try {
        const articleElement = document.querySelector("[data-opaline-note]");
        if (!articleElement) {
          throw new Error("找不到当前笔记内容");
        }

        const content = (articleElement.textContent ?? "").trim();
        if (!content) {
          throw new Error("笔记内容为空");
        }

        const promptMap: Record<AiAction, string> = {
          summarize: SUMMARY_PROMPT,
          title: TITLE_PROMPT,
          tags: TAG_PROMPT,
        };

        const messages = [
          {
            role: "system" as const,
            content: "你是一个知识管理助手，帮助用户整理和总结 Opaline 笔记。用中文回复。",
          },
          {
            role: "user" as const,
            content: `${promptMap[action]}\n\n---\n笔记内容：\n${content.slice(0, 8000)}`,
          },
        ];

        const text = await activeAdapter.chat(messages, {
          model: settings.model,
          apiKey: settings.apiKey,
          baseUrl: settings.baseUrl || undefined,
        });

        setResult(text);
        setStatus("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : "AI 请求失败");
        setStatus("error");
      }
    },
    [activeAdapter, settings],
  );

  return (
    <aside className="ai-panel">
      <div className="ai-panel-header">
        <Brain size={18} />
        <strong>AI 助手</strong>
      </div>

      <div className="ai-actions">
        <AiButton
          label="生成摘要"
          loadingLabel="生成中..."
          status={status}
          onClick={() => runAction("summarize")}
        >
          <Sparkles size={16} />
        </AiButton>
        <AiButton
          label="建议标题"
          loadingLabel="生成中..."
          status={status}
          onClick={() => runAction("title")}
        >
          <TextSearch size={16} />
        </AiButton>
        <AiButton
          label="提取标签"
          loadingLabel="提取中..."
          status={status}
          onClick={() => runAction("tags")}
        >
          <Tag size={16} />
        </AiButton>
      </div>

      {status === "loading" ? (
        <div className="ai-result ai-loading">
          <Loader2 size={18} className="spinner" />
          <span>正在请求 AI...</span>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="ai-result ai-error">
          <p>{error}</p>
        </div>
      ) : null}

      {status === "done" ? (
        <div className="ai-result ai-done">
          <p>{result}</p>
          <button
            className="ai-apply-button"
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(result).catch(() => {});
            }}
          >
            复制结果
          </button>
        </div>
      ) : null}
    </aside>
  );
}

export function AiSettingsPanel() {
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
    setSavedMessage("已保存");
    window.setTimeout(() => setSavedMessage(""), 1800);
  }, [settings]);

  const aiOptions = {
    model: settings.model || activeAdapter.defaultModel,
    apiKey: settings.apiKey,
    baseUrl: settings.baseUrl || activeAdapter.defaultBaseUrl,
  };

  const testModel = useCallback(async () => {
    setToolStatus("loading");
    setToolMessage("正在测试模型连通性...");
    try {
      if (!settings.apiKey.trim()) {
        throw new Error("请先填写 API Key");
      }
      if (!aiOptions.model.trim()) {
        throw new Error("请先填写模型名称");
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
      setToolMessage(`模型可用：${aiOptions.model}`);
    } catch (err) {
      setToolStatus("error");
      setToolMessage(err instanceof Error ? err.message : "模型测试失败");
    }
  }, [activeAdapter, aiOptions, settings.apiKey]);

  const fetchModels = useCallback(async () => {
    setToolStatus("loading");
    setToolMessage("正在抓取模型列表...");
    try {
      if (!settings.apiKey.trim()) {
        throw new Error("请先填写 API Key");
      }
      if (!activeAdapter.listModels) {
        throw new Error("当前提供商不支持抓取模型列表");
      }
      const models = await activeAdapter.listModels({
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl || activeAdapter.defaultBaseUrl,
      });
      if (models.length === 0) {
        throw new Error("接口返回了空模型列表");
      }
      setFetchedModels(models);
      saveSettings({ ...settings, model: settings.model || models[0] });
      setToolStatus("done");
      setToolMessage(`已抓取 ${models.length} 个模型`);
    } catch (err) {
      setToolStatus("error");
      setToolMessage(err instanceof Error ? err.message : "抓取模型失败");
    }
  }, [activeAdapter, saveSettings, settings]);

  return (
    <section className="settings-card">
      <div className="settings-card-header">
        <Brain size={18} />
        <div>
          <h2>AI 设置</h2>
          <p>聊天、整理和模型测试会使用这里的配置。</p>
        </div>
      </div>

      <div className="ai-settings">
        <label>
          <span>提供商</span>
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
          <span>API 地址</span>
          <input
            type="text"
            value={settings.baseUrl ?? activeAdapter.defaultBaseUrl ?? ""}
            placeholder={activeAdapter.defaultBaseUrl}
            onChange={(e) => saveSettings({ ...settings, baseUrl: e.target.value })}
          />
        </label>

        <label>
          <span>模型</span>
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
        <div className="ai-model-chips" aria-label="已抓取模型">
          {fetchedModels.slice(0, 8).map((model) => (
            <button key={model} type="button" onClick={() => saveSettings({ ...settings, model })}>
              {model}
            </button>
          ))}
        </div>
      ) : null}

      <div className="ai-tool-actions">
        <button type="button" onClick={persistSettings}>
          <span>保存</span>
        </button>
        <button type="button" onClick={testModel} disabled={toolStatus === "loading"}>
          <PlugZap size={15} />
          <span>测试模型</span>
        </button>
        <button type="button" onClick={fetchModels} disabled={toolStatus === "loading"}>
          <RefreshCw size={15} />
          <span>抓取模型</span>
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

function AiButton({
  label,
  loadingLabel,
  status,
  children,
  onClick,
}: {
  label: string;
  loadingLabel: string;
  status: string;
  children: ReactNode;
  onClick: () => void;
}) {
  const isLoading = status === "loading";
  return (
    <button
      className="ai-action-button"
      type="button"
      disabled={isLoading}
      onClick={onClick}
    >
      {children}
      <span>{isLoading ? loadingLabel : label}</span>
    </button>
  );
}
