/** Load DEMO data for trying the system (staff, customers, machines, jobs).
 *  Refuses to run when staff already exist, so it never mixes with real data.
 *  Every demo login uses the password "demo-pass-1".
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { loadEnv } from "./env";

loadEnv();
const { db, schema, pool } = await import("../src/db/index");
const { hashPassword } = await import("../src/lib/password");
const { qcTemplate } = await import("../src/lib/lists");
const { addDays, today } = await import("../src/lib/format");
const { translator } = await import("../src/i18n/index");
const { sellFromMarkup } = await import("../src/lib/stock");
const { weekDays, planWeekStart } = await import("../src/lib/calendar");
const en = translator("en");

const existing = await db.select({ id: schema.staff.id }).from(schema.staff).limit(1);
if (existing.length) {
  console.error("Staff already exist. Demo data is only loaded into an empty database.");
  await pool.end();
  process.exit(1);
}

const T = today();
const d = (n: number) => addDays(T, n);
const ago = (days: number) => new Date(Date.now() - days * 86400000);
const pw = await hashPassword("demo-pass-1");

const S = async (v: Omit<typeof schema.staff.$inferInsert, "passwordHash">) => (await db.insert(schema.staff).values({ ...v, passwordHash: pw }).returning())[0];
const boss = await S({ name: "Tan Boon Hock", role: "boss", phone: "0120000000", joined: "2009-03-01", skills: ["Business", "Estimating"] });
const sup = await S({ name: "Ahmad Faizal", role: "supervisor", reportsTo: boss.id, phone: "0120000001", joined: "2014-06-15", skills: ["Operations", "Parts & Inventory", "Hydraulics", "QC"], payRate: "38" });
const raj = await S({ name: "Rajesh Kumar", role: "mechanic", reportsTo: sup.id, phone: "0120000002", joined: "2016-01-10", skills: ["Hydraulics", "CAT", "Komatsu", "Field service"], payRate: "28" });
const lim = await S({ name: "Lim Wei Jie", role: "mechanic", reportsTo: sup.id, phone: "0120000003", joined: "2019-08-01", skills: ["Engine", "Electrical", "Diagnostics laptop"], payRate: "26" });
const haf = await S({ name: "Mohd Hafiz", role: "mechanic", reportsTo: sup.id, phone: "0120000004", joined: "2018-04-23", skills: ["Cranes", "Tadano", "Kato"], payRate: "27" });
const sur = await S({ name: "Suresh Muthu", role: "assistant", reportsTo: raj.id, phone: "0120000005", joined: "2023-02-01", skills: ["Servicing", "Hose making"], payRate: "16" });
const azm = await S({ name: "Azman Ismail", role: "fabricator", reportsTo: sup.id, phone: "0120000006", joined: "2015-09-12", skills: ["MIG/MMAW welding", "Hardfacing"], payRate: "24" });
const kum = await S({ name: "Kumaravel", role: "painter", reportsTo: sup.id, phone: "0120000007", joined: "2020-11-02", skills: ["Spray painting", "Sandblasting"], payRate: "20" });
const siti = await S({ name: "Siti Aminah", role: "cleaner", reportsTo: sup.id, phone: "0120000008", joined: "2022-05-16", skills: ["Steam wash", "Degreasing"], payRate: "12" });
await db.insert(schema.certifications).values([
  { staffId: sup.id, name: "CIDB Green Card", expiry: d(46) }, { staffId: raj.id, name: "First Aid", expiry: d(35) },
  { staffId: haf.id, name: "DOSH Crane Operator", expiry: d(14) }, { staffId: azm.id, name: "Welder Cert 3G/4G", expiry: d(-16) },
]);

const C = async (v: typeof schema.customers.$inferInsert) => (await db.insert(schema.customers).values(v).returning())[0];
const bina = await C({ name: "Bina Jaya Construction (demo)", contactName: "Mr. Wong", phone: "03-0000 1111" });
const kuari = await C({ name: "Kuari Selatan Sdn Bhd (demo)", contactName: "En. Rahim", phone: "03-0000 2222" });
const tunas = await C({ name: "Tunas Crane Rental (demo)", contactName: "Ms. Chong", phone: "03-0000 3333" });
const port = await C({ name: "Port Klang Logistics (demo)", contactName: "Mr. Ravi", phone: "03-0000 4444" });

const M = async (v: typeof schema.machineModels.$inferInsert) => (await db.insert(schema.machineModels).values(v).returning())[0];
const cat320 = await M({ make: "Caterpillar", model: "320D2", type: "excavator", specs: { "Operating weight": "20.5 t", Engine: "CAT C7.1", "Engine oil": "15 L" }, serviceIntervals: [250, 500, 1000, 2000] });
const pc200 = await M({ make: "Komatsu", model: "PC200-8", type: "excavator", specs: { "Operating weight": "20 t", Engine: "SAA6D107E-1", "Hydraulic tank": "135 L" }, serviceIntervals: [250, 500, 1000, 2000] });
const zx200 = await M({ make: "Hitachi", model: "ZX200-5G", type: "excavator", specs: { Engine: "Isuzu 4HK1" }, serviceIntervals: [250, 500, 1000, 2000] });
const gr500 = await M({ make: "Tadano", model: "GR-500EX", type: "rough_terrain_crane", specs: { Capacity: "50 t", Boom: "5-section, 42 m" }, serviceIntervals: [250, 500, 1000] });
const l120 = await M({ make: "Volvo", model: "L120H", type: "wheel_loader", specs: { Engine: "Volvo D8J", Bucket: "3.6 m³" }, serviceIntervals: [500, 1000, 2000] });
await db.insert(schema.knownIssues).values([
  { modelId: pc200.id, title: "Main pump not building pressure", fix: "Check PC-EPC solenoid and servo before strip-down. Piston shoe leakage needs the main pump seal kit.", addedBy: raj.id },
  { modelId: gr500.id, title: "Intermittent outrigger fault", fix: "Check proximity sensor and harness at the outrigger beam; water ingress is common.", addedBy: haf.id },
]);

const U = async (v: typeof schema.machineUnits.$inferInsert) => (await db.insert(schema.machineUnits).values(v).returning())[0];
const u1 = await U({ category: "excavator", engineModel: "CAT C7.1", pumpModel: "Kawasaki K5V140", modelId: cat320.id, customerId: bina.id, serialNo: "CAT0320DXKJB01234", year: 2017, hourMeter: 9850, location: "Workshop · Bay 2", arrivedAt: d(-2), nextServiceDate: d(19), nextServiceType: "10,000 hr service" });
const u2 = await U({ category: "excavator", engineModel: "Isuzu 4HK1", modelId: zx200.id, customerId: bina.id, serialNo: "HCMDCD70P00056789", year: 2015, hourMeter: 12430, location: "Workshop · Long-stay yard A", arrivedAt: d(-44) });
const u3 = await U({ category: "excavator", engineModel: "Komatsu SAA6D107E-1", pumpModel: "Komatsu HPV95", modelId: pc200.id, customerId: kuari.id, serialNo: "PC200-8 #350123", year: 2013, hourMeter: 14210, location: "Customer site", nextServiceDate: d(12), nextServiceType: "250 hr service" });
const u4 = await U({ category: "rough_terrain_crane", engineModel: "Mitsubishi 6M60", transmissionModel: "Tadano 3-speed powershift", modelId: gr500.id, customerId: tunas.id, serialNo: "GR-500EX-545678", year: 2018, plateNo: "WXY 1234", hourMeter: 6420, location: "Workshop · Bay 4", arrivedAt: d(-4) });
const u5 = await U({ category: "wheel_loader", engineModel: "Volvo D8J", modelId: l120.id, customerId: port.id, serialNo: "VCE0L120H00013377", year: 2020, hourMeter: 6890, location: "Customer site" });
const kato = await M({ make: "Kato", model: "NK-250E", type: "truck_crane", specs: { Capacity: "25 t" }, serviceIntervals: [250, 500] });
const fd30 = await M({ make: "Toyota", model: "8FD30", type: "forklift", specs: { Capacity: "3 t" }, serviceIntervals: [250, 500] });
const kato1 = await U({ category: "truck_crane", modelId: kato.id, customerId: tunas.id, plateNo: "BKE 8821", year: 2012, hourMeter: 18450, engineModel: "Mitsubishi 8DC9", transmissionModel: "Fuso 6-speed", pumpModel: "KYB KFP2233", location: "Customer site" });
await U({ category: "forklift", modelId: fd30.id, customerId: port.id, serialNo: "8FD30-31842", year: 2019, hourMeter: 4210, engineModel: "Toyota 1DZ-III", location: "Customer site" });

// Service schedule for the Kato truck crane: one overdue, one due soon, the rest fine.
await db.insert(schema.machineServices).values([
  { unitId: kato1.id, item: "engine_oil", intervalMonths: 3, lastDone: d(-100), nextDue: d(-8) },
  { unitId: kato1.id, item: "greasing", intervalMonths: 1, lastDone: d(-20), nextDue: d(10) },
  { unitId: kato1.id, item: "hydraulic_oil", intervalMonths: 12, lastDone: d(-120), nextDue: d(245) },
  { unitId: kato1.id, item: "transmission_oil", intervalMonths: 12, lastDone: d(-200), nextDue: d(165) },
  { unitId: kato1.id, item: "aircon", intervalMonths: 6 },
]);

let n = 0;
async function J(v: Omit<typeof schema.jobs.$inferInsert, "jobNo">, extra: { team?: number[]; tasks?: [string, boolean, number?][]; labour?: [number, number, number][]; qcDone?: number } = {}) {
  const jobNo = `J-${T.slice(0, 4)}-${String(++n).padStart(4, "0")}`;
  const [job] = await db.insert(schema.jobs).values({ ...v, jobNo, createdBy: sup.id }).returning();
  for (const s of extra.team ?? []) await db.insert(schema.jobTeam).values({ jobId: job.id, staffId: s });
  for (const [i, [t, done, who]] of (extra.tasks ?? []).entries()) await db.insert(schema.jobTasks).values({ jobId: job.id, seq: i, description: t, assigneeId: who ?? null, doneAt: done ? ago(1) : null, doneBy: done ? who ?? null : null });
  const qc = qcTemplate(v.category, en);
  await db.insert(schema.jobQc).values(qc.map((q, i) => ({ jobId: job.id, seq: i, ...q, passedAt: i < (extra.qcDone ?? 0) ? ago(1) : null, passedBy: i < (extra.qcDone ?? 0) ? sup.id : null })));
  for (const [s, h, back] of extra.labour ?? []) await db.insert(schema.labourEntries).values({ jobId: job.id, staffId: s, hours: String(h), workDate: d(-back), loggedBy: s });
  const params = { no: jobNo, name: sup.name };
  await db.insert(schema.jobActivity).values({ jobId: job.id, staffId: sup.id, key: "act.created", params, text: en("act.created", params) });
  return job;
}

const old = await J({ category: "MAJOR", status: "closed", unitId: u3.id, siteLocation: "Bay 2", complaint: "Swing motor noisy.", diagnosis: "Swing motor bearing failed; rebuilt.", leadId: raj.id, hourMeterIn: 13980, openedAt: d(-73), dueDate: d(-57), closedAt: d(-58), statusSince: ago(58) }, { labour: [[raj.id, 14, 66]], qcDone: 6 });
await J({ category: "EMG", priority: "critical", status: "received", unitId: u5.id, siteType: "field", siteLocation: "Westport, Pulau Indah", complaint: "Loader overheating and shutting down during container yard work.", reportedBy: "Mr. Ravi", hourMeterIn: 6890, openedAt: T, dueDate: T, statusSince: new Date() });
const pumpJob = await J({ category: "EMG", priority: "critical", status: "in_progress", unitId: u3.id, siteType: "field", siteLocation: "Semenyih quarry, pit 2", complaint: "Boom will not lift, machine weak on all functions.", diagnosis: "Main pump delivery pressure 18 MPa against 34.3 MPa spec. Pilot pressure OK.", leadId: raj.id, hourMeterIn: 14210, openedAt: d(-1), dueDate: d(1), statusSince: ago(1) },
  { team: [sur.id], tasks: [["Travel to site, lock-out / tag-out", true, raj.id], ["Pressure test main and pilot circuits", true, raj.id], ["Replace main pump seal kit", false, raj.id], ["Flush and refill hydraulic oil", false, sur.id], ["Test run and hand over", false, raj.id]], labour: [[raj.id, 6.5, 1], [sur.id, 6.5, 1], [raj.id, 3, 0]] });
const pmJob = await J({ category: "PM", status: "awaiting_parts", unitId: u1.id, siteLocation: "Bay 2", complaint: "Scheduled 500 hr service plus check slow boom up.", diagnosis: "Pilot filter partly blocked. Waiting for oil filters.", leadId: lim.id, hourMeterIn: 9850, openedAt: d(-2), dueDate: d(2), statusSince: ago(1) },
  { team: [sur.id], tasks: [["Take oil samples", true, lim.id], ["Replace engine oil and filters", false, sur.id], ["Replace pilot filter", false, lim.id]], labour: [[lim.id, 2, 2]] });
const diagJob = await J({ category: "DIAG", priority: "high", status: "in_progress", unitId: u4.id, siteLocation: "Bay 4", complaint: "Outrigger interlock fault comes and goes.", diagnosis: "Left front outrigger proximity sensor corroded. Replaced and calibrated.", leadId: haf.id, hourMeterIn: 6420, openedAt: d(-4), dueDate: d(4), statusSince: ago(0) },
  { tasks: [["Read fault history", true, haf.id], ["Harness continuity test", true, haf.id], ["Replace sensor and calibrate", true, haf.id]], labour: [[haf.id, 4, 3], [haf.id, 3, 1]], qcDone: 3 });
await J({ category: "MAJOR", status: "in_progress", unitId: u2.id, siteLocation: "Long-stay yard A", complaint: "Engine knocking, low oil pressure. Customer wants full engine overhaul.", diagnosis: "No. 3 con-rod bearing spun. Crankshaft regrind sublet.", leadId: raj.id, hourMeterIn: 12430, openedAt: d(-44), dueDate: d(14), statusSince: ago(41) },
  { team: [lim.id], tasks: [["Remove engine", true, raj.id], ["Strip and measure", true, lim.id], ["Rebuild engine", false, raj.id]], labour: [[raj.id, 8, 43], [lim.id, 8, 42], [raj.id, 6, 2]] });
const fabJob = await J({ category: "FAB", status: "in_progress", unitId: u2.id, siteLocation: "Fabrication bay", complaint: "Bucket side cutters worn through, base cracked.", leadId: azm.id, hourMeterIn: 12430, openedAt: d(-11), dueDate: d(6), statusSince: ago(10) },
  { tasks: [["Gouge and weld base crack", true, azm.id], ["Fit new side cutters", false, azm.id], ["Hardface wear areas", false, azm.id]], labour: [[azm.id, 7, 8]] });
await J({ category: "WARR", priority: "high", status: "closed", closedAt: d(-1), unitId: u3.id, siteLocation: "Open yard", complaint: "Oil leak at swing motor after repair in August.", diagnosis: "O-ring pinched during last assembly. Replaced under warranty.", leadId: lim.id, hourMeterIn: 14150, openedAt: d(-8), dueDate: d(-1), statusSince: ago(2), parentJobId: old.id },
  { tasks: [["Replace swing motor O-ring", true, lim.id], ["Leak test 1 hr", true, lim.id]], labour: [[lim.id, 3, 7]], qcDone: 6 });
await J({ category: "PAINT", priority: "low", status: "received", unitId: u2.id, siteLocation: "Paint bay", complaint: "Touch-up and repaint boom before return.", leadId: kum.id, hourMeterIn: 12430, openedAt: d(-5), dueDate: d(21), statusSince: ago(4) });
await J({ category: "HYD", priority: "normal", status: "deferred", unitId: kato1.id, siteLocation: "", complaint: "Slight oil seep at boom elevating cylinder rod seal. Crane still working; reseal when it comes back from site.", reportedBy: "Operator Rashide", leadId: null, openedAt: d(-6), dueDate: null, statusSince: ago(6) });

/* ---------- Phase 2 demo: categories, suppliers, parts, prices, purchase orders, stock ---------- */
// The standard categories are already there (migration 0013); demo values are set on them.
const CAT = async (name: string, markup: number, target: number) => (await db.insert(schema.partCategories).values({ name, markupPct: String(markup), targetMarginPct: String(target) })
  .onConflictDoUpdate({ target: schema.partCategories.name, set: { markupPct: String(markup), targetMarginPct: String(target) } }).returning())[0];
