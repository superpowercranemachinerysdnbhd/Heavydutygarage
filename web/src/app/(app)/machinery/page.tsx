import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { daysBetween, fmtDate, today } from "@/lib/format";
import { unitsWithNames } from "@/lib/queries";
import { groupOf, machinePhotoUrl, machineTypeLabel, unitRef } from "@/lib/machine-types";
import { getI18n } from "@/i18n/server";
import { placeLabel } from "@/i18n";
import MachineTypeOptions from "@/components/MachineTypeOptions";

export async function generateMetadata() {
  return { title: (await getI18n()).t("mach.title") };
}

export default async function MachineryPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const type = sp.type ?? "";
  const units = (await unitsWithNames())
    .filter((u) => !q || [u.plateNo, u.serialNo, u.make, u.model, u.customerName, machineTypeLabel(t, u.type)].join(" ").toLowerCase().includes(q))
    .filter((u) => !type || u.type === type || groupOf(u.type) === type);
  const d = today();
  return (
    <div className="page">
      <div className="view-head"><h2>{t("mach.title")}</h2>
        <Link className="btn" href="/machinery/models">{t("mach.models")}</Link>
        {can(user.role, "machine.manage") && <Link className="btn primary" href="/machinery/new">{t("mach.add")}</Link>}</div>
      <form className="filters" method="get">
        <input type="search" name="q" defaultValue={sp.q ?? ""} placeholder={t("mach.searchPh")} style={{ flex: "1 1 240px" }} aria-label={t("common.search")} />
        <select className="field" name="type" defaultValue={type} aria-label={t("u.type")}>
          <option value="">{t("mach.allTypes")}</option>
          <MachineTypeOptions t={t} groupChoice />
        </select>
        <button className="btn">{t("common.search")}</button>
      </form>
      <div className="tbl-wrap"><table className="mach-tbl">
        <thead><tr><th>{t("col.machine")}</th><th>{t("col.plate")}</th><th>{t("col.owner")}</th><th>{t("col.location")}</th><th className="r">{t("col.hourMeter")}</th><th>{t("col.nextService")}</th></tr></thead>
        <tbody>
          {units.map((u) => {
            const stay = u.arrivedAt ? daysBetween(u.arrivedAt, d) : null;
            const photo = machinePhotoUrl(u.id, u.photoPath);
            return (
              <tr key={u.id}>
                <td><Link href={`/machinery/${u.id}`} className="mach-cell plain">
                  {photo ? <img className="mach-thumb" src={photo} alt="" loading="lazy" /> : <span className="mach-thumb none" aria-hidden="true" />}
                  <span><b className="link">{u.make} {u.model}</b><br /><small className="muted">{machineTypeLabel(t, u.type)}</small></span>
                </Link></td>
                <td className="mono"><b>{unitRef(u)}</b>{u.plateNo && u.serialNo ? <><br /><small className="muted">{u.serialNo}</small></> : null}</td>
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
