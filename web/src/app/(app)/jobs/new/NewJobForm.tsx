"use client";
import { useState } from "react";
import { BAYS, CATEGORIES, CATEGORY_KEYS, PRIORITIES, PRIORITY_LABEL, type Category } from "@/lib/jobs";
import SubmitButton from "@/components/SubmitButton";

type Opt = { id: number; label: string };
export default function NewJobForm({ action, units, leads, busyBays, emergency, defaultDue, today, unitId }: {
  action: (f: FormData) => Promise<void>; units: Opt[]; leads: Opt[]; busyBays: string[]; emergency: boolean; defaultDue: string; today: string; unitId?: number;
}) {
  const [cat, setCat] = useState<Category>(emergency ? "EMG" : "DIAG");
  const [site, setSite] = useState(emergency ? "field" : "workshop");
  return (
    <form action={action} className="form panel" style={{ padding: 16 }}>
      <label className="full">Machine<select className="field" name="unitId" required defaultValue={unitId ?? ""}><option value="" disabled>Choose machine…</option>{units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</select></label>
      <label>Category<select className="field" name="category" value={cat} onChange={(e) => setCat(e.target.value as Category)}>{CATEGORY_KEYS.map((k) => <option key={k} value={k}>{CATEGORIES[k].name}</option>)}</select></label>
      <label>Priority<select className="field" name="priority" key={cat} defaultValue={CATEGORIES[cat].defaultPriority}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</select></label>
      <label>Service location<select className="field" name="siteType" value={site} onChange={(e) => setSite(e.target.value)}><option value="workshop">Workshop</option><option value="field">Field (customer site)</option></select></label>
      {site === "workshop"
        ? <label>Bay<select className="field" name="bay">{BAYS.map((b) => <option key={b} value={b}>{b}{busyBays.includes(b) ? " (in use)" : ""}</option>)}</select></label>
        : <label>Site address / GPS<input type="text" name="siteAddress" required placeholder="e.g. Westport, Pulau Indah, berth 7" /></label>}
      <label>Target due date<input type="date" name="dueDate" defaultValue={emergency ? today : defaultDue} min={today} required /></label>
      <label>Lead<select className="field" name="leadId" defaultValue=""><option value="">Assign later</option>{leads.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select></label>
      <label>Hour meter at intake<input type="number" name="hourMeter" min={0} placeholder="Reading" /></label>
      <label>Reported by<input type="text" name="reportedBy" placeholder="Who called / brought it in" /></label>
      {cat === "WARR" && <label>Original job no.<input type="text" name="parentJobNo" placeholder="J-2026-0311" /></label>}
      <label className="full">Customer complaint<textarea name="complaint" rows={3} required placeholder="What the customer reports, in their words" /></label>
      <div className="full"><SubmitButton className="btn primary" pendingText="Creating…">{emergency ? "Log emergency call-out" : "Create job"}</SubmitButton></div>
    </form>
  );
}
