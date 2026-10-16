"use server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createSession, destroySession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { normalisePhone } from "@/lib/phone";
import { getI18n } from "@/i18n/server";

export type LoginState = { error?: string; phone?: string };

export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  const { t } = await getI18n();
  const phone = normalisePhone(String(form.get("phone") ?? ""));
  const password = String(form.get("password") ?? "");
  if (!phone || !password) return { error: t("login.missing"), phone };
  const [u] = await db.select().from(schema.staff).where(eq(schema.staff.phone, phone)).limit(1);
  if (!u || !u.active || !(await verifyPassword(password, u.passwordHash))) return { error: t("login.wrong"), phone };
  await createSession(u.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
