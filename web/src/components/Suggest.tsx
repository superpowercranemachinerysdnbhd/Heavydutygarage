"use client";

/** Tap a suggestion to add it to a text box (on a new line). Nothing is added unless tapped. */
export default function Suggest({ target, label, items }: { target: string; label: string; items: string[] }) {
  const add = (text: string) => {
    const el = document.getElementById(target) as HTMLTextAreaElement | null;
    if (!el) return;
    el.value = el.value.trim() ? `${el.value.trimEnd()}\n${text}` : text;
    el.focus();
  };
  return (
    <div className="suggest"><small className="muted">{label}</small>
      {items.map((s) => <button key={s} type="button" className="chip-btn" onClick={() => add(s)}>+ {s.length > 70 ? `${s.slice(0, 70)}…` : s}</button>)}
    </div>
  );
}
