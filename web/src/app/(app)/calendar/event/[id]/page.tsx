import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fmtDate } from "@/lib/format";
import { eventColor, itemLabel } from "@/lib/lists";
import { eventById, isLate } from "@/lib/events";
import { machineFormOptions, unitsWithNames } from "@/lib/queries";
import { ensureLists } from "@/lib/lists-server";
import { getI18n } from "@/i18n/server";
import { Notice } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import EventForm from "@/components/EventForm";
import { deleteEvent, toggleEventDone } from "../actions";

export async function generateMetadata() {
  return { title: (await getI18n()).t("ev.event") };
}

export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const id = Number((await params).id);
  const sp = await searchParams;
  await ensureLists();
  const e = Number.isInteger(id) ? await eventById(id) : null;
  if (!e) notFound();
  const manage = can(user.role, "job.assign");
  const [units, opts] = manage ? await Promise.all([unitsWithNames(), machineFormOptions()]) : [[], { companies: [] }];
  const when = `${fmtDate(e.day, true, locale)}${e.endDay ? ` – ${fmtDate(e.endDay, true, locale)}` : ""}${e.time ? ` · ${e.time}` : ""}`;
  const late = isLate(e);
  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <div className="view-head"><h2>{t("ev.event")}</h2><Link className="btn" href={`/calendar?m=${e.day.slice(0, 7)}`}>{t("ev.backToCal")}</Link></div>
      <Notice ok={sp.ok} error={sp.error} />
      <section className="panel ev-card" style={{ ["--cat" as string]: eventColor(e.type) }}>
        <div className="ev-card-body">
          <span className="chip" style={{ color: eventColor(e.type) }}><span className="dot" />{itemLabel(t, "event_type", e.type)}</span>
          <h3 className={e.doneAt ? "done" : ""}>{e.title}</h3>
          <p className={late ? "due over" : "muted"}>{when}{late ? ` · ${t("cal.overdue")}` : ""}{e.doneAt ? ` · ${t("ev.isDone")}` : ""}</p>
          {e.unitId && <p><Link href={`/machinery/${e.unitId}`}>{e.plateNo} · {e.make} {e.model}</Link>{e.customerName ? ` · ${e.customerName}` : ""}</p>}
          {!e.unitId && e.customerName && <p>{e.customerName}</p>}
          {e.repeatMonths && <p className="muted">{t("ev.repeatsEvery", { n: e.repeatMonths })}</p>}
          {e.notes && <p style={{ whiteSpace: "pre-line" }}>{e.notes}</p>}
        </div>
        {manage && (
          <div className="ev-card-actions">
            <form action={toggleEventDone}><input type="hidden" name="id" value={e.id} /><SubmitButton className={`btn ${e.doneAt ? "" : "primary"}`}>{e.doneAt ? t("ev.markNotDone") : e.repeatMonths ? t("ev.markDoneNext", { n: e.repeatMonths }) : t("ev.markDone")}</SubmitButton></form>
            <form action={deleteEvent}><input type="hidden" name="id" value={e.id} /><SubmitButton className="linkbtn muted">{t("ev.delete")}</SubmitButton></form>
          </div>
        )}
      </section>
      {manage && (
        <details className="panel">
          <summary className="panel-head"><h3>{t("ev.edit")}</h3></summary>
          <EventForm t={t} init={e} units={units} companies={opts.companies} />
        </details>
      )}
    </div>
  );
}
