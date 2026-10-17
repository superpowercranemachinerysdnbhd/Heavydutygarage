"use client";
import { useState } from "react";
import { BAYS, CATEGORIES, CATEGORY_KEYS, PRIORITIES, type Category } from "@/lib/jobs";
import { placeLabel } from "@/i18n";
import { useT } from "@/i18n/client";
import { catLabel, priLabel } from "@/i18n/labels";
import SubmitButton from "@/components/SubmitButton";
import MachineFields from "@/components/MachineFields";

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

export default function NewJobForm({ action, units, leads, busyBays, emergency, defaultDue, today, unitId, machineOptions }: {
  action: (f: FormData) => Promise<void>; units: Opt[]; leads: Opt[]; busyBays: string[]; emergency: boolean; defaultDue: string; today: string; unitId?: number;
  machineOptions: MachineOptions;
}) {
  const t = useT();
  const [cat, setCat] = useState<Category>(emergency ? "EMG" : "DIAG");
  const [site, setSite] = useState(emergency ? "field" : "workshop");
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
      <label>{t("f.category")}<select className="field" name="category" value={cat} onChange={(e) => setCat(e.target.value as Category)}>{CATEGORY_KEYS.map((k) => <option key={k} value={k}>{catLabel(t, k)}</option>)}</select></label>
      <label>{t("f.priority")}<select className="field" name="priority" key={cat} defaultValue={CATEGORIES[cat].defaultPriority}>{PRIORITIES.map((p) => <option key={p} value={p}>{priLabel(t, p)}</option>)}</select></label>
      <label>{t("f.location")}<select className="field" name="siteType" value={site} onChange={(e) => setSite(e.target.value)}><option value="workshop">{t("f.workshop")}</option><option value="field">{t("f.fieldSite")}</option></select></label>
      {site === "workshop"
        ? <label>{t("f.bay")}<select className="field" name="bay">{BAYS.map((b) => <option key={b} value={b}>{placeLabel(t, b)}{busyBays.includes(b) ? ` ${t("f.inUse")}` : ""}</option>)}</select></label>
        : <label>{t("f.siteAddress")}<input type="text" name="siteAddress" required placeholder={t("f.siteAddressPh")} /></label>}
      <label>{t("f.due")}<input type="date" name="dueDate" defaultValue={emergency ? today : defaultDue} min={today} required /></label>
      <label>{t("f.lead")}<select className="field" name="leadId" defaultValue=""><option value="">{t("f.assignLater")}</option>{leads.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select></label>
      <label>{t("f.hourMeterIn")}<input type="number" name="hourMeter" min={0} placeholder={t("f.reading")} /></label>
      <label>{t("f.reportedBy")}<input type="text" name="reportedBy" placeholder={t("f.reportedByPh")} /></label>
      {cat === "WARR" && <label>{t("f.parentJob")}<input type="text" name="parentJobNo" placeholder="J-2026-0311" /></label>}
      <label className="full">{t("f.complaint")}<textarea name="complaint" rows={3} required placeholder={t("f.complaintPh")} /></label>
      <div className="full"><SubmitButton className="btn primary" pendingText={t("new.creating")}>{emergency ? t("new.logEmg") : t("new.create")}</SubmitButton></div>
    </form>
  );
}
