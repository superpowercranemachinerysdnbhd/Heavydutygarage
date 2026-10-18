import { test } from "node:test";
import assert from "node:assert/strict";
import { can, canWorkOnJob } from "../src/lib/permissions";

test("only the Boss sees labour cost, pay rates and margins", () => {
  assert.equal(can("boss", "money.labourCost"), true);
  assert.equal(can("supervisor", "money.labourCost"), false);
  assert.equal(can("mechanic", "money.labourCost"), false);
});

test("supervisor sees purchase costs; crew see no prices; nobody sees selling prices", () => {
  assert.equal(can("supervisor", "money.cost"), true);
  for (const r of ["mechanic", "assistant", "fabricator", "painter", "cleaner"] as const) assert.equal(can(r, "money.cost"), false, r);
  for (const r of ["boss", "supervisor", "mechanic"] as const) { assert.equal(can(r, "money.selling"), false); assert.equal(can(r, "price.set"), false); }
});

test("only boss and supervisor run QC, handover and service reports", () => {
  for (const a of ["job.qc", "job.handover", "job.report", "job.create", "job.assign"] as const) {
    assert.equal(can("boss", a), true);
    assert.equal(can("supervisor", a), true);
    assert.equal(can("mechanic", a), false);
  }
});

test("only the Boss manages staff accounts", () => {
  assert.equal(can("boss", "staff.manage"), true);
  assert.equal(can("supervisor", "staff.manage"), false);
});

test("crew work only on jobs they lead or are on", () => {
  const job = { leadId: 3, teamIds: [5] };
  assert.equal(canWorkOnJob({ id: 3, role: "mechanic" }, job), true);
  assert.equal(canWorkOnJob({ id: 5, role: "assistant" }, job), true);
  assert.equal(canWorkOnJob({ id: 4, role: "mechanic" }, job), false);
  assert.equal(canWorkOnJob({ id: 2, role: "supervisor" }, job), true);
});
