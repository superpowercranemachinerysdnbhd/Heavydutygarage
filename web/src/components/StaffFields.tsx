import { ROLE_LABEL, type Role } from "@/lib/permissions";

type S = { name?: string; role?: Role; phone?: string; email?: string | null; reportsTo?: number | null; idNumber?: string | null; permitExpiry?: string | null;
  emergencyContact?: string | null; joined?: string | null; skills?: string[]; payRate?: string };
export default function StaffFields({ s = {}, managers }: { s?: S; managers: { id: number; name: string }[] }) {
  return (<>
    <label>Full name<input name="name" required defaultValue={s.name ?? ""} /></label>
    <label>Role<select className="field" name="role" defaultValue={s.role ?? "mechanic"}>{(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></label>
    <label>Phone (used to sign in)<input name="phone" type="tel" required defaultValue={s.phone ?? ""} /></label>
    <label>Reports to<select className="field" name="reportsTo" defaultValue={s.reportsTo ?? ""}><option value="">—</option>{managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
    <label>Email<input name="email" type="email" defaultValue={s.email ?? ""} /></label>
    <label>IC / passport no.<input name="idNumber" defaultValue={s.idNumber ?? ""} /></label>
    <label>Work permit expiry<input type="date" name="permitExpiry" defaultValue={s.permitExpiry ?? ""} /></label>
    <label>Joined<input type="date" name="joined" defaultValue={s.joined ?? ""} /></label>
    <label>Pay rate (RM per hour, Boss only)<input type="number" name="payRate" min={0} step="0.5" defaultValue={s.payRate ?? "0"} /></label>
    <label>Emergency contact<input name="emergencyContact" defaultValue={s.emergencyContact ?? ""} placeholder="Name · phone" /></label>
    <label className="full">Skills (comma separated)<input name="skills" defaultValue={(s.skills ?? []).join(", ")} placeholder="Hydraulics, Komatsu, Field service" /></label>
  </>);
}
