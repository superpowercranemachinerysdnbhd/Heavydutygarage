import type { T } from "@/i18n";
import SubmitButton from "./SubmitButton";

type P = { id?: number; sku?: string; oemPartNo?: string | null; description?: string; categoryId?: number; uom?: string; bin?: string | null; minLevel?: number; reorderQty?: number; fitsAll?: boolean; notes?: string | null; modelIds?: number[]; bulk?: boolean };
export default function PartForm({ action, t, part, categories, models, submit }: {
  action: (f: FormData) => Promise<void>; t: T; part?: P; categories: { id: number; name: string }[]; models: { id: number; label: string }[]; submit: string;
}) {
  const p = part ?? {};
  return (
    <form action={action} className="form" style={{ padding: 14 }}>
      {p.id && <input type="hidden" name="id" value={p.id} />}
      <label>{t("parts.sku")}<input name="sku" required defaultValue={p.sku ?? ""} placeholder="1R-0739" /></label>
      <label>{t("parts.oem")}<input name="oemPartNo" defaultValue={p.oemPartNo ?? ""} /></label>
      <label className="full">{t("parts.description")}<input name="description" required defaultValue={p.description ?? ""} /></label>
      <label>{t("parts.category")}<select className="field" name="categoryId" defaultValue={p.categoryId ?? ""}><option value="">{t("common.choose")}</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>{t("parts.newCategory")}<input name="newCategory" placeholder={t("parts.newCategoryPh")} /></label>
      <label>{t("parts.uom")}<input name="uom" defaultValue={p.uom ?? "pc"} list="uoms" /></label>
      <datalist id="uoms"><option>pc</option><option>set</option><option>kit</option><option>m</option><option>L</option><option>pail</option><option>drum</option><option>kg</option><option>pack</option><option>tin</option></datalist>
      <label>{t("parts.bin")}<input name="bin" defaultValue={p.bin ?? ""} placeholder="A1-04" /></label>
      <label>{t("parts.min")}<input type="number" name="minLevel" min={0} step="any" defaultValue={p.minLevel ?? 0} /></label>
      <label>{t("parts.reorderQty")}<input type="number" name="reorderQty" min={0} step="any" defaultValue={p.reorderQty ?? 0} /></label>
      <label className="full set-check" style={{ alignItems: "flex-start" }}><input type="checkbox" name="bulk" defaultChecked={p.bulk} /> <span><b>{t("bulk.label")}</b><br /><small className="muted">{t("bulk.help")}</small></span></label>
      <fieldset className="full" style={{ border: "1px solid var(--line)", borderRadius: 5, padding: "8px 12px" }}>
        <legend className="label">{t("parts.fits")}</legend>
        <label style={{ flexDirection: "row", gap: 6, alignItems: "center", color: "var(--ink)" }}><input type="checkbox" name="fitsAll" defaultChecked={p.fitsAll} style={{ width: "auto" }} /> {t("parts.fitsAllHelp")}</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", marginTop: 6 }}>
          {models.map((m) => <label key={m.id} style={{ flexDirection: "row", gap: 6, alignItems: "center", color: "var(--ink)" }}><input type="checkbox" name="modelIds" value={m.id} defaultChecked={p.modelIds?.includes(m.id)} style={{ width: "auto" }} /> {m.label}</label>)}
        </div>
      </fieldset>
      <label className="full">{t("u.notes")}<textarea name="notes" rows={2} defaultValue={p.notes ?? ""} /></label>
      <div className="full"><SubmitButton className="btn primary">{submit}</SubmitButton></div>
    </form>
  );
}
