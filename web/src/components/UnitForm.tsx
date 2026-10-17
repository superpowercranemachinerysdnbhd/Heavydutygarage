import type { T } from "@/i18n";
import SubmitButton from "./SubmitButton";
import MachineFields, { type MachineInit } from "./MachineFields";

type Extra = { id?: number; location?: string; arrivedAt?: string | null; nextServiceDate?: string | null; nextServiceType?: string | null; notes?: string | null };
type Options = { companies: { id: number; name: string }[]; makes: string[]; models: string[] };

/** Add / edit machine: the shared machine fields plus where it is, service due and notes. */
export default function UnitForm({ action, unit, options, submit, t }: { action: (f: FormData) => Promise<void>; unit?: MachineInit & Extra; options: Options; submit: string; t: T }) {
  const u = unit ?? {};
  return (
    <form action={action} className="form" style={{ padding: 14 }}>
      {u.id && <input type="hidden" name="unitId" value={u.id} />}
      <MachineFields init={u} {...options} />
      <label>{t("u.location")}<input name="location" defaultValue={u.location ?? "Customer site"} placeholder={t("u.locationPh")} /></label>
      <label>{t("u.arrived")}<input type="date" name="arrivedAt" defaultValue={u.arrivedAt ?? ""} /></label>
      <label>{t("u.nextDate")}<input type="date" name="nextServiceDate" defaultValue={u.nextServiceDate ?? ""} /></label>
      <label>{t("u.nextType")}<input name="nextServiceType" defaultValue={u.nextServiceType ?? ""} placeholder={t("u.nextTypePh")} /></label>
      <label className="full">{t("u.notes")}<textarea name="notes" rows={2} defaultValue={u.notes ?? ""} /></label>
      <div className="full"><SubmitButton className="btn primary">{submit}</SubmitButton></div>
    </form>
  );
}
