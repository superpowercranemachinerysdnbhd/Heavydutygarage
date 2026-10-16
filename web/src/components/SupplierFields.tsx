import type { T } from "@/i18n";

type S = { name?: string; contactName?: string | null; phone?: string | null; email?: string | null; address?: string | null; paymentTerms?: string | null; leadTimeDays?: number | null; notes?: string | null };
export default function SupplierFields({ s = {}, t }: { s?: S; t: T }) {
  return (<>
    <label>{t("sup.name")}<input name="name" required defaultValue={s.name ?? ""} /></label>
    <label>{t("c.contact")}<input name="contactName" defaultValue={s.contactName ?? ""} /></label>
    <label>{t("c.phone")}<input name="phone" type="tel" defaultValue={s.phone ?? ""} /></label>
    <label>{t("c.email")}<input name="email" type="email" defaultValue={s.email ?? ""} /></label>
    <label>{t("sup.terms")}<input name="paymentTerms" defaultValue={s.paymentTerms ?? ""} placeholder={t("sup.termsPh")} /></label>
    <label>{t("sup.leadTimeDays")}<input name="leadTimeDays" type="number" min={0} defaultValue={s.leadTimeDays ?? ""} /></label>
    <label className="full">{t("c.address")}<textarea name="address" rows={2} defaultValue={s.address ?? ""} /></label>
    <label className="full">{t("u.notes")}<textarea name="notes" rows={2} defaultValue={s.notes ?? ""} /></label>
  </>);
}
