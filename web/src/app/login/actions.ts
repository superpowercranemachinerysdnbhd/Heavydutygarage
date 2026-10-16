"use server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { createSession, destroySession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { normalisePhone } from "@/lib/phone";

export type LoginState = { error?: string };


export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  const phone = normalisePhone(String(form.get("phone") ?? ""));
  const password = String(form.get("password") ?? "");
  if (!phone || !password) return { error: "Enter your phone number and password." };
  const [u] = await db.select().from(schema.staff).where(eq(schema.staff.phone, phone)).limit(1);
  if (!u || !u.active || !(await verifyPassword(password, u.passwordHash))) {
    return { error: "Phone number or password is wrong. Ask the Boss to reset your password if you have forgotten it." };
  }
  await createSession(u.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
