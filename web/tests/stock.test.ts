import { test } from "node:test";
import assert from "node:assert/strict";
import { isBigPriceChange, isLowStock, latestPrices, marginPct, needsApproval, nextPoNo, parsePriceCsv, poStatusAfterReceive, priceChangePct, sellFromMarkup, suggestOrderQty, weightedAverage } from "../src/lib/stock";
import { can } from "../src/lib/permissions";

test("weighted average cost", () => {
  assert.equal(weightedAverage(2, 60, 6, 65), 63.75);
  assert.equal(weightedAverage(0, 50, 4, 65), 65);
  assert.equal(weightedAverage(-1, 50, 4, 65), 65);
  assert.equal(weightedAverage(5, 60, 0, 99), 60);
});

test("markup, margin and price change", () => {
  assert.equal(sellFromMarkup(65, 45), 94.3);
  assert.equal(marginPct(100, 75), 25);
  assert.equal(marginPct(0, 10), null);
  assert.equal(priceChangePct(65, 76.7), 18);
  assert.equal(isBigPriceChange(65, 70), false);
  assert.equal(isBigPriceChange(65, 76.7), true);
  assert.equal(isBigPriceChange(null, 76.7), false);
});

test("POs over the limit need Boss approval unless the Boss raises them", () => {
  assert.equal(needsApproval("supervisor", 5705), true);
  assert.equal(needsApproval("supervisor", 4999), false);
  assert.equal(needsApproval("boss", 50000), false);
  assert.equal(can("supervisor", "po.approve"), false);
  assert.equal(can("supervisor", "price.set"), false);
  assert.equal(can("mechanic", "stock.manage"), false);
});

test("reorder suggestion and low stock", () => {
  assert.equal(suggestOrderQty({ onHand: 2, onOrder: 0, minLevel: 4, reorderQty: 0 }), 6);
  assert.equal(suggestOrderQty({ onHand: 2, onOrder: 0, minLevel: 4, reorderQty: 10 }), 10);
  assert.equal(isLowStock({ onHand: 2, onOrder: 6, minLevel: 4 }), false);
  assert.equal(isLowStock({ onHand: 2, onOrder: 0, minLevel: 4 }), true);
  assert.equal(isLowStock({ onHand: 0, onOrder: 0, minLevel: 0 }), false);
});

test("PO status after receiving", () => {
  assert.equal(poStatusAfterReceive([{ qty: 6, receivedQty: 6 }, { qty: 2, receivedQty: 2 }]), "received");
  assert.equal(poStatusAfterReceive([{ qty: 6, receivedQty: 4 }, { qty: 2, receivedQty: 0 }]), "partially_received");
  assert.equal(poStatusAfterReceive([{ qty: 6, receivedQty: 0 }]), "ordered");
});

test("latest price per supplier, cheapest first", () => {
  const r = latestPrices([
    { id: 1, supplierId: 1, price: 61.5, priceDate: "2026-08-02" },
    { id: 2, supplierId: 1, price: 65, priceDate: "2026-10-15" },
    { id: 3, supplierId: 2, price: 59, priceDate: "2026-09-22" },
  ]);
  assert.deepEqual(r.map((x) => [x.supplierId, x.price]), [[2, 59], [1, 65]]);
});

test("PO numbers run per year", () => {
  assert.equal(nextPoNo(2026, ["PO-2026-0233", "PO-2025-0999"]), "PO-2026-0234");
});

test("price list CSV import", () => {
  const csv = 'Part No,Description,Unit Price (RM),Your Code\n1R-0739,"Oil filter, engine",RM 61.50,SHP-0739\nHYD-VG46-20,Hydraulic oil,"1,210.00",\n,No part,5\nX1,Bad price,abc\n';
  const r = parsePriceCsv(csv);
  assert.equal(r.ok, true);
  assert.deepEqual(r.rows.map((x) => [x.partNo, x.price, x.supplierPartNo]), [["1R-0739", 61.5, "SHP-0739"], ["HYD-VG46-20", 1210, null]]);
  assert.deepEqual(r.problems, [{ line: 4, reason: "noPartNo" }, { line: 5, reason: "noPrice" }]);
  assert.equal(parsePriceCsv("a,b\n1,2").ok, false);
});
