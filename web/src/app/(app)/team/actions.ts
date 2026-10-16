"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/lib/auth";
import { hashPassword, passwordProblem } from "@/lib/password";
import { normalisePhone } from "@/lib/phone";
import { isRole } from "@/lib/queries";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const optDate = (f: FormData, k: string) => { const v = str(f, k); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; };

function values(f: FormData) {
  const role = str(f, "role");
  return {
    name: str(f, "name"), role: isRole(role) ? role : null, phone: normalisePhone(str(f, "phone")), email: str(f, "email") || null,
    reportsTo: Number(f.get("reportsTo")) || null, idNumber: str(f, "idNumber") || null, permitExpiry: optDate(f, "permitExpiry"),
    emergencyContact: str(f, "emergencyContact") || null, joined: optDate(f, "joined"),
    skills: str(f, "skills").split(",").map((s) => s.trim()).filter(Boolean), payRate: String(Number(str(f, "payRate")) || 0),
  };
}

export async function createStaff(form: FormData) {
  await requirePermission("staff.manage");
  const v = values(form), pw = str(form, "password");
  const fail = (e: string): never => redirect("/team/new?error=" + encodeURIComponent(e));
  if (!v.name || !v.role || v.phone.length < 9) fail("Enter name, role and a valid phone number.");
  const problem = passwordProblem(pw);
  if (problem) fail("Temporary password: " + problem);
  const [dupe] = await db.select({ id: schema.staff.id }).from(schema.staff).where(eq(schema.staff.phone, v.phone));
  if (dupe) fail("Someone already uses that phone number.");
  const [row] = await db.insert(schema.staff).values({ ...v, role: v.role!, passwordHash: await hashPassword(pw) }).returning({ id: schema.staff.id });
  revalidatePath("/team");
  redirect(`/team/${row.id}?ok=${encodeURIComponent("Staff added. Give them their phone number and temporary password to sign in.")}`);
}

export async function updateStaff(form: FormData) {
  const me = await requirePermission("staff.manage");
  const id = Number(form.get("id")), v = values(form);
  const fail = (e: string): never => redirect(`/team/${id}?error=${encodeURIComponent(e)}`);
  if (!v.name || !v.role || v.phone.length < 9) fail("Enter name, role and a valid phone number.");
  if (id === me.id && v.role !== "boss") fail("You cannot remove your own Boss role.");
  const [dupe] = await db.select({ id: schema.staff.id }).from(schema.staff).where(and(eq(schema.staff.phone, v.phone), ne(schema.staff.id, id)));
  if (dupe) fail("Someone else already uses that phone number.");
  await db.update(schema.staff).set({ ...v, role: v.role! }).where(eq(schema.staff.id, id));
  revalidatePath(`/team/${id}`);
  redirect(`/team/${id}?ok=${encodeURIComponent("Saved.")}`);
}

export async function resetPassword(form: FormData) {
  await requirePermission("staff.manage");
  const id = Number(form.get("id")), pw = str(form, "password");
  const problem = passwordProblem(pw);
  if (problem) redirect(`/team/${id}?error=${encodeURIComponent(problem)}`);
  await db.update(schema.staff).set({ passwordHash: await hashPassword(pw) }).where(eq(schema.staff.id, id));
  await db.delete(schema.sessions).where(eq(schema.sessions.staffId, id));
  redirect(`/team/${id}?ok=${encodeURIComponent("Password reset. They are signed out everywhere.")}`);
}

export async function setActive(form: FormData) {
  const me = await requirePermission("staff.manage");
  const id = Number(form.get("id")), active = form.get("active") === "1";
  if (id === me.id) redirect(`/team/${id}?error=${encodeURIComponent("You cannot deactivate yourself.")}`);
  await db.update(schema.staff).set({ active }).where(eq(schema.staff.id, id));
  if (!active) await db.delete(schema.sessions).where(eq(schema.sessions.staffId, id));
  revalidatePath("/team");
  redirect(`/team/${id}?ok=${encodeURIComponent(active ? "Account re-activated." : "Account deactivated. They can no longer sign in.")}`);
}

export async function addCert(form: FormData) {
  await requirePermission("staff.view");
  const staffId = Number(form.get("staffId")), name = str(form, "name");
  if (!name) redirect(`/team/${staffId}?error=${encodeURIComponent("Enter the certificate name.")}`);
  await db.insert(schema.certifications).values({ staffId, name, number: str(form, "number") || null, expiry: optDate(form, "expiry") });
  revalidatePath(`/team/${staffId}`);
  redirect(`/team/${staffId}`);
}

export async function removeCert(form: FormData) {
  await requirePermission("staff.view");
  const staffId = Number(form.get("staffId"));
  await db.delete(schema.certifications).where(and(eq(schema.certifications.id, Number(form.get("certId"))), eq(schema.certifications.staffId, staffId)));
  revalidatePath(`/team/${staffId}`);
  redirect(`/team/${staffId}`);
}
