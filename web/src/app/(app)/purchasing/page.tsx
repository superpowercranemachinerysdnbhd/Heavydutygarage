import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fmtDate, rm, today } from "@/lib/format";
import { listParts } from "@/lib/inventory";
import { listPos } from "@/lib/purchasing";
import { isLowStock } from "@/lib/stock";
import { getI18n } from "@/i18n/server";
import type { MessageKey } from "@/i18n";
import { Notice } from "@/components/ui";
import PoStatus from "@/components/PoStatus";
import PurchasingTabs from "@/components/PurchasingTabs";

export async function generateMetadata() {
  return { title: (await getI18n()).t("po.title") };
}

const FILTERS = ["open", "awaiting_approval", "ordered", "partially_received", "received", "cancelled", "all"] as const;

export default async function PoListPage({ searchParams }: { searchParams: Promise<{ status?: string; ok?: string; error?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "po.create")) notFound();
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const f = (FILTERS as readonly string[]).includes(sp.status ?? "") ? sp.status! : "open";
  const [pos, parts] = await Promise.all([listPos(), listParts()]);
  const list = pos.filter((p) => f === "all" ? true : f === "open" ? ["awaiting_approval", "ordered", "partially_received"].includes(p.status) : p.status === f);
  const d = today(), low = parts.filter(isLowStock).length;
  return (
    <div className="page">
      <div className="view-head"><h2>{t("po.title")}</h2>
        {low > 0 && <Link className="btn" href="/purchasing/new?suggest=1">{t("parts.orderLow", { n: low })}</Link>}
        <Link className="btn primary" href="/purchasing/record">{t("rp2.button")}</Link>
        <Link className="btn" href="/purchasing/new">{t("po.new")}</Link></div>
      <PurchasingTabs t={t} active="po" />
      <Notice error={sp.error} ok={sp.ok} />
      <div className="chipbar">{FILTERS.map((k) => <Link key={k} className="chip" href={`/purchasing?status=${k}`} aria-pressed={f === k} style={{ textDecoration: "none" }}>{t(k === "open" ? "po.fOpen" : k === "all" ? "po.fAll" : (`postatus.${k}` as MessageKey))}</Link>)}</div>
      <div className="tbl-wrap"><table>
        <thead><tr><th>{t("po.no")}</th><th>{t("sup.supplier")}</th><th>{t("po.date")}</th><th>{t("po.eta")}</th><th>{t("col.job")}</th><th className="r">{t("po.items")}</th><th className="r">{t("po.total")}</th><th>{t("col.status")}</th></tr></thead>
        <tbody>{list.map((p) => {
          const late = ["ordered", "partially_received"].includes(p.status) && p.eta && p.eta < d;
          return (
            <tr key={p.id}><td className="mono"><Link href={`/purchasing/${p.id}`}>{p.poNo}</Link></td><td>{p.supplier}</td><td className="num">{fmtDate(p.orderDate, false, locale)}</td>
              <td className={`num ${late ? "due over" : ""}`}>{p.eta ? fmtDate(p.eta, false, locale) : "—"}{late ? ` · ${t("po.late")}` : ""}</td>
              <td className="mono">{p.jobNo ? <Link href={`/jobs/${p.jobId}`}>{p.jobNo}</Link> : <span className="muted">{t("po.stock")}</span>}</td>
              <td className="r num">{p.lineCount}{p.status === "partially_received" && <><br /><small className="muted">{t("po.recvOf", { r: p.received, q: p.qty })}</small></>}</td>
              <td className="r num">{rm(p.total)}</td><td><PoStatus status={p.status} t={t} /></td></tr>);
        })}
          {list.length === 0 && <tr><td colSpan={8} className="muted">{t("po.none")}</td></tr>}</tbody>
      </table></div>
    </div>
  );
}
