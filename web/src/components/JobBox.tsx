import Link from "next/link";
import type { Locale, T } from "@/i18n";
import { statusLabel } from "@/i18n/labels";
import { addDays, fmtDate, today } from "@/lib/format";
import { invoicePending } from "@/lib/jobs";
import { catColor } from "@/lib/lists";
import { machinePhotoUrl } from "@/lib/machine-types";
import type { JobRow } from "@/lib/queries";
import { CatChip, Pri, dueInfo } from "./ui";

/** A job as a box: the machine's profile photo, plate, company, category, stage, due date and lead. */
export default function JobBox({ j, t, locale }: { j: JobRow; t: T; locale: Locale }) {
  const due = dueInfo(j, t, locale);
  const img = machinePhotoUrl(j.unitId, j.unitPhotoPath);
  const d0 = today();
  const dayLabel = (d: string) => (d === d0 ? t("jobs.today") : d === addDays(d0, -1) ? t("jobs.yesterday") : fmtDate(d, true, locale));
  return (
              <Link href={`/jobs/${j.id}`} className="jcard plain" style={{ ["--cat" as string]: catColor(j.category) }}>
                {img ? <img src={img} alt="" loading="lazy" /> : <span className="jcard-nophoto">{t("jobs.noPhoto")}</span>}
                <div className="jcard-body">
                  <div className="jcard-top"><span className="jcard-date">{dayLabel(j.openedAt)}</span><Pri p={j.priority} t={t} /></div>
                  <b className="jcard-id">{j.plateNo ? <span className="mono">{j.plateNo}</span> : `${j.make} ${j.model}`}</b>
                  {j.plateNo && <small>{j.make} {j.model}</small>}
                  <small className="muted">{j.customerName} · <span className="mono">{j.jobNo}</span></small>
                  <div className="jcard-tags"><CatChip cat={j.category} t={t} /><span className="pill mute">{statusLabel(t, j.status)}</span></div>
                  <div className="jcard-foot"><span className={`due ${due.cls}`}>{due.text}</span><span>{invoicePending(j) && <><span className="pill warn">{t("inv.pending")}</span> </>}{j.outsourced ? <span className="pill out">🔧 {j.vendorName ?? t("out.badge")}</span> : j.leadName ?? <span className="due over">{t("dash.unassigned")}</span>}</span></div>
                </div>
              </Link>
  );
}
