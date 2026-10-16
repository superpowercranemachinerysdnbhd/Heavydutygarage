"use server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { isLocale } from "@/i18n";
import { LANG_COOKIE } from "@/i18n/server";

/** Switch language: saved on the account when signed in, and in a cookie for the sign-in page. */
export async function setLanguage(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LANG_COOKIE, locale, { path: "/", maxAge: 365 * 86400, sameSite: "lax" });
  const user = await getCurrentUser();
  if (user) await db.update(schema.staff).set({ locale }).where(eq(schema.staff.id, user.id));
}