const cFilters = await CAT("Filters (oil, fuel, air, hydraulic)", 45, 30), cFluids = await CAT("Oils, grease & lubricants", 35, 22), cSeals = await CAT("Hydraulic seals & seal kits", 40, 25),
  cHoses = await CAT("Hydraulic hoses & fittings", 60, 35), cGet = await CAT("Ground engaging tools (teeth, cutting edges)", 45, 25), cWeld = await CAT("Welding & fabrication materials", 40, 25), cElec = await CAT("Electrical, sensors & switches", 45, 25);
const SUP = async (v: typeof schema.suppliers.$inferInsert) => (await db.insert(schema.suppliers).values(v).returning())[0];
const sinar = await SUP({ name: "Sinar Heavy Parts (demo)", contactName: "Mr. Lee", phone: "03-0000 5000", paymentTerms: "30 days", leadTimeDays: 2 });
const borneo = await SUP({ name: "Borneo Earthmoving Spares (demo)", contactName: "En. Hakim", phone: "03-0000 5100", paymentTerms: "COD", leadTimeDays: 3 });
const hidro = await SUP({ name: "Hidro Seal Engineering (demo)", contactName: "Ms. Tan", phone: "03-0000 6000", paymentTerms: "30 days", leadTimeDays: 4 });
const mega = await SUP({ name: "Mega Lubricants (demo)", contactName: "Mr. Siva", phone: "03-0000 7000", paymentTerms: "COD", leadTimeDays: 1 });
const united = await SUP({ name: "United Hydraulic Supply (demo)", contactName: "Mr. Ong", phone: "03-0000 6100", paymentTerms: "30 days", leadTimeDays: 3 });
const weld = await SUP({ name: "Weld-Pro Supplies (demo)", contactName: "En. Farid", phone: "03-0000 8000", paymentTerms: "14 days", leadTimeDays: 1 });
// Outsourced: the hydraulic pump went to an outside workshop for a rebuild; it is 2 days later than they promised.
const outJob = await J({ category: "HYD", priority: "high", status: "in_progress", unitId: u3.id, siteLocation: "", complaint: "Main hydraulic pump weak, slow boom and arm. Pump removed and sent out for rebuild.",
  reportedBy: "Operator", leadId: null, openedAt: d(-10), statusSince: ago(9), outsourced: true, vendorId: hidro.id, vendorRef: "HS-Q-2231", sentOutAt: d(-9), expectedBackAt: d(-2) },
  { labour: [[raj.id, 4, 9]] });
