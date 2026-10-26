"use client";
import { useEffect } from "react";

/** On the daily attendance sheet: tapping Present fills empty In / Out with the normal working day (e.g. 08:00 and 17:00);
 *  Late fills Out only (type the time they came in). Typed times are never overwritten. */
export default function AttendanceTimes({ formId, start, end }: { formId: string; start: string; end: string }) {
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const onChange = (e: Event) => {
      const el = e.target as HTMLInputElement;
      if (el.type !== "radio" || !el.name.startsWith("s_")) return;
      const id = el.name.slice(2);
      const tin = form.elements.namedItem(`in_${id}`) as HTMLInputElement | null, tout = form.elements.namedItem(`out_${id}`) as HTMLInputElement | null;
      if (!tin || !tout) return;
      if (el.value === "present") { if (!tin.value) tin.value = start; if (!tout.value) tout.value = end; }
      else if (el.value === "late") { if (!tout.value) tout.value = end; if (tin.value === start) tin.value = ""; }
      else if (["mc", "leave", "absent", "off"].includes(el.value)) { if (tin.value === start) tin.value = ""; if (tout.value === end) tout.value = ""; }
    };
    form.addEventListener("change", onChange);
    return () => form.removeEventListener("change", onChange);
  }, [formId, start, end]);
  return null;
}
