import "server-only";
import { and, isNotNull, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CurrentUser } from "./auth";
import { can } from "./permissions";
import { ageLevel } from "./jobs";
import { addDays, daysBetween, fmtDate, today } from "./format";
import type { JobRow } from "./queries";
import { purchasingAlerts, type Alert } from "./alerts";
import { dueServices } from "./services";
import { upcomingEvents, eventTitle, isLate } from "./events";
import { attendanceBetween } from "./attendance-server";
import { holidaysBetween } from "./calendar-server";
import { weekday } from "./calendar";
import { itemLabel } from "./lists";
import { unitRef } from "./machine-types";
import { daysInStatus, dueInfo } from "@/components/ui";
import { placeLabel, type Locale, type T } from "@/i18n";
import { statusLabel } from "@/i18n/labels";

const plate = (j: JobRow) => j.plateNo || j.serialNo || `${j.make} ${j.model}`;
const place = (j: JobRow, t: T) => j.siteType === "field" ? t("dash.field", { place: j.siteLocation.split(",")[0] }) : j.siteLocation ? placeLabel(t, j.siteLocation) : t("loc.tbd");

/** What needs the Head Manager's or Supervisor's attention, shown at the top of the Work orders page.
 *  `now`: act today. `later`: background reminders (follow-ups, long-stay machines, certificates, stock, prices). */
export async function workshopAlerts(user: CurrentUser, locale: Locale, t: T, open: JobRow[], invoicesDue: JobRow[] = []): Promise<{ now: Alert[]; later: Alert[] }> {
  const d = today();
  const [units, certs, staff, fu, purchasing, events, services, attToday, holToday] = await Promise.all([
    db.select({ id: schema.machineUnits.id, arrivedAt: schema.machineUnits.arrivedAt, serialNo: schema.machineUnits.serialNo, plateNo: schema.machineUnits.plateNo }).from(schema.machineUnits),
    db.select({ staffId: schema.certifications.staffId, name: schema.certifications.name, expiry: schema.certifications.expiry }).from(schema.certifications),
    db.select({ id: schema.staff.id, name: schema.staff.name }).from(schema.staff),
    db.select({ id: schema.jobs.id, jobNo: schema.jobs.jobNo, note: schema.jobs.followUp, date: schema.jobs.followUpDate }).from(schema.jobs)
      .where(and(isNotNull(schema.jobs.followUp), lte(schema.jobs.followUpDate, d))),
    purchasingAlerts(user, locale),
    upcomingEvents(0),
    dueServices(30),
    attendanceBetween(d, d),
    holidaysBetween(d, d),
  ]);
  const names = new Map(staff.map((s) => [s.id, s.name]));
  const now: Alert[] = [], later: Alert[] = [];
  // New fault reports from operators (QR sticker) that nobody has picked up yet.
  open.filter((j) => j.source === "qr" && j.status === "received" && !j.leadId).forEach((j) => now.push({ sev: j.category === "EMG" ? "var(--crit)" : "var(--warn)", text: t("att.faultReport", { machine: plate(j), who: j.reportedBy ?? "" }), href: `/jobs/${j.id}` }));
  open.filter((j) => j.priority === "critical" && !j.leadId && !j.outsourced).forEach((j) => now.push({ sev: "var(--crit)", text: t("att.emgUnassigned", { no: plate(j), machine: `${j.make} ${j.model}`, place: place(j, t) }), href: `/jobs/${j.id}` }));
  open.filter((j) => dueInfo(j, t, locale).cls === "over").forEach((j) => now.push({ sev: "var(--crit)", text: t("att.overdue", { no: plate(j), date: fmtDate(j.dueDate, false, locale) }), href: `/jobs/${j.id}` }));
  // Outsourced and still at the vendor: chase it once the expected date has passed (not "stuck" before that).
  const atVendor = open.filter((j) => j.outsourced && !j.backAt);
  atVendor.filter((j) => j.expectedBackAt && j.expectedBackAt < d).forEach((j) => now.push({ sev: "var(--warn)", href: `/jobs/${j.id}`,
    text: t("att.vendorLate", { machine: plate(j), vendor: j.vendorName ?? "?", n: daysBetween(j.expectedBackAt!, d) }) }));
  atVendor.filter((j) => !(j.expectedBackAt && j.expectedBackAt < d)).forEach((j) => later.push({ sev: "var(--info)", href: `/jobs/${j.id}`,
    text: t("att.atVendor", { machine: plate(j), vendor: j.vendorName ?? "?", n: daysBetween(j.sentOutAt ?? j.openedAt, d) }) }));
  // Vendor invoices still to come: a reminder; after 30 days, act now.
  for (const j of invoicesDue) {
    const since = j.closedAt ?? j.backAt ?? j.openedAt, n = daysBetween(since, d);
    (n > 30 ? now : later).push({ sev: n > 30 ? "var(--warn)" : "var(--info)", href: `/jobs/${j.id}#parts`, text: t("att.invoicePending", { machine: plate(j), vendor: j.vendorName ?? "?", n }) });
  }
  open.filter((j) => j.status !== "received" && !(j.outsourced && !j.backAt) && ageLevel(j.status, daysInStatus(j.statusSince)) === "crit")
    .forEach((j) => now.push({ sev: "var(--warn)", text: t("att.stuck", { no: plate(j), n: daysInStatus(j.statusSince), status: statusLabel(t, j.status) }), href: `/jobs/${j.id}` }));
  // Attendance not taken yet on a working day.
  if (can(user.role, "job.assign") && !attToday.length && weekday(d) !== 6 && !holToday.size) now.push({ sev: "var(--info)", text: t("att.notTaken"), href: "/team/attendance" });
  for (const a of purchasing) (a.now ? now : later).push(a);
  events.filter((e) => isLate(e, d)).forEach((e) => now.push({ sev: "var(--warn)", text: t("att.eventLate", { what: eventTitle(e), date: fmtDate(e.endDay ?? e.day, false, locale) }), href: `/calendar/event/${e.id}` }));
  // Machine services: overdue → act now; due within two weeks → reminder.
  for (const r of services) {
    const over = r.s.nextDue! < d;
    if (!over && r.s.nextDue! > addDays(d, 14)) continue;
    (over ? now : later).push({ sev: over ? "var(--crit)" : "var(--warn)", href: `/machinery/${r.s.unitId}#services`,
      text: t(over ? "att.serviceOverdue" : "att.serviceDue", { machine: r.plateNo || `${r.make} ${r.model}`, service: itemLabel(t, "service_item", r.s.item), date: fmtDate(r.s.nextDue, false, locale) }) });
  }
  fu.forEach((f) => later.push({ sev: "var(--info)", text: t("att.followUp", { no: f.jobNo, note: (f.note ?? "").slice(0, 80), date: fmtDate(f.date, false, locale) }), href: `/jobs/${f.id}#writeup` }));
  units.filter((u) => u.arrivedAt && daysBetween(u.arrivedAt, d) > 30).forEach((u) => later.push({ sev: "var(--warn)", text: t("att.longStay", { serial: unitRef(u), n: daysBetween(u.arrivedAt!, d) }), href: `/machinery/${u.id}` }));
  certs.filter((c) => c.expiry && daysBetween(d, c.expiry) < 45).forEach((c) => {
    const left = daysBetween(d, c.expiry!);
    later.push({ sev: left < 0 ? "var(--crit)" : "var(--warn)", text: t(left < 0 ? "att.certExpired" : "att.certExpires", { name: names.get(c.staffId) ?? "", cert: c.name, date: fmtDate(c.expiry, false, locale) }), href: `/team/${c.staffId}` });
  });
  return { now, later };
}
