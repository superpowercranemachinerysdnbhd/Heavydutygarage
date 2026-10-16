import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, count, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Notice } from "@/components/ui";
import CustomerFields from "@/components/CustomerFields";
import SubmitButton from "@/components/SubmitButton";
import { createCustomer } from "./actions";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; error?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "customer.manage")) notFound();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const rows = (await db.select({ c: schema.customers, machines: count(schema.machineUnits.id) }).from(schema.customers)
    .leftJoin(schema.machineUnits, eq(schema.machineUnits.customerId, schema.customers.id)).groupBy(schema.customers.id).orderBy(asc(schema.customers.name)))
    .filter(({ c }) => !q || [c.name, c.contactName, c.phone].join(" ").toLowerCase().includes(q));
  return (
    <div className="page">
      <h2>Customers</h2>
      <Notice error={sp.error} />
      <form className="filters" method="get"><input type="search" name="q" defaultValue={sp.q ?? ""} placeholder="Search name, contact, phone" style={{ flex: "1 1 240px" }} aria-label="Search" /><button className="btn">Search</button></form>
      <div className="tbl-wrap"><table>
        <thead><tr><th>Company</th><th>Contact</th><th>Phone</th><th className="r">Machines</th></tr></thead>
        <tbody>{rows.map(({ c, machines }) => <tr key={c.id}><td><Link href={`/customers/${c.id}`}><b>{c.name}</b></Link></td><td>{c.contactName ?? "—"}</td><td className="mono">{c.phone ?? "—"}</td><td className="r num">{machines}</td></tr>)}
          {rows.length === 0 && <tr><td colSpan={4} className="muted">No customers yet.</td></tr>}</tbody>
      </table></div>
      <form action={createCustomer} className="panel"><div className="panel-head"><h3>Add customer</h3></div>
        <div className="form" style={{ padding: 14 }}><CustomerFields /><div className="full"><SubmitButton className="btn primary">Add customer</SubmitButton></div></div></form>
    </div>
  );
}
