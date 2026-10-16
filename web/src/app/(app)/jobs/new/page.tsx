import { notFound } from "next/navigation";
import { ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, LEAD_ROLES, ROLE_LABEL } from "@/lib/permissions";
import { activeStaff, unitsWithNames } from "@/lib/queries";
import { addDays, today } from "@/lib/format";
import { Notice } from "@/components/ui";
import { createJob } from "../actions";
import NewJobForm from "./NewJobForm";

export const metadata = { title: "New job" };

export default async function NewJobPage({ searchParams }: { searchParams: Promise<{ error?: string; emergency?: string; unit?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "job.create")) notFound();
  const sp = await searchParams;
  const [units, staff, open] = await Promise.all([
    unitsWithNames(), activeStaff(),
    db.select({ siteType: schema.jobs.siteType, siteLocation: schema.jobs.siteLocation }).from(schema.jobs).where(ne(schema.jobs.status, "closed")),
  ]);
  const emergency = sp.emergency === "1";
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <h2>{emergency ? "Emergency call-out" : "New job"}</h2>
      <Notice error={sp.error} />
      {units.length === 0 ? <div className="notice">Add the machine first under Machinery, then create the job.</div> : (
        <NewJobForm action={createJob} emergency={emergency} today={today()} defaultDue={addDays(today(), 7)} unitId={Number(sp.unit) || undefined}
          units={units.map((u) => ({ id: u.id, label: `${u.make} ${u.model} · ${u.serialNo} · ${u.customerName}` }))}
          leads={staff.filter((s) => LEAD_ROLES.includes(s.role)).map((s) => ({ id: s.id, label: `${s.name} · ${ROLE_LABEL[s.role]}${s.skills.length ? " · " + s.skills.slice(0, 2).join(", ") : ""}` }))}
          busyBays={open.filter((o) => o.siteType === "workshop").map((o) => o.siteLocation)} />
      )}
    </div>
  );
}
