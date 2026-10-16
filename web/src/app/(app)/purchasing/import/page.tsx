import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { activeSuppliers } from "@/lib/catalog";
import { today } from "@/lib/format";
import { getI18n } from "@/i18n/server";
import PurchasingTabs from "@/components/PurchasingTabs";
import ImportForm from "./ImportForm";

export async function generateMetadata() {
  return { title: (await getI18n()).t("imp.title") };
}

export default async function ImportPage() {
  const user = await requireUser();
  if (!can(user.role, "po.create")) notFound();
  const { t } = await getI18n();
  const sups = (await activeSuppliers()).filter((s) => s.active);
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div className="view-head"><h2>{t("imp.title")}</h2></div>
      <PurchasingTabs t={t} active="import" />
      <div className="panel"><div className="in" style={{ padding: 14 }}>
        <p style={{ margin: 0 }}>{t("imp.help1")}</p>
        <pre className="mono" style={{ margin: 0, background: "var(--surface-2)", padding: 10, borderRadius: 5, overflowX: "auto" }}>Part No,Description,Price,Supplier Code{"\n"}1R-0739,Oil filter,61.50,SHP-0739{"\n"}HYD-VG46-20,Hydraulic oil 20L,215.00,</pre>
        <small className="muted">{t("imp.help2")}</small>
      </div></div>
      <ImportForm suppliers={sups.map((s) => ({ id: s.id, name: s.name }))} today={today()} />
    </div>
  );
}
