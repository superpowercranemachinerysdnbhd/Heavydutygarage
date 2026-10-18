import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { excelDate, readXlsx, records } from "./xlsx";
import { WO_CATEGORIES, guessMachineType, looksLikePlate, num, partCategory, teamRole, woCategory, woPriority, woStatus } from "./appsheet-map";
import { normalisePlate } from "./machine-types";
import { sellFromMarkup } from "./stock";
import { today } from "./format";
import { loadLists } from "./lists-server";

/** One-time import of an AppSheet "CMMC" workbook (work orders, assets, labour, bills, parts, suppliers, team).
 *  Safe to run again: everything is matched first (machines by plate, staff and suppliers by name, parts by part
 *  number, work orders by their AppSheet number) and only what is missing is added. */

export const OWN_FLEET = "Superpower Crane Machinery Sdn Bhd";
export const CUSTOMER_MACHINES = "Customer machines";
const VENDOR_HINT = /supply|tyre|tire|hose|spray|mobile|enterprise|sdn|bhd|trading|workshop/i;
/** Outsourced team rows (or ones named like a business) are vendors, not staff. */
const isVendor = (r: Record<string, string>) => /out ?source/i.test(r["CATEGORY"] ?? "") || (!/in ?house/i.test(r["CATEGORY"] ?? "") && VENDOR_HINT.test(r["TECHNICIAN"]));

export type AppSheetData = ReturnType<typeof parseAppSheet>;

export function parseAppSheet(buf: Buffer) {
  const s = readXlsx(buf);
  if (!s["WORK ORDER"] || !s["ASSETS"]) throw new Error("missing-tabs");
  const team = records(s["TEAM"]);
  return {
    workOrders: records(s["WORK ORDER"]).filter((r) => r["WO#"]),
    assets: records(s["ASSETS"]).filter((r) => r["MACHINERY ID"]),
    labour: records(s["LABOR"]).filter((r) => r["WORKORDER ID"] && r["EMPLOYEE NAME"] && num(r["HOURS WORKED"]) > 0),
    bills: records(s["Bills"]).filter((r) => r["WORK ORDER ID"] && num(r["AMOUNT"]) > 0),
    usedParts: records(s["USED PARTS"]).filter((r) => r["WORK ORDER ID"] && r["PART ID"] && num(r["QUANTITY USED"]) > 0),
    parts: records(s["PARTS & INVENTORY"]).filter((r) => r["PART NAME"]),
    suppliers: records(s["SUPLLIER LIST"] ?? s["SUPPLIER LIST"]).filter((r) => r["Supplier Name"]),
    staff: team.filter((r) => r["TECHNICIAN"] && !isVendor(r)),
    vendors: team.filter((r) => r["TECHNICIAN"] && isVendor(r)).map((r) => r["TECHNICIAN"]),
    pm: records(s["PREVENTATIVE MAINTENANCE"]).filter((r) => r["ASSETS"]),
    hq: records(s["LOCATION"])[0]?.["ADDRESS"] ?? "",
  };
}

const lower = (s: string) => s.trim().toLowerCase();
/** Part number as stored (the part number column is 60 characters; the full name stays in the description). */
const skuOf = (name: string) => name.trim().slice(0, 60);
const woNo = (id: string) => `AS-${id.trim().toUpperCase()}`.slice(0, 20);
const assetKey = (id: string) => (looksLikePlate(id) ? normalisePlate(id) : id.trim());