await db.insert(schema.jobPurchases).values({ jobId: outJob.id, kind: "service", description: "Rebuild main hydraulic pump (deposit)", supplierId: hidro.id, qty: "1", uom: "job",
  unitCost: "1500.00", unitPrice: "1500.00", ref: "HS-INV-0912", purchasedAt: d(-8), addedBy: sup.id });
await db.update(schema.machineUnits).set({ location: "At vendor · Hidro Seal Engineering (demo)" }).where(eq(schema.machineUnits.id, u3.id));

type PartSeed = { sku: string; oem?: string; desc: string; cat: { id: number; markupPct: string }; uom: string; bin: string; fits?: number[]; onHand: number; min: number; reorder?: number; avg: number; fixedSell?: number;
  prices: [number, number, number, "quote" | "po" | "invoice" | "import", string?][]; codes?: [number, string][] };
const P: Record<string, typeof schema.parts.$inferSelect & { final: number }> = {};
async function part(key: string, v: PartSeed) {
  const sell = v.fixedSell ?? sellFromMarkup(v.avg, Number(v.cat.markupPct));
  const [row] = await db.insert(schema.parts).values({ sku: v.sku, oemPartNo: v.oem ?? v.sku, description: v.desc, categoryId: v.cat.id, uom: v.uom, bin: v.bin, fitsAll: !v.fits,
    onHand: "0", minLevel: String(v.min), reorderQty: String(v.reorder ?? 0), avgCost: v.avg.toFixed(4), lastCost: v.prices.length ? v.prices[v.prices.length - 1][1].toFixed(2) : null,
    pricingMode: v.fixedSell ? "fixed" : "markup", sellPrice: sell.toFixed(2) }).returning();
  for (const m of v.fits ?? []) await db.insert(schema.partModels).values({ partId: row.id, modelId: m });
  for (const [sid, price, daysAgo, source, ref] of v.prices) await db.insert(schema.supplierPrices).values({ partId: row.id, supplierId: sid, price: price.toFixed(2), priceDate: d(-daysAgo), source, ref: ref ?? null, createdBy: sup.id });
  for (const [sid, code] of v.codes ?? []) await db.insert(schema.supplierParts).values({ partId: row.id, supplierId: sid, supplierPartNo: code });
  P[key] = { ...row, final: v.onHand };
}
await part("fuel", { sku: "1R-0750", desc: "Fuel filter, secondary", cat: cFilters, uom: "pc", bin: "A1-03", fits: [cat320.id], onHand: 4, min: 4, avg: 76, prices: [[sinar.id, 74, 120, "quote"], [borneo.id, 72, 25, "quote", "WhatsApp En. Hakim"], [sinar.id, 78, 30, "po", "PO-2026-0218"]], codes: [[sinar.id, "SHP-0750"]] });
await part("oil", { sku: "1R-0739", desc: "Engine oil filter", cat: cFilters, uom: "pc", bin: "A1-04", fits: [cat320.id], onHand: 2, min: 4, reorder: 6, avg: 62, prices: [[sinar.id, 61.5, 75, "invoice", "INV-77812"], [borneo.id, 59, 24, "quote"], [sinar.id, 65, 1, "po"]], codes: [[sinar.id, "SHP-0739"]] });
await part("hyd", { sku: "HYD-VG46-20", desc: "Hydraulic oil ISO VG46, 20 L pail", cat: cFluids, uom: "pail", bin: "L-01", onHand: 14, min: 10, avg: 208, prices: [[mega.id, 205, 90, "quote"], [united.id, 222, 95, "quote"], [mega.id, 210, 10, "po"]] });
await part("eng", { sku: "EO-15W40-20", desc: "Engine oil 15W-40 CI-4, 20 L", cat: cFluids, uom: "pail", bin: "L-02", onHand: 9, min: 8, avg: 246, prices: [[united.id, 238, 95, "quote"], [mega.id, 245, 10, "po"], [mega.id, 248, 8, "invoice", "MG-3301"]] });
await part("pump", { sku: "KIT-PC200-MP", oem: "708-2L-00300", desc: "Main pump seal kit, PC200-8", cat: cSeals, uom: "kit", bin: "B2-01", fits: [pc200.id], onHand: 1, min: 1, avg: 640, prices: [[hidro.id, 640, 110, "invoice"], [united.id, 695, 3, "quote", "Quote Q-5521"]] });
await part("lift", { sku: "KIT-L120H-LC", desc: "Lift cylinder seal kit, L120H", cat: cSeals, uom: "kit", bin: "B2-02", fits: [l120.id], onHand: 0, min: 1, avg: 0, prices: [[hidro.id, 880, 3, "po"]] });
await part("tooth", { sku: "TTH-J350", desc: "Bucket tooth, J350 style", cat: cGet, uom: "pc", bin: "C1-01", fits: [cat320.id, zx200.id], onHand: 24, min: 20, avg: 57, prices: [[sinar.id, 58, 60, "quote"], [borneo.id, 52, 20, "quote"]], codes: [[borneo.id, "BES-J350"]] });
await part("rod", { sku: "HF-ROD-40", desc: "Hardfacing rod 4.0 mm, 5 kg", cat: cWeld, uom: "pack", bin: "W-02", onHand: 3, min: 5, avg: 165, fixedSell: 195, prices: [[weld.id, 150, 200, "invoice"], [weld.id, 165, 7, "po"]] });
await part("hose", { sku: "HOSE-08-2W", desc: "Hydraulic hose 1/2\" 2-wire", cat: cHoses, uom: "m", bin: "H-01", onHand: 40, min: 20, avg: 21, prices: [[hidro.id, 22, 40, "quote"], [united.id, 19.5, 3, "quote"]] });
await part("sensor", { sku: "SNS-GR500-OR", desc: "Outrigger proximity sensor, GR-500EX", cat: cElec, uom: "pc", bin: "E1-01", fits: [gr500.id], onHand: 0, min: 1, avg: 0, prices: [[sinar.id, 520, 1, "po"]] });
await part("pm250", { sku: "KIT-PC200-PM250", desc: "250 hr service kit, PC200-8", cat: cFilters, uom: "kit", bin: "A3-01", fits: [pc200.id], onHand: 3, min: 2, avg: 390, prices: [[sinar.id, 390, 50, "po"]] });

