"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
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
