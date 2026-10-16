import { LOCALES, type T } from "@/i18n";
import { langLabel } from "@/i18n/labels";

type C = { name?: string; contactName?: string | null; phone?: string | null; email?: string | null; address?: string | null; notes?: string | null; locale?: string };
export default function CustomerFields({ c = {}, t }: { c?: C; t: T }) {
  return (<>
    <label>{t("c.name")}<input name="name" required defaultValue={c.name ?? ""} /></label>
    <label>{t("c.contact")}<input name="contactName" defaultValue={c.contactName ?? ""} /></label>
    <label>{t("c.phone")}<input name="phone" type="tel" defaultValue={c.phone ?? ""} /></label>
    <label>{t("c.email")}<input name="email" type="email" defaultValue={c.email ?? ""} /></label>
    <label>{t("c.locale")}<select className="field" name="locale" defaultValue={c.locale ?? "en"}>{LOCALES.map((l) => <option key={l} value={l}>{langLabel(t, l)}</option>)}</select></label>
    <label className="full">{t("c.address")}<textarea name="address" rows={2} defaultValue={c.address ?? ""} /></label>
    <label className="full">{t("c.notes")}<textarea name="notes" rows={2} defaultValue={c.notes ?? ""} /></label>
  </>);
}
