import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { readStoredFile } from "@/lib/storage";
import { OWN_FLEET, parseAppSheet, previewImport } from "@/lib/import-appsheet";
import { getI18n } from "@/i18n/server";
import { Notice } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { runImport, uploadWorkbook } from "./actions";

export async function generateMetadata() {
  return { title: (await getI18n()).t("as.title") };
}

const FILE = /^imports\/[0-9a-f-]{36}\.xlsx$/;

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ f?: string; done?: string; ok?: string; error?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "settings.manage")) notFound();
  const { t } = await getI18n();
  const sp = await searchParams;
  const preview = sp.f && FILE.test(sp.f) ? await previewImport(parseAppSheet(await readStoredFile(sp.f))).catch(() => null) : null;
  const companies = await db.select({ id: schema.customers.id, name: schema.customers.name }).from(schema.customers).orderBy(asc(schema.customers.name));
  const row = (label: string, total: number, existing?: number) => (
    <tr><td>{label}</td><td className="r num">{total}</td><td className="r num">{existing === undefined ? "—" : existing}</td><td className="r num"><b>{existing === undefined ? total : total - existing}</b></td></tr>
  );
  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="crumbs"><Link href="/settings">{t("set.title")}</Link> / {t("as.title")}</div>
      <h2>{t("as.title")}</h2>
      <Notice ok={sp.ok} error={sp.error} />
      <p className="muted" style={{ margin: 0 }}>{t("as.intro", { company: OWN_FLEET })}</p>

      <form action={uploadWorkbook} className="panel">
        <div className="panel-head"><h3>{t("as.step1")}</h3></div>
        <div className="filters" style={{ padding: 14 }}>
          <input type="file" name="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
          <SubmitButton className="btn small" pendingText={t("as.reading")}>{t("as.upload")}</SubmitButton>
        </div>
      </form>

      {preview && (
        <section className="panel">
          <div className="panel-head"><h3>{sp.done ? t("as.afterTitle") : t("as.step2")}</h3></div>
          <div className="tbl-wrap"><table>
            <thead><tr><th></th><th className="r">{t("as.inFile")}</th><th className="r">{t("as.already")}</th><th className="r">{t("as.willAdd")}</th></tr></thead>
            <tbody>
              {row(t("as.r.workOrders"), preview.workOrders.total, preview.workOrders.existing)}
              {row(t("as.r.machines"), preview.machines.total, preview.machines.existing)}
              {row(t("as.r.staff"), preview.staff.total, preview.staff.existing)}
              {row(t("as.r.suppliers"), preview.suppliers.total, preview.suppliers.existing)}
              {row(t("as.r.parts"), preview.parts.total, preview.parts.existing)}
              {row(t("as.r.labour"), preview.labour)}
              {row(t("as.r.bills"), preview.bills)}
              {row(t("as.r.usedParts"), preview.usedParts)}
              {row(t("as.r.services"), preview.services)}
            </tbody>
          </table></div>
          <div className="stack" style={{ padding: 14, gap: 8 }}>
            <p className="hint" style={{ margin: 0 }}>{t("as.notes", { open: preview.workOrders.open })}</p>
            {preview.vendors.length > 0 && <p className="hint" style={{ margin: 0 }}>{t("as.vendors", { names: preview.vendors.join(", ") })}</p>}
            <p className="hint" style={{ margin: 0 }}>{t("as.photos")}</p>
            {!sp.done && (
              <form action={runImport} className="stack" style={{ gap: 8 }}>
                <input type="hidden" name="f" value={sp.f} />
                <label className="label" htmlFor="owner">{t("as.owner")}</label>
                <select id="owner" name="owner" className="field" defaultValue={companies.find((c) => /superpower/i.test(c.name))?.id ?? ""} style={{ maxWidth: 420 }}>
                  <option value="">{t("as.ownerNew", { company: OWN_FLEET })}</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <SubmitButton className="btn primary" pendingText={t("as.importing")}>{t("as.run")}</SubmitButton>
              </form>
            )}
            {sp.done && <div className="filters"><Link className="btn primary" href="/jobs?status=all">{t("as.seeWo")}</Link><Link className="btn" href="/machinery">{t("nav.machinery")}</Link><Link className="btn" href="/team">{t("nav.team")}</Link></div>}
          </div>
        </section>
      )}
      {sp.f && !preview && <div className="notice err">{t("as.err.read")}</div>}
    </div>
  );
}
