/** Stock and pricing rules. Pure functions only, so they can be tested without a database. */
import { settings } from "./lists";
import { can, type Role } from "./permissions";

/** POs above this total (RM) need Head Manager approval. Set in Settings. */
export const poApprovalLimit = () => settings().poApprovalLimit;
/** Warn when a new price differs from the last price from the same supplier by more than this. */
export const PRICE_WARN_PCT = 10;

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

/** Weighted average cost after receiving stock. If stock was empty (or negative), the new price becomes the average. */
export function weightedAverage(onHand: number, avgCost: number, qtyIn: number, unitCost: number): number {
  if (qtyIn <= 0) return avgCost;
  if (onHand <= 0) return round(unitCost, 4);
  return round((onHand * avgCost + qtyIn * unitCost) / (onHand + qtyIn), 4);
}

/** Selling price from cost and markup %, rounded to 10 sen. */
export function sellFromMarkup(cost: number, markupPct: number): number {
  return Math.round(cost * (1 + markupPct / 100) * 10) / 10;
}

/** Gross margin as % of selling price. */
export function marginPct(sell: number, cost: number): number | null {
  if (sell <= 0) return null;
  return round(((sell - cost) / sell) * 100, 1);
}

/** % change from an old price to a new one. */
export function priceChangePct(oldPrice: number | null | undefined, newPrice: number): number | null {
  if (!oldPrice || oldPrice <= 0) return null;
  return round(((newPrice - oldPrice) / oldPrice) * 100, 1);
}
export function isBigPriceChange(oldPrice: number | null | undefined, newPrice: number): boolean {
  const c = priceChangePct(oldPrice, newPrice);
  return c !== null && Math.abs(c) > PRICE_WARN_PCT;
}

/** A PO raised by someone without approval rights and over the limit waits for the Boss. */
export function needsApproval(role: Role, total: number): boolean {
  return !can(role, "po.approve") && total > poApprovalLimit();
}

/** How many to order: enough to get back above minimum, at least the reorder quantity. */
export function suggestOrderQty(p: { onHand: number; onOrder: number; minLevel: number; reorderQty: number }): number {
  const short = p.minLevel * 2 - p.onHand - p.onOrder;
  return Math.max(Math.ceil(short), Math.ceil(p.reorderQty), 1);
}
export function isLowStock(p: { onHand: number; onOrder: number; minLevel: number }): boolean {
  return p.minLevel > 0 && p.onHand + p.onOrder < p.minLevel;
}

export type PoLineState = { qty: number; receivedQty: number };
export function poStatusAfterReceive(lines: PoLineState[]): "partially_received" | "received" | "ordered" {
  const any = lines.some((l) => l.receivedQty > 0);
  const all = lines.every((l) => l.receivedQty >= l.qty);
  return all ? "received" : any ? "partially_received" : "ordered";
}

/** Latest price per supplier from a price history, cheapest first. */
export function latestPrices<T extends { supplierId: number; price: number; priceDate: string; id: number }>(history: T[]): T[] {
  const best = new Map<number, T>();
  for (const h of history) {
    const cur = best.get(h.supplierId);
    if (!cur || h.priceDate > cur.priceDate || (h.priceDate === cur.priceDate && h.id > cur.id)) best.set(h.supplierId, h);
  }
  return [...best.values()].sort((a, b) => a.price - b.price);
}

/** Next PO number for the year, e.g. PO-2026-0042. */
export function nextPoNo(year: number, existing: string[]): string {
  const prefix = `PO-${year}-`;
  const max = existing.filter((n) => n.startsWith(prefix)).reduce((m, n) => Math.max(m, Number(n.slice(prefix.length)) || 0), 0);
  return prefix + String(max + 1).padStart(4, "0");
}

/** Parse a supplier price list CSV: needs a part number column and a price column. Returns rows and problems. */
export function parsePriceCsv(text: string): { rows: { partNo: string; price: number; supplierPartNo: string | null; line: number }[]; problems: { line: number; reason: "noPrice" | "noPartNo" }[]; ok: boolean } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { rows: [], problems: [], ok: false };
  const split = (l: string) => {
    const out: string[] = []; let cur = "", q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === "," || c === ";" || c === "\t") { out.push(cur.trim()); cur = ""; } else cur += c;
    }
    out.push(cur.trim());
    return out;
  };
  const head = split(lines[0]).map((h) => h.toLowerCase());
  const find = (...names: string[]) => head.findIndex((h) => names.some((n) => h.replace(/[^a-z]/g, "").includes(n)));
  const iPart = find("partno", "partnumber", "oem", "sku", "part", "code");
  const iPrice = find("price", "harga", "cost", "unitprice");
  const iSup = find("supplierpartno", "suppliercode", "yourcode", "itemcode");
  if (iPart < 0 || iPrice < 0) return { rows: [], problems: [], ok: false };
  const rows: { partNo: string; price: number; supplierPartNo: string | null; line: number }[] = [];
  const problems: { line: number; reason: "noPrice" | "noPartNo" }[] = [];
  lines.slice(1).forEach((l, i) => {
    const c = split(l), line = i + 2;
    const partNo = (c[iPart] ?? "").trim();
    const price = Number((c[iPrice] ?? "").replace(/rm|,|\s/gi, ""));
    if (!partNo) problems.push({ line, reason: "noPartNo" });
    else if (!(price > 0)) problems.push({ line, reason: "noPrice" });
    else rows.push({ partNo, price, supplierPartNo: iSup >= 0 && iSup !== iPart ? c[iSup] || null : null, line });
  });
  return { rows, problems, ok: true };
}
