import SubmitButton from "./SubmitButton";

type Opt = { id: number; label: string };
type Unit = { id?: number; modelId?: number; customerId?: number; serialNo?: string; engineNo?: string | null; plateNo?: string | null; year?: number | null; hourMeter?: number;
  location?: string; arrivedAt?: string | null; nextServiceDate?: string | null; nextServiceType?: string | null; notes?: string | null };

export default function UnitForm({ action, models, customers, unit, submit }: { action: (f: FormData) => Promise<void>; models: Opt[]; customers: Opt[]; unit?: Unit; submit: string }) {
  const u = unit ?? {};
  return (
    <form action={action} className="form" style={{ padding: 14 }}>
      {u.id && <input type="hidden" name="unitId" value={u.id} />}
      <label>Model<select className="field" name="modelId" defaultValue={u.modelId ?? ""} required><option value="" disabled>Choose…</option>{models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
      <label>Owner<select className="field" name="customerId" defaultValue={u.customerId ?? ""} required><option value="" disabled>Choose…</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
      <label>Serial / chassis no.<input name="serialNo" defaultValue={u.serialNo ?? ""} required /></label>
      <label>Engine no.<input name="engineNo" defaultValue={u.engineNo ?? ""} /></label>
      <label>Plate no.<input name="plateNo" defaultValue={u.plateNo ?? ""} /></label>
      <label>Year<input type="number" name="year" min={1950} max={2100} defaultValue={u.year ?? ""} /></label>
      <label>Hour meter<input type="number" name="hourMeter" min={0} defaultValue={u.hourMeter ?? 0} /></label>
      <label>Location<input name="location" defaultValue={u.location ?? "Customer site"} placeholder="Customer site, Workshop · Bay 2, Long-stay yard A" /></label>
      <label>On our premises since<input type="date" name="arrivedAt" defaultValue={u.arrivedAt ?? ""} /></label>
      <label>Next service due<input type="date" name="nextServiceDate" defaultValue={u.nextServiceDate ?? ""} /></label>
      <label>Next service type<input name="nextServiceType" defaultValue={u.nextServiceType ?? ""} placeholder="500 hr service" /></label>
      <label className="full">Notes<textarea name="notes" rows={2} defaultValue={u.notes ?? ""} /></label>
      <div className="full"><SubmitButton className="btn primary">{submit}</SubmitButton></div>
    </form>
  );
}
