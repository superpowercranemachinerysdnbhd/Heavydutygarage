"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createSession, destroySession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { normalisePhone } from "@/lib/phone";
import { getI18n } from "@/i18n/server";
import { FailureLimiter } from "@/lib/rate-limit";

// 8 wrong passwords for one phone, or 30 from one address, in 15 minutes locks sign-in for a while.
const g = globalThis as unknown as { loginByPhone?: FailureLimiter; loginByIp?: FailureLimiter };
const byPhone = (g.loginByPhone ??= new FailureLimiter(8, 15 * 60_000));
const byIp = (g.loginByIp ??= new FailureLimiter(30, 15 * 60_000));

export type LoginState = { error?: string; phone?: string };

export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  const { t } = await getI18n();
  const phone = normalisePhone(String(form.get("phone") ?? ""));
  const password = String(form.get("password") ?? "");
  if (!phone || !password) return { error: t("login.missing"), phone };
  const ip = ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (byPhone.blocked(phone) || byIp.blocked(ip)) return { error: t("login.tooMany"), phone };
  const [u] = await db.select().from(schema.staff).where(eq(schema.staff.phone, phone)).limit(1);
  if (!u || !u.active || !(await verifyPassword(password, u.passwordHash))) {
    byPhone.fail(phone);
    byIp.fail(ip);
    return { error: t("login.wrong"), phone };
  }
  byPhone.clear(phone);
  await createSession(u.id);
  redirect("/jobs");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
