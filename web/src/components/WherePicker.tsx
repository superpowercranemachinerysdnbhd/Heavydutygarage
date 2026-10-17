"use client";
import { useState } from "react";
import { placeLabel } from "@/i18n";
import { useT } from "@/i18n/client";
import { bayCodes } from "@/lib/lists";

export const OUTSIDE = "__outside";
/** Not decided yet: the job is logged but nobody has said where (or when) it will be done. */
export const TBD = "__tbd";

/** One list for where the machine is: a bay or area at the workshop, or an outside job (then the site address). */
export default function WherePicker({ defaultWhere, defaultAddress = "", busy = [] }: { defaultWhere?: string; defaultAddress?: string; busy?: string[] }) {
  const t = useT();
  const bays = bayCodes();
  const [where, setWhere] = useState(defaultWhere ?? TBD);
  const extra = where !== OUTSIDE && where !== TBD && !bays.includes(where) ? [where] : [];
  return (<>
    <label>{t("f.where")}
      <select className="field" name="where" value={where} onChange={(e) => setWhere(e.target.value)}>
        <option value={TBD}>{t("loc.tbd")}</option>
        <optgroup label={t("f.workshopGroup")}>
          {[...bays, ...extra].map((b) => <option key={b} value={b}>{placeLabel(t, b)}{busy.includes(b) ? ` ${t("f.inUse")}` : ""}</option>)}
        </optgroup>
        <option value={OUTSIDE}>{t("f.outside")}</option>
      </select>
    </label>
    {where === OUTSIDE && <label>{t("f.siteAddress")}<input type="text" name="siteAddress" required defaultValue={defaultAddress} placeholder={t("f.siteAddressPh")} /></label>}
  </>);
}
