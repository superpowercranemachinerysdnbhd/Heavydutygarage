import { fmtDate } from "./format";
import type { JobDetail } from "./queries";
import type { Locale, T } from "@/i18n";

/** Ready-made recommendation lines for a work order. They are only suggestions: nothing is written into the
 *  work order or the report unless someone taps one. */
export function recommendationIdeas(d: JobDetail, t: T, locale: Locale): string[] {
  const out: string[] = [];
  if (d.job.category === "WARR") out.push(t("rec.warranty"));
  if (["HYD", "EMG"].includes(d.job.category)) out.push(t("rec.hoses"));
  if (d.unit.nextServiceType && d.unit.nextServiceDate) out.push(t("rec.nextService", { type: d.unit.nextServiceType, date: fmtDate(d.unit.nextServiceDate, true, locale) }));
  const left = d.tasks.filter((x) => !x.doneAt);
  if (left.length) out.push(t("rec.outstanding", { tasks: left.map((x) => x.description).join("; ") }));
  return out.filter((x) => !(d.job.recommendations ?? "").includes(x));
}
