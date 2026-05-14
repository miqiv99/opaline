import type { AiAdapter, AiMessage, AiOptions } from "./adapter";

const ANTHROPIC_DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_DEFAULT_BASE_URL = "https://api.anthropic.com/v1";

const ANTHROPIC_MODELS = [
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6",
  "claude-opus-4-7",
];

export const anthropicAdapter: AiAdapter = {
  id: "anthropic",
  label: "Anthropic 兼容",
  defaultModel: ANTHROPIC_DEFAULT_MODEL,
  defaultBaseUrl: ANTHROPIC_DEFAULT_BASE_URL,
  models: ANTHROPIC_MODELS,

  async listModels(options: Omit<AiOptions, "model">) {
    const baseUrl = apiBaseUrl(options.baseUrl);
    const response = await fetch(`${baseUrl}/models`, {
      method: "GET",
      headers: anthropicHeaders(options.apiKey),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`模型列表请求失败 (${response.status}): ${body}`);
    }

    const data = (await response.json()) as {
      data?: { id?: string }[];
      models?: { id?: string }[];
    };
    const rows = data.data ?? data.models ?? [];
    return rows.map((model) => model.id).filter((id): id is string => Boolean(id)).sort();
  },

  async testModel(options: AiOptions) {
    await this.chat(
      [
        { role: "system", content: "You are a connection test. Reply with OK only." },
        { role: "user", content: "ping" },
      ],
      options,
    );
  },

  async chat(messages: AiMessage[], options: AiOptions) {
    const baseUrl = apiBaseUrl(options.baseUrl);
    const url = `${baseUrl}/messages`;

    const systemMessages = messages.filter((m) => m.role === "system");
    const conversationMessages = messages.filter((m) => m.role !== "system");

    const body: Record<string, unknown> = {
      model: options.model,
      max_tokens: 1024,
      messages: conversationMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };

    if (systemMessages.length > 0) {
      body.system = systemMessages.map((m) => m.content).join("\n\n");
    }

    const response = await fetch(url, {
      method: "POST",
      headers: anthropicHeaders(options.apiKey),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Anthropic API 请求失败 (${response.status}): ${body}`);
    }

    const data = (await response.json()) as {
      content: { type: string; text: string }[];
    };

    const text = data.content
      ?.filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    if (!text) {
      throw new Error("Anthropic API 返回了空响应");
    }

    return text.trim();
  },
};

const apiBaseUrl = (baseUrl?: string) => (baseUrl || ANTHROPIC_DEFAULT_BASE_URL).replace(/\/+$/, "");

const anthropicHeaders = (apiKey: string) => ({
  "Content-Type": "application/json",
  "x-api-key": apiKey,
  "anthropic-version": "2023-06-01",
});
