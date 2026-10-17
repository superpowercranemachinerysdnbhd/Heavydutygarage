import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PRIORITIES } from "@/lib/jobs";
import { categoryCodes } from "@/lib/lists";
import { unitRef } from "@/lib/machine-types";
import { getI18n } from "@/i18n/server";
import { catLabel, priLabel } from "@/i18n/labels";
import { Notice } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import WherePicker, { OUTSIDE } from "@/components/WherePicker";
import { updateDetails } from "../../actions";

export async function generateMetadata() {
  return { title: (await getI18n()).t("job.edit") };
}

/** Edit a job's details (Head Manager and Supervisor). */
export default async function EditJobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "job.editDetails")) notFound();
  const { t } = await getI18n();
  const id = Number((await params).id);
  const sp = await searchParams;
  const [row] = Number.isInteger(id) ? await db.select({ job: schema.jobs, unit: schema.machineUnits, model: schema.machineModels }).from(schema.jobs)
    .innerJoin(schema.machineUnits, eq(schema.jobs.unitId, schema.machineUnits.id)).innerJoin(schema.machineModels, eq(schema.machineUnits.modelId, schema.machineModels.id))
    .where(eq(schema.jobs.id, id)) : [];
  if (!row) notFound();
  const { job, unit, model } = row;
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div className="crumbs"><Link href="/jobs">{t("nav.jobs")}</Link> / <Link href={`/jobs/${id}`}>{job.jobNo}</Link> / {t("job.edit")}</div>
      <h2>{t("job.editTitle", { no: job.jobNo })} <span className="muted" style={{ fontSize: "1rem" }}>{unitRef(unit)} · {model.make} {model.model}</span></h2>
      <Notice error={sp.error} />
      <form action={updateDetails} className="form panel" style={{ padding: 16 }}>
        <input type="hidden" name="jobId" value={job.id} />
        <label>{t("f.category")}<select className="field" name="category" defaultValue={job.category}>{[...new Set([...categoryCodes(), job.category])].map((k) => <option key={k} value={k}>{catLabel(t, k)}</option>)}</select></label>
        <label>{t("f.priority")}<select className="field" name="priority" defaultValue={job.priority}>{PRIORITIES.map((p) => <option key={p} value={p}>{priLabel(t, p)}</option>)}</select></label>
        <label>{t("f.due")}<input type="date" name="dueDate" defaultValue={job.dueDate} required /></label>
        <WherePicker defaultWhere={job.siteType === "field" ? OUTSIDE : job.siteLocation} defaultAddress={job.siteType === "field" ? job.siteLocation : ""} />
        <label>{t("f.hourMeterIn")}<input type="number" name="hourMeterIn" min={0} defaultValue={job.hourMeterIn ?? ""} /></label>
        <label>{t("f.reportedBy")}<input name="reportedBy" defaultValue={job.reportedBy ?? ""} placeholder={t("f.reportedByPh")} /></label>
        <label className="full">{t("f.complaint")}<textarea name="complaint" rows={4} required defaultValue={job.complaint} /></label>
        <div className="full" style={{ display: "flex", gap: 8 }}>
          <SubmitButton className="btn primary">{t("job.saveDetails")}</SubmitButton>
          <Link className="btn" href={`/jobs/${id}`}>{t("common.cancel")}</Link>
        </div>
      </form>
    </div>
  );
}
