import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const js = await readFile(new URL("./kenji-admin-v1.js", import.meta.url), "utf8");
const css = await readFile(new URL("./kenji-admin-v1.css", import.meta.url), "utf8");

test("canonical admin shell exposes the seven sections", () => {
  for (const label of ["Overview", "Models", "Knowledge", "Access", "Routing", "QA & Preview", "Versions"]) assert.match(js, new RegExp(label.replace("&", "&")));
});

test("Knowledge UI connects only to versioned Worker workflow endpoints", () => {
  assert.match(js, /\/v1\/admin\/kenji\/knowledge/);
  for (const action of ["review", "qa", "publish", "audit"]) assert.match(js, new RegExp(action));
  assert.match(js, /expected_version/);
  assert.match(js, /Idempotency-Key/);
  assert.match(js, /crypto\.randomUUID/);
  assert.doesNotMatch(js, /api\.airtable\.com|AIRTABLE_API_KEY|Bearer\s+[A-Za-z0-9]/);
});

test("mobile admin layout stays compact with horizontal layers", () => {
  assert.match(css, /@media\(max-width:820px\)/);
  assert.match(css, /scroll-snap-type:x mandatory/);
  assert.match(css, /min-width:92vw/);
});
