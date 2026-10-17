"use client";
import { useState } from "react";
import { placeLabel } from "@/i18n";
import { useT } from "@/i18n/client";
import { bayCodes } from "@/lib/lists";

export const OUTSIDE = "__outside";

/** One list for where the machine is: a bay or area at the workshop, or an outside job (then the site address). */
export default function WherePicker({ defaultWhere, defaultAddress = "", busy = [] }: { defaultWhere?: string; defaultAddress?: string; busy?: string[] }) {
  const t = useT();
  const bays = bayCodes();
  const [where, setWhere] = useState(defaultWhere ?? bays[0] ?? OUTSIDE);
  const extra = where !== OUTSIDE && !bays.includes(where) ? [where] : [];
  return (<>
    <label>{t("f.where")}
      <select className="field" name="where" value={where} onChange={(e) => setWhere(e.target.value)}>
        <optgroup label={t("f.workshopGroup")}>
          {[...bays, ...extra].map((b) => <option key={b} value={b}>{placeLabel(t, b)}{busy.includes(b) ? ` ${t("f.inUse")}` : ""}</option>)}
        </optgroup>
        <option value={OUTSIDE}>{t("f.outside")}</option>
      </select>
    </label>
    {where === OUTSIDE && <label>{t("f.siteAddress")}<input type="text" name="siteAddress" required defaultValue={defaultAddress} placeholder={t("f.siteAddressPh")} /></label>}
  </>);
}
