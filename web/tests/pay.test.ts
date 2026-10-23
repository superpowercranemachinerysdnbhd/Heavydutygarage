import { test } from "node:test";
import assert from "node:assert/strict";
import { hourlyFromSalary, rateMultiplier, rateTypeFor } from "../src/lib/pay";

test("hourly rate from monthly salary", () => {
  assert.equal(hourlyFromSalary(1900, 195), 9.74);
  assert.equal(hourlyFromSalary(0, 195), 0);
  assert.equal(hourlyFromSalary(1900, 0), 0);
});

test("overtime and Sunday multipliers", () => {
  const s = { otMultiplier: 1.5, sundayMultiplier: 2 };
  assert.equal(rateMultiplier("normal", s), 1);
  assert.equal(rateMultiplier("ot", s), 1.5);
  assert.equal(rateMultiplier("sunday", s), 2);
  assert.equal(Math.round(9.74 * rateMultiplier("ot", s) * 100) / 100, 14.61);
});

test("a Sunday is always the Sunday rate", () => {
  assert.equal(rateTypeFor("normal", "2026-10-18"), "sunday"); // Sunday
  assert.equal(rateTypeFor("ot", "2026-10-19"), "ot"); // Monday
  assert.equal(rateTypeFor("bogus", "2026-10-19"), "normal");
});

test("split clock times at the start of overtime", async () => {
  const { splitHours } = await import("../src/lib/pay");
  assert.deepEqual(splitHours("15:00", "19:00", "17:00"), { normal: 2, ot: 2 });
  assert.deepEqual(splitHours("08:00", "17:00", "17:00"), { normal: 9, ot: 0 });
  assert.deepEqual(splitHours("18:00", "21:30", "17:00"), { normal: 0, ot: 3.5 });
  assert.deepEqual(splitHours("16:45", "17:15", "17:00"), { normal: 0.25, ot: 0.25 });
  assert.equal(splitHours("19:00", "15:00", "17:00"), null);
  assert.equal(splitHours("x", "15:00", "17:00"), null);
});

test("rate on a day follows the pay history", async () => {
  const { rateOn } = await import("../src/lib/pay");
  const h = [{ effectiveFrom: "2000-01-01", hourlyRate: 9.74 }, { effectiveFrom: "2026-10-01", hourlyRate: 10.77 }];
  assert.equal(rateOn(h, "2026-09-30", 0), 9.74);
  assert.equal(rateOn(h, "2026-10-01", 0), 10.77);
  assert.equal(rateOn(h, "2026-12-15", 0), 10.77);
  assert.equal(rateOn([{ effectiveFrom: "2026-10-01", hourlyRate: 10.77 }], "2026-01-01", 0), 10.77);
  assert.equal(rateOn([], "2026-01-01", 8), 8);
});

test("no overtime pay: overtime hours at the normal rate, Sunday unchanged", async () => {
  const { rateMultiplier } = await import("../src/lib/pay");
  const s = { otMultiplier: 1.5, sundayMultiplier: 2 };
  assert.equal(rateMultiplier("ot", s, true), 1);
  assert.equal(rateMultiplier("sunday", s, true), 2);
  assert.equal(rateMultiplier("ot", s, false), 1.5);
});
