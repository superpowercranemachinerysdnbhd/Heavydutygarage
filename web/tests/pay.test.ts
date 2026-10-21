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
