import type { AiAdapter, AiMessage, AiOptions } from "./adapter";

const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";

const OPENAI_MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "gpt-4-turbo",
  "gpt-3.5-turbo",
  "deepseek-chat",
  "deepseek-reasoner",
];

export const openaiAdapter: AiAdapter = {
  id: "openai",
  label: "OpenAI 兼容",
  defaultModel: OPENAI_DEFAULT_MODEL,
  defaultBaseUrl: "https://api.openai.com/v1",
  models: OPENAI_MODELS,

  async listModels(options: Omit<AiOptions, "model">) {
    const baseUrl = apiBaseUrl(options.baseUrl);
    const response = await fetch(`${baseUrl}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`模型列表请求失败 (${response.status}): ${body}`);
    }

    const data = (await response.json()) as { data?: { id?: string }[] };
    const models = data.data?.map((model) => model.id).filter((id): id is string => Boolean(id)) ?? [];
    return models.sort();
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
    const url = `${baseUrl}/chat/completions`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages,
        temperature: 0.3,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`API 请求失败 (${response.status}): ${body}`);
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("API 返回了空响应");
    }

    return content.trim();
  },
};

const apiBaseUrl = (baseUrl?: string) => (baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
