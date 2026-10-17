import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { MessageKey } from "@/i18n";
import { hasIdentity, isMachineType, normalisePlate } from "./machine-types";
import { ALLOWED_IMAGE_TYPES, MAX_PHOTO_BYTES, saveFile } from "./storage";

/** Saving a machine from one form: the company and the model library entry are created on the way if they are new.
 *  Used by Add machine, Edit machine and New job (new machine). */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const optInt = (f: FormData, k: string) => { const v = str(f, k); return v === "" ? null : Number.isInteger(Number(v)) ? Number(v) : NaN; };
const optDate = (f: FormData, k: string) => { const v = str(f, k); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; };

export type SaveResult = { ok: true; id: number } | { ok: false; error: MessageKey };

/** The photo attached to the form, checked; null when none was chosen. */
async function photoFrom(form: FormData): Promise<{ path: string; type: string } | null | MessageKey> {
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) return null;
  const ext = ALLOWED_IMAGE_TYPES[file.type];
  if (!ext) return "err.mphotoType";
  if (file.size > MAX_PHOTO_BYTES) return "err.mphotoSize";
  return { path: await saveFile("photos", Buffer.from(await file.arrayBuffer()), ext), type: file.type };
}

/** Existing company id, or a new company from the inline fields (customerId = "new"). */
async function companyId(tx: Tx, form: FormData): Promise<number | MessageKey> {
  const raw = str(form, "customerId");
  if (raw === "new") {
    const name = str(form, "newCompanyName");
    if (!name) return "err.companyName";
    const [same] = await tx.select({ id: schema.customers.id }).from(schema.customers).where(sql`lower(${schema.customers.name}) = lower(${name})`);
    if (same) return same.id;
    const [row] = await tx.insert(schema.customers).values({ name, contactName: str(form, "newCompanyContact") || null, phone: str(form, "newCompanyPhone") || null })
      .returning({ id: schema.customers.id });
    return row.id;
  }
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return "err.unitModelOwner";
  const [c] = await tx.select({ id: schema.customers.id }).from(schema.customers).where(eq(schema.customers.id, id));
  return c ? c.id : "err.unitModelOwner";
}

/** Model library entry for make + model (matched ignoring case), created if it is new. */
async function modelId(tx: Tx, make: string, model: string, type: string): Promise<number> {
  const M = schema.machineModels;
  const [m] = await tx.select({ id: M.id }).from(M).where(and(sql`lower(${M.make}) = lower(${make})`, sql`lower(${M.model}) = lower(${model})`));
  if (m) return m.id;
  const [row] = await tx.insert(M).values({ make, model, type }).returning({ id: M.id });
  return row.id;
}

/** Create (no unitId) or update a machine from the machine fields. `full` forms also carry location, dates and notes. */
export async function saveMachine(form: FormData, opts: { unitId?: number; full?: boolean } = {}): Promise<SaveResult> {
  const category = str(form, "machineType");
  const make = str(form, "make"), model = str(form, "model");
  const plateNo = str(form, "plateNo") ? normalisePlate(str(form, "plateNo")) : null;
  const serialNo = str(form, "serialNo") || null;
  const year = optInt(form, "year"), hourMeter = optInt(form, "hourMeter");
  if (!isMachineType(category)) return { ok: false, error: "err.machineType" };
  if (!make || !model) return { ok: false, error: "err.unitModelOwner" };
  if (!hasIdentity({ plateNo, serialNo })) return { ok: false, error: "err.plateOrSerial" };
  if (Number.isNaN(year) || Number.isNaN(hourMeter) || (hourMeter ?? 0) < 0) return { ok: false, error: "err.yearHm" };

  const photo = await photoFrom(form);
  if (typeof photo === "string") return { ok: false, error: photo };

  return db.transaction(async (tx): Promise<SaveResult> => {
    const customerId = await companyId(tx, form);
    if (typeof customerId === "string") return { ok: false, error: customerId };
    const U = schema.machineUnits;
    if (plateNo) {
      const [dup] = await tx.select({ id: U.id }).from(U).where(eq(U.plateNo, plateNo));
      if (dup && dup.id !== opts.unitId) return { ok: false, error: "err.plateTaken" };
    }
    const values = {
      category, modelId: await modelId(tx, make, model, category), customerId, plateNo, serialNo,
      engineNo: str(form, "engineNo") || null, engineModel: str(form, "engineModel") || null,
      transmissionModel: str(form, "transmissionModel") || null, pumpModel: str(form, "pumpModel") || null, year,
      ...(hourMeter !== null ? { hourMeter } : {}),
      ...(opts.full ? {
        location: str(form, "location") || "Customer site", arrivedAt: optDate(form, "arrivedAt"),
        nextServiceDate: optDate(form, "nextServiceDate"), nextServiceType: str(form, "nextServiceType") || null, notes: str(form, "notes") || null,
      } : {}),
      ...(photo ? { photoPath: photo.path, photoType: photo.type } : {}),
    };
    if (opts.unitId) {
      await tx.update(U).set(values).where(eq(U.id, opts.unitId));
      return { ok: true, id: opts.unitId };
    }
    const [row] = await tx.insert(U).values(values).returning({ id: U.id });
    return { ok: true, id: row.id };
  });
}
