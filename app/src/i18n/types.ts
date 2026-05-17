export type LocaleCode = string;

export type TranslationParams = Record<string, string | number>;

export type LanguagePackManifest = {
  schemaVersion: number;
  id: string;
  locale: LocaleCode;
  name: string;
  nativeName: string;
  version: string;
  author?: string;
  fallback?: LocaleCode;
};

export type LoadedLanguagePack = {
  manifest: LanguagePackManifest;
  messages: Record<string, string>;
};

export type LanguageOption = {
  locale: LocaleCode;
  name: string;
  nativeName: string;
  source: "builtin" | "community";
  version?: string;
  author?: string;
};
