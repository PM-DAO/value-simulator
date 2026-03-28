"use client";
import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { Locale, translations } from "./i18n";

type I18nContextType = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
};

const I18nContext = createContext<I18nContextType>({
  locale: "ja",
  setLocale: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ja");

  useEffect(() => {
    // Detect from browser or localStorage
    const saved = localStorage.getItem("vs_locale") as Locale | null;
    if (saved === "en" || saved === "ja") {
      setLocaleState(saved);
    } else if (typeof navigator !== "undefined" && !navigator.language.startsWith("ja")) {
      setLocaleState("en");
    }
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("vs_locale", l);
  }, []);

  const t = useCallback(
    (key: string) => {
      return translations[locale][key] || translations["ja"][key] || key;
    },
    [locale],
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
