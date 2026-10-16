/** Load DEMO data for trying the system (staff, customers, machines, jobs).
 *  Refuses to run when staff already exist, so it never mixes with real data.
 *  Every demo login uses the password "demo-pass-1".
 */
import { loadEnv } from "./env";

loadEnv();
const { db, schema, pool } = await import("../src/db/index");
const { hashPassword } = await import("../src/lib/password");
const { qcTemplate } = await import("../src/lib/jobs");
const { addDays, today } = await import("../src/lib/format");

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
await S({ name: "Siti Aminah", role: "cleaner", reportsTo: sup.id, phone: "0120000008", joined: "2022-05-16", skills: ["Steam wash", "Degreasing"], payRate: "12" });
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
const cat320 = await M({ make: "Caterpillar", model: "320D2", type: "Excavator", specs: { "Operating weight": "20.5 t", Engine: "CAT C7.1", "Engine oil": "15 L" }, serviceIntervals: [250, 500, 1000, 2000] });
const pc200 = await M({ make: "Komatsu", model: "PC200-8", type: "Excavator", specs: { "Operating weight": "20 t", Engine: "SAA6D107E-1", "Hydraulic tank": "135 L" }, serviceIntervals: [250, 500, 1000, 2000] });
const zx200 = await M({ make: "Hitachi", model: "ZX200-5G", type: "Excavator", specs: { Engine: "Isuzu 4HK1" }, serviceIntervals: [250, 500, 1000, 2000] });
const gr500 = await M({ make: "Tadano", model: "GR-500EX", type: "Rough-terrain crane", specs: { Capacity: "50 t", Boom: "5-section, 42 m" }, serviceIntervals: [250, 500, 1000] });
const l120 = await M({ make: "Volvo", model: "L120H", type: "Wheel loader", specs: { Engine: "Volvo D8J", Bucket: "3.6 m³" }, serviceIntervals: [500, 1000, 2000] });
await db.insert(schema.knownIssues).values([
  { modelId: pc200.id, title: "Main pump not building pressure", fix: "Check PC-EPC solenoid and servo before strip-down. Piston shoe leakage needs the main pump seal kit.", addedBy: raj.id },
  { modelId: gr500.id, title: "Intermittent outrigger fault", fix: "Check proximity sensor and harness at the outrigger beam; water ingress is common.", addedBy: haf.id },
]);

const U = async (v: typeof schema.machineUnits.$inferInsert) => (await db.insert(schema.machineUnits).values(v).returning())[0];
const u1 = await U({ modelId: cat320.id, customerId: bina.id, serialNo: "CAT0320DXKJB01234", year: 2017, hourMeter: 9850, location: "Workshop · Bay 2", arrivedAt: d(-2), nextServiceDate: d(19), nextServiceType: "10,000 hr service" });
const u2 = await U({ modelId: zx200.id, customerId: bina.id, serialNo: "HCMDCD70P00056789", year: 2015, hourMeter: 12430, location: "Workshop · Long-stay yard A", arrivedAt: d(-44) });
const u3 = await U({ modelId: pc200.id, customerId: kuari.id, serialNo: "PC200-8 #350123", year: 2013, hourMeter: 14210, location: "Customer site", nextServiceDate: d(12), nextServiceType: "250 hr service" });
const u4 = await U({ modelId: gr500.id, customerId: tunas.id, serialNo: "GR-500EX-545678", year: 2018, plateNo: "WXY 1234", hourMeter: 6420, location: "Workshop · Bay 4", arrivedAt: d(-4) });
const u5 = await U({ modelId: l120.id, customerId: port.id, serialNo: "VCE0L120H00013377", year: 2020, hourMeter: 6890, location: "Customer site" });

let n = 0;
async function J(v: Omit<typeof schema.jobs.$inferInsert, "jobNo">, extra: { team?: number[]; tasks?: [string, boolean, number?][]; labour?: [number, number, number][]; qcDone?: number; log?: string[] } = {}) {
  const jobNo = `J-${T.slice(0, 4)}-${String(++n).padStart(4, "0")}`;
  const [job] = await db.insert(schema.jobs).values({ ...v, jobNo, createdBy: sup.id }).returning();
  for (const s of extra.team ?? []) await db.insert(schema.jobTeam).values({ jobId: job.id, staffId: s });
  for (const [i, [t, done, who]] of (extra.tasks ?? []).entries()) await db.insert(schema.jobTasks).values({ jobId: job.id, seq: i, description: t, assigneeId: who ?? null, doneAt: done ? ago(1) : null, doneBy: done ? who ?? null : null });
  const qc = qcTemplate(v.category);
  await db.insert(schema.jobQc).values(qc.map((item, i) => ({ jobId: job.id, seq: i, item, passedAt: i < (extra.qcDone ?? 0) ? ago(1) : null, passedBy: i < (extra.qcDone ?? 0) ? sup.id : null })));
  for (const [s, h, back] of extra.labour ?? []) await db.insert(schema.labourEntries).values({ jobId: job.id, staffId: s, hours: String(h), workDate: d(-back), loggedBy: s });
  for (const t of extra.log ?? [`Job ${jobNo} created by ${sup.name}.`]) await db.insert(schema.jobActivity).values({ jobId: job.id, staffId: sup.id, text: t });
  return job;
}

