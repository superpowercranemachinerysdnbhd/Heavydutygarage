import { notFound } from "next/navigation";
import { ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, LEAD_ROLES } from "@/lib/permissions";
import { activeStaff, unitsWithNames } from "@/lib/queries";
import { addDays, today } from "@/lib/format";
import { getI18n } from "@/i18n/server";
import { roleLabel } from "@/i18n/labels";
import { Notice } from "@/components/ui";
import { createJob } from "../actions";
import NewJobForm from "./NewJobForm";

export async function generateMetadata() {
  return { title: (await getI18n()).t("new.title") };
}

export default async function NewJobPage({ searchParams }: { searchParams: Promise<{ error?: string; emergency?: string; unit?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "job.create")) notFound();
  const { t } = await getI18n();
  const sp = await searchParams;
  const [units, staff, open] = await Promise.all([
    unitsWithNames(), activeStaff(),
    db.select({ siteType: schema.jobs.siteType, siteLocation: schema.jobs.siteLocation }).from(schema.jobs).where(ne(schema.jobs.status, "closed")),
  ]);
  const emergency = sp.emergency === "1";
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <h2>{emergency ? t("new.emgTitle") : t("new.title")}</h2>
      <Notice error={sp.error} />
      {units.length === 0 ? <div className="notice">{t("new.addMachineFirst")}</div> : (
        <NewJobForm action={createJob} emergency={emergency} today={today()} defaultDue={addDays(today(), 7)} unitId={Number(sp.unit) || undefined}
          units={units.map((u) => ({ id: u.id, label: `${u.make} ${u.model} · ${u.serialNo} · ${u.customerName}` }))}
          leads={staff.filter((s) => LEAD_ROLES.includes(s.role)).map((s) => ({ id: s.id, label: `${s.name} · ${roleLabel(t, s.role)}${s.skills.length ? " · " + s.skills.slice(0, 2).join(", ") : ""}` }))}
          busyBays={open.filter((o) => o.siteType === "workshop").map((o) => o.siteLocation)} />
      )}
    </div>
  );
}