const PO = async (no: string, supplierId: number, status: "awaiting_approval" | "ordered" | "partially_received" | "received", orderAgo: number, etaIn: number, lines: [string, number, number][], jobId?: number) => {
  const [po] = await db.insert(schema.purchaseOrders).values({ poNo: no, supplierId, status, jobId: jobId ?? null, orderDate: d(-orderAgo), eta: d(etaIn), createdBy: sup.id,
    ...(status === "awaiting_approval" ? {} : { approvedBy: sup.id, approvedAt: ago(orderAgo) }) }).returning();
  const ls = [];
  for (const [k, q, price] of lines) ls.push((await db.insert(schema.poLines).values({ poId: po.id, partId: P[k].id, qty: String(q), unitPrice: price.toFixed(2), receivedQty: status === "received" ? String(q) : "0" }).returning())[0]);
  return { po, ls };
};
const y = T.slice(0, 4);
const r1 = await PO(`PO-${y}-0001`, mega.id, "received", 10, -8, [["hyd", 10, 210], ["eng", 6, 245]]);
await PO(`PO-${y}-0002`, weld.id, "ordered", 7, -6, [["rod", 4, 165]], fabJob.id);
await PO(`PO-${y}-0003`, hidro.id, "ordered", 3, 4, [["lift", 2, 880]]);
await PO(`PO-${y}-0004`, sinar.id, "ordered", 1, 1, [["sensor", 1, 520], ["oil", 6, 65]], pmJob.id);
await PO(`PO-${y}-0005`, united.id, "awaiting_approval", 0, 3, [["pump", 4, 695], ["hose", 150, 19.5]]);
const [rc] = await db.insert(schema.receipts).values({ poId: r1.po.id, invoiceNo: "MG-3301", receivedBy: sup.id, receivedAt: ago(8) }).returning();
await db.insert(schema.receiptLines).values([
  { receiptId: rc.id, poLineId: r1.ls[0].id, qty: "10", poPrice: "210.00", invoicePrice: "210.00" },
  { receiptId: rc.id, poLineId: r1.ls[1].id, qty: "6", poPrice: "245.00", invoicePrice: "248.00" },
]);

