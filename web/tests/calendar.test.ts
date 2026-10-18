import { test } from "node:test";
import assert from "node:assert/strict";
import { monthGrid, planWeekStart, shiftMonth, weekDays, weekStart, weekday } from "../src/lib/calendar";

test("weeks start on Monday", () => {
  assert.equal(weekday("2026-10-19"), 0); // Monday
  assert.equal(weekday("2026-10-18"), 6); // Sunday
  assert.equal(weekStart("2026-10-18"), "2026-10-12");
  assert.equal(weekStart("2026-10-19"), "2026-10-19");
  assert.deepEqual(weekDays("2026-10-19"), ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"]);
});

test("month grid covers whole weeks", () => {
  const g = monthGrid("2026-10");
  assert.equal(g[0], "2026-09-28");
  assert.equal(g.at(-1), "2026-11-01");
  assert.equal(g.length % 7, 0);
  assert.equal(monthGrid("2026-02").length, 35);
});

test("shift month across years", () => {
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
});

test("on Sunday the plan opens on the coming week", () => {
  assert.equal(planWeekStart("2026-10-18"), "2026-10-19");
  assert.equal(planWeekStart("2026-10-17"), "2026-10-12");
});
