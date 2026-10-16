import { test } from "node:test";
import assert from "node:assert/strict";
import { ageLevel, checkTransition, nextJobNo, qcTemplate } from "../src/lib/jobs";

const base = { isOnJob: true, qcTotal: 6, qcPassed: 6, signedOff: false } as const;

test("mechanic can move own job between crew statuses only", () => {
  assert.equal(checkTransition({ ...base, role: "mechanic", from: "diagnosing", to: "in_progress" }).ok, true);
  assert.equal(checkTransition({ ...base, role: "mechanic", from: "in_progress", to: "quality_check" }).ok, true);
  assert.equal(checkTransition({ ...base, role: "mechanic", from: "quality_check", to: "ready_for_pickup" }).ok, false);
  assert.equal(checkTransition({ ...base, role: "mechanic", from: "in_progress", to: "awaiting_parts" }).ok, false);
  assert.equal(checkTransition({ ...base, role: "mechanic", isOnJob: false, from: "diagnosing", to: "in_progress" }).ok, false);
});

test("release needs the full QC checklist", () => {
  const r = checkTransition({ ...base, role: "supervisor", from: "quality_check", to: "ready_for_pickup", qcPassed: 5 });
  assert.equal(r.ok, false);
  assert.equal(checkTransition({ ...base, role: "supervisor", from: "quality_check", to: "ready_for_pickup" }).ok, true);
});

test("closing needs QC and customer sign-off", () => {
  assert.equal(checkTransition({ ...base, role: "boss", from: "ready_for_pickup", to: "closed" }).ok, false);
  assert.equal(checkTransition({ ...base, role: "boss", from: "ready_for_pickup", to: "closed", signedOff: true }).ok, true);
  assert.equal(checkTransition({ ...base, role: "boss", from: "in_progress", to: "closed", qcPassed: 0, signedOff: true }).ok, false);
});

test("release is blocked while tasks are open", () => {
  const r = checkTransition({ ...base, role: "supervisor", from: "quality_check", to: "ready_for_pickup", tasksOpen: 1 });
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /1 task is not done/);
});

test("closed jobs cannot be reopened", () => {
  assert.equal(checkTransition({ ...base, role: "boss", from: "closed", to: "in_progress" }).ok, false);
});

test("job numbers run per year", () => {
  assert.equal(nextJobNo(2026, []), "J-2026-0001");
  assert.equal(nextJobNo(2026, ["J-2026-0009", "J-2026-0041", "J-2025-0900"]), "J-2026-0042");
  assert.equal(nextJobNo(2027, ["J-2026-0041"]), "J-2027-0001");
});

test("days-in-status thresholds", () => {
  assert.equal(ageLevel("received", 0), "");
  assert.equal(ageLevel("received", 2), "crit");
  assert.equal(ageLevel("in_progress", 8), "warn");
  assert.equal(ageLevel("awaiting_parts", 3), "warn");
  assert.equal(ageLevel("closed", 99), "");
});

test("QC list has a category check plus the standard checks", () => {
  const q = qcTemplate("HYD");
  assert.equal(q.length, 6);
  assert.match(q[0], /Pressure readings/);
});
