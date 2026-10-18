"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { nextJobNo } from "@/lib/jobs";
import { today } from "@/lib/format";
import { ALLOWED_IMAGE_TYPES, MAX_PHOTO_BYTES, saveFile } from "@/lib/storage";
import { addActivity } from "@/lib/queries";
import { notifyRoles } from "@/lib/notify";
import { isLocale, translator, type Locale, type MessageKey } from "@/i18n";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
/** A sticker can raise at most this many reports an hour (stops a stolen or prank sticker flooding the list). */
const PER_HOUR = 5;

/** Fault report from the machine's QR sticker. No sign-in: the sticker's secret token identifies the machine. */
export async function submitFault(form: FormData) {
  const token = str(form, "token"), lang: Locale = isLocale(str(form, "lang")) ? (str(form, "lang") as Locale) : "ms";
  const back = (error: MessageKey): never => redirect(`/r/${encodeURIComponent(token)}?lang=${lang}&error=${encodeURIComponent(translator(lang)(error))}`);
  if (!/^[0-9a-f]{20}$/.test(token)) redirect("/");
  const [unit] = await db.select({ id: schema.machineUnits.id, plate: schema.machineUnits.plateNo, serial: schema.machineUnits.serialNo, hm: schema.machineUnits.hourMeter })
    .from(schema.machineUnits).where(eq(schema.machineUnits.reportToken, token));
  if (!unit) redirect("/");
  const name = str(form, "name").slice(0, 80), phone = str(form, "phone").slice(0, 30), what = str(form, "what").slice(0, 2000);
  const down = str(form, "canWork") === "no";
  if (!name || !what) back("fr.err.fields");
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 4);
  if (files.some((f) => !ALLOWED_IMAGE_TYPES[f.type] || f.size > MAX_PHOTO_BYTES)) back("fr.err.photo");
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.jobs)
    .where(and(eq(schema.jobs.unitId, unit.id), eq(schema.jobs.source, "qr"), gte(schema.jobs.createdAt, new Date(Date.now() - 3600_000))));
  if (n >= PER_HOUR) back("fr.err.tooMany");

  const d = today();
  const { id, jobNo } = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(4201)`);
    const existing = await tx.select({ no: schema.jobs.jobNo }).from(schema.jobs).where(sql`${schema.jobs.jobNo} like ${`J-${d.slice(0, 4)}-%`}`);
    const jobNo = nextJobNo(Number(d.slice(0, 4)), existing.map((r) => r.no));
    const [row] = await tx.insert(schema.jobs).values({
      jobNo, category: down ? "EMG" : "MINOR", priority: down ? "high" : "normal", status: "received", unitId: unit.id,
      siteType: "workshop", siteLocation: "", complaint: what, reportedBy: phone ? `${name} (${phone})` : name,
      hourMeterIn: unit.hm || null, openedAt: d, source: "qr",
    }).returning({ id: schema.jobs.id });
    return { id: row.id, jobNo };
  });
  for (const f of files) {
    const path = await saveFile("photos", Buffer.from(await f.arrayBuffer()), ALLOWED_IMAGE_TYPES[f.type]);
    await db.insert(schema.jobPhotos).values({ jobId: id, stage: "before", caption: name, path, contentType: f.type });
  }
  await addActivity(id, null, "act.faultReport", { name, machine: unit.plate || unit.serial || "" });
  await notifyRoles(["boss", "supervisor"], { key: down ? "nt.faultDown" : "nt.fault", vars: { machine: unit.plate || unit.serial || "", name }, url: `/jobs/${id}`, urgent: down });
  revalidatePath("/jobs");
  redirect(`/r/${token}?lang=${lang}&done=${encodeURIComponent(jobNo)}`);
}
