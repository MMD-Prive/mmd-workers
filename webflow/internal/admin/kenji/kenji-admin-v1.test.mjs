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

test("Models tab migrates legacy keyword editing through the dedicated Worker adapter", () => {
  assert.match(js, /\/v1\/admin\/kenji\/models/);
  for (const field of [
    "model_key",
    "working_name",
    "search_aliases",
    "customer_safe_info",
    "customer_safe_remark",
    "model_tier",
    "proposed_visibility",
    "allowed_customer_scope",
    "restricted_scope",
  ]) assert.match(js, new RegExp(field));

  assert.match(js, /Save Draft → Review/);
  assert.match(js, /Idempotency-Key/);
  assert.match(js, /kenji-model-keyword-copy/);
  assert.doesNotMatch(js, /Save Draft · รอ Model adapter/);
  assert.doesNotMatch(js, /\/v1\/admin\/models\/upsert/);
  assert.doesNotMatch(js, /api\.airtable\.com|AIRTABLE_API_KEY|MMD_MODEL_ASSETS\.put/);
});

test("Models tab keeps rate, availability and private media outside the editor", () => {
  assert.match(js, /ไม่รับราคา, availability\/คิว/);
  assert.match(js, /Model Console media review/);
  assert.doesNotMatch(js, /minimum_rate_90m|standard_rate_thb|private_original_key|signed_url/);
});

test("mobile admin layout stays compact with horizontal layers", () => {
  assert.match(css, /@media\(max-width:820px\)/);
  assert.match(css, /scroll-snap-type:x mandatory/);
  assert.match(css, /min-width:92vw/);
  assert.match(css, /\.ka__modelGrid\{grid-template-columns:1fr\}/);
});
