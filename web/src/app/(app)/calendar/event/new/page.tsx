import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { today } from "@/lib/format";
import { isDay } from "@/lib/calendar";
import { machineFormOptions, unitsWithNames } from "@/lib/queries";
import { ensureLists } from "@/lib/lists-server";
import { getI18n } from "@/i18n/server";
import { Notice } from "@/components/ui";
import EventForm from "@/components/EventForm";

export async function generateMetadata() {
  return { title: (await getI18n()).t("ev.new") };
}

export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ day?: string; unit?: string; error?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "job.assign")) notFound();
  const { t } = await getI18n();
  const sp = await searchParams;
  await ensureLists();
  const [units, { companies }] = await Promise.all([unitsWithNames(), machineFormOptions()]);
  const day = isDay(sp.day) ? sp.day : today();
  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <div className="view-head"><h2>{t("ev.new")}</h2><Link className="btn" href={`/calendar?m=${day.slice(0, 7)}`}>{t("common.cancel")}</Link></div>
      <Notice error={sp.error} />
      <section className="panel"><EventForm t={t} init={{ day, unitId: Number(sp.unit) || null }} units={units} companies={companies} /></section>
    </div>
  );
}
