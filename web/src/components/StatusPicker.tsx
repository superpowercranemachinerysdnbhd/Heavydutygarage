"use client";
import { useState } from "react";

/** "Move to" status list; choosing Completed also asks for the completion date (today by default). */
export default function StatusPicker({ options, openedAt, today, dateLabel }: { options: { value: string; label: string }[]; openedAt: string; today: string; dateLabel: string }) {
  const [to, setTo] = useState(options[0]?.value ?? "");
  return (<>
    <select className="field" id="to" name="to" value={to} onChange={(e) => setTo(e.target.value)}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
    {to === "closed" && <label className="label" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{dateLabel}<input type="date" name="closedAt" defaultValue={today} min={openedAt} max={today} required style={{ width: 160 }} /></label>}
  </>);
}
