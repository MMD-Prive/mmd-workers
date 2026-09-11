import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./confirmation-handoff.js", import.meta.url), "utf8");

test("confirmation handoff uses canonical signed pages and LINE Mini App dashboards", () => {
  assert.match(source, /CUSTOMER_CONFIRM_PATH = "\/sigil\/confirm\/job-confirmation"/);
  assert.match(source, /MODEL_CONFIRM_PATH = "\/sigil\/confirm\/job-model"/);
  assert.match(source, /MEMBER_LIFF_URL = "https:\/\/miniapp\.line\.me\/2010862595-yT4DCEMc"/);
  assert.match(source, /MODEL_LIFF_URL = "https:\/\/miniapp\.line\.me\/2010864854-N34SgCqq"/);
  assert.match(source, /ไปที่ My MMD ใน LINE/);
  assert.match(source, /ไปที่ MMD MODEL ใน LINE/);
});

test("confirmation handoff does not route success back to legacy or web-only dashboards", () => {
  assert.doesNotMatch(source, /href\s*=\s*["']\/model\/dashboard/);
  assert.doesNotMatch(source, /href\s*=\s*["']\/member\/my-mmd/);
  assert.doesNotMatch(source, /MODEL_DASHBOARD_PATH/);
  assert.doesNotMatch(source, /MY_MMD_PATH/);
  assert.doesNotMatch(source, /location\.(?:assign|replace)\(/);
});
