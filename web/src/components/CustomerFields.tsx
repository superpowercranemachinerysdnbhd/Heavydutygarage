type C = { name?: string; contactName?: string | null; phone?: string | null; email?: string | null; address?: string | null; notes?: string | null };
export default function CustomerFields({ c = {} }: { c?: C }) {
  return (<>
    <label>Company name<input name="name" required defaultValue={c.name ?? ""} /></label>
    <label>Contact person<input name="contactName" defaultValue={c.contactName ?? ""} /></label>
    <label>Phone<input name="phone" type="tel" defaultValue={c.phone ?? ""} /></label>
    <label>Email<input name="email" type="email" defaultValue={c.email ?? ""} /></label>
    <label className="full">Address / sites<textarea name="address" rows={2} defaultValue={c.address ?? ""} /></label>
    <label className="full">Notes (payment terms, site access, etc.)<textarea name="notes" rows={2} defaultValue={c.notes ?? ""} /></label>
  </>);
}
