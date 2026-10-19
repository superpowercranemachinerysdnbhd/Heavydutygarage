"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission, type CurrentUser } from "@/lib/auth";
import { findItem } from "@/lib/lists";
import { ensureLists } from "@/lib/lists-server";
import { isDay } from "@/lib/calendar";
import { addMonths } from "@/lib/service-rules";
import { daysBetween } from "@/lib/format";
import { translator, type MessageKey } from "@/i18n";

const E = schema.calendarEvents;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const optId = (f: FormData, k: string) => { const n = Number(str(f, k)); return Number.isInteger(n) && n > 0 ? n : null; };

function go(user: CurrentUser, path: string, msg: { ok?: MessageKey; error?: MessageKey }): never {
  const t = translator(user.locale);
  revalidatePath("/calendar"); revalidatePath("/");
  const q = msg.error ? `error=${encodeURIComponent(t(msg.error))}` : msg.ok ? `ok=${encodeURIComponent(t(msg.ok))}` : "";
  redirect(`${path}${path.includes("?") ? "&" : "?"}${q}`);
}

/** Create (no id) or update an event from the event form. */
export async function saveEvent(form: FormData) {
  const user = await requirePermission("job.assign");
  await ensureLists();
  const id = optId(form, "id");
  const back = id ? `/calendar/event/${id}` : `/calendar/event/new?day=${str(form, "day")}`;
  const type = str(form, "type"), day = str(form, "day"), endDay = str(form, "endDay") || null;
  const time = /^\d{2}:\d{2}$/.test(str(form, "time")) ? str(form, "time") : null;
  const repeat = Number(str(form, "repeatMonths")) || null;
  if (!findItem("event_type", type)) go(user, back, { error: "ev.err.type" });
  if (!isDay(day)) go(user, back, { error: "ev.err.day" });
  if (endDay && (!isDay(endDay) || endDay < day || daysBetween(day, endDay) > 90)) go(user, back, { error: "ev.err.end" });
  const unitId = optId(form, "unitId");
  let customerId = optId(form, "customerId");
  if (unitId && !customerId) {
    const [u] = await db.select({ c: schema.machineUnits.customerId }).from(schema.machineUnits).where(eq(schema.machineUnits.id, unitId));
    customerId = u?.c ?? null;
  }
  const t = translator("en");
  const title = (str(form, "title") || findItem("event_type", type)?.label || t(`evt.${type}` as MessageKey)).slice(0, 120);
  const values = { type, day, endDay: endDay === day ? null : endDay, time, title, unitId, customerId, notes: str(form, "notes") || null,
    repeatMonths: repeat && [1, 2, 3, 6, 12, 24, 36].includes(repeat) ? repeat : null };
  if (id) {
    await db.update(E).set(values).where(eq(E.id, id));
    go(user, `/calendar?m=${day.slice(0, 7)}`, { ok: "ev.saved" });
  }
  await db.insert(E).values({ ...values, createdBy: user.id });
  go(user, `/calendar?m=${day.slice(0, 7)}`, { ok: "ev.added" });
}

/** Mark done (a repeating event then gets its next date) or not done again. */
export async function toggleEventDone(form: FormData) {
  const user = await requirePermission("job.assign");
  const id = optId(form, "id");
  const [e] = id ? await db.select().from(E).where(eq(E.id, id)) : [];
  if (!e) go(user, "/calendar", { error: "ev.err.notFound" });
  if (e.doneAt) {
    await db.update(E).set({ doneAt: null, doneBy: null }).where(eq(E.id, e.id));
    go(user, `/calendar/event/${e.id}`, { ok: "ev.undone" });
  }
  await db.update(E).set({ doneAt: new Date(), doneBy: user.id }).where(eq(E.id, e.id));
  if (e.repeatMonths) {
    const day = addMonths(e.day, e.repeatMonths);
    const endDay = e.endDay ? addMonths(e.endDay, e.repeatMonths) : null;
    const [dup] = await db.select({ id: E.id }).from(E).where(and(eq(E.type, e.type), eq(E.title, e.title), eq(E.day, day)));
    if (!dup) await db.insert(E).values({ day, endDay, time: e.time, type: e.type, title: e.title, unitId: e.unitId, customerId: e.customerId, notes: e.notes, repeatMonths: e.repeatMonths, createdBy: user.id });
    go(user, `/calendar/event/${e.id}`, { ok: "ev.doneNext" });
  }
  go(user, `/calendar/event/${e.id}`, { ok: "ev.doneOk" });
}

export async function deleteEvent(form: FormData) {
  const user = await requirePermission("job.assign");
  const id = optId(form, "id");
  const [e] = id ? await db.select({ day: E.day }).from(E).where(eq(E.id, id)) : [];
  if (id) await db.delete(E).where(eq(E.id, id));
  go(user, `/calendar?m=${(e?.day ?? "").slice(0, 7)}`, { ok: "ev.deleted" });
}
