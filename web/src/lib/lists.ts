/** Editable lists (job categories, machine types, bays, QC checklist) and workshop settings.
 *  The built-in entries below are the defaults; the Head Manager's changes in Settings are stored in the
 *  database (list_items, app_settings) and merged on top. Works on server and client: the server loads the
 *  merged lists (lib/lists-server) and the app layout hands them to the browser (ListsProvider). Pure module. */
import type { MessageKey, T } from "@/i18n";

export type ListName = "job_category" | "machine_type" | "bay" | "qc_item" | "service_item" | "event_type";
export type Priority = "critical" | "high" | "normal" | "low";

export type ListItem = {
  list: ListName; code: string;
  /** Name typed by the Head Manager. Null = the built-in name, shown in each person's language. */
  label: string | null;
  /** machine_type: group code (built-in) or group name (custom). */
  grp: string | null;
  /** job_category and event_type: colour. job_category: priority. */
  color: string | null; priority: Priority | null;
  /** service_item: default interval in months. job_category: 1 = service job (the job page offers "Services done"), 0 = not. */
  num: number | null;
  sort: number; active: boolean; builtin: boolean;
};
export type Settings = { labourRate: number; poApprovalLimit: number; otMultiplier: number; sundayMultiplier: number; otStart: string; jobPurchaseMarkup: number; companyName: string; companyAddress: string; companyPhone: string; companyReg: string };
export type Lists = { items: ListItem[]; settings: Settings };

const B = (list: ListName, code: string, sort: number, extra: Partial<ListItem> = {}): ListItem =>
  ({ list, code, label: null, grp: null, color: null, priority: null, num: null, sort, active: true, builtin: true, ...extra });

/** Built-in categories use theme colours (they adjust for dark mode); a colour picked in Settings is stored as hex. */
/** Built-in categories that are service jobs: their job pages show "Services done on this job". */
const SERVICE_CATS = ["PM", "HYD"];
const CATS: [string, string, Priority][] = [
  ["EMG", "#c4342b", "critical"], ["DIAG", "#2d68a6", "high"], ["PM", "#2c7d3f", "normal"], ["MINOR", "#1b8a8a", "normal"],
  ["MAJOR", "#5146a8", "normal"], ["HYD", "#d06a12", "high"], ["FAB", "#8a5a2b", "normal"], ["PAINT", "#b0357c", "low"], ["WARR", "#6b7480", "high"],
];
export const BUILTIN_CATEGORY_CODES = CATS.map(([c]) => c);
/** Light-theme hex of a built-in category colour (null for custom categories). */
export const builtinHex = (code: string): string | null => CATS.find(([k]) => k === code)?.[1] ?? null;
/** Hex for a colour picker: stored hex, or the light-theme value of a built-in colour. */
export function colorHex(code: string, list: ListName = "job_category"): string {
  const c = findItem(list, code)?.color ?? "";
  return c.startsWith("#") ? c : builtinHex(code) ?? "#6b7480";
}
export const MACHINE_GROUPS_BUILTIN = [
  { group: "mobile_crane", types: ["truck_crane", "rough_terrain_crane", "all_terrain_crane"] },
  { group: "crane_lifting", types: ["crawler_crane", "lorry_crane", "skylift", "scissor_lift", "forklift"] },
  { group: "vehicle", types: ["lorry", "cargo_lorry", "low_loader", "prime_mover", "car"] },
  { group: "equipment", types: ["generator", "compressor", "excavator", "wheel_loader", "other"] },
] as const;
export const BUILTIN_GROUPS: string[] = MACHINE_GROUPS_BUILTIN.map((g) => g.group);
const BAY_NAMES = ["Bay 1", "Bay 2", "Bay 3", "Bay 4", "Fabrication bay", "Paint bay", "Open yard", "Long-stay yard A", "Long-stay yard B"];
/** Machine service items and their usual interval in months (date-based: many machines have no hour meter). */
const SERVICE_ITEMS: [string, number][] = [
  ["engine_oil", 3], ["hydraulic_oil", 12], ["transmission_oil", 12], ["differential_oil", 12], ["greasing", 1],
  ["aircon", 6], ["brake", 6], ["coolant", 24], ["fuel_filter", 6], ["air_filter", 6], ["swing_gear_oil", 12], ["wire_rope", 6],
];
/** Calendar event types: things the workshop needs to remember on a date. */
const EVENT_TYPES: [string, string][] = [
  ["machine_in", "#2d68a6"], ["machine_out", "#1b8a8a"], ["puspakom", "#d06a12"], ["road_tax", "#b0357c"],
  ["dosh", "#c4342b"], ["visit", "#5146a8"], ["meeting", "#6b7480"], ["other", "#8a5a2b"],
];
const QC_CODES = ["testRun", "leakCheck", "allTasks", "afterPhotos", "cleanUp"];

const env = (k: string) => (typeof process !== "undefined" ? process.env?.[k] : undefined);
export const DEFAULT_SETTINGS: Settings = {
  labourRate: Number(env("LABOUR_RATE") ?? 95) || 95, poApprovalLimit: Number(env("PO_APPROVAL_LIMIT") ?? 5000) || 5000, otMultiplier: 1.5, sundayMultiplier: 2, otStart: "17:00", jobPurchaseMarkup: 25,
  companyName: "", companyAddress: "", companyPhone: "", companyReg: "",
};

