import { test } from "node:test";
import assert from "node:assert/strict";
import { isAttStatus, tally } from "../src/lib/attendance";

test("days worked: present and late are full days, half day counts half", () => {
  const t = tally([{ status: "present" }, { status: "late" }, { status: "half" }, { status: "mc" }, { status: "leave" }, { status: "absent" }]);
  assert.equal(t.worked, 2.5);
  assert.equal(t.mc, 1);
  assert.equal(t.absent, 1);
});

test("only known statuses are accepted", () => {
  assert.ok(isAttStatus("mc"));
  assert.ok(!isAttStatus("holiday"));
});

test("hours from clock in / out, less breaks, overtime after 17:00", async () => {
  const { attHours, sumHours } = await import("../src/lib/attendance");
  const { parseBreaks } = await import("../src/lib/pay");
  const o = { breaks: parseBreaks("10:00-10:30, 12:00-13:00"), otStart: "17:00" };
  assert.deepEqual(attHours("08:00", "17:00", o), { normal: 7.5, ot: 0, total: 7.5 });
  assert.deepEqual(attHours("08:00", "19:00", o), { normal: 7.5, ot: 2, total: 9.5 });
  assert.equal(attHours("08:00", null, o), null);
  assert.deepEqual(sumHours([{ timeIn: "08:00", timeOut: "17:00" }, { timeIn: "08:00", timeOut: "19:00" }, { timeIn: null, timeOut: null }], o), { total: 17, ot: 2, days: 2 });
});
