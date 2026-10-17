/** Typed label helpers so pages don't build message keys by hand. */
import { itemLabel } from "@/lib/lists";
import type { Category, Priority, Status } from "@/lib/jobs";
import type { Role } from "@/lib/permissions";
import type { Locale, MessageKey, T, Vars } from "./index";

export const statusLabel = (t: T, s: Status) => t(`status.${s}` as MessageKey);
export const catLabel = (t: T, c: Category) => itemLabel(t, "job_category", c);
export const priLabel = (t: T, p: Priority) => t(`priority.${p}` as MessageKey);
export const roleLabel = (t: T, r: Role) => t(`role.${r}` as MessageKey);
export const stageLabel = (t: T, s: string) => t(`stage.${s}` as MessageKey);
export const langLabel = (t: T, l: Locale) => t(`lang.${l}` as MessageKey);

/** Render a stored activity entry (key + params) in the reader's language. Status and stage codes are translated too. */
export function activityText(t: T, a: { key: string | null; params: Vars | null; text: string }): string {
  if (!a.key) return a.text;
  const p: Vars = { ...(a.params ?? {}) };
  for (const k of ["from", "to"]) if (typeof p[k] === "string") p[k] = statusLabel(t, p[k] as Status);
  if (typeof p.stage === "string") p.stage = stageLabel(t, p.stage);
  return t(a.key as MessageKey, p);
}
