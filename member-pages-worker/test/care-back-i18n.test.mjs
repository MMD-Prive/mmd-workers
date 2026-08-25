import assert from "node:assert/strict";
import test from "node:test";
import { CARE_BACK_COPY, CARE_BACK_LOCALES, normalizeCareBackLocale } from "../src/care-back-i18n.js";

test("CARE BACK required customer copy is complete in TH EN and ZH", () => {
  const keys = Object.keys(CARE_BACK_COPY.th).sort();
  assert.deepEqual(CARE_BACK_LOCALES, ["th", "en", "zh"]);
  for (const locale of CARE_BACK_LOCALES) {
    assert.deepEqual(Object.keys(CARE_BACK_COPY[locale]).sort(), keys, `${locale} keys`);
    for (const key of keys) assert.ok(String(CARE_BACK_COPY[locale][key]).trim(), `${locale}.${key}`);
  }
  for (const value of Object.values(CARE_BACK_COPY.en)) assert.doesNotMatch(value, /[ก-๙]/);
  for (const value of Object.values(CARE_BACK_COPY.zh)) assert.doesNotMatch(value, /[ก-๙]/);
  assert.match(CARE_BACK_COPY.en.default_status, /MMD/);
  assert.match(CARE_BACK_COPY.zh.default_status, /MMD/);
});

test("CARE BACK locale selection is bounded and deterministic", () => {
  assert.equal(normalizeCareBackLocale("en-US"), "en");
  assert.equal(normalizeCareBackLocale("zh-TW"), "zh");
  assert.equal(normalizeCareBackLocale("zh-CN"), "zh");
  assert.equal(normalizeCareBackLocale("th-TH"), "th");
  assert.equal(normalizeCareBackLocale("unknown"), "th");
});
