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

test("utilisation: hours at work against hours logged on work orders", async () => {
  const { hoursAtWork, utilisation } = await import("../src/lib/attendance");
  const { parseBreaks } = await import("../src/lib/pay");
  const o = { breaks: parseBreaks("10:00-10:30, 12:00-13:00"), otStart: "17:00", workStart: "08:00", workEnd: "17:00" };
  assert.equal(hoursAtWork({ status: "present", timeIn: "08:00", timeOut: "17:00" }, o), 7.5);
  assert.equal(hoursAtWork({ status: "present", timeIn: null, timeOut: null }, o), 7.5);
  assert.equal(hoursAtWork({ status: "half", timeIn: null, timeOut: null }, o), 3.75);
  assert.equal(hoursAtWork({ status: "mc", timeIn: null, timeOut: null }, o), 0);
  assert.equal(hoursAtWork(undefined, o), 0);
  assert.deepEqual(utilisation(7.5, 0), { pct: 0, idle: 7.5, flag: "none" });
  assert.deepEqual(utilisation(7.5, 3), { pct: 40, idle: 4.5, flag: "low" });
  assert.deepEqual(utilisation(7.5, 7), { pct: 93, idle: 0.5, flag: "ok" });
  assert.equal(utilisation(7.5, 9).flag, "over");
  assert.deepEqual(utilisation(0, 0), { pct: null, idle: 0, flag: "" });
  assert.equal(utilisation(0, 2).flag, "over");
});

test("cost of a day at work: normal, overtime after 17:00, Sunday", async () => {
  const { costAtWork } = await import("../src/lib/attendance");
  const { parseBreaks } = await import("../src/lib/pay");
  const o = { breaks: parseBreaks("10:00-10:30, 12:00-13:00"), otStart: "17:00", workStart: "08:00", workEnd: "17:00", otMultiplier: 1.5, sundayMultiplier: 2 };
  assert.equal(costAtWork({ status: "present", timeIn: "08:00", timeOut: "17:00" }, "2026-11-02", 10, o), 75);
  assert.equal(costAtWork({ status: "present", timeIn: "08:00", timeOut: "19:00" }, "2026-11-02", 10, o), 105);
  assert.equal(costAtWork({ status: "present", timeIn: "08:00", timeOut: "19:00" }, "2026-11-02", 10, { ...o, noOvertime: true }), 95);
  assert.equal(costAtWork({ status: "present", timeIn: "08:00", timeOut: "17:00" }, "2026-11-01", 10, o), 150);
  assert.equal(costAtWork({ status: "mc", timeIn: null, timeOut: null }, "2026-11-02", 10, o), 0);
});
