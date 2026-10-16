"use server";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { directThreadId } from "@/lib/chat";

/** Open (or create) the private chat between the user and another active staff member. */
export async function startDirect(form: FormData) {
  const user = await requireUser();
  const other = Number(form.get("staffId"));
  const [s] = Number.isInteger(other) && other !== user.id
    ? await db.select({ id: schema.staff.id }).from(schema.staff).where(and(eq(schema.staff.id, other), eq(schema.staff.active, true)))
    : [];
  if (!s) redirect("/chat");
  redirect(`/chat?t=${await directThreadId(user.id, s.id)}`);
}
