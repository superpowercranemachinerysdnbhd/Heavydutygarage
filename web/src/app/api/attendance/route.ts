import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { isMonth, monthGrid } from "@/lib/calendar";
import { ATT_CODE, attHours, sumHours, tally } from "@/lib/attendance";
import { parseBreaks } from "@/lib/pay";
import { settings } from "@/lib/lists";
import { ensureLists } from "@/lib/lists-server";
import { attendanceBetween, sheetStaff } from "@/lib/attendance-server";
import { translator, type MessageKey } from "@/i18n";
import { roleLabel } from "@/i18n/labels";

const cell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** Month of attendance as CSV (opens in Excel): totals per person, then one column per day. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  if (!can(user.role, "job.assign")) return new Response("Not found", { status: 404 });
  const m = new URL(req.url).searchParams.get("m");
  if (!isMonth(m)) return new Response("Bad month", { status: 400 });
  const t = translator(user.locale);
  await ensureLists();
  const hOpts = { breaks: parseBreaks(settings().breaks), otStart: settings().otStart };
  const days = monthGrid(m).filter((x) => x.startsWith(m));
  const [people, rows] = await Promise.all([sheetStaff(), attendanceBetween(days[0], days.at(-1)!)]);
  const head = [t("col.person"), t("att.role"), t("att.worked"), t("att.hoursCol"), t("att.otCol"), ...(["present", "late", "half", "leave", "mc", "absent", "off"] as const).map((s) => t(`att.s.${s}` as MessageKey)), ...days.map((x) => x.slice(8))];
  const lines = [head.map(cell).join(",")];
  for (const p of people) {
    const mine = rows.filter((r) => r.staffId === p.id), n = tally(mine), h = sumHours(mine, hOpts);
    lines.push([p.name, roleLabel(t, p.role), n.worked, h.total, h.ot, n.present, n.late, n.half, n.leave, n.mc, n.absent, n.off,
      // Each day: status code and, when clocked in and out, the hours (e.g. "P 7.5").
      ...days.map((x) => { const r = mine.find((y) => y.day === x), hh = r ? attHours(r.timeIn, r.timeOut, hOpts) : null; return r ? `${ATT_CODE[r.status]}${hh ? ` ${hh.total}` : ""}` : ""; })].map(cell).join(","));
  }
  // BOM so Excel reads names in any language correctly.
  return new Response("﻿" + lines.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="attendance-${m}.csv"`, "Cache-Control": "no-store" } });
}
