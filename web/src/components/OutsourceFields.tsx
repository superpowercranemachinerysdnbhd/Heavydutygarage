"use client";
import { useState } from "react";
import { useT } from "@/i18n/client";

export type OutsourceValues = { vendorName?: string; vendorRef?: string | null; sentOutAt?: string | null; expectedBackAt?: string | null; backAt?: string | null };

/** "Who does the work?": our crew, or an outside workshop / supplier with its reference and dates. */
export default function OutsourceFields({ vendors, today, initial, showBack = false }: { vendors: string[]; today: string; initial?: OutsourceValues | null; showBack?: boolean }) {
  const t = useT();
  const [by, setBy] = useState<"crew" | "vendor">(initial ? "vendor" : "crew");
  return (<>
    <div className="full">
      <span className="label">{t("f.doneBy")}</span>
      <div className="choice" role="radiogroup" aria-label={t("f.doneBy")}>
        <label><input type="radio" name="doneBy" value="crew" checked={by === "crew"} onChange={() => setBy("crew")} />{t("f.ourCrew")}</label>
        <label><input type="radio" name="doneBy" value="vendor" checked={by === "vendor"} onChange={() => setBy("vendor")} />{t("f.byVendor")}</label>
      </div>
    </div>
    {by === "vendor" && (<>
      <label>{t("out.vendor")}<input name="vendorName" list="vendors-list" required defaultValue={initial?.vendorName ?? ""} placeholder={t("out.vendorPh")} autoComplete="off" /></label>
      <datalist id="vendors-list">{vendors.map((v) => <option key={v} value={v} />)}</datalist>
      <label>{t("out.ref")}<input name="vendorRef" defaultValue={initial?.vendorRef ?? ""} maxLength={60} /></label>
      <label>{t("out.sent")}<input type="date" name="sentOutAt" defaultValue={initial?.sentOutAt ?? today} max={today} required /></label>
      <label>{t("out.expected")}<input type="date" name="expectedBackAt" defaultValue={initial?.expectedBackAt ?? ""} /></label>
      {showBack && <label>{t("out.backOn")}<input type="date" name="backAt" defaultValue={initial?.backAt ?? ""} max={today} /></label>}
      <p className="full hint" style={{ margin: 0 }}>{t("out.help")}</p>
    </>)}
  </>);
}
