import Link from "next/link";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { rm } from "@/lib/format";
import { latestPricesByPart, listParts } from "@/lib/inventory";
import { isLowStock, marginPct } from "@/lib/stock";
import { getI18n } from "@/i18n/server";

export async function generateMetadata() {
  return { title: (await getI18n()).t("parts.title") };
}

const q2 = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));

export default async function PartsPage({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string; model?: string; low?: string }> }) {
  const user = await requireUser();
  const { t } = await getI18n();
  const sp = await searchParams;
  const [all, cats, models] = await Promise.all([
    listParts(),
    db.select().from(schema.partCategories).orderBy(asc(schema.partCategories.name)),
    db.select().from(schema.machineModels).orderBy(asc(schema.machineModels.make), asc(schema.machineModels.model)),
  ]);
  const q = (sp.q ?? "").trim().toLowerCase();
  const list = all.filter((p) =>
    (!q || [p.sku, p.oemPartNo, p.description, p.bin].join(" ").toLowerCase().includes(q)) &&
    (!sp.cat || String(p.categoryId) === sp.cat) &&
    (!sp.model || p.fitsAll || p.modelIds.includes(Number(sp.model))) &&
    (sp.low !== "1" || isLowStock(p)));
  const cost = can(user.role, "money.cost"), sell = can(user.role, "money.selling"), margin = false; // margins are not used: parts are costed, not priced
  const prices = cost ? await latestPricesByPart(list.map((p) => p.id)) : new Map();
  const lowN = all.filter(isLowStock).length;

  return (
    <div className="page">
      <div className="view-head"><h2>{t("parts.title")}</h2>
        {can(user.role, "stock.manage") && <Link className="btn" href="/parts/categories">{t("parts.categories")}</Link>}
        {can(user.role, "po.create") && <Link className="btn" href="/purchasing/import">{t("imp.title")}</Link>}
        {can(user.role, "po.create") && lowN > 0 && <Link className="btn" href="/purchasing/new?suggest=1">{t("parts.orderLow", { n: lowN })}</Link>}
        {can(user.role, "stock.manage") && <Link className="btn primary" href="/parts/new">{t("parts.add")}</Link>}
      </div>
      <form className="filters" method="get">
        <input type="search" name="q" defaultValue={sp.q ?? ""} placeholder={t("parts.searchPh")} style={{ flex: "1 1 220px" }} aria-label={t("common.search")} />
        <select className="field" name="cat" defaultValue={sp.cat ?? ""} aria-label={t("parts.category")}><option value="">{t("parts.allCats")}</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className="field" name="model" defaultValue={sp.model ?? ""} aria-label={t("parts.fits")}><option value="">{t("parts.anyModel")}</option>{models.map((m) => <option key={m.id} value={m.id}>{m.make} {m.model}</option>)}</select>
        <label><input type="checkbox" name="low" value="1" defaultChecked={sp.low === "1"} /> {t("parts.lowOnly")}</label>
        <button className="btn">{t("common.filter")}</button>
      </form>
      <div className="tbl-wrap"><table>
        <thead><tr><th>{t("parts.partNo")}</th><th>{t("parts.description")}</th><th>{t("parts.fits")}</th>
          {cost && <th className="r">{t("parts.avgCost")}</th>}{cost && <th>{t("parts.bestPrice")}</th>}
          {sell && <th className="r">{t("parts.sell")}</th>}{margin && <th className="r">{t("parts.margin")}</th>}
          <th className="r">{t("parts.onHand")}</th><th className="r">{t("parts.min")}</th><th>{t("parts.bin")}</th></tr></thead>
        <tbody>
          {list.map((p) => {
            const best = prices.get(p.id)?.[0];
            const m = marginPct(p.sellPrice, p.avgCost);
            const low = isLowStock(p);
            return (
              <tr key={p.id}>
                <td className="mono"><Link href={`/parts/${p.id}`}>{p.sku}</Link>{p.oemPartNo && p.oemPartNo !== p.sku ? <><br /><small className="muted">{p.oemPartNo}</small></> : null}</td>
                <td>{p.description}<br /><small className="muted">{p.category}</small></td>
                <td>{p.fitsAll ? <span className="muted">{t("parts.allModels")}</span> : p.models.join(", ") || "—"}</td>
                {cost && <td className="r num">{p.avgCost ? rm(p.avgCost) : "—"}</td>}
                {cost && <td>{best ? <>{rm(best.price)}<br /><small className="muted">{best.supplierName}</small></> : <span className="muted">—</span>}</td>}
                {sell && <td className="r num">{p.sellPrice ? rm(p.sellPrice) : "—"}</td>}
                {margin && <td className={`r num ${m !== null && m < p.targetMarginPct ? "stock-low" : ""}`}>{m === null ? "—" : `${m}%`}</td>}
                <td className={`r num ${p.bulk ? (low ? "stock-low" : "") : p.onHand < 0 || (p.onHand <= 0 && p.minLevel > 0) ? "stock-out" : low ? "stock-low" : ""}`}>{p.bulk ? <>{t("bulk.about", { n: q2(p.onHand), uom: p.uom })}<br /><span className="pill info">{t("bulk.badge")}</span>{p.lowFlaggedAt && <> <span className="pill warn">{t("bulk.flag")}</span></>}</> : <>{q2(p.onHand)} {p.uom}</>}{p.onOrder > 0 && <><br /><small className="muted">{t("parts.onOrderN", { n: q2(p.onOrder) })}</small></>}</td>
                <td className="r num">{q2(p.minLevel)}</td>
                <td className="mono">{p.bin ?? "—"}</td>
              </tr>
            );
          })}
          {list.length === 0 && <tr><td colSpan={10} className="muted">{all.length ? t("parts.noMatch") : t("parts.none")}</td></tr>}
        </tbody>
      </table></div>
    </div>
  );
}
