/** Languages, message lookup and helpers. Safe to import from server and client code. */
import { findItem } from "@/lib/lists";
import { en, type MessageKey, type Messages } from "./en";
import { ms } from "./ms";
import { zh } from "./zh";

export const LOCALES = ["en", "ms", "zh"] as const;
export type Locale = (typeof LOCALES)[number];
export type { MessageKey, Messages };

export const DICTS: Record<Locale, Messages> = { en, ms, zh };
/** Locale used for dates and numbers. */
export const INTL_LOCALE: Record<Locale, string> = { en: "en-GB", ms: "ms-MY", zh: "zh-CN" };

export function isLocale(x: unknown): x is Locale {
  return typeof x === "string" && (LOCALES as readonly string[]).includes(x);
}

export type Vars = Record<string, string | number>;
export type T = (key: MessageKey, vars?: Vars) => string;

export function format(msg: string, vars?: Vars): string {
  if (!vars) return msg;
  return msg.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function translator(locale: Locale): T {
  const dict = DICTS[locale] ?? en;
  return (key, vars) => format(dict[key] ?? en[key] ?? key, vars);
}

/** Pick a language from an Accept-Language header. */
export function fromAcceptLanguage(header: string | null | undefined): Locale {
  const h = (header ?? "").toLowerCase();
  for (const part of h.split(",")) {
    const tag = part.trim().slice(0, 2);
    if (tag === "zh") return "zh";
    if (tag === "ms" || tag === "id") return "ms";
    if (tag === "en") return "en";
  }
  return "en";
}

/** Translate stored place names such as "Bay 2", "Workshop · Paint bay" or "Customer site". */
export function placeLabel(t: T, s: string): string {
  if (!s) return t("loc.tbd");
  return findItem("bay", s)?.label || builtinPlaceLabel(t, s);
}

/** Translated name of a built-in place ("Bay 2" → "Petak 2"); other text is returned as typed. */
export function builtinPlaceLabel(t: T, s: string): string {
  if (s === "Customer site") return t("loc.customerSite");
  if (s.startsWith("Workshop · ")) return `${t("loc.workshop")} · ${placeLabel(t, s.slice("Workshop · ".length))}`;
  let m = s.match(/^Bay (\d+)$/);
  if (m) return t("bay.n", { n: m[1] });
  if (s === "Fabrication bay") return t("bay.fab");
  if (s === "Paint bay") return t("bay.paint");
  if (s === "Open yard") return t("bay.openYard");
  m = s.match(/^Long-stay yard (\w+)$/);
  if (m) return t("bay.yard", { x: m[1] });
  return s;
}
