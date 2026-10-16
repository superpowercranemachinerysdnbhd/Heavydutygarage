import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { daysBetween, fmtDate, today } from "@/lib/format";
import { unitsWithNames } from "@/lib/queries";
import { getI18n } from "@/i18n/server";
import { placeLabel } from "@/i18n";

export async function generateMetadata() {
  return { title: (await getI18n()).t("mach.title") };
}

export default async function MachineryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const units = (await unitsWithNames()).filter((u) => !q || [u.make, u.model, u.serialNo, u.plateNo, u.customerName].join(" ").toLowerCase().includes(q));
  const d = today();
  return (
    <div className="page">
      <div className="view-head"><h2>{t("mach.title")}</h2>
        <Link className="btn" href="/machinery/models">{t("mach.models")}</Link>
        {can(user.role, "machine.manage") && <Link className="btn primary" href="/machinery/new">{t("mach.add")}</Link>}</div>
      <form className="filters" method="get"><input type="search" name="q" defaultValue={sp.q ?? ""} placeholder={t("mach.searchPh")} style={{ flex: "1 1 260px" }} aria-label={t("common.search")} /><button className="btn">{t("common.search")}</button></form>
      <div className="tbl-wrap"><table>
        <thead><tr><th>{t("col.machine")}</th><th>{t("col.serial")}</th><th>{t("col.owner")}</th><th>{t("col.location")}</th><th className="r">{t("col.hourMeter")}</th><th>{t("col.nextService")}</th></tr></thead>
        <tbody>
          {units.map((u) => {
            const stay = u.arrivedAt ? daysBetween(u.arrivedAt, d) : null;
            return (
              <tr key={u.id}>
                <td><Link href={`/machinery/${u.id}`}><b>{u.make} {u.model}</b></Link><br /><small className="muted">{u.type}</small></td>
                <td className="mono">{u.serialNo}{u.plateNo ? <><br /><small className="muted">{u.plateNo}</small></> : null}</td>
                <td>{u.customerName}</td>
                <td>{placeLabel(t, u.location)}{stay !== null && stay > 30 && <> <span className="badge-long">{t("mach.days", { n: stay })}</span></>}</td>
                <td className="r num">{u.hourMeter.toLocaleString()} h</td>
                <td>{u.nextServiceDate ? `${u.nextServiceType ?? t("hist.serviceDefault")}, ${fmtDate(u.nextServiceDate, false, locale)}` : "—"}</td>
              </tr>
            );
          })}
          {units.length === 0 && <tr><td colSpan={6} className="muted">{t("mach.none")}</td></tr>}
        </tbody>
      </table></div>
    </div>
  );
}
