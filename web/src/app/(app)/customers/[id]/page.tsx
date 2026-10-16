import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fmtDate } from "@/lib/format";
import { listJobs, unitsWithNames } from "@/lib/queries";
import { getI18n } from "@/i18n/server";
import { placeLabel } from "@/i18n";
import { statusLabel } from "@/i18n/labels";
import { CatChip, Notice } from "@/components/ui";
import CustomerFields from "@/components/CustomerFields";
import SubmitButton from "@/components/SubmitButton";
import { updateCustomer } from "../actions";

export async function generateMetadata() {
  return { title: (await getI18n()).t("cust.title") };
}

export default async function CustomerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "customer.manage")) notFound();
  const { t, locale } = await getI18n();
  const id = Number((await params).id);
  const sp = await searchParams;
  const [c] = Number.isInteger(id) ? await db.select().from(schema.customers).where(eq(schema.customers.id, id)) : [];
  if (!c) notFound();
  const units = (await unitsWithNames()).filter((u) => u.customerId === id);
  const unitIds = new Set(units.map((u) => u.id));
  const jobs = (await listJobs(user)).filter((j) => unitIds.has(j.unitId));
  return (
    <div className="page">
      <div className="crumbs"><Link href="/customers">{t("cust.title")}</Link> / {c.name}</div>
      <div className="view-head"><h2>{c.name}</h2><Link className="btn" href={`/machinery/new?customer=${id}`}>{t("cust.addMachine")}</Link></div>
      <Notice error={sp.error} ok={sp.ok} />
      <div className="two">
        <div className="panel"><div className="panel-head"><h3>{t("cust.machines")}</h3></div>
          {units.map((u) => <Link key={u.id} href={`/machinery/${u.id}`} className="li plain"><div className="li-main"><b>{u.make} {u.model}</b><small className="mono">{u.serialNo}</small><small>{placeLabel(t, u.location)} · {u.hourMeter.toLocaleString()} h</small></div></Link>)}
          {units.length === 0 && <div className="empty">{t("cust.noMachines")}</div>}
        </div>
        <form action={updateCustomer} className="panel"><div className="panel-head"><h3>{t("cust.details")}</h3></div>
          <input type="hidden" name="id" value={c.id} />
          <div className="form" style={{ padding: 14 }}><CustomerFields c={c} t={t} /><div className="full"><SubmitButton className="btn primary">{t("common.save")}</SubmitButton></div></div></form>
      </div>
      <div className="panel"><div className="panel-head"><h3>{t("cust.jobs")}</h3><span className="muted" style={{ fontSize: ".8rem" }}>{jobs.length}</span></div>
        <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}><table><tbody>
          {jobs.map((j) => <tr key={j.id}><td className="mono"><Link href={`/jobs/${j.id}`}>{j.jobNo}</Link></td><td>{fmtDate(j.openedAt, true, locale)}</td><td>{j.make} {j.model}</td><td><CatChip cat={j.category} t={t} /></td><td>{statusLabel(t, j.status)}</td></tr>)}
          {jobs.length === 0 && <tr><td className="muted">{t("cust.noJobs")}</td></tr>}
        </tbody></table></div></div>
    </div>
  );
}