/** What the import would add, compared with what is already in the app. */
export async function previewImport(d: AppSheetData) {
  const [units, staff, sups, parts, jobs] = await Promise.all([
    db.select({ plate: schema.machineUnits.plateNo, serial: schema.machineUnits.serialNo }).from(schema.machineUnits),
    db.select({ name: schema.staff.name }).from(schema.staff),
    db.select({ name: schema.suppliers.name }).from(schema.suppliers),
    db.select({ sku: schema.parts.sku }).from(schema.parts),
    db.select({ no: schema.jobs.jobNo }).from(schema.jobs).where(sql`${schema.jobs.jobNo} like 'AS-%'`),
  ]);
  const have = (list: (string | null)[], v: string) => list.some((x) => x && lower(x) === lower(v));
  const assetIds = [...new Set([...d.assets.map((a) => a["MACHINERY ID"]), ...d.workOrders.map((w) => w["ASSET"]).filter(Boolean)])];
  const machinesExisting = assetIds.filter((id) => have(units.map((u) => u.plate), assetKey(id)) || have(units.map((u) => u.serial), id));
  const staffExisting = d.staff.filter((r) => have(staff.map((x) => x.name), r["TECHNICIAN"]));
  const known = new Set([...d.staff.map((r) => lower(r["TECHNICIAN"])), ...staff.map((x) => lower(x.name))]);
  const names = [...new Set(d.workOrders.flatMap((w) => [w["PRIMARY TECHNICIAN"], w["SECONDARY TECHNICIAN"]]).filter(Boolean))];
  const wosDone = new Set(jobs.map((j) => j.no));
  const isNew = (id: string) => !wosDone.has(woNo(id));
  const uniq = (xs: string[]) => [...new Map(xs.map((x) => [lower(x), x])).values()];
  const partNames = uniq(d.parts.map((r) => skuOf(r["PART NAME"]))), supNames = uniq(d.suppliers.map((r) => r["Supplier Name"]));
  return {
    machines: { total: assetIds.length, existing: machinesExisting.length },
    workOrders: { total: d.workOrders.length, existing: d.workOrders.filter((w) => wosDone.has(woNo(w["WO#"]))).length,
      open: d.workOrders.filter((w) => woStatus(w["STATUS"], !!w["END DATE"]).status !== "closed").length },
    staff: { total: d.staff.length, existing: staffExisting.length },
    suppliers: { total: supNames.length, existing: supNames.filter((x) => have(sups.map((s) => s.name), x)).length },
    parts: { total: partNames.length, existing: partNames.filter((x) => have(parts.map((p) => p.sku), x)).length },
    labour: d.labour.filter((r) => isNew(r["WORKORDER ID"])).length, bills: d.bills.filter((r) => isNew(r["WORK ORDER ID"])).length,
    usedParts: d.usedParts.filter((r) => isNew(r["WORK ORDER ID"])).length, services: d.workOrders.some((w) => isNew(w["WO#"])) ? d.pm.length : 0,
    vendors: names.filter((n) => !known.has(lower(n))),
  };
}

export type ImportResult = Record<"machines" | "companies" | "staff" | "suppliers" | "parts" | "workOrders" | "labour" | "bills" | "usedParts" | "services" | "skipped", number>;

