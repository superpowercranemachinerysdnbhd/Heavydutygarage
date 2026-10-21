import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { mergeLists, setLists, type Lists, type Settings } from "./lists";

const NUM_KEYS = ["labourRate", "poApprovalLimit", "jobPurchaseMarkup", "otMultiplier", "sundayMultiplier"] as const;

/** Read the Head Manager's list changes and settings and make them current for this server process. */
export async function loadLists(): Promise<Lists> {
  const [rows, sets] = await Promise.all([db.select().from(schema.listItems), db.select().from(schema.appSettings)]);
  const settings: Partial<Settings> = {};
  for (const s of sets) {
    if ((NUM_KEYS as readonly string[]).includes(s.key)) { const n = Number(s.value); if (Number.isFinite(n) && n >= 0) (settings as Record<string, number>)[s.key] = n; }
    else if (["companyName", "companyAddress", "companyPhone", "companyReg"].includes(s.key)) (settings as Record<string, string>)[s.key] = s.value;
  }
  const merged = mergeLists(rows.map(({ list, code, label, grp, color, priority, num, sort, active }) => ({ list, code, label, grp, color, priority, num, sort, active })), settings);
  setLists(merged);
  return merged;
}

/** Load once per process: at start-up (instrumentation.ts) or on first use. Settings changes reload straight away. */
export async function ensureLists(): Promise<Lists> {
  return (globalThis as unknown as { __hwLists?: Lists }).__hwLists ?? loadLists();
}

/** How many records use an entry, so the page can say whether hiding it affects anything. */
export async function usageCounts(): Promise<Record<string, number>> {
  const [cats, types, bays] = await Promise.all([
    db.select({ k: schema.jobs.category, n: sql<number>`count(*)` }).from(schema.jobs).groupBy(schema.jobs.category),
    db.select({ k: schema.machineUnits.category, n: sql<number>`count(*)` }).from(schema.machineUnits).groupBy(schema.machineUnits.category),
    db.select({ k: schema.jobs.siteLocation, n: sql<number>`count(*)` }).from(schema.jobs).where(and(eq(schema.jobs.siteType, "workshop"), sql`${schema.jobs.status} <> 'closed'`)).groupBy(schema.jobs.siteLocation),
  ]);
  const out: Record<string, number> = {};
  for (const r of cats) out[`job_category:${r.k}`] = Number(r.n);
  for (const r of types) if (r.k) out[`machine_type:${r.k}`] = Number(r.n);
  for (const r of bays) out[`bay:${r.k}`] = Number(r.n);
  return out;
}
