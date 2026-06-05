"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  translations,
  type Language,
  type TranslationKey,
} from "@/lib/translations";

type TranslationValues = Record<string, string | number>;

type TranslationContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, values?: TranslationValues) => string;
};

const TranslationContext = createContext<TranslationContextValue | null>(null);

function isLanguage(value: string | null): value is Language {
  return value === "fr" || value === "en";
}

function interpolate(text: string, values?: TranslationValues) {
  if (!values) return text;
  return Object.entries(values).reduce(
    (nextText, [key, value]) => nextText.replaceAll(`{${key}}`, String(value)),
    text,
  );
}

export function TranslationProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);

  useEffect(() => {
    const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    const nextLanguage = isLanguage(storedLanguage) ? storedLanguage : DEFAULT_LANGUAGE;
    window.requestAnimationFrame(() => setLanguageState(nextLanguage));
    document.documentElement.lang = nextLanguage;
  }, []);

  const setLanguage = useCallback((nextLanguage: Language) => {
    setLanguageState(nextLanguage);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    document.documentElement.lang = nextLanguage;
  }, []);

  const t = useCallback(
    (key: TranslationKey, values?: TranslationValues) => {
      const dictionary = translations[language];
      return interpolate(dictionary[key] ?? translations[DEFAULT_LANGUAGE][key] ?? key, values);
    },
    [language],
  );

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>;
}

export function useTranslation() {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error("useTranslation must be used within TranslationProvider");
  }
  return context;
}