// Stock movements: opening stock, the received PO, then parts issued to jobs. Final on-hand matches the part records above.
const received: Record<string, [number, number]> = { hyd: [10, 210], eng: [6, 248] };
const issues: [string, number, number][] = [["pump", 1, pumpJob.id], ["hyd", 4, pumpJob.id], ["fuel", 2, pmJob.id], ["eng", 1, pmJob.id], ["rod", 2, fabJob.id], ["tooth", 5, fabJob.id]];
for (const [k, p] of Object.entries(P)) {
  const inQty = received[k]?.[0] ?? 0, outQty = issues.filter((i) => i[0] === k).reduce((a, i) => a + i[1], 0);
  let bal = p.final + outQty - inQty;
  if (bal > 0) await db.insert(schema.stockMovements).values({ partId: p.id, type: "adjust", qty: String(bal), unitCost: p.avgCost, balanceAfter: String(bal), note: "Opening stock", staffId: sup.id, createdAt: ago(30) });
  if (inQty) { bal += inQty; await db.insert(schema.stockMovements).values({ partId: p.id, type: "receive", qty: String(inQty), unitCost: String(received[k][1]), balanceAfter: String(bal), poId: r1.po.id, note: "Invoice MG-3301", staffId: sup.id, createdAt: ago(8) }); }
  for (const [, q, jobId] of issues.filter((i) => i[0] === k)) {
    bal -= q;
    await db.insert(schema.stockMovements).values({ partId: p.id, type: "issue", qty: String(-q), unitCost: p.avgCost, balanceAfter: String(bal), jobId, staffId: sup.id, createdAt: ago(1) });
    await db.insert(schema.jobParts).values({ jobId, partId: p.id, qty: String(q), unitCost: p.avgCost, unitPrice: p.sellPrice, issuedBy: sup.id, issuedAt: ago(1) });
  }
  await db.update(schema.parts).set({ onHand: String(p.final) }).where(eq(schema.parts.id, p.id));
}
await db.insert(schema.partRequests).values([
  { jobId: pumpJob.id, partId: P.hose.id, qty: "2", note: "Case drain hose chafed", requestedBy: raj.id },
  { jobId: pmJob.id, partId: P.oil.id, qty: "2", note: "500 hr service", requestedBy: lim.id },
  { jobId: diagJob.id, partId: P.sensor.id, qty: "1", note: "Left front outrigger", requestedBy: haf.id },
]);

