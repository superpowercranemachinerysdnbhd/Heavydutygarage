"use client";
import { createContext, useContext, useMemo } from "react";
import { DICTS, format, type Locale, type T } from "./index";

const Ctx = createContext<Locale>("en");

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

export function useLocale(): Locale {
  return useContext(Ctx);
}

export function useT(): T {
  const locale = useContext(Ctx);
  return useMemo<T>(() => (key, vars) => format(DICTS[locale][key], vars), [locale]);
}
