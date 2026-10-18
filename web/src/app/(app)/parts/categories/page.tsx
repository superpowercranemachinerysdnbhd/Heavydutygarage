import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, count, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { STANDARD_PART_CATEGORIES } from "@/lib/part-categories";
import { getI18n } from "@/i18n/server";
import { Notice } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { addCategory, addStandardCategories, deleteCategory, saveCategory } from "../actions";

export async function generateMetadata() {
  return { title: (await getI18n()).t("parts.categories") };
}

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "stock.manage")) notFound();
  const { t } = await getI18n();
  const sp = await searchParams;
  const cats = await db.select({ c: schema.partCategories, n: count(schema.parts.id) }).from(schema.partCategories)
    .leftJoin(schema.parts, eq(schema.parts.categoryId, schema.partCategories.id)).groupBy(schema.partCategories.id).orderBy(asc(schema.partCategories.name));
  const have = new Set(cats.map(({ c }) => c.name.toLowerCase()));
  const missing = STANDARD_PART_CATEGORIES.filter(([name]) => !have.has(name.toLowerCase())).length;
  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <div className="crumbs"><Link href="/parts">{t("parts.title")}</Link> / {t("parts.categories")}</div>
      <h2>{t("parts.categories")}</h2>
      <Notice error={sp.error} ok={sp.ok} />
      <p className="muted" style={{ margin: 0 }}>{t("cat.intro")}</p>

      <form action={addCategory} className="panel"><div className="panel-head"><h3>{t("cat.add")}</h3></div>
        <div className="filters" style={{ padding: 14 }}>
          <input name="name" required placeholder={t("parts.newCategoryPh")} style={{ flex: "1 1 240px" }} aria-label={t("parts.category")} />
          <SubmitButton className="btn small primary">{t("common.add")}</SubmitButton>
        </div>
      </form>
      {missing > 0 && (
        <form action={addStandardCategories} className="filters">
          <SubmitButton className="btn small">{t("cat.addStandard", { n: missing })}</SubmitButton>
          <small className="muted">{t("cat.addStandardHelp")}</small>
        </form>
      )}

      <div className="panel">
        <div className="panel-head"><h3>{t("cat.list")}</h3><span className="count">{cats.length}</span></div>
        <ul className="set-list">
          {cats.map(({ c, n }) => (
            <li key={c.id} className="set-row">
              <form action={saveCategory} className="set-form">
                <input type="hidden" name="id" value={c.id} />
                <input name="name" defaultValue={c.name} required maxLength={80} aria-label={t("parts.category")} className="set-name" />
                <SubmitButton className="btn small">{t("common.save")}</SubmitButton>
                <Link className="muted set-used plain" href={`/parts?cat=${c.id}`}>{t("cat.nParts", { n })}</Link>
              </form>
              {n === 0 && <form action={deleteCategory}><input type="hidden" name="id" value={c.id} /><button className="linkbtn muted" aria-label={`${t("common.remove")}: ${c.name}`}>✕</button></form>}
            </li>
          ))}
          {cats.length === 0 && <li className="empty">{t("cat.none")}</li>}
        </ul>
      </div>
    </div>
  );
}