const old = await J({ category: "MAJOR", status: "closed", unitId: u3.id, siteLocation: "Bay 2", complaint: "Swing motor noisy.", diagnosis: "Swing motor bearing failed; rebuilt.", leadId: raj.id, hourMeterIn: 13980, openedAt: d(-73), dueDate: d(-57), closedAt: d(-58), statusSince: ago(58) }, { labour: [[raj.id, 14, 66]], qcDone: 6 });
await J({ category: "EMG", priority: "critical", status: "received", unitId: u5.id, siteType: "field", siteLocation: "Westport, Pulau Indah", complaint: "Loader overheating and shutting down during container yard work.", reportedBy: "Mr. Ravi", hourMeterIn: 6890, openedAt: T, dueDate: T, statusSince: new Date() });
await J({ category: "EMG", priority: "critical", status: "in_progress", unitId: u3.id, siteType: "field", siteLocation: "Semenyih quarry, pit 2", complaint: "Boom will not lift, machine weak on all functions.", diagnosis: "Main pump delivery pressure 18 MPa against 34.3 MPa spec. Pilot pressure OK.", leadId: raj.id, hourMeterIn: 14210, openedAt: d(-1), dueDate: d(1), statusSince: ago(1) },
  { team: [sur.id], tasks: [["Travel to site, lock-out / tag-out", true, raj.id], ["Pressure test main and pilot circuits", true, raj.id], ["Replace main pump seal kit", false, raj.id], ["Flush and refill hydraulic oil", false, sur.id], ["Test run and hand over", false, raj.id]], labour: [[raj.id, 6.5, 1], [sur.id, 6.5, 1], [raj.id, 3, 0]] });
await J({ category: "PM", status: "awaiting_parts", unitId: u1.id, siteLocation: "Bay 2", complaint: "Scheduled 500 hr service plus check slow boom up.", diagnosis: "Pilot filter partly blocked. Waiting for oil filters.", leadId: lim.id, hourMeterIn: 9850, openedAt: d(-2), dueDate: d(2), statusSince: ago(1) },
  { team: [sur.id], tasks: [["Take oil samples", true, lim.id], ["Replace engine oil and filters", false, sur.id], ["Replace pilot filter", false, lim.id]], labour: [[lim.id, 2, 2]] });
await J({ category: "DIAG", priority: "high", status: "quality_check", unitId: u4.id, siteLocation: "Bay 4", complaint: "Outrigger interlock fault comes and goes.", diagnosis: "Left front outrigger proximity sensor corroded. Replaced and calibrated.", leadId: haf.id, hourMeterIn: 6420, openedAt: d(-4), dueDate: d(4), statusSince: ago(0) },
  { tasks: [["Read fault history", true, haf.id], ["Harness continuity test", true, haf.id], ["Replace sensor and calibrate", true, haf.id]], labour: [[haf.id, 4, 3], [haf.id, 3, 1]], qcDone: 3 });
await J({ category: "MAJOR", status: "in_progress", unitId: u2.id, siteLocation: "Long-stay yard A", complaint: "Engine knocking, low oil pressure. Customer wants full engine overhaul.", diagnosis: "No. 3 con-rod bearing spun. Crankshaft regrind sublet.", leadId: raj.id, hourMeterIn: 12430, openedAt: d(-44), dueDate: d(14), statusSince: ago(41) },
  { team: [lim.id], tasks: [["Remove engine", true, raj.id], ["Strip and measure", true, lim.id], ["Rebuild engine", false, raj.id]], labour: [[raj.id, 8, 43], [lim.id, 8, 42], [raj.id, 6, 2]] });
await J({ category: "FAB", status: "in_progress", unitId: u2.id, siteLocation: "Fabrication bay", complaint: "Bucket side cutters worn through, base cracked.", leadId: azm.id, hourMeterIn: 12430, openedAt: d(-11), dueDate: d(6), statusSince: ago(10) },
  { tasks: [["Gouge and weld base crack", true, azm.id], ["Fit new side cutters", false, azm.id], ["Hardface wear areas", false, azm.id]], labour: [[azm.id, 7, 8]] });
await J({ category: "WARR", priority: "high", status: "ready_for_pickup", unitId: u3.id, siteLocation: "Bay 5", complaint: "Oil leak at swing motor after repair in August.", diagnosis: "O-ring pinched during last assembly. Replaced under warranty.", leadId: lim.id, hourMeterIn: 14150, openedAt: d(-8), dueDate: d(-1), statusSince: ago(2), parentJobId: old.id },
  { tasks: [["Replace swing motor O-ring", true, lim.id], ["Leak test 1 hr", true, lim.id]], labour: [[lim.id, 3, 7]], qcDone: 6 });
await J({ category: "PAINT", priority: "low", status: "awaiting_approval", unitId: u2.id, siteLocation: "Paint bay", complaint: "Touch-up and repaint boom before return.", leadId: kum.id, hourMeterIn: 12430, openedAt: d(-5), dueDate: d(21), statusSince: ago(4) });

console.log(`Demo data loaded. Sign in with any demo phone (Boss 0120000000, Supervisor 0120000001, Mechanic 0120000003) and password demo-pass-1.`);
await pool.end();
