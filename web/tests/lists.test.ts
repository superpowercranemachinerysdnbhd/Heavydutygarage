import { test } from "node:test";
import assert from "node:assert/strict";
import { catColor, categoryCodes, itemLabel, machineGroups, mergeLists, newCode, qcTemplate, setLists, bayCodes, settings } from "../src/lib/lists";
import { translator } from "../src/i18n/index";

const en = translator("en");
const row = (list: "job_category" | "machine_type" | "bay" | "qc_item", code: string, extra: Record<string, unknown> = {}) =>
  ({ list, code, label: null, grp: null, color: null, priority: null, sort: 50, active: true, ...extra });

test("built-in lists are there with nothing stored", () => {
  setLists(mergeLists([], {}));
  assert.ok(categoryCodes().includes("EMG"));
  assert.equal(itemLabel(en, "job_category", "PM"), en("cat.PM"));
  assert.equal(machineGroups()[0].group, "mobile_crane");
  assert.equal(settings().poApprovalLimit, 5000);
});

test("stored changes rename, hide and add entries", () => {
  setLists(mergeLists([
    row("job_category", "PAINT", { active: false }),
    row("job_category", "PM", { label: "Servis Berkala" }),
    row("job_category", "INSPECT", { label: "Inspection", color: "#123456", priority: "high", sort: 20 }),
    row("machine_type", "tower_crane", { label: "Tower Crane", grp: "mobile_crane" }),
    row("bay", "Wash bay", { label: "Wash bay" }),
    row("qc_item", "cleanUp", { active: false }),
    row("qc_item", "greasing", { label: "All grease points done", sort: 9 }),
  ], { labourRate: 110 }));
  assert.ok(!categoryCodes().includes("PAINT"));
  assert.ok(categoryCodes({ all: true }).includes("PAINT"));
  assert.equal(itemLabel(en, "job_category", "PM"), "Servis Berkala");
  assert.equal(catColor("INSPECT"), "#123456");
  assert.ok(machineGroups().find((g) => g.group === "mobile_crane")!.types.includes("tower_crane"));
  assert.ok(bayCodes().includes("Wash bay"));
  const qc = qcTemplate("INSPECT", en);
  assert.ok(!qc.some((q) => q.itemKey === "cleanUp"));
  assert.ok(qc.some((q) => q.item === "All grease points done" && q.itemKey === null));
  assert.equal(qc.length, 5); // no category check for a custom category; 4 standard + 1 new
  assert.equal(settings().labourRate, 110);
});

test("new codes are readable and unique", () => {
  setLists(mergeLists([row("machine_type", "tower_crane", { label: "Tower Crane" })], {}));
  assert.equal(newCode("machine_type", "Tower Crane"), "tower_crane_2");
  assert.equal(newCode("job_category", "Electrical"), "ELECTRICAL");
});
