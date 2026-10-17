import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { machineFormOptions } from "@/lib/queries";
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
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <h2>{t("mach.addTitle")}</h2>
      <Notice error={sp.error} />
      <div className="panel"><UnitForm t={t} action={createUnit} submit={t("mach.addTitle")} options={await machineFormOptions()} unit={{ customerId: Number(sp.customer) || undefined }} /></div>
    </div>
  );
}
