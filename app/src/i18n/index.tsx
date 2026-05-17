import { createContext, useCallback, useContext, useMemo, useState } from "react";
import zhHansMessages from "./builtin/zh-Hans.json";
import enMessages from "./builtin/en.json";
import type { LanguageOption, LoadedLanguagePack, LocaleCode, TranslationParams } from "./types";

export type { LanguageOption, LoadedLanguagePack, LocaleCode, TranslationParams } from "./types";

const UI_LANGUAGE_STORAGE_KEY = "opaline-ui-language";

const builtinLanguagePacks: LoadedLanguagePack[] = [
  {
    manifest: {
      schemaVersion: 1,
      id: "opaline.zh-Hans",
      locale: "zh-Hans",
      name: "Simplified Chinese",
      nativeName: "简体中文",
      version: "1.0.0",
      fallback: "en",
    },
    messages: zhHansMessages,
  },
  {
    manifest: {
      schemaVersion: 1,
      id: "opaline.en",
      locale: "en",
      name: "English",
      nativeName: "English",
      version: "1.0.0",
      fallback: "zh-Hans",
    },
    messages: enMessages,
  },
];

type I18nContextValue = {
  locale: LocaleCode;
  languageOptions: LanguageOption[];
  communityLanguagePacks: LoadedLanguagePack[];
  setLocale: (locale: LocaleCode) => void;
  setCommunityLanguagePacks: (packs: LoadedLanguagePack[]) => void;
  t: (key: string, params?: TranslationParams) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const loadSavedLocale = () => {
  if (typeof localStorage === "undefined") return "zh-Hans";
  return localStorage.getItem(UI_LANGUAGE_STORAGE_KEY) || "zh-Hans";
};

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(() => loadSavedLocale());
  const [communityLanguagePacks, setCommunityLanguagePacks] = useState<LoadedLanguagePack[]>([]);

  const packs = useMemo(
    () => [...communityLanguagePacks, ...builtinLanguagePacks],
    [communityLanguagePacks],
  );

  const packByLocale = useMemo(() => {
    const map = new Map<LocaleCode, LoadedLanguagePack>();
    for (const pack of packs) {
      if (!map.has(pack.manifest.locale)) {
        map.set(pack.manifest.locale, pack);
      }
    }
    return map;
  }, [packs]);

  const languageOptions = useMemo<LanguageOption[]>(() => {
    const options = packs.map((pack) => ({
      locale: pack.manifest.locale,
      name: pack.manifest.name,
      nativeName: pack.manifest.nativeName,
      version: pack.manifest.version,
      author: pack.manifest.author,
      source: builtinLanguagePacks.some((builtin) => builtin.manifest.id === pack.manifest.id)
        ? "builtin"
        : "community",
    }) satisfies LanguageOption);
    const seen = new Set<string>();
    return options.filter((option) => {
      if (seen.has(option.locale)) return false;
      seen.add(option.locale);
      return true;
    });
  }, [packs]);

  const setLocale = useCallback((nextLocale: LocaleCode) => {
    setLocaleState(nextLocale);
    localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, nextLocale);
    document.documentElement.lang = nextLocale;
  }, []);

  const t = useCallback((key: string, params: TranslationParams = {}) => {
    const visited = new Set<LocaleCode>();
    const lookup = (candidate: LocaleCode | undefined): string | undefined => {
      if (!candidate || visited.has(candidate)) return undefined;
      visited.add(candidate);
      const pack = packByLocale.get(candidate);
      const message = pack?.messages[key];
      if (message) return message;
      return lookup(pack?.manifest.fallback);
    };
    const template = lookup(locale) ?? lookup("en") ?? lookup("zh-Hans") ?? key;
    return interpolate(template, params);
  }, [locale, packByLocale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      languageOptions,
      communityLanguagePacks,
      setLocale,
      setCommunityLanguagePacks,
      t,
    }),
    [communityLanguagePacks, languageOptions, locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return context;
};

const interpolate = (template: string, params: TranslationParams) =>
  template.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (match, key) => {
    const value = params[key];
    return value === undefined ? match : String(value);
  });
