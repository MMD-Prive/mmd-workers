import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./kenji-admin-knowledge-view-v1.js", import.meta.url), "utf8");

test("Knowledge has a canonical query view inside Kenji Admin", () => {
  assert.match(source, /knowledgeViewV1/);
  assert.match(source, /data-tab="knowledge"/);
  assert.match(source, /currentView\(\) !== "knowledge"/);
  assert.match(source, /updateView\("knowledge"/);
  assert.match(source, /KENJI · KNOWLEDGE/);
});

test("Knowledge deep link reuses the existing Worker-backed Knowledge tab", () => {
  assert.match(source, /\.ka__nav \[data-tab="knowledge"\]/);
  assert.match(source, /button\.click\(\)/);
  assert.doesNotMatch(source, /api\.airtable\.com|AIRTABLE_API_KEY|Authorization:\s*["']Bearer/);
});

test("Control Centre Knowledge shortcut uses the same canonical query-view handler", () => {
  assert.match(source, /data-kso-knowledge/);
});

test("leaving Knowledge removes only the view query state", () => {
  assert.match(source, /url\.searchParams\.delete\("view"\)/);
  assert.match(source, /pushState/);
  assert.match(source, /popstate/);
});
