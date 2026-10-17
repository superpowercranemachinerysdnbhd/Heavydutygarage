/** Machine types, grouped for the picker. Codes are stored on the machine; names live in src/i18n (mtype.*, mgroup.*). Pure module. */
import type { MessageKey, T } from "@/i18n";

export const MACHINE_GROUPS = [
  { group: "mobile_crane", types: ["truck_crane", "rough_terrain_crane", "all_terrain_crane"] },
  { group: "crane_lifting", types: ["crawler_crane", "lorry_crane", "skylift", "scissor_lift", "forklift"] },
  { group: "vehicle", types: ["lorry", "cargo_lorry", "low_loader", "prime_mover", "car"] },
  { group: "equipment", types: ["generator", "compressor", "excavator", "wheel_loader", "other"] },
] as const;

export type MachineType = (typeof MACHINE_GROUPS)[number]["types"][number];
export const MACHINE_TYPES: MachineType[] = MACHINE_GROUPS.flatMap((g) => [...g.types]);
export const isMachineType = (x: unknown): x is MachineType => typeof x === "string" && (MACHINE_TYPES as string[]).includes(x);

/** The group a type belongs to, e.g. truck_crane → mobile_crane. */
export function groupOf(type: string | null | undefined): string | null {
  return MACHINE_GROUPS.find((g) => (g.types as readonly string[]).includes(type ?? ""))?.group ?? null;
}

/** Display name for a stored type. Older records may hold free text (e.g. "Excavator"), shown as typed. */
export function machineTypeLabel(t: T, type: string | null | undefined): string {
  if (!type) return "";
  return isMachineType(type) ? t(`mtype.${type}` as MessageKey) : type;
}

/** How staff refer to a machine: the plate number if it has one, otherwise the serial number. */
export function unitRef(u: { plateNo?: string | null; serialNo?: string | null }): string {
  return u.plateNo?.trim() || u.serialNo?.trim() || "—";
}

/** A machine needs a plate number or a serial number (or both). */
export function hasIdentity(u: { plateNo?: string | null; serialNo?: string | null }): boolean {
  return Boolean(u.plateNo?.trim() || u.serialNo?.trim());
}

/** Plate numbers are stored the way Malaysians write them: upper case, single spaces ("WXY 1234"). */
export function normalisePlate(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, " ");
}

/** URL of a machine's profile photo; the version part makes phones fetch a replaced photo straight away. */
export function machinePhotoUrl(id: number, photoPath: string | null | undefined): string | null {
  return photoPath ? `/api/machines/${id}/photo?v=${photoPath.slice(-12, -4)}` : null;
}
