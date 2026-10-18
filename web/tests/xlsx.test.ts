import { test } from "node:test";
import assert from "node:assert/strict";
import { excelDate } from "../src/lib/xlsx";

test("Excel serial dates and text dates", () => {
  assert.equal(excelDate("46014"), "2025-12-23");
  assert.equal(excelDate("46014.0"), "2025-12-23");
  assert.equal(excelDate("15/04/26"), "2026-04-15");
  assert.equal(excelDate("2026-01-17 00:00:00"), "2026-01-17");
  assert.equal(excelDate(""), null);
  assert.equal(excelDate("0.729"), null);
});
