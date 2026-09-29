import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const workerRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourcePath = join(workerRoot, "src/internal-pages.ts");

test("Create Job customer search uses lineage POST contract", async () => {
  const source = await readFile(sourcePath, "utf8");

  assert.match(source, /apiJson\("\/v1\/admin\/clients\/lineage-lookup", \{ method: "POST"/);
  assert.match(source, /JSON\.stringify\(\{ query: q/);
  assert.match(source, /allow_manual_fallback: true/);
  assert.doesNotMatch(source, /lineage-lookup\?q=/);
});

test("Create Job mobile layout tells operator what to tap first", async () => {
  const source = await readFile(sourcePath, "utf8");

  assert.match(source, /data-cj-flow="customer-first-digital"/);
  assert.match(source, /mmdop__tapGuide/);
  assert.match(source, /Tap first/);
  assert.match(source, /1 ค้นลูกค้า/);
  assert.match(source, /@media\(max-width:720px\)/);
  assert.match(source, /\.mmdop__tapGuide\{grid-template-columns:1fr/);
});

test("Create Job hides raw not_found from operator", async () => {
  const source = await readFile(sourcePath, "utf8");

  assert.match(source, /raw === "not_found"/);
  assert.match(source, /ไม่พบผลจากคำนี้/);
  assert.match(source, /ลอง Recent/);
});
