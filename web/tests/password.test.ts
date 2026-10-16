import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, passwordProblem, verifyPassword } from "../src/lib/password";
import { normalisePhone } from "../src/lib/phone";

test("passwords hash and verify", async () => {
  const h = await hashPassword("workshop-2026");
  assert.notEqual(h, "workshop-2026");
  assert.equal(await verifyPassword("workshop-2026", h), true);
  assert.equal(await verifyPassword("wrong-pass", h), false);
  assert.equal(await verifyPassword("x", null), false);
});

test("password rules and phone normalising", () => {
  assert.ok(passwordProblem("short"));
  assert.equal(passwordProblem("long-enough"), null);
  assert.equal(normalisePhone("012-345 6789"), "0123456789");
});
