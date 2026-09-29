import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const file = new URL("../src/internal-pages.ts", import.meta.url);

test("Create Job page is customer-first before Job Board", async () => {
  const html = await readFile(file, "utf8");
  assert.match(html, /data-cj-flow="customer-first"/);
  assert.match(html, /id="job-client-query"/);
  assert.match(html, /data-cj-primary-flow="customer-search"/);
  assert.match(html, /\/v1\/admin\/clients\/lineage-lookup/);
  assert.match(html, /\/v1\/admin\/clients\/recent/);
  assert.match(html, /กรุณาค้นหาและเลือกลูกค้าก่อนสร้างงาน/);
  assert.ok(
    html.indexOf('data-cj-primary-flow="customer-search"') < html.indexOf('data-cj-secondary-flow="model-job-board"'),
    "Customer search must appear before the optional Model Job Board flow",
  );
});

test("Create Job keeps payment and Job Board contracts", async () => {
  const html = await readFile(file, "utf8");
  assert.match(html, /id="amount_thb" name="amount_thb" type="number" min="1" step="1" required/);
  assert.match(html, /amount_thb:\s*amount\(\)/);
  assert.match(html, /if \(!payload\.amount_thb\)/);
  assert.match(html, /id="job-board-text" maxlength="1000"/);
  assert.match(html, /id="job-customer-gender"/);
  assert.match(html, /id="job-budget-disclosure"/);
  assert.match(html, /fetch\("\/v1\/admin\/job-board\/publish"/);
  assert.match(html, /broadcastLink\.startsWith\("https:\/\/www\.mmdbkk\.com\/sigil\/model\/login\?"/);
});

test("Create Job no longer forces operators to remember a Session ID first", async () => {
  const html = await readFile(file, "utf8");
  assert.doesNotMatch(html, /กรุณาใส่ Session ID ก่อนสร้าง canonical Job/);
  assert.match(html, /Session ID · optional/);
});
