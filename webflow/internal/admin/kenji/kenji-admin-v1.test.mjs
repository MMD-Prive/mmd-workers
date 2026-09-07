import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const js = await readFile(new URL("./kenji-admin-v1.js", import.meta.url), "utf8");
const css = await readFile(new URL("./kenji-admin-v1.css", import.meta.url), "utf8");
const friendly = await readFile(new URL("./kenji-admin-friendly-v3.js", import.meta.url), "utf8");

test("canonical admin shell keeps the seven technical sections available for Advanced diagnostics", () => {
  for (const label of ["Overview", "Models", "Knowledge", "Access", "Routing", "QA & Preview", "Versions"]) assert.match(js, new RegExp(label.replace("&", "&")));
});

test("Knowledge core still connects only to versioned Worker workflow endpoints", () => {
  assert.match(js, /\/v1\/admin\/kenji\/knowledge/);
  for (const action of ["review", "qa", "publish", "audit"]) assert.match(js, new RegExp(action));
  assert.match(js, /expected_version/);
  assert.match(js, /Idempotency-Key/);
  assert.match(js, /crypto\.randomUUID/);
  assert.doesNotMatch(js, /api\.airtable\.com|AIRTABLE_API_KEY|Bearer\s+[A-Za-z0-9]/);
});

test("Models core keeps the dedicated Worker adapter and safe fields", () => {
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

test("Models core keeps operational truth and private media outside the editor", () => {
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

test("mobile admin layout stays compact", () => {
  assert.match(css, /@media\s*\(\s*max-width\s*:\s*820px\s*\)/);
  assert.match(css, /\.ka__modelGrid\s*\{\s*grid-template-columns\s*:\s*1fr\s*;?\s*\}/);
  assert.match(friendly, /@media\(max-width:820px\)/);
  assert.match(friendly, /\.kso-home\{grid-template-columns:1fr\}/);
});

test("Models search still delegates query to the Worker and ignores stale responses", () => {
  assert.match(js, /modelSearchTimer/);
  assert.match(js, /modelSearchSeq/);
  assert.match(js, /encodeURIComponent\(q\)/);
  assert.match(js, /MODEL_API\+"\?limit=120"/);
  assert.doesNotMatch(js, /addEventListener\("input", renderModelList\)/);
});

test("single-owner layer is task-oriented and hides multi-admin review UI by default", () => {
  assert.match(friendly, /singleOwnerV4/);
  assert.match(friendly, /root\.dataset\.uxFriendly = "2"/);
  for (const copy of ["สอน Kenji", "ลองถาม", "Model", "Knowledge", "History / Advanced", "สรุปก่อนใช้จริง", "ใช้จริง"]) {
    assert.match(friendly, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(friendly, /\.kux-review-board\{display:none!important\}/);
  assert.match(friendly, /\.ka__nav\{display:none!important\}/);
});

test("single-owner Knowledge flow is Teach -> Summary -> Use Live while Worker keeps review and QA gates", () => {
  assert.match(friendly, /API \+ "\/draft"/);
  assert.match(friendly, /source_ref: "single-owner-friendly-v4"/);
  assert.match(friendly, /function advanceKnowledge/);
  assert.match(friendly, /command\(id, "review"/);
  assert.match(friendly, /command\(id, "qa"/);
  assert.match(friendly, /command\(id, "publish"/);
  assert.match(friendly, /expected_version/);
  assert.match(friendly, /Idempotency-Key/);
  assert.match(friendly, /privacy_checked/);
  assert.match(friendly, /policy_path_match: true/);
  assert.match(friendly, /blocked_information/);
  assert.doesNotMatch(friendly, /api\.airtable\.com|AIRTABLE_API_KEY|Authorization:\s*["']Bearer/);
});

test("single-owner summary keeps sensitive authority confirmation in the same page", () => {
  assert.match(friendly, /ksoSensitiveConfirm/);
  assert.match(friendly, /Payment \/ Membership \/ Model \/ Policy/);
  assert.match(friendly, /backend authority/);
  assert.match(friendly, /isSensitiveKnowledge/);
  assert.match(friendly, /handoff_required/);
});

test("single-owner Model flow saves draft then auto-runs review QA publish after one summary confirmation", () => {
  assert.match(friendly, /saveModelForSummary/);
  assert.match(friendly, /\/review-queue\?status=all&limit=160/);
  assert.match(friendly, /modelCommand\(requestId, "review"/);
  assert.match(friendly, /modelCommand\(requestId, "qa"/);
  assert.match(friendly, /modelCommand\(requestId, "publish"/);
  assert.match(friendly, /customer_safe_preview_checked: true/);
  assert.match(friendly, /source_checked: sourceOk/);
  assert.match(friendly, /privacy_checked: true/);
  assert.match(friendly, /data-kso-model-sensitive/);
});

test("friendly preview is discovery-only and never calls a generative reply endpoint", () => {
  assert.match(friendly, /ลองถามก่อนสอนซ้ำ/);
  assert.match(friendly, /function score/);
  assert.match(friendly, /customer_answer/);
  assert.doesNotMatch(friendly, /\/v1\/internal\/kenji\/reply|\/chat\/completion|openai/i);
});
