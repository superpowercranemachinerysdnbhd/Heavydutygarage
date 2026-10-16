import { test } from "node:test";
import assert from "node:assert/strict";
import { canSeeThread, cleanBody, directKey } from "../src/lib/chat-rules";

test("everyone sees the workshop chat", () => {
  assert.equal(canSeeThread({ id: 9, role: "cleaner" }, { kind: "team" }), true);
});

test("direct messages are private to the two people, even from the Boss", () => {
  const t = { kind: "direct" as const, memberIds: [3, 5] };
  assert.equal(canSeeThread({ id: 3, role: "mechanic" }, t), true);
  assert.equal(canSeeThread({ id: 5, role: "assistant" }, t), true);
  assert.equal(canSeeThread({ id: 1, role: "boss" }, t), false);
});

test("job chat follows job access", () => {
  const t = { kind: "job" as const, job: { leadId: 3, teamIds: [5] } };
  assert.equal(canSeeThread({ id: 3, role: "mechanic" }, t), true);
  assert.equal(canSeeThread({ id: 4, role: "mechanic" }, t), false);
  assert.equal(canSeeThread({ id: 2, role: "supervisor" }, t), true);
});

test("one direct thread per pair; messages are trimmed and limited", () => {
  assert.equal(directKey(7, 3), directKey(3, 7));
  assert.equal(cleanBody("  hi \r\n there  "), "hi \n there");
  assert.equal(cleanBody("x".repeat(3000)).length, 2000);
});
