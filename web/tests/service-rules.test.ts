import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, nextDueFrom, serviceState } from "../src/lib/service-rules";

test("addMonths keeps month ends sensible", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-10-17", 3), "2027-01-17");
  assert.equal(addMonths("2026-10-17", 12), "2027-10-17");
});

test("next due: explicit date, else last done + interval", () => {
  assert.equal(nextDueFrom("2026-10-01", 6), "2027-04-01");
  assert.equal(nextDueFrom("2026-10-01", 6, "2026-12-25"), "2026-12-25");
  assert.equal(nextDueFrom(null, 6), null);
  assert.equal(nextDueFrom("2026-10-01", null), null);
});

test("service state: overdue, due within 14 days, ok, unknown", () => {
  assert.equal(serviceState("2026-10-16", "2026-10-17"), "overdue");
  assert.equal(serviceState("2026-10-31", "2026-10-17"), "soon");
  assert.equal(serviceState("2026-11-01", "2026-10-17"), "ok");
  assert.equal(serviceState(null, "2026-10-17"), "none");
});
