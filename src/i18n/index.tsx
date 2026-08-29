import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { zhCN } from './zh';
import { enUS } from './en';

export type Language = 'zh' | 'en';

const DICTS: Record<Language, Record<string, string>> = {
  zh: zhCN,
  en: enUS
};

const STORAGE_KEY = 'starlims-language';

interface I18nContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  /** Translate a key; supports {placeholder} interpolation. */
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  language: 'zh',
  setLanguage: () => undefined,
  toggleLanguage: () => undefined,
  t: (key: string) => key
});

function readInitialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'zh') return saved;
  } catch {
    // ignore
  }
  // Default to Chinese
  return 'zh';
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readInitialLanguage);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // ignore
    }
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  }, [language]);

  const setLanguage = useCallback((lang: Language) => setLanguageState(lang), []);
  const toggleLanguage = useCallback(() => {
    setLanguageState(prev => (prev === 'zh' ? 'en' : 'zh'));
  }, []);

  const t = useCallback((key: string, params?: Record<string, string | number>) => {
    const dict = DICTS[language];
    let text = dict[key] ?? key;
    if (params) {
      for (const [name, value] of Object.entries(params)) {
        text = text.split(`{${name}}`).join(String(value));
      }
    }
    return text;
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage, toggleLanguage, t }), [language, setLanguage, toggleLanguage, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Hook to read the current language and the translate function. */
export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

/** Standalone translate helper for non-component modules (uses zh as fallback). */
export function translate(key: string, lang: Language = 'zh', params?: Record<string, string | number>): string {
  const dict = DICTS[lang];
  let text = dict[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}
