import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, count, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getI18n } from "@/i18n/server";
import { isLocale } from "@/i18n";
import { langLabel } from "@/i18n/labels";
import { Notice } from "@/components/ui";
import CustomerFields from "@/components/CustomerFields";
import SubmitButton from "@/components/SubmitButton";
import { createCustomer } from "./actions";

export async function generateMetadata() {
  return { title: (await getI18n()).t("cust.title") };
}

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string; ok?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "customer.manage")) notFound();
  const { t } = await getI18n();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const rows = (await db.select({ c: schema.customers, machines: count(schema.machineUnits.id) }).from(schema.customers)
    .leftJoin(schema.machineUnits, eq(schema.machineUnits.customerId, schema.customers.id)).groupBy(schema.customers.id).orderBy(asc(schema.customers.name)))
    .filter(({ c }) => !q || [c.name, c.contactName, c.phone].join(" ").toLowerCase().includes(q));
  return (
    <div className="page">
      <h2>{t("cust.title")}</h2>
      <Notice error={sp.error} ok={sp.ok} />
      <form className="filters" method="get"><input type="search" name="q" defaultValue={sp.q ?? ""} placeholder={t("cust.searchPh")} style={{ flex: "1 1 240px" }} aria-label={t("common.search")} /><button className="btn">{t("common.search")}</button></form>
      <div className="tbl-wrap"><table>
        <thead><tr><th>{t("col.company")}</th><th>{t("col.contact")}</th><th>{t("col.phone")}</th><th>{t("c.locale")}</th><th className="r">{t("col.machines")}</th></tr></thead>
        <tbody>{rows.map(({ c, machines }) => <tr key={c.id}><td><Link href={`/customers/${c.id}`}><b>{c.name}</b></Link></td><td>{c.contactName ?? "—"}</td><td className="mono">{c.phone ?? "—"}</td><td>{isLocale(c.locale) ? langLabel(t, c.locale) : c.locale}</td><td className="r num">{machines}</td></tr>)}
          {rows.length === 0 && <tr><td colSpan={5} className="muted">{t("cust.none")}</td></tr>}</tbody>
      </table></div>
      <form action={createCustomer} className="panel"><div className="panel-head"><h3>{t("cust.add")}</h3></div>
        <div className="form" style={{ padding: 14 }}><CustomerFields t={t} /><div className="full"><SubmitButton className="btn primary">{t("cust.add")}</SubmitButton></div></div></form>
    </div>
  );
}
