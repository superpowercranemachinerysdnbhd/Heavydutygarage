import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";
import { hashToken, newToken } from "./password";
import { can, type Action, type Role } from "./permissions";

const COOKIE = "hw_session";
const SESSION_DAYS = 30;

export type CurrentUser = { id: number; name: string; role: Role; phone: string };

export async function createSession(staffId: number) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  await db.insert(schema.sessions).values({ tokenHash: hashToken(token), staffId, expiresAt });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, hashToken(token)));
  jar.delete(COOKIE);
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ id: schema.staff.id, name: schema.staff.name, role: schema.staff.role, phone: schema.staff.phone, active: schema.staff.active })
    .from(schema.sessions)
    .innerJoin(schema.staff, eq(schema.sessions.staffId, schema.staff.id))
    .where(and(eq(schema.sessions.tokenHash, hashToken(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  const u = rows[0];
  if (!u || !u.active) return null;
  return { id: u.id, name: u.name, role: u.role, phone: u.phone };
});

/** For pages and actions: the signed-in user, or a redirect to the login page. */
export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

/** Throws when the user lacks a permission. Use inside server actions. */
export async function requirePermission(action: Action): Promise<CurrentUser> {
  const u = await requireUser();
  if (!can(u.role, action)) throw new Error("You do not have permission to do this.");
  return u;
}
