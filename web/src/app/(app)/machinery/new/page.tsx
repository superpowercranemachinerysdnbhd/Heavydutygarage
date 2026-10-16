import { notFound } from "next/navigation";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Notice } from "@/components/ui";
import UnitForm from "@/components/UnitForm";
import { createUnit } from "../actions";

export const metadata = { title: "Add machine" };

export default async function NewUnitPage({ searchParams }: { searchParams: Promise<{ error?: string; customer?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "machine.manage")) notFound();
  const sp = await searchParams;
  const [models, customers] = await Promise.all([
    db.select().from(schema.machineModels).orderBy(asc(schema.machineModels.make), asc(schema.machineModels.model)),
    db.select().from(schema.customers).orderBy(asc(schema.customers.name)),
  ]);
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <h2>Add machine</h2>
      <Notice error={sp.error} />
      {(!models.length || !customers.length) && <div className="notice">You need at least one model (Machinery → Model library) and one customer before adding a machine.</div>}
      <div className="panel"><UnitForm action={createUnit} submit="Add machine" unit={{ customerId: Number(sp.customer) || undefined }}
        models={models.map((m) => ({ id: m.id, label: `${m.make} ${m.model} · ${m.type}` }))} customers={customers.map((c) => ({ id: c.id, label: c.name }))} /></div>
    </div>
  );
}
