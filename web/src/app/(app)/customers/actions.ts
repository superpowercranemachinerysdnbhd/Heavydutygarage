"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/lib/auth";
import { isLocale, translator } from "@/i18n";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const values = (f: FormData) => {
  const locale = str(f, "locale");
  return {
    name: str(f, "name"), contactName: str(f, "contactName") || null, phone: str(f, "phone") || null,
    email: str(f, "email") || null, address: str(f, "address") || null, notes: str(f, "notes") || null,
    locale: isLocale(locale) ? locale : "en",
  };
};

export async function createCustomer(form: FormData) {
  const t = translator((await requirePermission("customer.manage")).locale);
  const v = values(form);
  if (!v.name) redirect("/customers?error=" + encodeURIComponent(t("err.custName")));
  const [row] = await db.insert(schema.customers).values(v).returning({ id: schema.customers.id });
  revalidatePath("/customers");
  redirect(`/customers/${row.id}?ok=${encodeURIComponent(t("cust.added"))}`);
}

export async function updateCustomer(form: FormData) {
  const t = translator((await requirePermission("customer.manage")).locale);
  const id = Number(form.get("id")), v = values(form);
  if (!v.name) redirect(`/customers/${id}?error=${encodeURIComponent(t("err.custName"))}`);
  await db.update(schema.customers).set(v).where(eq(schema.customers.id, id));
  revalidatePath(`/customers/${id}`);
  redirect(`/customers/${id}?ok=${encodeURIComponent(t("ok.saved"))}`);
}

/** Delete a company (Head Manager). Its machines, with all their work orders, first move to another company,
 *  so this also merges a duplicate company into the right one. */
export async function deleteCustomer(form: FormData) {
  const user = await requirePermission("customer.delete");
  const t = translator(user.locale);
  const id = Number(form.get("id")), moveTo = Number(form.get("moveTo")) || null;
  const fail = (k: Parameters<typeof t>[0]): never => redirect(`/customers/${id}?error=${encodeURIComponent(t(k))}#delete`);
  const [c] = await db.select({ name: schema.customers.name }).from(schema.customers).where(eq(schema.customers.id, id));
  if (!c) redirect("/customers");
  if (form.get("confirm") !== "on") fail("cust.delConfirmErr");
  const units = await db.select({ id: schema.machineUnits.id }).from(schema.machineUnits).where(eq(schema.machineUnits.customerId, id));
  if (units.length && !moveTo) fail("cust.delMoveErr");
  if (moveTo) {
    const [target] = await db.select({ id: schema.customers.id }).from(schema.customers).where(and(eq(schema.customers.id, moveTo), ne(schema.customers.id, id)));
    if (!target) fail("cust.delMoveErr");
  }
  await db.transaction(async (tx) => {
    if (moveTo) {
      await tx.update(schema.machineUnits).set({ customerId: moveTo }).where(eq(schema.machineUnits.customerId, id));
      await tx.update(schema.calendarEvents).set({ customerId: moveTo }).where(eq(schema.calendarEvents.customerId, id));
    }
    await tx.delete(schema.customers).where(eq(schema.customers.id, id));
  });
  revalidatePath("/customers"); revalidatePath("/machinery");
  const msg = units.length ? t("cust.deletedMoved", { name: c.name, n: units.length }) : t("cust.deleted", { name: c.name });
  redirect(moveTo ? `/customers/${moveTo}?ok=${encodeURIComponent(msg)}` : `/customers?ok=${encodeURIComponent(msg)}`);
}
