import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import {
  type Locale,
  localeNames,
  localeTag,
  t as translate,
  tf as translateFormatted,
  months as getMonths,
} from "./i18n";

export interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
  tf: (key: string, values: Record<string, string | number>) => string;
  months: string[];
  localeNames: Record<Locale, string>;
}

const I18nContext = createContext<I18nContextType | null>(null);

const STORAGE_KEY = "zer_locale";

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && (saved === "en" || saved === "am" || saved === "om" || saved === "ti")) {
        return saved;
      }
    } catch {
      // ignore local storage errors in private mode
    }
    return "en";
  });

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem(STORAGE_KEY, newLocale);
    } catch {
      // ignore
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = localeTag(newLocale);
    }
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = localeTag(locale);
    }
  }, [locale]);

  const t = useCallback((key: string) => translate(locale, key), [locale]);
  const tf = useCallback(
    (key: string, values: Record<string, string | number>) =>
      translateFormatted(locale, key, values),
    [locale],
  );
  const months = useMemo(() => getMonths(locale), [locale]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      tf,
      months,
      localeNames,
    }),
    [locale, setLocale, t, tf, months],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nContextType => {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return ctx;
};
