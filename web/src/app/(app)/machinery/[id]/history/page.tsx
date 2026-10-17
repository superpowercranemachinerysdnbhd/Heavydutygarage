import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { categoryCodes } from "@/lib/lists";
import { labourRate, addDays, daysBetween, fmtDate, fmtDateTime, rm, today, hmText } from "@/lib/format";
import { listJobs } from "@/lib/queries";
import { getI18n } from "@/i18n/server";
import { LOCALES, isLocale, placeLabel, translator, type Locale } from "@/i18n";
import { catLabel, langLabel, statusLabel } from "@/i18n/labels";
import PrintButton from "@/components/PrintButton";
import { machineTypeLabel, unitRef } from "@/lib/machine-types";
import DocBrand from "@/components/DocBrand";

export async function generateMetadata() {
  return { title: (await getI18n()).t("hist.title") };
}

export default async function HistoryReport({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ range?: string; prices?: string; lang?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "job.report")) notFound();
  const { t: ui } = await getI18n();
  const id = Number((await params).id);
  const sp = await searchParams;
  const [row] = await db.select({ unit: schema.machineUnits, model: schema.machineModels, customer: schema.customers }).from(schema.machineUnits)
    .innerJoin(schema.machineModels, eq(schema.machineUnits.modelId, schema.machineModels.id))
    .innerJoin(schema.customers, eq(schema.machineUnits.customerId, schema.customers.id)).where(eq(schema.machineUnits.id, id));
  if (!row) notFound();
  const { unit, model, customer } = row;
  const lang: Locale = isLocale(sp.lang) ? sp.lang : isLocale(customer.locale) ? customer.locale : "en";
  const t = translator(lang);
  const all = sp.range === "all", prices = sp.prices === "1";
  const d = today(), from = all ? "0000-00-00" : addDays(d, -365);
  const list = (await listJobs(user, { unitId: id })).filter((j) => j.openedAt >= from);
  const down = (j: (typeof list)[number]) => Math.max(1, daysBetween(j.openedAt, j.closedAt ?? d));
  const value = (j: (typeof list)[number]) => (j.category === "WARR" ? 0 : j.labourHours * labourRate() + j.partsValue);
  const hrs = list.reduce((a, j) => a + j.labourHours, 0), days = list.reduce((a, j) => a + down(j), 0), billed = list.reduce((a, j) => a + value(j), 0);
  const byCat = [...new Set([...categoryCodes({ all: true }), ...list.map((j) => j.category)])].map((k) => [k, list.filter((j) => j.category === k).length] as const).filter(([, n]) => n);
  const q = (c: Partial<{ range: string; prices: boolean; lang: Locale }>) => {
    const v = { range: all ? "all" : "12", prices, lang, ...c };
    return `?${new URLSearchParams({ range: v.range, prices: v.prices ? "1" : "0", lang: v.lang })}`;
  };

  return (
    <div className="page" style={{ maxWidth: 900, marginInline: "auto" }}>
      <div className="no-print stack">
        <div className="crumbs"><Link href={`/machinery/${id}`}>{unitRef(unit)}</Link> / {ui("mach.historyReport")}</div>
        <div className="docbar">
          <div className="filters"><span className="label">{ui("rep.language")}</span>
            {LOCALES.map((l) => <Link key={l} className="btn small" href={q({ lang: l })} aria-pressed={lang === l}>{lang === l ? "✓ " : ""}{langLabel(ui, l)}</Link>)}
          </div>
          <div className="filters">
            <span className="label">{ui("hist.period")}</span>
            <Link className="btn small" href={q({ range: "12" })} aria-pressed={!all}>{!all ? "✓ " : ""}{ui("hist.12m")}</Link>
            <Link className="btn small" href={q({ range: "all" })} aria-pressed={all}>{all ? "✓ " : ""}{ui("hist.all")}</Link>
            <Link className="btn small" href={q({ prices: !prices })} aria-pressed={prices}>{prices ? "✓ " : ""}{ui("hist.amounts")}</Link>
            <PrintButton />
          </div>
        </div>
      </div>
      <article className="doc" aria-label={t("hist.title")} lang={lang === "zh" ? "zh-Hans" : lang}>
        <div className="doc-head">
          <DocBrand t={t} />
          <div className="doc-meta"><b>{t("hist.title")}</b><span>{unitRef(unit)}</span><span>{fmtDate(d, true, lang)}</span></div>
        </div>
        <div className="doc-grid">
          <div><h4>{t("rep.machine")}</h4><dl><dt>{t("rep.model")}</dt><dd>{model.make} {model.model} · {machineTypeLabel(t, unit.category ?? model.type)}</dd><dt>{t("rep.serial")}</dt><dd>{unit.serialNo ?? "—"}</dd><dt>{t("rep.yearPlate")}</dt><dd>{unit.year ?? "—"} · {unit.plateNo ?? "—"}</dd><dt>{t("rep.hourMeter")}</dt><dd>{hmText(unit.hourMeter)}</dd></dl></div>
          <div><h4>{t("hist.owner")}</h4><dl><dt>{t("rep.company")}</dt><dd>{customer.name}</dd><dt>{t("rep.contact")}</dt><dd>{customer.contactName ?? "—"} · {customer.phone ?? ""}</dd><dt>{t("rep.location")}</dt><dd>{placeLabel(t, unit.location)}</dd>{unit.arrivedAt && <><dt>{t("hist.withUsSince")}</dt><dd>{t("hist.daysN", { date: fmtDate(unit.arrivedAt, true, lang), n: daysBetween(unit.arrivedAt, d) })}</dd></>}</dl></div>
        </div>
        <div><h4>{t("hist.summary", { period: all ? t("hist.all") : t("hist.12m") })}</h4>
          <div className="sumrow"><div><b>{list.length}</b><small>{t("hist.jobs")}</small></div><div><b>{hrs}</b><small>{t("hist.labourHours")}</small></div><div><b>{days}</b><small>{t("hist.daysOff")}</small></div>{prices && <div><b>{rm(billed)}</b><small>{t("hist.billed")}</small></div>}</div>
          <p style={{ marginTop: 8 }}>{byCat.map(([k, n]) => `${n} × ${catLabel(t, k)}`).join(" · ") || t("hist.noJobs")}</p></div>
        <div><h4>{t("hist.jobHistory")}</h4><div className="dt"><table>
          <thead><tr><th>{t("col.date")}</th><th>{t("col.job")}</th><th>{t("col.type")}</th><th>{t("col.complaintFindings")}</th><th className="r">{t("col.days")}</th>{prices && <th className="r">{t("col.amount")}</th>}</tr></thead>
          <tbody>{list.map((j) => <tr key={j.id}><td style={{ whiteSpace: "nowrap" }}>{fmtDate(j.openedAt, true, lang)}</td><td className="mono" style={{ whiteSpace: "nowrap" }}>{j.jobNo}</td><td>{catLabel(t, j.category)}</td>
            <td><b>{j.complaint}</b>{j.status !== "closed" && <><br /><small>{t("hist.open", { status: statusLabel(t, j.status) })}</small></>}</td><td className="r">{down(j)}</td>{prices && <td className="r">{j.category === "WARR" ? t("hist.warranty") : rm(value(j))}</td>}</tr>)}</tbody>
        </table></div></div>
        <div><h4>{t("hist.comingUp")}</h4><p>{unit.nextServiceDate ? t("hist.nextDue", { type: unit.nextServiceType ?? t("hist.serviceDefault"), date: fmtDate(unit.nextServiceDate, true, lang) }) : t("hist.noNext")}</p></div>
        <div className="doc-foot">{t("rep.generated", { when: fmtDateTime(new Date(), lang), name: user.name })}</div>
      </article>
    </div>
  );
}
