"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/lib/auth";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const values = (f: FormData) => ({
  name: str(f, "name"), contactName: str(f, "contactName") || null, phone: str(f, "phone") || null,
  email: str(f, "email") || null, address: str(f, "address") || null, notes: str(f, "notes") || null,
});

export async function createCustomer(form: FormData) {
  await requirePermission("customer.manage");
  const v = values(form);
  if (!v.name) redirect("/customers?error=" + encodeURIComponent("Enter the company name."));
  const [row] = await db.insert(schema.customers).values(v).returning({ id: schema.customers.id });
  revalidatePath("/customers");
  redirect(`/customers/${row.id}?ok=${encodeURIComponent("Customer added.")}`);
}

export async function updateCustomer(form: FormData) {
  await requirePermission("customer.manage");
  const id = Number(form.get("id")), v = values(form);
  if (!v.name) redirect(`/customers/${id}?error=${encodeURIComponent("Enter the company name.")}`);
  await db.update(schema.customers).set(v).where(eq(schema.customers.id, id));
  revalidatePath(`/customers/${id}`);
  redirect(`/customers/${id}?ok=${encodeURIComponent("Saved.")}`);
}