export const BUILTIN: ListItem[] = [
  ...CATS.map(([code, , priority], i) => B("job_category", code, i, { color: `var(--c-${code.toLowerCase()})`, priority, num: SERVICE_CATS.includes(code) ? 1 : 0 })),
  ...MACHINE_GROUPS_BUILTIN.flatMap((g, gi) => g.types.map((code, i) => B("machine_type", code, gi * 100 + i, { grp: g.group }))),
  ...BAY_NAMES.map((code, i) => B("bay", code, i)),
  ...QC_CODES.map((code, i) => B("qc_item", code, i)),
  ...SERVICE_ITEMS.map(([code, months], i) => B("service_item", code, i, { num: months })),
  ...EVENT_TYPES.map(([code, color], i) => B("event_type", code, i, { color })),
];

/** Built-ins with the stored changes applied, plus custom entries. */
export function mergeLists(stored: Omit<ListItem, "builtin">[], settings: Partial<Settings>): Lists {
  const key = (i: { list: string; code: string }) => `${i.list}:${i.code}`;
  const byKey = new Map(stored.map((s) => [key(s), s]));
  const items = [
    ...BUILTIN.map((b) => { const s = byKey.get(key(b)); return s ? { ...b, ...s, builtin: true, grp: s.grp ?? b.grp, color: s.color ?? b.color, priority: s.priority ?? b.priority, num: s.num ?? b.num } : b; }),
    ...stored.filter((s) => !BUILTIN.some((b) => key(b) === key(s))).map((s) => ({ ...s, builtin: false })),
  ].sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code));
  return { items, settings: { ...DEFAULT_SETTINGS, ...settings } };
}

/* ---------- current lists (one copy per server process, one per browser tab) ---------- */
const store = globalThis as unknown as { __hwLists?: Lists };
export function setLists(l: Lists) { store.__hwLists = l; }
export function lists(): Lists { return store.__hwLists ?? mergeLists([], {}); }
export function settings(): Settings { return lists().settings; }

export function listItems(list: ListName, opts: { all?: boolean } = {}): ListItem[] {
  return lists().items.filter((i) => i.list === list && (opts.all || i.active));
}
export function findItem(list: ListName, code: string | null | undefined): ListItem | undefined {
  return code ? lists().items.find((i) => i.list === list && i.code === code) : undefined;
}

/** Display name: the Head Manager's name if set, else the built-in name in the reader's language, else the stored code. */
export function itemLabel(t: T, list: ListName, code: string | null | undefined): string {
  if (!code) return "";
  const it = findItem(list, code);
  if (it?.label) return it.label;
  if (it?.builtin || !it) {
    const k = { job_category: `cat.${code}`, machine_type: `mtype.${code}`, qc_item: `qc.${code}`, service_item: `svc.${code}`, event_type: `evt.${code}`, bay: "" }[list];
    if (k) { const s = t(k as MessageKey); if (s !== k) return s; }
  }
  return code;
}

/* ---------- job categories ---------- */
export const categoryCodes = (opts: { all?: boolean } = {}) => listItems("job_category", opts).map((i) => i.code);
export const isCategory = (x: unknown): x is string => typeof x === "string" && listItems("job_category").some((i) => i.code === x);
export const catColor = (code: string) => findItem("job_category", code)?.color ?? "#6b7684";
export const catPriority = (code: string): Priority => findItem("job_category", code)?.priority ?? "normal";
export const eventColor = (code: string) => findItem("event_type", code)?.color ?? "#6b7480";
export const isServiceCategory = (code: string) => findItem("job_category", code)?.num === 1;

/* ---------- bays and work areas ---------- */
export const bayCodes = () => listItems("bay").map((i) => i.code);

/* ---------- machine types ---------- */
export function machineGroups(): { group: string; types: string[] }[] {
  const types = listItems("machine_type");
  const groups = [...new Set([...BUILTIN_GROUPS, ...types.map((t) => t.grp ?? "other")])];
  return groups.map((group) => ({ group, types: types.filter((t) => (t.grp ?? "other") === group).map((t) => t.code) })).filter((g) => g.types.length);
}
export function groupLabel(t: T, group: string): string {
  return BUILTIN_GROUPS.includes(group) ? t(`mgroup.${group}` as MessageKey) : group;
}

/* ---------- QC checklist ---------- */
/** QC rows for a new job: the category's own check (built-in categories) then the standard checklist.
 *  itemKey is kept for built-in wording (translated for each reader); renamed or custom items store their text. */
export function qcTemplate(category: string, en: T): { itemKey: string | null; item: string }[] {
  const first = BUILTIN_CATEGORY_CODES.includes(category) ? [{ itemKey: category, item: en(`qc.${category}` as MessageKey) }] : [];
  return [...first, ...listItems("qc_item").map((q) => (q.label ? { itemKey: null, item: q.label } : { itemKey: q.code, item: en(`qc.${q.code}` as MessageKey) }))];
}

/** Suggested checks for a job (the Settings list, plus the category's own check for built-in categories). */
export function qcSuggestions(category: string, t: T): { itemKey: string | null; item: string }[] {
  return qcTemplate(category, t);
}

/** Code for a new custom entry: readable, unique within its list. */
export function newCode(list: ListName, name: string): string {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24) || "item";
  const taken = new Set(listItems(list, { all: true }).map((i) => i.code.toLowerCase()));
  let code = list === "job_category" ? base.toUpperCase().slice(0, 20) : base, n = 2;
  while (taken.has(code.toLowerCase())) code = `${base.slice(0, 20)}_${n++}`;
  return list === "bay" ? name.trim().slice(0, 60) : code;
}
