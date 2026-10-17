"use client";
import { useState } from "react";
import { useT } from "@/i18n/client";
import MachineTypeOptions from "./MachineTypeOptions";
import PhotoInput from "./PhotoInput";

export type MachineInit = {
  machineType?: string | null; make?: string; model?: string; customerId?: number; plateNo?: string | null; serialNo?: string | null;
  engineModel?: string | null; transmissionModel?: string | null; pumpModel?: string | null; engineNo?: string | null; year?: number | null; hourMeter?: number;
  hasPhoto?: boolean;
};

/** Company picker with "+ New company" that opens name/contact/phone fields in place. */
export function CompanyPicker({ companies, defaultId }: { companies: { id: number; name: string }[]; defaultId?: number }) {
  const t = useT();
  const [val, setVal] = useState(defaultId ? String(defaultId) : companies.length ? "" : "new");
  return (<>
    <label>{t("u.owner")}
      <select className="field" name="customerId" value={val} onChange={(e) => setVal(e.target.value)} required>
        <option value="" disabled>{t("common.choose")}</option>
        <option value="new">{t("co.new")}</option>
        {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </label>
    {val === "new" && (
      <div className="full inline-new">
        <label>{t("c.name")}<input name="newCompanyName" required autoComplete="organization" /></label>
        <label>{t("c.contact")}<input name="newCompanyContact" /></label>
        <label>{t("c.phone")}<input name="newCompanyPhone" type="tel" /></label>
      </div>
    )}
  </>);
}

/** Machine type, make/model, plate/serial, company and component models. Field names match lib/machines.saveMachine. */
export default function MachineFields({ init = {}, companies, makes, models, showHourMeter = true }: {
  init?: MachineInit; companies: { id: number; name: string }[]; makes: string[]; models: string[]; showHourMeter?: boolean;
}) {
  const t = useT();
  const [more, setMore] = useState(Boolean(init.engineModel || init.transmissionModel || init.pumpModel || init.engineNo || init.year));
  return (<>
    <label>{t("u.type")}
      <select className="field" name="machineType" defaultValue={init.machineType ?? ""} required>
        <option value="" disabled>{t("common.choose")}</option>
        <MachineTypeOptions t={t} keep={init.machineType} />
      </select>
    </label>
    <CompanyPicker companies={companies} defaultId={init.customerId} />
    <label>{t("u.make")}<input name="make" list="dl-makes" required defaultValue={init.make ?? ""} placeholder="Tadano, Kato, Isuzu…" /></label>
    <label>{t("u.model")}<input name="model" list="dl-models" required defaultValue={init.model ?? ""} placeholder="GR-500EX" /></label>
    <label>{t("u.plate")}<input name="plateNo" defaultValue={init.plateNo ?? ""} placeholder="WXY 1234" autoCapitalize="characters" /></label>
    <label>{t("u.serial")}<input name="serialNo" defaultValue={init.serialNo ?? ""} /></label>
    <p className="full hint">{t("u.plateOrSerial")}</p>
    {showHourMeter && <label>{t("u.hm")}<input type="number" name="hourMeter" min={0} defaultValue={init.hourMeter ?? ""} placeholder={t("f.reading")} /></label>}
    <div>{<PhotoInput name="photo" label={t("u.photo")} />}{init.hasPhoto && <small className="muted">{t("u.photoReplace")}</small>}</div>
    {!more && <div className="full"><button type="button" className="linkbtn" onClick={() => setMore(true)}>{t("u.moreDetails")}</button></div>}
    {more && (<>
      <label>{t("u.engineModel")}<input name="engineModel" defaultValue={init.engineModel ?? ""} placeholder="Mitsubishi 6D24" /></label>
      <label>{t("u.transmissionModel")}<input name="transmissionModel" defaultValue={init.transmissionModel ?? ""} /></label>
      <label>{t("u.pumpModel")}<input name="pumpModel" defaultValue={init.pumpModel ?? ""} placeholder="Kawasaki K3V112" /></label>
      <label>{t("u.engine")}<input name="engineNo" defaultValue={init.engineNo ?? ""} /></label>
      <label>{t("u.year")}<input type="number" name="year" min={1950} max={2100} defaultValue={init.year ?? ""} /></label>
    </>)}
    <datalist id="dl-makes">{makes.map((m) => <option key={m} value={m} />)}</datalist>
    <datalist id="dl-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
  </>);
}
