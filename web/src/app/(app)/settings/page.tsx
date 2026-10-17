import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { BUILTIN_GROUPS, colorHex, groupLabel, itemLabel, listItems, settings, type ListItem, type ListName } from "@/lib/lists";
import { ensureLists, usageCounts } from "@/lib/lists-server";
import { getI18n } from "@/i18n/server";
import { placeLabel, type T } from "@/i18n";
import { priLabel } from "@/i18n/labels";
import { PRIORITIES } from "@/lib/jobs";
import { Notice } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { addItem, moveItem, saveItem, saveWorkshop } from "./actions";

export async function generateMetadata() {
  return { title: (await getI18n()).t("set.title") };
}

const name = (t: T, i: ListItem) => (i.list === "bay" ? placeLabel(t, i.code) : itemLabel(t, i.list, i.code));
const hidden = (n: string, v: string) => <input type="hidden" name={n} value={v} />;

function Row({ t, i, n, first, last, groups }: { t: T; i: ListItem; n: number; first: boolean; last: boolean; groups: string[] }) {
  return (
    <li className={`set-row ${i.active ? "" : "off"}`}>
      <form action={saveItem} className="set-form">
        {hidden("list", i.list)}{hidden("code", i.code)}
        {i.list === "job_category" && <input type="color" name="color" defaultValue={colorHex(i.code)} aria-label={t("set.color")} className="set-color" />}
        <input name="label" defaultValue={name(t, i)} required aria-label={t("set.name")} className="set-name" />
        {i.list === "job_category" && (
          <select className="field" name="priority" defaultValue={i.priority ?? "normal"} aria-label={t("set.defaultPriority")}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{priLabel(t, p)}</option>)}
          </select>
        )}
        {i.list === "machine_type" && (
          <select className="field" name="grp" defaultValue={i.grp ?? "other"} aria-label={t("set.group")}>
            {groups.map((g) => <option key={g} value={g}>{groupLabel(t, g)}</option>)}
          </select>
        )}
        <label className="set-check"><input type="checkbox" name="active" defaultChecked={i.active} /> {t("set.show")}</label>
        <SubmitButton className="btn small">{t("common.save")}</SubmitButton>
        {n > 0 && <small className="muted set-used">{t("set.usedBy", { n })}</small>}
      </form>
      <div className="set-move">
        <form action={moveItem}>{hidden("list", i.list)}{hidden("code", i.code)}{hidden("dir", "up")}<button className="linkbtn" disabled={first} aria-label={t("set.up")}>▲</button></form>
        <form action={moveItem}>{hidden("list", i.list)}{hidden("code", i.code)}{hidden("dir", "down")}<button className="linkbtn" disabled={last} aria-label={t("set.down")}>▼</button></form>
      </div>
    </li>
  );
}

function ListSection({ t, list, id, title, help, addPh, usage }: { t: T; list: ListName; id: string; title: string; help: string; addPh: string; usage: Record<string, number> }) {
  const items = listItems(list, { all: true });
  const groups = [...new Set([...BUILTIN_GROUPS, ...items.map((i) => i.grp).filter((g): g is string => !!g)])];
  return (
    <section className="panel" id={id}>
      <div className="panel-head"><h3>{title}</h3><span className="muted" style={{ fontSize: ".8rem" }}>{t("set.count", { n: items.filter((i) => i.active).length })}</span></div>
      <p className="hint" style={{ padding: "8px 14px 0", margin: 0 }}>{help}</p>
      <ul className="set-list">
        {items.map((i, k) => <Row key={i.code} t={t} i={i} n={usage[`${list}:${i.code}`] ?? 0} first={k === 0} last={k === items.length - 1} groups={groups} />)}
      </ul>
      <form action={addItem} className="set-form set-add">
        {hidden("list", list)}
        {list === "job_category" && <input type="color" name="color" defaultValue="#3a7bd5" aria-label={t("set.color")} className="set-color" />}
        <input name="label" required placeholder={addPh} aria-label={addPh} className="set-name" />
        {list === "job_category" && <select className="field" name="priority" defaultValue="normal" aria-label={t("set.defaultPriority")}>{PRIORITIES.map((p) => <option key={p} value={p}>{priLabel(t, p)}</option>)}</select>}
        {list === "machine_type" && (<>
          <select className="field" name="grp" defaultValue="" aria-label={t("set.group")}><option value="">{t("set.chooseGroup")}</option>{groups.map((g) => <option key={g} value={g}>{groupLabel(t, g)}</option>)}</select>
          <input name="newGroup" placeholder={t("set.newGroupPh")} aria-label={t("set.newGroupPh")} style={{ maxWidth: 200 }} />
        </>)}
        <SubmitButton className="btn small primary">{t("common.add")}</SubmitButton>
      </form>
    </section>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  if (!can(user.role, "settings.manage")) notFound();
  const { t } = await getI18n();
  const sp = await searchParams;
  await ensureLists();
  const [usage, s] = [await usageCounts(), settings()];
  return (
    <div className="page" style={{ maxWidth: 1000 }} id="top">
      <div className="view-head"><h2>{t("set.title")}</h2></div>
      <p className="muted" style={{ margin: 0 }}>{t("set.intro")}</p>
      <nav className="chipbar" aria-label={t("set.title")}>
        {[["workshop", t("set.workshop")], ["categories", t("set.categories")], ["types", t("set.types")], ["bays", t("set.bays")], ["qc", t("set.qc")]].map(([h, l]) =>
          <a key={h} className="chip plain" href={`#${h}`}>{l}</a>)}
      </nav>
      <Notice ok={sp.ok} error={sp.error} />

      <section className="panel" id="workshop">
        <div className="panel-head"><h3>{t("set.workshop")}</h3></div>
        <form action={saveWorkshop} className="form" style={{ padding: 14 }}>
          <label>{t("set.companyName")}<input name="companyName" defaultValue={s.companyName} placeholder={t("app.name")} /></label>
          <label>{t("set.companyPhone")}<input name="companyPhone" type="tel" defaultValue={s.companyPhone} /></label>
          <label>{t("set.companyReg")}<input name="companyReg" defaultValue={s.companyReg} placeholder="202301012345 (1234567-X)" /></label>
          <label className="full">{t("set.companyAddress")}<textarea name="companyAddress" rows={2} defaultValue={s.companyAddress} /></label>
          <label>{t("set.labourRate")}<input name="labourRate" type="number" min={0} step="0.01" required defaultValue={s.labourRate} /></label>
          <label>{t("set.poLimit")}<input name="poApprovalLimit" type="number" min={0} step="1" required defaultValue={s.poApprovalLimit} /></label>
          <p className="full hint">{t("set.workshopHelp")}</p>
          <div className="full"><SubmitButton className="btn primary">{t("common.save")}</SubmitButton></div>
        </form>
      </section>

      <ListSection t={t} list="job_category" id="categories" title={t("set.categories")} help={t("set.categoriesHelp")} addPh={t("set.addCategory")} usage={usage} />
      <ListSection t={t} list="machine_type" id="types" title={t("set.types")} help={t("set.typesHelp")} addPh={t("set.addType")} usage={usage} />
      <ListSection t={t} list="bay" id="bays" title={t("set.bays")} help={t("set.baysHelp")} addPh={t("set.addBay")} usage={usage} />
      <ListSection t={t} list="qc_item" id="qc" title={t("set.qc")} help={t("set.qcHelp")} addPh={t("set.addQc")} usage={usage} />
    </div>
  );
}
