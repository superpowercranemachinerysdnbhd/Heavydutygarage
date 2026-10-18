import "server-only";
import webpush from "web-push";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Role } from "./permissions";
import { isLocale, translator, type MessageKey, type Vars } from "@/i18n";

/** Phone notifications (Web Push). The signing keys are made once and kept in app_settings, so nothing has to be set
 *  up on the server. Sending never blocks or breaks the action that triggered it. */

export type Note = { key: MessageKey; vars?: Vars; url: string; urgent?: boolean };

let keys: { publicKey: string; privateKey: string } | null = null;
export async function vapidKeys() {
  if (keys) return keys;
  const S = schema.appSettings;
  const read = async () => Object.fromEntries((await db.select().from(S).where(inArray(S.key, ["vapidPublic", "vapidPrivate"]))).map((r) => [r.key, r.value]));
  let k = await read();
  if (!k.vapidPublic || !k.vapidPrivate) {
    const g = webpush.generateVAPIDKeys();
    await db.insert(S).values([{ key: "vapidPublic", value: g.publicKey }, { key: "vapidPrivate", value: g.privateKey }]).onConflictDoNothing();
    k = await read();
  }
  keys = { publicKey: k.vapidPublic, privateKey: k.vapidPrivate };
  return keys;
}

/** 22:00–07:00 Malaysia time: only urgent notifications (breakdowns, emergencies) go out. */
function quietNow(): boolean {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", hour12: false }).format(new Date()));
  return h >= 22 || h < 7;
}

export async function notifyStaff(staffIds: number[], note: Note, exceptId?: number) {
  const ids = [...new Set(staffIds)].filter((id) => id && id !== exceptId);
  if (!ids.length || (!note.urgent && quietNow())) return;
  try {
    const k = await vapidKeys();
    const P = schema.pushSubscriptions;
    const subs = await db.select({ id: P.id, endpoint: P.endpoint, p256dh: P.p256dh, auth: P.auth, locale: schema.staff.locale })
      .from(P).innerJoin(schema.staff, eq(P.staffId, schema.staff.id)).where(and(inArray(P.staffId, ids), eq(schema.staff.active, true)));
    const sends = subs.map(async (s) => {
      const t = translator(isLocale(s.locale) ? s.locale : "en");
      const payload = JSON.stringify({ title: t("app.name"), body: t(note.key, note.vars), url: note.url, tag: note.url });
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload,
          { TTL: note.urgent ? 6 * 3600 : 3600, urgency: note.urgent ? "high" : "normal", vapidDetails: { subject: "mailto:admin@heavyworksgarage.com", ...k } });
      } catch (e) {
        // The device unsubscribed or the browser dropped the subscription: forget it.
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.delete(P).where(eq(P.id, s.id));
      }
    });
    await Promise.race([Promise.allSettled(sends), new Promise((r) => setTimeout(r, 4000))]);
  } catch { /* notifications are best-effort */ }
}

export async function notifyRoles(roles: Role[], note: Note, exceptId?: number) {
  const rows = await db.select({ id: schema.staff.id }).from(schema.staff).where(and(inArray(schema.staff.role, roles), eq(schema.staff.active, true)));
  await notifyStaff(rows.map((r) => r.id), note, exceptId);
}

/** A new chat message: direct → the other person; work order chat → its lead, team and supervisors. Team chat: none. */
export async function notifyChat(threadId: number, senderId: number, senderName: string, preview: string) {
  const T = schema.chatThreads;
  const [th] = await db.select().from(T).where(eq(T.id, threadId));
  if (!th || th.kind === "team") return;
  const text = preview.length > 80 ? `${preview.slice(0, 77)}…` : preview || "📷";
  if (th.kind === "direct") {
    const m = await db.select({ id: schema.chatMembers.staffId }).from(schema.chatMembers).where(and(eq(schema.chatMembers.threadId, threadId), ne(schema.chatMembers.staffId, senderId)));
    return notifyStaff(m.map((x) => x.id), { key: "nt.chatDirect", vars: { name: senderName, text }, url: `/chat?t=${threadId}` }, senderId);
  }
  const [j] = await db.select({ id: schema.jobs.id, leadId: schema.jobs.leadId, plate: schema.machineUnits.plateNo, serial: schema.machineUnits.serialNo })
    .from(schema.jobs).innerJoin(schema.machineUnits, eq(schema.jobs.unitId, schema.machineUnits.id)).where(eq(schema.jobs.id, th.jobId!));
  if (!j) return;
  const team = (await db.select({ id: schema.jobTeam.staffId }).from(schema.jobTeam).where(eq(schema.jobTeam.jobId, j.id))).map((x) => x.id);
  const sups = (await db.select({ id: schema.staff.id }).from(schema.staff).where(and(eq(schema.staff.role, "supervisor"), eq(schema.staff.active, true)))).map((x) => x.id);
  await notifyStaff([...(j.leadId ? [j.leadId] : []), ...team, ...sups], { key: "nt.chatJob", vars: { machine: j.plate || j.serial || "", name: senderName, text }, url: `/jobs/${j.id}#chat` }, senderId);
}

/** "BKE 8821" for a work order: how people refer to it. */
export async function jobMachine(jobId: number): Promise<string> {
  const [j] = await db.select({ plate: schema.machineUnits.plateNo, serial: schema.machineUnits.serialNo, make: schema.machineModels.make, model: schema.machineModels.model })
    .from(schema.jobs).innerJoin(schema.machineUnits, eq(schema.jobs.unitId, schema.machineUnits.id)).innerJoin(schema.machineModels, eq(schema.machineUnits.modelId, schema.machineModels.id))
    .where(eq(schema.jobs.id, jobId));
  return j ? j.plate || j.serial || `${j.make} ${j.model}` : "";
}
