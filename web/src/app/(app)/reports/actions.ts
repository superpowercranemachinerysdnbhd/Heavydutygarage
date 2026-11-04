"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission } from "@/lib/auth";
import { isExpenseCategory } from "@/lib/expenses";
import { today } from "@/lib/format";
import { translator, type MessageKey } from "@/i18n";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function done(locale: Parameters<typeof translator>[0], year: string, kind: "ok" | "error", key: MessageKey): never {
  revalidatePath("/reports");
  redirect(`/reports?y=${year}&${kind}=${encodeURIComponent(translator(locale)(key))}#expenses`);
}

/** Record another company expense (rent, electricity, diesel…). Head Manager. */
export async function addExpense(form: FormData) {
  const user = await requirePermission("money.labourCost");
  const day = str(form, "day"), category = str(form, "category"), amount = Number(str(form, "amount").replace(/,/g, ""));
  const year = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.slice(0, 4) : today().slice(0, 4);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !isExpenseCategory(category) || !(amount > 0)) done(user.locale, year, "error", "exp.err");
  await db.insert(schema.companyExpenses).values({ day, category, amount: amount.toFixed(2), description: str(form, "description").slice(0, 200) || null, createdBy: user.id });
  done(user.locale, year, "ok", "exp.saved");
}

export async function removeExpense(form: FormData) {
  const user = await requirePermission("money.labourCost");
  await db.delete(schema.companyExpenses).where(eq(schema.companyExpenses.id, Number(form.get("id"))));
  done(user.locale, str(form, "y") || today().slice(0, 4), "ok", "exp.removed");
}
