import { itemLabel, listItems } from "@/lib/lists";
import type { T } from "@/i18n";
import SubmitButton from "./SubmitButton";
import { saveEvent } from "@/app/(app)/calendar/event/actions";

type Init = { id?: number; type?: string; title?: string; day: string; endDay?: string | null; time?: string | null; unitId?: number | null; customerId?: number | null; notes?: string | null; repeatMonths?: number | null };
type Unit = { id: number; plateNo: string | null; serialNo: string | null; make: string; model: string; customerName: string };

/** Add or edit a calendar event. Field names match calendar/event/actions.saveEvent. */
export default function EventForm({ t, init, units, companies }: { t: T; init: Init; units: Unit[]; companies: { id: number; name: string }[] }) {
  const types = listItems("event_type");
  const keep = init.type && !types.some((x) => x.code === init.type) ? [init.type] : [];
  const sorted = [...units].sort((a, b) => (a.plateNo || a.serialNo || "").localeCompare(b.plateNo || b.serialNo || ""));
  return (
    <form action={saveEvent} className="form" style={{ padding: 14 }}>
      {init.id && <input type="hidden" name="id" value={init.id} />}
      <label>{t("ev.type")}
        <select className="field" name="type" defaultValue={init.type ?? types[0]?.code} required>
          {[...types.map((x) => x.code), ...keep].map((c) => <option key={c} value={c}>{itemLabel(t, "event_type", c)}</option>)}
        </select>
      </label>
      <label>{t("ev.title")}<input name="title" defaultValue={init.title ?? ""} maxLength={120} placeholder={t("ev.titlePh")} /></label>
      <label>{t("ev.date")}<input type="date" name="day" defaultValue={init.day} required /></label>
      <label>{t("ev.time")}<input type="time" name="time" defaultValue={init.time ?? ""} /></label>
      <label>{t("ev.until")}<input type="date" name="endDay" defaultValue={init.endDay ?? ""} /></label>
      <label>{t("ev.repeat")}
        <select className="field" name="repeatMonths" defaultValue={String(init.repeatMonths ?? "")}>
          <option value="">{t("ev.noRepeat")}</option>
          {[1, 2, 3, 6, 12, 24, 36].map((n) => <option key={n} value={n}>{t("ev.everyN", { n })}</option>)}
        </select>
      </label>
      <label>{t("ev.machine")}
        <select className="field" name="unitId" defaultValue={String(init.unitId ?? "")}>
          <option value="">{t("ev.none")}</option>
          {sorted.map((u) => <option key={u.id} value={u.id}>{u.plateNo || u.serialNo} · {u.make} {u.model} · {u.customerName}</option>)}
        </select>
      </label>
      <label>{t("ev.company")}
        <select className="field" name="customerId" defaultValue={String(init.customerId ?? "")}>
          <option value="">{t("ev.companyAuto")}</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="full">{t("ev.notes")}<textarea name="notes" rows={3} defaultValue={init.notes ?? ""} /></label>
      <p className="full hint">{t("ev.help")}</p>
      <div className="full"><SubmitButton className="btn primary">{init.id ? t("common.save") : t("ev.addBtn")}</SubmitButton></div>
    </form>
  );
}
