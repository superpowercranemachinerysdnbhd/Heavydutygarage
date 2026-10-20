import { test } from "node:test";
import assert from "node:assert/strict";
import { ageLevel, checkTransition, nextJobNo } from "../src/lib/jobs";
import { qcTemplate } from "../src/lib/lists";
import { translator } from "../src/i18n/index";

const base = { isOnJob: true, qcTotal: 6, qcPassed: 6, signedOff: false } as const;

test("mechanic can move own job between crew stages only", () => {
  assert.equal(checkTransition({ ...base, role: "mechanic", from: "received", to: "in_progress" }).ok, true);
  assert.equal(checkTransition({ ...base, role: "mechanic", from: "in_progress", to: "awaiting_parts" }).ok, true);
  assert.equal(checkTransition({ ...base, role: "mechanic", from: "in_progress", to: "closed" }).ok, false);
  assert.equal(checkTransition({ ...base, role: "mechanic", from: "in_progress", to: "received" }).ok, false);
  assert.equal(checkTransition({ ...base, role: "mechanic", isOnJob: false, from: "received", to: "in_progress" }).ok, false);
});

test("completing needs every quality check ticked (if the job has any)", () => {
  const r = checkTransition({ ...base, role: "supervisor", from: "in_progress", to: "closed", qcPassed: 5 });
  assert.equal(r.ok, false);
  assert.equal((r as { reason: string }).reason, "tr.qc");
  assert.equal(checkTransition({ ...base, role: "supervisor", from: "in_progress", to: "closed" }).ok, true);
  assert.equal(checkTransition({ ...base, role: "supervisor", from: "in_progress", to: "closed", qcTotal: 0, qcPassed: 0 }).ok, true);
});

test("a completed job can't be moved (it is reopened instead); sign-off is not needed to complete", () => {
  assert.equal(checkTransition({ ...base, role: "boss", from: "closed", to: "in_progress" }).ok, false);
  assert.equal(checkTransition({ ...base, role: "boss", from: "awaiting_parts", to: "closed", signedOff: false }).ok, true);
});

test("completing is blocked while tasks are open", () => {
  const r = checkTransition({ ...base, role: "supervisor", from: "in_progress", to: "closed", tasksOpen: 1 });
  assert.equal(r.ok, false);
  assert.equal((r as { reason: string }).reason, "tr.tasksOpen");
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
  const q = qcTemplate("HYD", translator("en"));
  assert.equal(q.length, 6);
  assert.equal(q[0].itemKey, "HYD");
});

test("invoicePending: outsourced, done, no outside work cost, not marked as no invoice", async () => {
  const { invoicePending } = await import("../src/lib/jobs");
  const base = { outsourced: true, status: "closed" as const, backAt: null, outsideLines: 0, invoiceStatus: null };
  assert.equal(invoicePending(base), true);
  assert.equal(invoicePending({ ...base, outsideLines: 1 }), false);
  assert.equal(invoicePending({ ...base, invoiceStatus: "none" }), false);
  assert.equal(invoicePending({ ...base, outsourced: false }), false);
  assert.equal(invoicePending({ ...base, status: "in_progress" }), false);
  assert.equal(invoicePending({ ...base, status: "in_progress", backAt: "2026-10-01" }), true);
});
