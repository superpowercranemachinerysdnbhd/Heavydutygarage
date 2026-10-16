import type { T } from "@/i18n";
import SubmitButton from "./SubmitButton";

type Opt = { id: number; label: string };
type Unit = { id?: number; modelId?: number; customerId?: number; serialNo?: string; engineNo?: string | null; plateNo?: string | null; year?: number | null; hourMeter?: number;
  location?: string; arrivedAt?: string | null; nextServiceDate?: string | null; nextServiceType?: string | null; notes?: string | null };

export default function UnitForm({ action, models, customers, unit, submit, t }: { action: (f: FormData) => Promise<void>; models: Opt[]; customers: Opt[]; unit?: Unit; submit: string; t: T }) {
  const u = unit ?? {};
  return (
    <form action={action} className="form" style={{ padding: 14 }}>
      {u.id && <input type="hidden" name="unitId" value={u.id} />}
      <label>{t("u.model")}<select className="field" name="modelId" defaultValue={u.modelId ?? ""} required><option value="" disabled>{t("common.choose")}</option>{models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
      <label>{t("u.owner")}<select className="field" name="customerId" defaultValue={u.customerId ?? ""} required><option value="" disabled>{t("common.choose")}</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
      <label>{t("u.serial")}<input name="serialNo" defaultValue={u.serialNo ?? ""} required /></label>
      <label>{t("u.engine")}<input name="engineNo" defaultValue={u.engineNo ?? ""} /></label>
      <label>{t("u.plate")}<input name="plateNo" defaultValue={u.plateNo ?? ""} /></label>
      <label>{t("u.year")}<input type="number" name="year" min={1950} max={2100} defaultValue={u.year ?? ""} /></label>
      <label>{t("u.hm")}<input type="number" name="hourMeter" min={0} defaultValue={u.hourMeter ?? 0} /></label>
      <label>{t("u.location")}<input name="location" defaultValue={u.location ?? "Customer site"} placeholder={t("u.locationPh")} /></label>
      <label>{t("u.arrived")}<input type="date" name="arrivedAt" defaultValue={u.arrivedAt ?? ""} /></label>
      <label>{t("u.nextDate")}<input type="date" name="nextServiceDate" defaultValue={u.nextServiceDate ?? ""} /></label>
      <label>{t("u.nextType")}<input name="nextServiceType" defaultValue={u.nextServiceType ?? ""} placeholder={t("u.nextTypePh")} /></label>
      <label className="full">{t("u.notes")}<textarea name="notes" rows={2} defaultValue={u.notes ?? ""} /></label>
      <div className="full"><SubmitButton className="btn primary">{submit}</SubmitButton></div>
    </form>
  );
}