/** ownerId: an existing company to own the fleet; otherwise OWN_FLEET is found or created. */
export async function applyImport(d: AppSheetData, userId: number, ownerId?: number): Promise<ImportResult> {
  const n: ImportResult = { machines: 0, companies: 0, staff: 0, suppliers: 0, parts: 0, workOrders: 0, labour: 0, bills: 0, usedParts: 0, services: 0, skipped: 0 };
  const result = await db.transaction(async (tx) => {
    const S = schema;
    /* ---- work order categories that have no built-in match ---- */
    const cats = await tx.select({ code: S.listItems.code }).from(S.listItems).where(eq(S.listItems.list, "job_category"));
    let sort = 100;
    for (const c of Object.values(WO_CATEGORIES)) {
      if (!c.label || cats.some((x) => x.code === c.code)) continue;
      await tx.insert(S.listItems).values({ list: "job_category", code: c.code, label: c.label, color: c.color, priority: c.priority, num: 0, sort: sort++, active: true, updatedBy: userId }).onConflictDoNothing();
    }

    /* ---- companies ---- */
    const company = async (name: string) => {
      const [c] = await tx.select({ id: S.customers.id }).from(S.customers).where(sql`lower(${S.customers.name}) = ${lower(name)}`);
      if (c) return c.id;
      n.companies++;
      return (await tx.insert(S.customers).values({ name, address: name === OWN_FLEET ? d.hq || null : null, notes: "Added by the AppSheet import." }).returning({ id: S.customers.id }))[0].id;
    };
    const [owner] = ownerId ? await tx.select({ id: S.customers.id }).from(S.customers).where(eq(S.customers.id, ownerId)) : [];
    const ownId = owner?.id ?? await company(OWN_FLEET);

    /* ---- machines ---- */
    const units = await tx.select({ id: S.machineUnits.id, plate: S.machineUnits.plateNo, serial: S.machineUnits.serialNo }).from(S.machineUnits);
    const unitByAsset = new Map<string, number>();
    const modelId = async (make: string, model: string, type: string) => {
      const M = S.machineModels;
      const [m] = await tx.select({ id: M.id }).from(M).where(and(sql`lower(${M.make}) = ${lower(make)}`, sql`lower(${M.model}) = ${lower(model)}`));
      return m ? m.id : (await tx.insert(M).values({ make, model, type }).returning({ id: M.id }))[0].id;
    };
    const ensureUnit = async (assetId: string, a?: Record<string, string>) => {
      const key = assetKey(assetId);
      if (unitByAsset.has(lower(key))) return unitByAsset.get(lower(key))!;
      const found = units.find((u) => (u.plate && lower(u.plate) === lower(key)) || (u.serial && lower(u.serial) === lower(assetId.trim())));
      if (found) { unitByAsset.set(lower(key), found.id); return found.id; }
      const isCustomer = lower(assetId) === "customer";
      const forklift = /forklift/i.test(assetId);
      const make = (a?.["MANUFACTURER"] || (forklift ? assetId.split(" ")[0] : isCustomer ? "Various" : "Unknown")).replace(/\b\w/g, (ch) => ch.toUpperCase()).replace(/\B\w+/g, (w) => w.toLowerCase());
      const model = a?.["MODEL"] || (isCustomer ? "Customer machine" : forklift ? assetId.replace(/^\S+\s*/, "") : "Unknown model");
      const type = guessMachineType(a?.["MANUFACTURER"] ?? "", a?.["MODEL"] ?? "", assetId);
      const plate = looksLikePlate(assetId) ? normalisePlate(assetId) : null;
      const serial = a?.["SERIAL NUMBER"] || (plate ? null : assetId.trim());
      const year = Number((excelDate(a?.["YEAR MADE"] ?? "") ?? "").slice(0, 4));
      const notes = [a?.["DESCRIPTION"], a?.["STATUS"] && a["STATUS"].toUpperCase() !== "OPERATIONAL" ? `AppSheet status: ${a["STATUS"]}` : "", "Added by the AppSheet import."].filter(Boolean).join("\n");
      const [u] = await tx.insert(S.machineUnits).values({
        modelId: await modelId(make, model, type), customerId: isCustomer ? await company(CUSTOMER_MACHINES) : ownId, category: type,
        plateNo: plate, serialNo: serial, engineNo: a?.["ENGINE NUMBER"] || null, year: year && year < 2025 ? year : null, location: "Own yard", notes,
      }).returning({ id: S.machineUnits.id });
      n.machines++;
      unitByAsset.set(lower(key), u.id);
      return u.id;
    };
    for (const a of d.assets) await ensureUnit(a["MACHINERY ID"], a);

    /* ---- staff (no login until the Head Manager adds a phone number) ---- */
    const staffRows = await tx.select({ id: S.staff.id, name: S.staff.name }).from(S.staff);
    const staffByName = new Map(staffRows.map((s) => [lower(s.name), s.id]));
    const [sup] = await tx.select({ id: S.staff.id }).from(S.staff).where(eq(S.staff.role, "supervisor")).limit(1);
    for (const t of d.staff) {
      if (staffByName.has(lower(t["TECHNICIAN"]))) continue;
      const [s] = await tx.insert(S.staff).values({
        name: t["TECHNICIAN"], role: teamRole(t["TYPES OF TECHNICIAN"] ?? ""), reportsTo: sup?.id ?? null,
        phone: `no-login-${randomBytes(4).toString("hex")}`, payRate: String(num(t["HOURLY RATE"] ?? "")), passwordHash: null,
        skills: t["TYPES OF TECHNICIAN"] ? [t["TYPES OF TECHNICIAN"]] : [],
      }).returning({ id: S.staff.id });
      staffByName.set(lower(t["TECHNICIAN"]), s.id);
      n.staff++;
    }

    /* ---- suppliers ---- */
    const supRows = await tx.select({ id: S.suppliers.id, name: S.suppliers.name }).from(S.suppliers);
    const supByName = new Map(supRows.map((s) => [lower(s.name), s.id]));
    const supById = new Map<string, { id: number; name: string }>();
    for (const r of d.suppliers) {
      const name = r["Supplier Name"].slice(0, 160);
      let id = supByName.get(lower(name));
      if (!id) {
        id = (await tx.insert(S.suppliers).values({ name, notes: r["Category"] ? `Category: ${r["Category"]}` : null }).returning({ id: S.suppliers.id }))[0].id;
        supByName.set(lower(name), id);
        n.suppliers++;
      }
      supById.set(r["Supplier ID"], { id, name });
    }

    /* ---- parts ---- */
    const catRows = await tx.select({ id: S.partCategories.id, name: S.partCategories.name, markup: S.partCategories.markupPct }).from(S.partCategories);
    const catId = async (name: string) => {
      const c = catRows.find((x) => lower(x.name) === lower(name));
      if (c) return c;
      const [row] = await tx.insert(S.partCategories).values({ name }).returning({ id: S.partCategories.id, name: S.partCategories.name, markup: S.partCategories.markupPct });
      catRows.push(row);
      return row;
    };
    const partRows = await tx.select({ id: S.parts.id, sku: S.parts.sku, avg: S.parts.avgCost, sell: S.parts.sellPrice }).from(S.parts);
    const partByAs = new Map<string, { id: number; cost: number; sell: number }>();
    for (const r of d.parts) {
      const sku = skuOf(r["PART NAME"]);
      const ex = partRows.find((p) => lower(p.sku) === lower(sku));
      if (ex) { partByAs.set(r["PART ID #"], { id: ex.id, cost: Number(ex.avg), sell: Number(ex.sell) }); continue; }
      const cat = await catId(partCategory(r["CATEGORY"] ?? ""));
      const cost = num(r["COST"] ?? "");
      const sell = sellFromMarkup(cost, Number(cat.markup));
      const notes = [r["TAGS"] ? `Fits: ${r["TAGS"]}` : "", r["BARCODE"] ? `Barcode: ${r["BARCODE"]}` : "", "Added by the AppSheet import."].filter(Boolean).join("\n");
      const [p] = await tx.insert(S.parts).values({
        sku, oemPartNo: sku, description: (r["DESCRIPTION"] || r["PART NAME"]).slice(0, 200), categoryId: cat.id, fitsAll: true,
        onHand: String(num(r["STOCK LEVEL"] ?? "")), minLevel: String(num(r["MIN QTY"] ?? "")), avgCost: String(cost), lastCost: cost ? String(cost) : null,
        sellPrice: String(sell), notes,
      }).returning({ id: S.parts.id });
      partByAs.set(r["PART ID #"], { id: p.id, cost, sell });
      partRows.push({ id: p.id, sku, avg: String(cost), sell: String(sell) });
      const sup = supById.get(r["SUPPLIER"] ?? "");
      if (sup && cost) await tx.insert(S.supplierPrices).values({ partId: p.id, supplierId: sup.id, price: String(cost), priceDate: today(), source: "import", createdBy: userId });
      n.parts++;
    }

    /* ---- work orders ---- */
    const done = new Set((await tx.select({ no: S.jobs.jobNo }).from(S.jobs).where(sql`${S.jobs.jobNo} like 'AS-%'`)).map((j) => j.no));
    const jobByWo = new Map<string, { id: number; leadId: number | null; day: string }>();
    for (const w of d.workOrders) {
      const no = woNo(w["WO#"]);
      if (done.has(no)) { n.skipped++; continue; }
      const opened = excelDate(w["REPORT DATE"]) ?? excelDate(w["START DATE"]) ?? today();
      const end = excelDate(w["END DATE"]);
      const { status, cancelled } = woStatus(w["STATUS"], !!end);
      const closed = status === "closed" ? end ?? excelDate(w["START DATE"]) ?? opened : null;
      const lead = staffByName.get(lower(w["PRIMARY TECHNICIAN"] ?? "")) ?? null;
      const second = staffByName.get(lower(w["SECONDARY TECHNICIAN"] ?? "")) ?? null;
      const outsourced = [w["PRIMARY TECHNICIAN"], w["SECONDARY TECHNICIAN"]].filter((x) => x && !staffByName.has(lower(x)));
      const loc = (w["LOCATION"] ?? "").trim();
      const field = loc.length > 3 && (loc.includes(",") || VENDOR_HINT.test(loc) || / /.test(loc));
      const workDone = [cancelled ? "CANCELLED — not carried out." : "", w["REPAIR ACTIONS TAKEN"], outsourced.length ? `Outsourced to: ${outsourced.join(", ")}` : ""].filter(Boolean).join("\n");
      const followUp = [w["REMARKS"], w["PO"] ? `Supplier refs: ${w["PO"]}` : "", w["TASKS & CHECKLIST"]].filter(Boolean).join("\n") || null;
      const [j] = await tx.insert(S.jobs).values({
        jobNo: no, category: woCategory(w["CATEGORY"] ?? ""), priority: woPriority(w["PRIORITY"] ?? ""), status,
        statusSince: new Date(`${closed ?? opened}T09:00:00+08:00`), unitId: await ensureUnit(w["ASSET"] || "Unknown"),
        siteType: field ? "field" : "workshop", siteLocation: field ? loc.slice(0, 200) : loc === "GDS" ? "GDS" : "",
        complaint: [w["WORK ORDER TITLE"], w["DESCRIPTION"]].filter(Boolean).join("\n") || "(no description)", reportedBy: w["REQUESTED BY:"] || null,
        workDone, followUp, leadId: lead, openedAt: opened, closedAt: closed, createdBy: userId,
      }).returning({ id: S.jobs.id });
      if (second && second !== lead) await tx.insert(S.jobTeam).values({ jobId: j.id, staffId: second }).onConflictDoNothing();
      jobByWo.set(w["WO#"], { id: j.id, leadId: lead, day: excelDate(w["START DATE"]) ?? opened });
      n.workOrders++;
    }

    /* ---- labour, bills, parts used (only for work orders added in this run) ---- */
    for (const l of d.labour) {
      const j = jobByWo.get(l["WORKORDER ID"]); const s = staffByName.get(lower(l["EMPLOYEE NAME"]));
      if (!j || !s) continue;
      await tx.insert(S.labourEntries).values({ jobId: j.id, staffId: s, workDate: j.day, hours: String(num(l["HOURS WORKED"])), note: "AppSheet", loggedBy: userId });
      if (s !== j.leadId) await tx.insert(S.jobTeam).values({ jobId: j.id, staffId: s }).onConflictDoNothing();
      n.labour++;
    }
    for (const b of d.bills) {
      const j = jobByWo.get(b["WORK ORDER ID"]); if (!j) continue;
      const sup = supById.get(b["SUPPLIER NAME"] ?? "");
      const amount = num(b["AMOUNT"]);
      await tx.insert(S.jobPurchases).values({ jobId: j.id, description: (b["DESCRIPTION"] || "Bill").slice(0, 200), supplierId: sup?.id ?? null,
        supplierName: sup?.name ?? (b["SUPPLIER NAME"] || null), qty: "1", unitCost: String(amount), unitPrice: String(amount), purchasedAt: j.day, addedBy: userId, ref: "AppSheet bill" });
      n.bills++;
    }
    for (const u of d.usedParts) {
      const j = jobByWo.get(u["WORK ORDER ID"]); const p = partByAs.get(u["PART ID"]);
      if (!j || !p) continue;
      const cost = num(u["UNIT PRICE"] ?? "") || p.cost;
      await tx.insert(S.jobParts).values({ jobId: j.id, partId: p.id, qty: String(num(u["QUANTITY USED"])), unitCost: String(cost), unitPrice: String(p.sell || cost), issuedBy: userId, issuedAt: new Date(`${j.day}T09:00:00+08:00`) });
      n.usedParts++;
    }

    /* ---- preventive maintenance schedules → machine service schedule ---- */
    for (const pm of d.pm) {
      const unitId = await ensureUnit(pm["ASSETS"]);
      const months = /quart/i.test(`${pm["WORK ORDER TITLE"]} ${pm["CATEGORY"]}`) ? 3 : null;
      const due = excelDate(pm["SCHEDULES"] ?? "");
      const notes = [pm["WORK ORDER TITLE"], pm["DESCRIPTION"]].filter(Boolean).join(" — ");
      const res = await tx.insert(S.machineServices).values({ unitId, item: "engine_oil", intervalMonths: months ?? 3, nextDue: due, notes, updatedBy: userId })
        .onConflictDoNothing().returning({ id: S.machineServices.id });
      n.services += res.length;
    }

    /* ---- workshop address, if not set yet ---- */
    if (d.hq) await tx.insert(S.appSettings).values({ key: "companyAddress", value: d.hq }).onConflictDoNothing();
    return n;
  });
  await loadLists();
  return result;
}