// Chat: workshop group and a job chat.
const mins = (m: number) => new Date(Date.now() - m * 60000);
const [teamT] = await db.insert(schema.chatThreads).values({ kind: "team", lastMessageAt: mins(35) }).returning();
const [pumpT] = await db.insert(schema.chatThreads).values({ kind: "job", jobId: pumpJob.id, lastMessageAt: mins(12) }).returning();
await db.insert(schema.chatMessages).values([
  { threadId: teamT.id, staffId: sup.id, body: "Morning all. Toolbox talk at 8:15, then bays as per the board.", createdAt: mins(95) },
  { threadId: teamT.id, staffId: lim.id, body: "Noted. Bay 2 forklift battery is low, charging now.", createdAt: mins(80) },
  { threadId: teamT.id, staffId: boss.id, body: "Customer visit at 3pm today, please keep the front bay tidy.", createdAt: mins(35) },
  { threadId: pumpT.id, staffId: raj.id, body: "On site. Pump delivery 18 MPa, spec 34.3. Pilot OK. Pump coming off.", createdAt: mins(40) },
  { threadId: pumpT.id, staffId: sup.id, body: "New pump issued to the job. Send a photo of the old pump nameplate please.", createdAt: mins(12) },
]);
for (const [threadId, staffId] of [[teamT.id, sup.id], [teamT.id, boss.id], [pumpT.id, sup.id], [pumpT.id, raj.id]]) {
  const [last] = await db.select({ id: schema.chatMessages.id }).from(schema.chatMessages).where(and(eq(schema.chatMessages.threadId, threadId), eq(schema.chatMessages.staffId, staffId))).orderBy(desc(schema.chatMessages.id)).limit(1);
  if (last) await db.insert(schema.chatReads).values({ threadId, staffId, lastReadId: last.id });
}

