import type { Locale, T } from "@/i18n";
import { fmtDate } from "@/lib/format";
import { itemLabel, listItems } from "@/lib/lists";
import type { ServiceRow } from "@/lib/services";
import SubmitButton from "./SubmitButton";
import { addStandardServices, removeService, saveService, serviceDoneToday } from "@/app/(app)/machinery/actions";

const PILL = { overdue: "crit", soon: "warn", ok: "ok", none: "mute" } as const;

/** Next-due text and colour for a service. */
export function ServiceDue({ s, t, locale }: { s: Pick<ServiceRow, "nextDue" | "state">; t: T; locale: Locale }) {
  if (!s.nextDue) return <span className="pill mute">{t("svc.noDate")}</span>;
  const date = fmtDate(s.nextDue, true, locale);
  return <span className={`pill ${PILL[s.state]}`}>{s.state === "overdue" ? t("svc.overdue", { date }) : date}</span>;
}

/** A machine's service schedule: hydraulic oil, greasing, air-con… with last done, interval and next due. */
export default function ServicePanel({ unitId, services, manage, t, locale }: { unitId: number; services: ServiceRow[]; manage: boolean; t: T; locale: Locale }) {
  const hidden = (n: string, v: string | number) => <input type="hidden" name={n} value={v} />;
  const items = listItems("service_item");
  const missing = items.filter((i) => !services.some((s) => s.item === i.code));
  return (
    <section className="panel" id="services">
      <div className="panel-head" style={{ flexWrap: "wrap" }}><h3>{t("svc.title")}</h3>
        {manage && missing.length > 0 && <form action={addStandardServices}>{hidden("unitId", unitId)}<SubmitButton className="btn small">{t("svc.addStandard", { n: missing.length })}</SubmitButton></form>}
      </div>
      {services.length > 0 ? (
        <div className="tbl-wrap" style={{ border: 0, borderRadius: 0 }}><table>
          <thead><tr><th>{t("svc.item")}</th><th>{t("svc.lastDone")}</th><th>{t("svc.every")}</th><th>{t("svc.nextDue")}</th>{manage && <th />}</tr></thead>
          <tbody>{services.map((s) => (
            <tr key={s.id}>
              <td><b>{itemLabel(t, "service_item", s.item)}</b>{s.notes && <><br /><small className="muted">{s.notes}</small></>}</td>
              <td>{s.lastDone ? fmtDate(s.lastDone, true, locale) : "—"}</td>
              <td>{s.intervalMonths ? t("svc.monthsN", { n: s.intervalMonths }) : "—"}</td>
              <td><ServiceDue s={s} t={t} locale={locale} /></td>
              {manage && <td className="r" style={{ whiteSpace: "nowrap" }}>
                <form action={serviceDoneToday} className="inline">{hidden("unitId", unitId)}{hidden("item", s.item)}<SubmitButton className="btn small">{t("svc.doneToday")}</SubmitButton></form>{" "}
                <form action={removeService} className="inline">{hidden("unitId", unitId)}{hidden("item", s.item)}<button className="linkbtn muted" aria-label={`${t("common.remove")}: ${itemLabel(t, "service_item", s.item)}`}>✕</button></form>
              </td>}
            </tr>
          ))}</tbody>
        </table></div>
      ) : <div className="empty">{t("svc.none")}</div>}
      {manage && (
        <details className="svc-edit"><summary className="btn small">{t("svc.addOrUpdate")}</summary>
          <form action={saveService} className="form" style={{ marginTop: 10 }}>
            {hidden("unitId", unitId)}
            <label>{t("svc.item")}<select className="field" name="item" required defaultValue="">
              <option value="" disabled>{t("common.choose")}</option>
              {items.map((i) => <option key={i.code} value={i.code}>{itemLabel(t, "service_item", i.code)}{services.some((s) => s.item === i.code) ? ` ${t("svc.onFile")}` : ""}</option>)}
            </select></label>
            <label>{t("svc.lastDone")}<input type="date" name="lastDone" /></label>
            <label>{t("svc.everyMonths")}<input type="number" name="intervalMonths" min={1} max={120} placeholder={t("svc.defaultHint")} /></label>
            <label>{t("svc.nextDueOptional")}<input type="date" name="nextDue" /></label>
            <label className="full">{t("u.notes")}<input name="notes" placeholder={t("svc.notesPh")} /></label>
            <div className="full"><SubmitButton className="btn small primary">{t("common.save")}</SubmitButton></div>
          </form>
        </details>
      )}
    </section>
  );
}
