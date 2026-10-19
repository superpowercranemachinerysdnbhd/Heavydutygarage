"use client";
import { useState } from "react";
import { PRIORITIES, type Category } from "@/lib/jobs";
import { catPriority, categoryCodes } from "@/lib/lists";
import WherePicker, { OUTSIDE } from "@/components/WherePicker";
import PhotoInput from "@/components/PhotoInput";
import { placeLabel } from "@/i18n";
import { useT } from "@/i18n/client";
import { catLabel, priLabel } from "@/i18n/labels";
import SubmitButton from "@/components/SubmitButton";
import MachineFields from "@/components/MachineFields";
import OutsourceFields from "@/components/OutsourceFields";

type Opt = { id: number; label: string };
type MachineOptions = { companies: { id: number; name: string }[]; makes: string[]; models: string[] };

/** Existing machine: a search box narrows the list (plate, serial, model or company). */
function MachinePicker({ units, unitId }: { units: Opt[]; unitId?: number }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(unitId ? String(unitId) : "");
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = units.filter((u) => String(u.id) === sel || words.every((w) => u.label.toLowerCase().includes(w)));
  return (<>
    <label className="full">{t("f.searchMachine")}<input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="WXY 1234, GR-500…" /></label>
    <label className="full">{t("f.machine")}
      <select className="field" name="unitId" required value={sel} onChange={(e) => setSel(e.target.value)} size={q ? Math.min(7, Math.max(3, shown.length + 1)) : undefined}>
        <option value="" disabled>{t("f.chooseMachine")}</option>
        {shown.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
      </select>
    </label>
    {q && shown.length === 0 && <p className="full hint">{t("f.noMatch")}</p>}
  </>);
}

export default function NewJobForm({ action, units, leads, busyBays, emergency, defaultDue, today, unitId, machineOptions, vendors }: {
  action: (f: FormData) => Promise<void>; units: Opt[]; leads: Opt[]; busyBays: string[]; emergency: boolean; defaultDue: string; today: string; unitId?: number; vendors: string[];
  machineOptions: MachineOptions;
}) {
  const t = useT();
  void defaultDue;
  const [cat, setCat] = useState<Category>(() => { const c = categoryCodes(); return emergency && c.includes("EMG") ? "EMG" : c.includes("DIAG") ? "DIAG" : c[0] ?? ""; });
  const [mode, setMode] = useState<"existing" | "new">(units.length ? "existing" : "new");
  return (
    <form action={action} className="form panel" style={{ padding: 16 }}>
      <div className="form-sect">{t("f.machineSection")}</div>
      <div className="full choice" role="radiogroup" aria-label={t("f.machineSection")}>
        <label><input type="radio" name="machineMode" value="existing" checked={mode === "existing"} onChange={() => setMode("existing")} disabled={!units.length} />{t("f.existingMachine")}</label>
        <label><input type="radio" name="machineMode" value="new" checked={mode === "new"} onChange={() => setMode("new")} />{t("f.newMachine")}</label>
      </div>
      {mode === "existing" ? <MachinePicker units={units} unitId={unitId} /> : <MachineFields {...machineOptions} showHourMeter={false} />}
      <div className="form-sect">{t("f.jobSection")}</div>
      <label>{t("f.category")}<select className="field" name="category" value={cat} onChange={(e) => setCat(e.target.value as Category)}>{categoryCodes().map((k) => <option key={k} value={k}>{catLabel(t, k)}</option>)}</select></label>
      <label>{t("f.priority")}<select className="field" name="priority" key={cat} defaultValue={catPriority(cat)}>{PRIORITIES.map((p) => <option key={p} value={p}>{priLabel(t, p)}</option>)}</select></label>
      <WherePicker defaultWhere={emergency ? OUTSIDE : undefined} busy={busyBays} />
      <label>{t("f.reportedOn")}<input type="date" name="openedAt" defaultValue={today} max={today} required /><small className="muted">{t("f.reportedOnHelp")}</small></label>
      <label>{t("f.dueOptional")}<input type="date" name="dueDate" defaultValue={emergency ? today : ""} min={today} /></label>
      <label className="full set-check" style={{ alignItems: "flex-start" }}><input type="checkbox" name="deferred" /> <span><b>{t("f.deferred")}</b><br /><small className="muted">{t("f.deferredHelp")}</small></span></label>
      <OutsourceFields vendors={vendors} today={today} />
      <label>{t("f.lead")}<select className="field" name="leadId" defaultValue=""><option value="">{t("f.assignLater")}</option>{leads.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select></label>
      <label>{t("f.hourMeterIn")}<input type="number" name="hourMeter" min={0} placeholder={t("f.reading")} /></label>
      <label>{t("f.reportedBy")}<input type="text" name="reportedBy" placeholder={t("f.reportedByPh")} /></label>
      {cat === "WARR" && <label>{t("f.parentJob")}<input type="text" name="parentJobNo" placeholder="J-2026-0311" /></label>}
      <label className="full">{t("f.complaint")}<textarea name="complaint" rows={3} required placeholder={t("f.complaintPh")} /></label>
      <div className="full"><PhotoInput name="photos" multiple label={t("f.beforePhotos")} /></div>
      <div className="full"><SubmitButton className="btn primary" pendingText={t("new.creating")}>{emergency ? t("new.logEmg") : t("new.create")}</SubmitButton></div>
    </form>
  );
}
