"use client";
import { useState } from "react";
import { useT } from "@/i18n/client";

/** Choose one or more people for a time entry (e.g. two mechanics who worked together). Sends staffId for each one ticked. */
export default function WorkerPicker({ people, initial }: { people: { id: number; name: string }[]; initial: number[] }) {
  const t = useT();
  const [sel, setSel] = useState<number[]>(initial);
  const toggle = (id: number) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const names = people.filter((p) => sel.includes(p.id)).map((p) => p.name);
  return (
    <details className="wp">
      <summary className="field">{names.length === 0 ? t("wp.choose") : names.length <= 2 ? names.join(", ") : t("wp.people", { n: names.length })}</summary>
      <div className="wp-list">
        {people.map((p) => (
          <label key={p.id} className="set-check"><input type="checkbox" checked={sel.includes(p.id)} onChange={() => toggle(p.id)} /> {p.name}</label>
        ))}
      </div>
      {sel.map((id) => <input key={id} type="hidden" name="staffId" value={id} />)}
    </details>
  );
}
