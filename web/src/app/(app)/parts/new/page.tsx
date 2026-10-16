import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { categoriesAndModels } from "@/lib/catalog";
import { getI18n } from "@/i18n/server";
import { Notice } from "@/components/ui";
import PartForm from "@/components/PartForm";
import { savePart } from "../actions";

export async function generateMetadata() {
  return { title: (await getI18n()).t("parts.add") };
}

export default async function NewPartPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "stock.manage")) notFound();
  const { t } = await getI18n();
  const sp = await searchParams;
  const { categories, models } = await categoriesAndModels();
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <h2>{t("parts.addTitle")}</h2>
      <Notice error={sp.error} />
      <div className="panel"><PartForm action={savePart} t={t} categories={categories} models={models} submit={t("parts.addTitle")} /></div>
      <p className="muted" style={{ margin: 0 }}>{t("parts.addHelp")}</p>
    </div>
  );
}
