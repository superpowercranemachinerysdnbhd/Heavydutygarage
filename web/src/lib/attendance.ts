/** Attendance statuses and the monthly tally. Pure module. */
export const ATT_STATUSES = ["present", "late", "half", "leave", "mc", "absent", "off"] as const;
export type AttStatus = (typeof ATT_STATUSES)[number];
export const isAttStatus = (x: unknown): x is AttStatus => typeof x === "string" && (ATT_STATUSES as readonly string[]).includes(x);
/** Short code for the month grid. */
export const ATT_CODE: Record<AttStatus, string> = { present: "P", late: "L", half: "½", leave: "LV", mc: "MC", absent: "A", off: "—" };

/** Days worked for a person in a month: present and late count 1, half day 0.5. */
export function tally(rows: { status: AttStatus }[]) {
  const n = Object.fromEntries(ATT_STATUSES.map((s) => [s, 0])) as Record<AttStatus, number>;
  for (const r of rows) n[r.status]++;
  return { ...n, worked: n.present + n.late + n.half * 0.5 };
}
