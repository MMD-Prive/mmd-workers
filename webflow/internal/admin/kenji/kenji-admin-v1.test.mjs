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
    "keyword_profile_id",
    "expected_profile_version",
    "folder_name",
    "working_name",
    "search_aliases",
    "customer_safe_info",
    "positive_sensitive_description",
    "customer_safe_remark",
    "model_tier",
    "proposed_visibility",
    "allowed_customer_scope",
    "photo_visibility_policy",
    "deposit_preview_gate",
    "include_in_public_kenji",
    "source_ref",
  ]) assert.match(js, new RegExp(field));

  assert.match(js, /Models \+ Keyword Profiles/);
  assert.match(js, /Save Draft → Review/);
  assert.match(js, /Idempotency-Key/);
  assert.match(js, /Legacy Backup · \/kenji-model-keyword-copy/);
  assert.doesNotMatch(js, /href="\/kenji-model-keyword-copy"/);
  assert.doesNotMatch(js, /Save Draft · รอ Model adapter/);
  assert.doesNotMatch(js, /\/v1\/admin\/models\/upsert/);
  assert.doesNotMatch(js, /api\.airtable\.com|AIRTABLE_API_KEY|MMD_MODEL_ASSETS\.put/);
});

test("Models tab uses the real Keyword Profile choice contract", () => {
  for (const value of ["Public", "GWs", "EMs", "Private"]) assert.match(js, new RegExp(`option\\(\\"${value}`));
  for (const value of ["All Active Members", "VIP", "SVIP", "Black Card", "#Potential", "Per Review"]) assert.match(js, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const value of ["Active eligible only", "VIP/SVIP/Black Card only", "No photo", "Per review"]) assert.match(js, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const value of ["None", "Verified deposit + Per approval", "Per approval"]) assert.match(js, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(js, /identity_tier/);
  assert.match(js, /Keyword Profile Tier/);
  assert.match(js, /Proposed Access Visibility/);
});

test("Models tab keeps operational truth and private media outside the editor", () => {
  assert.match(js, /ไม่รับราคา, availability\/คิว/);
  assert.match(js, /Model Console media review/);
  assert.match(js, /Production ยังไม่ถูกแก้ไข/);
  assert.doesNotMatch(js, /minimum_rate_90m|standard_rate_thb|private_original_key|signed_url|private_admin_note/);
});

test("safe preview excludes the positive-sensitive review-only field", () => {
  const previewStart = js.indexOf("function previewModelDraft");
  const saveStart = js.indexOf("function saveModelDraft");
  const preview = js.slice(previewStart, saveStart);
  assert.match(preview, /customer_safe_info/);
  assert.match(preview, /customer_safe_remark/);
  assert.doesNotMatch(preview, /positive_sensitive_description/);
});

test("mobile admin layout stays compact with horizontal layers", () => {
  assert.match(css, /@media\(max-width:820px\)/);
  assert.match(css, /scroll-snap-type:x mandatory/);
  assert.match(css, /min-width:92vw/);
  assert.match(css, /\.ka__modelGrid\{grid-template-columns:1fr\}/);
});
