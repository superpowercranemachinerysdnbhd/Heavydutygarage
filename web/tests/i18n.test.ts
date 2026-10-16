import { test } from "node:test";
import assert from "node:assert/strict";
import { DICTS, LOCALES, fromAcceptLanguage, placeLabel, translator } from "../src/i18n/index";
import { en } from "../src/i18n/en";
import { activityText } from "../src/i18n/labels";

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

test("every language has every phrase, non-empty, with the same placeholders", () => {
  for (const l of LOCALES) {
    const d = DICTS[l];
    assert.deepEqual(Object.keys(d).sort(), Object.keys(en).sort(), `${l} keys`);
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      assert.ok(d[k].trim().length > 0, `${l} ${k} is empty`);
      assert.equal(vars(d[k]), vars(en[k]), `${l} ${k} placeholders`);
    }
  }
});

test("placeholders are filled in", () => {
  assert.equal(translator("ms")("dash.more", { n: 3 }), "+3 lagi");
  assert.equal(translator("zh")("due.overdue", { n: 2 }), "逾期 2 天");
});

test("activity entries render in the reader's language with translated statuses", () => {
  const a = { key: "act.status", params: { from: "received", to: "in_progress", name: "Ahmad" }, text: "" };
  assert.equal(activityText(translator("en"), a), "Status Received → In Progress by Ahmad.");
  assert.equal(activityText(translator("ms"), a), "Status Diterima → Sedang Dibaiki oleh Ahmad.");
  assert.equal(activityText(translator("zh"), { key: null, params: null, text: "old free text" }), "old free text");
});

test("stored place names are translated", () => {
  assert.equal(placeLabel(translator("ms"), "Workshop · Bay 2"), "Bengkel · Petak 2");
  assert.equal(placeLabel(translator("zh"), "Long-stay yard A"), "长期停放场 A");
  assert.equal(placeLabel(translator("ms"), "Semenyih quarry"), "Semenyih quarry");
});

test("browser language picks a default", () => {
  assert.equal(fromAcceptLanguage("zh-CN,zh;q=0.9,en;q=0.8"), "zh");
  assert.equal(fromAcceptLanguage("ms-MY"), "ms");
  assert.equal(fromAcceptLanguage("fr-FR"), "en");
});
