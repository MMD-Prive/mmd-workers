import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./kenji-admin-ai20-view-v1.js", import.meta.url), "utf8");

test("Kenji AI 2.0 is a first-class query view inside canonical Kenji Admin", () => {
  assert.match(source, /ai20ViewV1/);
  assert.match(source, /currentView\(\) === "ai20"/);
  assert.match(source, /updateView\("ai20"/);
  assert.match(source, /KENJI · AI 2\.0/);
  assert.match(source, /data-kso-ai20-panel/);
});

test("Kenji AI 2.0 view reuses the real member-facing admin preview surface", () => {
  assert.match(source, /\/member\/kenji-ai-20\?mode=admin-preview/);
  assert.match(source, /<iframe/);
  assert.match(source, /data-kai20-frame/);
  assert.match(source, /Open Full Preview/);
});

test("existing lightweight Try a question nav is promoted to Kenji AI 2.0", () => {
  assert.match(source, /data-kso-scroll=\"preview\"/);
  assert.match(source, /removeAttribute\("data-kso-scroll"\)/);
  assert.match(source, /setAttribute\("data-kso-ai20"/);
  assert.match(source, /button\.textContent = "Kenji AI 2\.0"/);
});

test("AI 2.0 admin preview adds no browser-side authority or secret-bearing mutation", () => {
  assert.doesNotMatch(source, /api\.airtable\.com|AIRTABLE_API_KEY|Authorization:\s*["']Bearer|wrangler|secret/i);
  assert.doesNotMatch(source, /fetch\([^\n]+method:\s*["']POST/i);
  assert.match(source, /Preview only/);
  assert.match(source, /Money Truth/);
  assert.match(source, /published Knowledge/);
});
