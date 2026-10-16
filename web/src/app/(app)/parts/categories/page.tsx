import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, count, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getI18n } from "@/i18n/server";
import { Notice } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { addCategory, saveCategory } from "../actions";

export async function generateMetadata() {
  return { title: (await getI18n()).t("parts.categories") };
}

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "stock.manage")) notFound();
  const { t } = await getI18n();
  const sp = await searchParams;
  const boss = can(user.role, "price.set");
  const cats = await db.select({ c: schema.partCategories, n: count(schema.parts.id) }).from(schema.partCategories)
    .leftJoin(schema.parts, eq(schema.parts.categoryId, schema.partCategories.id)).groupBy(schema.partCategories.id).orderBy(asc(schema.partCategories.name));
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div className="crumbs"><Link href="/parts">{t("parts.title")}</Link> / {t("parts.categories")}</div>
      <h2>{t("parts.categories")}</h2>
      <Notice error={sp.error} ok={sp.ok} />
      {boss && <p className="muted" style={{ margin: 0 }}>{t("cat.help")}</p>}
      <div className="tbl-wrap"><table>
        <thead><tr><th>{t("parts.category")}</th><th className="r">{t("cat.parts")}</th>{boss && <><th>{t("cat.markup")}</th><th>{t("cat.target")}</th><th></th></>}</tr></thead>
        <tbody>{cats.map(({ c, n }) => (
          <tr key={c.id}><td><b>{c.name}</b></td><td className="r num">{n}</td>
            {boss && <td colSpan={3}><form action={saveCategory} className="filters">
              <input type="hidden" name="id" value={c.id} />
              <input type="number" name="markupPct" step="0.5" min="0" defaultValue={Number(c.markupPct)} style={{ width: 90 }} aria-label={t("cat.markup")} /> %
              <input type="number" name="targetMarginPct" step="0.5" min="0" max="99" defaultValue={Number(c.targetMarginPct)} style={{ width: 90 }} aria-label={t("cat.target")} /> %
              <SubmitButton>{t("common.save")}</SubmitButton></form></td>}
          </tr>))}
          {cats.length === 0 && <tr><td colSpan={5} className="muted">{t("cat.none")}</td></tr>}
        </tbody>
      </table></div>
      <form action={addCategory} className="panel"><div className="panel-head"><h3>{t("cat.add")}</h3></div>
        <div className="filters" style={{ padding: 14 }}>
          <input name="name" required placeholder={t("parts.newCategoryPh")} style={{ flex: "1 1 200px" }} aria-label={t("parts.category")} />
          {boss && <><input type="number" name="markupPct" step="0.5" min="0" defaultValue={40} style={{ width: 90 }} aria-label={t("cat.markup")} /> %</>}
          <SubmitButton className="btn small primary">{t("common.add")}</SubmitButton>
        </div></form>
    </div>
  );
}
