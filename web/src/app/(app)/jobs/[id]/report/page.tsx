import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { qcMessageKey } from "@/lib/jobs";
import { labourRate, fmtDate, fmtDateTime, rm, today } from "@/lib/format";
import { getJob } from "@/lib/queries";
import { jobPartsFor, jobPurchasesFor } from "@/lib/inventory";
import { getI18n } from "@/i18n/server";
import { LOCALES, isLocale, placeLabel, translator, type Locale } from "@/i18n";
import { catLabel, langLabel, stageLabel } from "@/i18n/labels";
import { Notice } from "@/components/ui";
import PrintButton from "@/components/PrintButton";
import SubmitButton from "@/components/SubmitButton";
import { saveRecommendations } from "../../actions";
import { machineTypeLabel } from "@/lib/machine-types";
import DocBrand from "@/components/DocBrand";
import Suggest from "@/components/Suggest";
import { servicesOnJob } from "@/lib/services";
import { itemLabel } from "@/lib/lists";
import { recommendationIdeas } from "@/lib/recommendations";

export async function generateMetadata() {
  return { title: (await getI18n()).t("rep.title") };
}

export default async function ReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  if (!can(user.role, "job.report")) notFound();
  const { t: ui } = await getI18n();
  const d = await getJob(Number((await params).id));
  if (!d) notFound();
  const sp = await searchParams;
  const { job, unit, model, customer, lead, team, tasks, qc, labour, photos } = d;
  const servicesDone = await servicesOnJob(job.id);
  const doneTasks = tasks.filter((x) => x.doneAt);
  // The report itself is written in the customer's language; the controls above it stay in the user's language.
  const lang: Locale = isLocale(sp.lang) ? sp.lang : isLocale(customer.locale) ? customer.locale : "en";
  const t = translator(lang);
  // Reports carry no prices: work orders are costed internally, not charged from here.
  // What the report shows (each on unless switched off in the link): photos, quality checks, labour hours, part no. and description of parts.
  const o = { prices: false, photos: sp.photos !== "0", qc: sp.qc !== "0", labour: sp.labour !== "0", pno: sp.pno !== "0", pdesc: sp.pdesc !== "0" };
  const SHOW = ["photos", "qc", "labour", "pno", "pdesc"] as const;
  const final = job.status === "closed";
  const no = "SR-" + job.jobNo.slice(2);
  const warr = job.category === "WARR";
  const byPerson = new Map<string, number>();
  labour.forEach((l) => byPerson.set(l.name, (byPerson.get(l.name) ?? 0) + Number(l.hours)));
  const hours = [...byPerson.values()].reduce((a, b) => a + b, 0);
  const [stockLines, boughtLines] = await Promise.all([jobPartsFor(job.id), jobPurchasesFor(job.id)]);
  // One parts list for the customer: from stock and bought for the job.
  const issued = [
    ...stockLines.map((x) => ({ id: `s${x.id}`, ref: x.oem ?? x.sku, description: x.description, qty: x.qty, uom: x.uom, unitPrice: x.unitPrice })),
    ...boughtLines.map((x) => ({ id: `b${x.id}`, ref: x.partNo ?? "—", description: x.description, qty: x.qty, uom: x.uom, unitPrice: x.unitPrice })),
  ];
  const partsTotal = warr ? 0 : issued.reduce((a, x) => a + x.qty * x.unitPrice, 0);
  const labourTotal = warr ? 0 : hours * labourRate();
  // Only what someone wrote; suggestions are offered beside the box, never filled in automatically.
  const rec = job.recommendations ?? "";
  const recIdeas = recommendationIdeas(d, t, lang);
  const stages = (["before", "during", "after", "qc"] as const).map((s) => [s, photos.filter((p) => p.stage === s)] as const).filter(([, l]) => l.length);
  const techs = [lead, ...team].filter(Boolean).map((p) => p!.name);
  const href = (change: Partial<Record<(typeof SHOW)[number] | "prices", boolean> & { lang: Locale }>) => {
    const v = { ...o, lang, ...change };
    return `?${new URLSearchParams({ prices: v.prices ? "1" : "0", ...Object.fromEntries(SHOW.map((k) => [k, v[k] ? "1" : "0"])), lang: v.lang })}`;
  };
  // Machines without an hour meter show a dash instead of "0 h".
  const hm = [job.hourMeterIn ? t("rep.hmIn", { in: job.hourMeterIn.toLocaleString() }) : "", job.signoffHourMeter ? t("rep.hmOut", { out: job.signoffHourMeter.toLocaleString() }) : ""].filter(Boolean).join(" · ") || "—";

  return (
    <div className="page" style={{ maxWidth: 860, marginInline: "auto" }}>
      <div className="no-print stack">
        <div className="crumbs"><Link href={`/jobs/${job.id}`}>{job.jobNo}</Link> / {ui("rep.title")}</div>
        <Notice error={sp.error} ok={sp.ok} />
        <div className="docbar">
          <div className="filters"><span className="label">{ui("rep.language")}</span>
            {LOCALES.map((l) => <Link key={l} className="btn small" href={href({ lang: l })} aria-pressed={lang === l}>{lang === l ? "✓ " : ""}{langLabel(ui, l)}</Link>)}
          </div>
          <div className="filters"><span className="label">{ui("rep.include")}</span>
            <Link className="btn small" href={href({ photos: !o.photos })} aria-pressed={o.photos}>{o.photos ? "✓ " : ""}{ui("rep.photos")}</Link>
            <Link className="btn small" href={href({ qc: !o.qc })} aria-pressed={o.qc}>{o.qc ? "✓ " : ""}{ui("rep.qc")}</Link>
            <Link className="btn small" href={href({ labour: !o.labour })} aria-pressed={o.labour}>{o.labour ? "✓ " : ""}{ui("rep.labourToggle")}</Link>
            <Link className="btn small" href={href({ pno: !o.pno })} aria-pressed={o.pno}>{o.pno ? "✓ " : ""}{ui("rep.pnoToggle")}</Link>
            <Link className="btn small" href={href({ pdesc: !o.pdesc })} aria-pressed={o.pdesc}>{o.pdesc ? "✓ " : ""}{ui("rep.pdescToggle")}</Link>
          </div>
          <form action={saveRecommendations} className="stack" style={{ gap: 6 }}>
            <input type="hidden" name="jobId" value={job.id} /><input type="hidden" name="lang" value={lang} />
            <input type="hidden" name="prices" value={o.prices ? "1" : "0"} /><input type="hidden" name="photos" value={o.photos ? "1" : "0"} />{SHOW.map((k) => <input key={k} type="hidden" name={k} value={o[k] ? "1" : "0"} />)}
            <label className="label" htmlFor="recommendations">{ui("rep.recTo")}</label>
            <textarea id="recommendations" name="recommendations" rows={3} defaultValue={rec} />
            {recIdeas.length > 0 && <Suggest target="recommendations" label={ui("rec.ideas")} items={recIdeas} />}
            <div className="btnrow"><SubmitButton>{ui("rep.saveRec")}</SubmitButton><PrintButton /></div>
          </form>
          <small className="muted">{ui("rep.note")}</small>
        </div>
      </div>

      <article className="doc" aria-label={t("rep.title")} lang={lang === "zh" ? "zh-Hans" : lang}>
        <div className="doc-head">
          <DocBrand t={t} />
          <div className="doc-meta"><b>{t("rep.title")}</b><span>{no}</span><span>{fmtDate(final ? job.closedAt ?? today() : today(), true, lang)}</span></div>
        </div>
        <span className={`stamp ${final ? "final" : ""}`}>{final ? t("rep.final") : t("rep.interim")}</span>
        <div className="doc-grid">
          <div><h4>{t("rep.customer")}</h4><dl><dt>{t("rep.company")}</dt><dd>{customer.name}</dd><dt>{t("rep.contact")}</dt><dd>{customer.contactName ?? "—"}</dd><dt>{t("rep.phone")}</dt><dd>{customer.phone ?? "—"}</dd></dl></div>
          <div><h4>{t("rep.machine")}</h4><dl><dt>{t("rep.model")}</dt><dd>{model.make} {model.model} · {machineTypeLabel(t, unit.category ?? model.type)}</dd><dt>{t("rep.serial")}</dt><dd>{unit.serialNo ?? "—"}</dd><dt>{t("rep.yearPlate")}</dt><dd>{unit.year ?? "—"} · {unit.plateNo ?? "—"}</dd><dt>{t("rep.hourMeter")}</dt><dd>{hm}</dd></dl></div>
          <div><h4>{t("rep.job")}</h4><dl><dt>{t("rep.jobNo")}</dt><dd>{job.jobNo}</dd><dt>{t("rep.type")}</dt><dd>{catLabel(t, job.category)}</dd><dt>{t("rep.location")}</dt><dd>{job.siteType === "field" ? t("rep.onSite") : t("loc.workshop")}: {placeLabel(t, job.siteLocation)}</dd><dt>{t("rep.received")}</dt><dd>{fmtDate(job.openedAt, true, lang)}</dd><dt>{t("rep.completed")}</dt><dd>{job.closedAt ? fmtDate(job.closedAt, true, lang) : "—"}</dd><dt>{t("rep.technicians")}</dt><dd>{techs.join(", ") || "—"}</dd></dl></div>
        </div>
        <div><h4>{t("rep.complaint")}</h4><p>{job.complaint}</p></div>
        <div><h4>{t("rep.findings")}</h4><p>{job.diagnosis || "—"}</p></div>
        {/* One "Work carried out" section: the written account, then the tasks ticked as done. */}
        <div><h4>{t("rep.work")}</h4>
          {job.workDone && <p style={{ whiteSpace: "pre-line" }}>{job.workDone}</p>}
          {doneTasks.length > 0 && <ul>{doneTasks.map((x) => <li key={x.id}>{x.description}</li>)}</ul>}
          {!job.workDone && doneTasks.length === 0 && <p>—</p>}
        </div>
        {servicesDone.length > 0 && <div><h4>{t("rep.services")}</h4>
          <div className="dt"><table><thead><tr><th>{t("rep.service")}</th><th>{t("rep.doneOn")}</th><th>{t("rep.nextDue")}</th></tr></thead>
            <tbody>{servicesDone.map((s) => <tr key={s.id}><td>✓ {itemLabel(t, "service_item", s.item)}</td><td>{fmtDate(s.doneOn, true, lang)}</td><td>{s.nextDue ? fmtDate(s.nextDue, true, lang) : "—"}</td></tr>)}</tbody></table></div>
        </div>}
        {(o.pno || o.pdesc) && <div><h4>{t("rep.parts")}</h4>{issued.length ? (
          <div className="dt"><table><thead><tr>{o.pno && <th>{t("parts.partNo")}</th>}{o.pdesc && <th>{t("parts.description")}</th>}<th className="r">{t("po.qty")}</th>{o.prices && <><th className="r">{t("po.unitPrice")}</th><th className="r">{t("col.amount")}</th></>}</tr></thead>
            <tbody>{issued.map((x) => <tr key={x.id}>{o.pno && <td>{x.ref}</td>}{o.pdesc && <td>{x.description}</td>}<td className="r">{x.qty} {x.uom}</td>{o.prices && <><td className="r">{warr ? t("rep.noCharge") : rm(x.unitPrice)}</td><td className="r">{warr ? t("rep.noCharge") : rm(x.qty * x.unitPrice)}</td></>}</tr>)}</tbody></table></div>
        ) : <p>{t("rep.noParts")}</p>}</div>}
        {o.labour && <div><h4>{t("rep.labour")}</h4>{byPerson.size ? (
          <div className="dt"><table><thead><tr><th>{t("col.technician")}</th><th className="r">{t("col.hours")}</th>{o.prices && <th className="r">{t("col.amount")}</th>}</tr></thead>
            <tbody>{[...byPerson].map(([n, h]) => <tr key={n}><td>{n}</td><td className="r">{h}</td>{o.prices && <td className="r">{warr ? t("rep.noCharge") : rm(h * labourRate())}</td>}</tr>)}</tbody></table></div>
        ) : <p>—</p>}</div>}
        {o.prices && <div className="tot"><span>{t("rep.parts")}</span><b>{warr ? t("rep.noCharge") : rm(partsTotal)}</b><span>{t("rep.labourHrs", { h: hours })}</span><b>{warr ? t("rep.noCharge") : rm(labourTotal)}</b><span><b>{t("rep.total")}</b></span><b>{rm(partsTotal + labourTotal)}</b></div>}
        {o.photos && stages.length > 0 && <div><h4>{t("rep.photos")}</h4>{stages.map(([s, l]) => (
          <div key={s} className="photos" style={{ marginBottom: 8 }}>{l.map((p) => <figure key={p.id} className="photo"><img src={`/api/photos/${p.id}`} alt={p.caption ?? stageLabel(t, s)} /><figcaption><span className="stage">{stageLabel(t, s)}</span> {p.caption}</figcaption></figure>)}</div>
        ))}</div>}
        {o.qc && qc.length > 0 && <div><h4>{t("job.qc")}</h4><div className="dt"><table><tbody>{qc.map((q) => {
          const pending = !q.passedAt && job.status !== "closed";
          return <tr key={q.id}><td>{q.itemKey ? t(qcMessageKey(q.itemKey)) : q.item}</td><td className={`r ${q.passedAt ? "ok" : pending ? "" : "no"}`}>{q.passedAt ? t("rep.pass") : pending ? t("rep.pending") : t("rep.notDone")}</td></tr>;
        })}</tbody></table></div></div>}
        {rec.trim() && <div><h4>{t("rep.recommendations")}</h4><p className="rec">{rec}</p></div>}
        <div className="sign">
          <div><div className="sline" /><small>{t("rep.servicedBy", { name: user.name })}</small></div>
          <div><div className="sline">{job.signaturePath && <img src={`/api/jobs/${job.id}/signature`} alt={t("job.signature")} />}</div>
            <small>{t("rep.acceptance", { who: job.signoffAt ? `${job.signoffName} · ${fmtDateTime(job.signoffAt, lang)}` : t("rep.acceptanceBlank") })}</small></div>
        </div>
        <div className="doc-foot">{t("rep.generated", { when: fmtDateTime(new Date(), lang), name: user.name })} {final ? "" : t("rep.interimFoot")}</div>
      </article>
    </div>
  );
}