/* ---------- calendar: this week's crew plan and two public holidays ---------- */
{
  const week = weekDays(planWeekStart(T));
  const P: { staffId: number; day: string; kind: "job" | "leave" | "mc" | "off"; jobId?: number }[] = [];
  for (const day of week) {
    P.push({ staffId: raj.id, day, kind: "job", jobId: pumpJob.id }, { staffId: lim.id, day, kind: "job", jobId: pmJob.id },
      { staffId: haf.id, day, kind: "job", jobId: diagJob.id }, { staffId: azm.id, day, kind: "job", jobId: fabJob.id });
    P.push(day === week[1] ? { staffId: sur.id, day, kind: "mc" } : { staffId: sur.id, day, kind: "job", jobId: pumpJob.id });
  }
  P.push({ staffId: kum.id, day: week[5], kind: "leave" }, { staffId: siti.id, day: week[5], kind: "off" });
  await db.insert(schema.crewPlan).values(P);
  await db.insert(schema.calendarEvents).values([
    { day: d(5), time: "09:00", type: "puspakom", title: "PUSPAKOM inspection", unitId: kato1.id, customerId: tunas.id, repeatMonths: 6, notes: "PUSPAKOM Shah Alam. Bring grant and insurance cover note.", createdBy: sup.id },
    { day: d(1), type: "machine_in", title: "Tadano GR-600 arriving on low loader", customerId: tunas.id, notes: "Park at Open yard. Customer reports slewing noise.", createdBy: sup.id },
    { day: d(-3), type: "dosh", title: "DOSH PMA inspection", unitId: u4.id, customerId: tunas.id, repeatMonths: 12, createdBy: boss.id },
    { day: d(9), endDay: d(10), type: "visit", title: "Kuari Selatan site visit (2 days)", customerId: kuari.id, createdBy: boss.id },
  ]);
  await db.insert(schema.holidays).values([{ day: "2026-11-08", name: "Deepavali" }, { day: "2026-12-25", name: "Christmas Day" }]).onConflictDoNothing();
}

