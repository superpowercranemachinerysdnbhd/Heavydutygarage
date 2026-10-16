import { notFound } from "next/navigation";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getI18n } from "@/i18n/server";
import { Notice } from "@/components/ui";
import UnitForm from "@/components/UnitForm";
import { createUnit } from "../actions";

export async function generateMetadata() {
  return { title: (await getI18n()).t("mach.addTitle") };
}

export default async function NewUnitPage({ searchParams }: { searchParams: Promise<{ error?: string; customer?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "machine.manage")) notFound();
  const { t } = await getI18n();
  const sp = await searchParams;
  const [models, customers] = await Promise.all([
    db.select().from(schema.machineModels).orderBy(asc(schema.machineModels.make), asc(schema.machineModels.model)),
    db.select().from(schema.customers).orderBy(asc(schema.customers.name)),
  ]);
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <h2>{t("mach.addTitle")}</h2>
      <Notice error={sp.error} />
      {(!models.length || !customers.length) && <div className="notice">{t("mach.needFirst")}</div>}
      <div className="panel"><UnitForm t={t} action={createUnit} submit={t("mach.addTitle")} unit={{ customerId: Number(sp.customer) || undefined }}
        models={models.map((m) => ({ id: m.id, label: `${m.make} ${m.model} · ${m.type}` }))} customers={customers.map((c) => ({ id: c.id, label: c.name }))} /></div>
    </div>
  );
}
