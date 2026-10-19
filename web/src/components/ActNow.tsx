import Link from "next/link";
import type { Alert } from "@/lib/alerts";
import type { JobRow } from "@/lib/queries";
import { bayCodes, catColor } from "@/lib/lists";
import { placeLabel, type T } from "@/i18n";

const Alerts = ({ list }: { list: Alert[] }) => <>{list.map((a, i) => <Link key={i} href={a.href} className="attn plain" style={{ ["--sev" as string]: a.sev }}><i /><span>{a.text}</span></Link>)}</>;

/** Top of the Work orders page (Head Manager, Supervisor): urgent items, other reminders, and the bays. All folded. */
export default function ActNow({ t, now, later, open }: { t: T; now: Alert[]; later: Alert[]; open: JobRow[] }) {
  const bays = [...new Set([...bayCodes(), ...open.filter((j) => j.siteType === "workshop" && j.siteLocation).map((j) => j.siteLocation)])];
  const inBay = (b: string) => open.find((x) => x.siteType === "workshop" && x.siteLocation === b);
  const free = bays.filter((b) => !inBay(b)).length;
  return (
    <div className="actbar">
      {now.length > 0 && (
        <details className="panel actnow">
          <summary className="panel-head"><h3>{t("dash.actNow")}</h3><span className="badge">{now.length}</span></summary>
          <div className="panel-body"><Alerts list={now} /></div>
        </details>
      )}
      <div className="actbar-row">
        {later.length > 0 && (
          <details className="panel">
            <summary className="panel-head"><h3>{t("dash.reminders")}</h3><span className="count">{later.length}</span></summary>
            <div className="panel-body"><Alerts list={later} /></div>
          </details>
        )}
        <details className="panel">
          <summary className="panel-head"><h3>{t("dash.bays")}</h3><span className="count">{t("dash.baysFree", { free, n: bays.length })}</span></summary>
          <div className="bays-mini">
            {bays.map((b) => {
              const j = inBay(b);
              return j ? <Link key={b} href={`/jobs/${j.id}`} className="plain" style={{ ["--cat" as string]: catColor(j.category) }}><small>{placeLabel(t, b)}</small><b className={j.plateNo ? "mono" : ""}>{j.plateNo || j.serialNo || `${j.make} ${j.model}`}</b></Link>
                : <div key={b} className="free"><small>{placeLabel(t, b)}</small><span>{t("dash.free")}</span></div>;
            })}
          </div>
        </details>
      </div>
    </div>
  );
}
