"use client";
import { useState } from "react";
import { useT } from "@/i18n/client";
import { splitHours } from "@/lib/pay";

/** Time on a work order: either clock times (from – to; split at the start of overtime, shown before saving) or a number of hours with its type. */
export default function LabourHours({ otStart, rateSelect }: { otStart: string; rateSelect: React.ReactNode }) {
  const t = useT();
  const [mode, setMode] = useState<"time" | "hours">("time");
  const [from, setFrom] = useState(""), [to, setTo] = useState(""), [date, setDate] = useState<string | null>(null);
  const split = from && to ? splitHours(from, to, otStart) : null;
  // The date box sits before this in the same form; read it to tell a Sunday.
  const sunday = (() => { const d = date ?? (typeof document !== "undefined" ? (document.querySelector('form input[name="workDate"]') as HTMLInputElement | null)?.value : ""); return d ? new Date(`${d}T00:00:00Z`).getUTCDay() === 0 : false; })();
  return (<>
    <span className="seg" role="group" aria-label={t("lab.byTime")}>
      <button type="button" aria-pressed={mode === "time"} onClick={() => setMode("time")}>{t("lab.byTime")}</button>
      <button type="button" aria-pressed={mode === "hours"} onClick={() => setMode("hours")}>{t("lab.byHours")}</button>
    </span>
    {mode === "time" ? (<>
      <input type="time" name="timeFrom" value={from} onChange={(e) => setFrom(e.target.value)} onFocus={(e) => setDate((e.target.form?.elements.namedItem("workDate") as HTMLInputElement | null)?.value ?? null)} required aria-label={t("lab.from")} title={t("lab.from")} style={{ width: 120 }} />
      <span className="muted">–</span>
      <input type="time" name="timeTo" value={to} onChange={(e) => setTo(e.target.value)} required aria-label={t("lab.to")} title={t("lab.to")} style={{ width: 120 }} />
      {split && <small className="muted">{sunday ? t("lab.previewSun", { h: split.normal + split.ot }) : t("lab.preview", { n: split.normal, ot: split.ot })}</small>}
    </>) : (<>
      <input type="number" name="hours" min="0.25" max="24" step="0.25" placeholder={t("col.hours")} style={{ width: 90 }} required aria-label={t("col.hours")} />
      {rateSelect}
    </>)}
  </>);
}
