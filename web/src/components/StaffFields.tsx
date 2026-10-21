import { LOCALES, type T } from "@/i18n";
import { langLabel, roleLabel } from "@/i18n/labels";
import type { Role } from "@/lib/permissions";

const ROLES: Role[] = ["boss", "supervisor", "mechanic", "assistant", "fabricator", "painter", "cleaner"];
type S = { name?: string; role?: Role; phone?: string; email?: string | null; reportsTo?: number | null; idNumber?: string | null; permitExpiry?: string | null;
  emergencyContact?: string | null; joined?: string | null; skills?: string[]; payRate?: string; monthlySalary?: string | null; monthlyHours?: string; locale?: string };
export default function StaffFields({ s = {}, managers, t }: { s?: S; managers: { id: number; name: string }[]; t: T }) {
  return (<>
    <label>{t("s.name")}<input name="name" required defaultValue={s.name ?? ""} /></label>
    <label>{t("s.role")}<select className="field" name="role" defaultValue={s.role ?? "mechanic"}>{ROLES.map((r) => <option key={r} value={r}>{roleLabel(t, r)}</option>)}</select></label>
    <label>{t("s.phone")}<input name="phone" type="tel" required defaultValue={s.phone ?? ""} /></label>
    <label>{t("s.reportsTo")}<select className="field" name="reportsTo" defaultValue={s.reportsTo ?? ""}><option value="">—</option>{managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
    <label>{t("s.language")}<select className="field" name="locale" defaultValue={s.locale ?? "en"}>{LOCALES.map((l) => <option key={l} value={l}>{langLabel(t, l)}</option>)}</select></label>
    <label>{t("s.email")}<input name="email" type="email" defaultValue={s.email ?? ""} /></label>
    <label>{t("s.ic")}<input name="idNumber" defaultValue={s.idNumber ?? ""} /></label>
    <label>{t("s.permit")}<input type="date" name="permitExpiry" defaultValue={s.permitExpiry ?? ""} /></label>
    <label>{t("s.joined")}<input type="date" name="joined" defaultValue={s.joined ?? ""} /></label>
    <label>{t("s.salary")}<input type="number" name="monthlySalary" min={0} step="1" defaultValue={s.monthlySalary ?? ""} placeholder="1900" /></label>
    <label>{t("s.monthlyHours")}<input type="number" name="monthlyHours" min={1} max={400} step="0.5" defaultValue={s.monthlyHours ?? "195"} /></label>
    <label>{t("s.pay")}<input type="number" name="payRate" min={0} step="0.01" defaultValue={s.payRate ?? "0"} /><small className="muted">{t("s.payHelp")}</small></label>
    <label>{t("s.emergency")}<input name="emergencyContact" defaultValue={s.emergencyContact ?? ""} placeholder={t("s.emergencyPh")} /></label>
    <label className="full">{t("s.skills")}<input name="skills" defaultValue={(s.skills ?? []).join(", ")} placeholder={t("s.skillsPh")} /></label>
  </>);
}
