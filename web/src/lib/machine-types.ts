/** Machine types live in the editable lists (lib/lists): built-in types grouped under Mobile crane etc., plus any the
 *  Head Manager adds in Settings. These helpers keep the machine code short to read. Pure module. */
import type { T } from "@/i18n";
import { findItem, groupLabel, itemLabel, listItems, machineGroups } from "./lists";

export { machineGroups, groupLabel };
export const isMachineType = (x: unknown): boolean => typeof x === "string" && listItems("machine_type").some((i) => i.code === x);

/** The group a type belongs to, e.g. truck_crane → mobile_crane. */
export function groupOf(type: string | null | undefined): string | null {
  return findItem("machine_type", type)?.grp ?? null;
}

/** Display name for a stored type. Older records may hold free text (e.g. "Excavator"), shown as typed. */
export function machineTypeLabel(t: T, type: string | null | undefined): string {
  return itemLabel(t, "machine_type", type);
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
