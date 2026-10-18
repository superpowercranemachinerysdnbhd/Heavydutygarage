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
