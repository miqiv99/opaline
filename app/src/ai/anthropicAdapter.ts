import type { AiAdapter, AiMessage, AiOptions } from "./adapter";

const ANTHROPIC_DEFAULT_MODEL = "claude-haiku-4-5-20251001";

const ANTHROPIC_MODELS = [
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6",
  "claude-opus-4-7",
];

export const anthropicAdapter: AiAdapter = {
  id: "anthropic",
  label: "Anthropic",
  defaultModel: ANTHROPIC_DEFAULT_MODEL,
  models: ANTHROPIC_MODELS,

  async chat(messages: AiMessage[], options: AiOptions) {
    const url = "https://api.anthropic.com/v1/messages";

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
      headers: {
        "Content-Type": "application/json",
        "x-api-key": options.apiKey,
        "anthropic-version": "2023-06-01",
      },
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
