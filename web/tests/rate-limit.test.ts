import { test } from "node:test";
import assert from "node:assert/strict";
import { FailureLimiter } from "../src/lib/rate-limit";

test("locks after max failures and unlocks when the window passes", () => {
  let now = 0;
  const l = new FailureLimiter(3, 1000, () => now);
  l.fail("a"); l.fail("a");
  assert.equal(l.blocked("a"), false);
  l.fail("a");
  assert.equal(l.blocked("a"), true);
  assert.equal(l.blocked("b"), false);
  now = 1001;
  assert.equal(l.blocked("a"), false);
});

test("a successful sign-in clears the count", () => {
  const l = new FailureLimiter(2, 1000, () => 0);
  l.fail("a"); l.clear("a"); l.fail("a");
  assert.equal(l.blocked("a"), false);
});