/* ---------- attendance: the last two weeks (Mon–Sat), mostly present ---------- */
{
  const { weekday } = await import("../src/lib/calendar");
  const people = [sup, raj, lim, haf, sur, azm, kum, siti];
  const rows: (typeof schema.attendance.$inferInsert)[] = [];
  for (let n = 14; n >= 1; n--) {
    const day = d(-n);
    if (weekday(day) === 6) continue;
    people.forEach((p, i) => {
      const status = p === sur && n === 3 ? "mc" : p === lim && n % 5 === 0 ? "late" : p === kum && n === 6 ? "leave" : p === azm && n === 9 ? "absent" : "present";
      rows.push({ staffId: p.id, day, status, timeIn: status === "late" ? "08:40" : status === "present" ? `0${7 + (i % 2)}:${i % 2 ? "05" : "55"}` : null, timeOut: status === "present" || status === "late" ? "17:30" : null, note: status === "absent" ? "No call, no show" : null, updatedBy: sup.id });
    });
  }
  await db.insert(schema.attendance).values(rows);
}

// Bulk / consumable parts (same rule as migration 0019), with one drum marked as running low.
await db.execute(sql`update parts set bulk = true where category_id in (select id from part_categories where name in
  ('Oils, grease & lubricants', 'Coolant & fluids', 'Electrical, sensors & switches', 'Workshop consumables', 'Paint'))`);
await db.execute(sql`update parts set low_flagged_at = now(), low_flagged_by = ${sup.id} where id = (select id from parts where bulk order by id limit 1)`);

console.log(`Demo data loaded. Sign in with any demo phone (Boss 0120000000, Supervisor 0120000001, Mechanic 0120000003) and password demo-pass-1.`);
await pool.end();
