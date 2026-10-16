import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { fromAcceptLanguage, isLocale, translator, type Locale } from "./index";

export const LANG_COOKIE = "hw_lang";

/** The reader's language: their account setting, else the language cookie, else the browser language. */
export const getLocale = cache(async (): Promise<Locale> => {
  const user = await getCurrentUser();
  if (user) return user.locale;
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  if (isLocale(c)) return c;
  return fromAcceptLanguage((await headers()).get("accept-language"));
});

export async function getI18n() {
  const locale = await getLocale();
  return { locale, t: translator(locale) };
}
