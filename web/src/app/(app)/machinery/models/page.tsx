import Link from "next/link";
import { asc, count, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Notice } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import SubmitButton from "@/components/SubmitButton";
import { createModel } from "../actions";
import { machineTypeLabel } from "@/lib/machine-types";
import MachineTypeOptions from "@/components/MachineTypeOptions";

export async function generateMetadata() {
  return { title: (await getI18n()).t("mod.title") };
}

export default async function ModelsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const { t } = await getI18n();
  const sp = await searchParams;
  const models = await db.select({ m: schema.machineModels, units: count(schema.machineUnits.id) }).from(schema.machineModels)
    .leftJoin(schema.machineUnits, eq(schema.machineUnits.modelId, schema.machineModels.id))
    .groupBy(schema.machineModels.id).orderBy(asc(schema.machineModels.make), asc(schema.machineModels.model));
  return (
    <div className="page">
      <div className="crumbs"><Link href="/machinery">{t("mach.title")}</Link> / {t("mod.title")}</div>
      <h2>{t("mod.title")}</h2>
      <Notice error={sp.error} />
      <div className="tbl-wrap"><table>
        <thead><tr><th>{t("col.makeModel")}</th><th>{t("col.type")}</th><th>{t("col.intervals")}</th><th className="r">{t("col.machinesOnFile")}</th></tr></thead>
        <tbody>{models.map(({ m, units }) => <tr key={m.id}><td><Link href={`/machinery/models/${m.id}`}><b>{m.make} {m.model}</b></Link></td><td>{machineTypeLabel(t, m.type)}</td><td className="mono">{m.serviceIntervals.length ? m.serviceIntervals.join(" / ") + " h" : "—"}</td><td className="r num">{units}</td></tr>)}
          {models.length === 0 && <tr><td colSpan={4} className="muted">{t("mod.none")}</td></tr>}</tbody>
      </table></div>
      {can(user.role, "machine.manage") && (
        <form action={createModel} className="panel">
          <div className="panel-head"><h3>{t("mod.add")}</h3></div>
          <div className="form" style={{ padding: 14 }}>
            <label>{t("mod.make")}<input name="make" required placeholder="Komatsu" /></label>
            <label>{t("mod.model")}<input name="model" required placeholder="PC200-8" /></label>
            <label>{t("mod.type")}<select className="field" name="type" required defaultValue=""><option value="" disabled>{t("common.choose")}</option>
              <MachineTypeOptions t={t} /></select></label>
            <label>{t("mod.intervals")}<input name="intervals" placeholder="250, 500, 1000, 2000" /></label>
            <label className="full">{t("mod.specs")}<textarea name="specs" rows={4} placeholder={"Operating weight: 20 t\nEngine: SAA6D107E-1\nEngine oil: 23 L"} /></label>
            <div className="full"><SubmitButton className="btn primary">{t("mod.addBtn")}</SubmitButton></div>
          </div>
        </form>
      )}
    </div>
  );
}
