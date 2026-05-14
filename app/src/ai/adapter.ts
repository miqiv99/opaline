export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiOptions {
  model: string;
  apiKey: string;
  baseUrl?: string;
}

export interface AiSettings {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
}

export interface AiAdapter {
  id: string;
  label: string;
  defaultModel: string;
  defaultBaseUrl?: string;
  models: string[];
  chat(messages: AiMessage[], options: AiOptions): Promise<string>;
  listModels?(options: Omit<AiOptions, "model">): Promise<string[]>;
  testModel?(options: AiOptions): Promise<void>;
}

// ---- prompts ----

export const SUMMARY_PROMPT = "请用 2-3 句话总结以下 HTML 笔记的内容，用中文回答。只返回总结文字。";

export const TITLE_PROMPT = "请根据以下 HTML 笔记内容，生成一个简洁的中文标题（不超过 20 个字）。只返回标题，不要加引号。";

export const TAG_PROMPT = "请从以下 HTML 笔记中提取 3-5 个关键词作为标签，每个标签 2-5 个字。用逗号分隔，只返回标签列表。";
