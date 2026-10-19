/** How AppSheet (CMMC workbook) values map to Heavyworks Garage values. Pure module, unit-tested. */
import type { Status } from "./jobs";

/** Machine type from make / model text (the Head Manager can change it afterwards). */
export function guessMachineType(make: string, model: string, id: string): string {
  const s = `${make} ${model} ${id}`.toUpperCase();
  if (/FORKLIFT/.test(s)) return "forklift";
  if (/AICHI|SKYLIFT|\bSK\d|\bSK-\d/.test(s)) return "skylift";
  if (/PALFINGER|\bPK\s?\d|UNIC|FASSI/.test(s)) return "lorry_crane";
  if (/RANGER|HILUX|TRITON|PERSONA|SAGA|MYVI|NAVARA|D-MAX|DMAX/.test(s)) return "car";
  const m = model.toUpperCase().replace(/\s+/g, "");
  if (/^(KR|GR|RK|TR)[-\d]/.test(m)) return "rough_terrain_crane";
  if (/^(KA|AR|ATF|LTM|GMK)[-\d]/.test(m)) return "all_terrain_crane";
  if (/^(TL|NK|SL|SA|TG|GT)[-\d]/.test(m)) return "truck_crane";
  if (/KATO|TADANO|SUMITOMO|KOBELCO|KOBLECO/.test(s)) return "truck_crane";
  if (/IVECO|HINO|ISUZU|FUSO|SCANIA|VOLVO FH|MERCEDES/.test(s)) return "lorry";
  return "other";
}

/** "VHX 8292", "SK 9920F", "WD302F", "PATRIOT 2638" are plates; free text like "Toyota Forklift 3T (3)" is not. */
export const looksLikePlate = (id: string) => /^[A-Z]{1,8} ?\d{1,4}[A-Z]?$/.test(id.trim().toUpperCase());

/** AppSheet work order categories → job category codes (built-in where one fits; the rest are added in Settings). */
export const WO_CATEGORIES: Record<string, { code: string; label?: string; color?: string; priority?: "critical" | "high" | "normal" | "low" }> = {
  "MT-CORRECTIVE (EMERGENCY)": { code: "EMG" },
  "MT-MINOR REPAIR": { code: "MINOR" },
  "MT-PREVENTIVE": { code: "PM" },
  "MT-REFURBISHMENT": { code: "PAINT" },
  "MT-STATUTORY": { code: "STATUTORY", label: "Statutory inspection (PMA, PUSPAKOM)", color: "#c4342b", priority: "high" },
  "MT-DAMAGE (CUSTOMER)": { code: "DMG_CUST", label: "Damage by customer", color: "#b0357c", priority: "high" },
  "MT-DAMAGE (OPERATOR)": { code: "DMG_OPR", label: "Damage by operator", color: "#8a5a2b", priority: "high" },
  "MT-PREDICTIVE": { code: "PREDICT", label: "Predictive (found before failure)", color: "#1b8a8a", priority: "normal" },
};
/** First category of a multi-select value ("A , B"); unknown or empty → Minor repair. */
export function woCategory(v: string): string {
  const first = v.split(",")[0].trim().toUpperCase();
  return WO_CATEGORIES[first]?.code ?? "MINOR";
}

export function woPriority(v: string): "high" | "normal" | "low" {
  const p = v.trim().toUpperCase();
  return p === "HIGH" ? "high" : p === "LOW" ? "low" : "normal";
}

/** Status mapping; cancelled work orders are closed and marked as cancelled in the write-up. */
export function woStatus(v: string, hasEnd: boolean): { status: Status; cancelled: boolean } {
  const s = v.trim().toLowerCase();
  if (s.startsWith("completed")) return { status: "closed", cancelled: false };
  if (s.startsWith("cancel")) return { status: "closed", cancelled: true };
  if (s.startsWith("in progress") || s.startsWith("pending inspection")) return { status: "in_progress", cancelled: false };
  if (s.startsWith("on-hold") || s.startsWith("on hold")) return { status: "awaiting_parts", cancelled: false };
  if (s.startsWith("open")) return { status: "received", cancelled: false };
  return { status: hasEnd ? "closed" : "received", cancelled: false };
}

/** AppSheet part categories ("Engine: Filter") → standard part category names. */
export function partCategory(v: string): string {
  const s = v.toLowerCase();
  if (/filter|filtration/.test(s)) return "Filters (oil, fuel, air, hydraulic)";
  if (/seal/.test(s)) return "Hydraulic seals & seal kits";
  if (/coolant/.test(s)) return "Coolant & fluids";
  if (/oil|grease|fluid|lubric/.test(s)) return "Oils, grease & lubricants";
  if (/tyre|tire|rim/.test(s)) return "Tyres & wheels";
  if (/light|lamp/.test(s)) return "Lights & lamps";
  if (/electric/.test(s)) return "Electrical, sensors & switches";
  if (/transmission|drivetrain/.test(s)) return "Transmission & drivetrain";
  if (/brak/.test(s)) return "Brake parts";
  if (/valve|manifold|pump|motor/.test(s)) return "Hydraulic pumps, motors & valves";
  if (/hose|fitting/.test(s)) return "Hydraulic hoses & fittings";
  if (/bearing|bush/.test(s)) return "Bearings & bushes";
  return "Workshop consumables";
}

/** AppSheet team type → staff role. Outsourced people are vendors, not staff. */
export function teamRole(type: string): "mechanic" | "assistant" | "fabricator" | "painter" | "cleaner" {
  const s = type.toLowerCase();
  if (/assist|helper|driver/.test(s)) return "assistant";
  if (/weld|fabric/.test(s)) return "fabricator";
  if (/paint|spray/.test(s)) return "painter";
  if (/clean/.test(s)) return "cleaner";
  return "mechanic";
}

export const num = (v: string) => { const n = Number(String(v).replace(/[^\d.-]/g, "")); return Number.isFinite(n) ? n : 0; };
