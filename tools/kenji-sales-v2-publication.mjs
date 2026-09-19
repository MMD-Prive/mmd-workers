import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { SALES_CARD_IDS, SALES_REPLY_VERSION, SALES_REPLY_REVIEW_AT, publishedSalesCard } from "../member-dashboard-chat-worker/src/kenji-sales-reply-v2-policy.mjs";
import { SALES_REPLY_HASHES } from "../member-dashboard-chat-worker/src/kenji-sales-reply-v2-runtime.mjs";
import { APPROVED_ANSWERS } from "../member-dashboard-chat-worker/test/fixtures/kenji-sales-v2-approved.mjs";

const ORIGIN = "https://www.mmdbkk.com";
const digest = (value) => createHash("sha256").update(value).digest("hex");
function safeAdminHandoff(location) {
  if (!location) return false;
  try {
    const target = new URL(location, ORIGIN);
    return target.origin === ORIGIN && !target.username && !target.password && /^\/internal\/admin(?:\/|$)/.test(target.pathname);
  } catch { return false; }
}
assert.equal(safeAdminHandoff("/internal/admin/kenji"), true);
assert.equal(safeAdminHandoff(`${ORIGIN}/internal/admin/kenji`), true);
assert.equal(safeAdminHandoff("/internal/admin"), true);
assert.equal(safeAdminHandoff("https://example.com/internal/admin/kenji"), false);
assert.equal(safeAdminHandoff("//example.com/internal/admin"), false);
assert.equal(safeAdminHandoff("/internal/admin-evil"), false);
assert.equal(safeAdminHandoff(""), false);
const entries = Object.entries(SALES_CARD_IDS);
assert.equal(entries.length, 8);
for (const [key] of entries) assert.equal(digest(APPROVED_ANSWERS[key]), SALES_REPLY_HASHES[key], `reviewed_digest:${key}`);
if (process.argv.includes("--validate")) {
  console.log(JSON.stringify({ ok: true, mode: "validate_only", version: SALES_REPLY_VERSION, count: entries.length, writes: 0, handoff_validation: "passed" }));
  process.exit(0);
}
assert.ok(process.argv.includes("--publish"), "Explicit --publish required");
assert.ok(Date.now() < SALES_REPLY_REVIEW_AT, "September snapshot requires fresh review after cutoff");
const credential = String(process.env.ADMIN_LOGIN_CREDENTIAL || "").trim();
assert.ok(credential.length > 0, "Canonical admin credential is missing");

// Cookies and credentials stay in memory and are never printed or saved as artifacts.
const login = await fetch(`${ORIGIN}/internal/admin/login/session`, {
  method: "POST", redirect: "manual", signal: AbortSignal.timeout(20000),
  headers: { Origin: ORIGIN, "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ credential, next: "/internal/admin/kenji" }),
});
const location = login.headers.get("location") || "";
const cookies = login.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
const hasSession = /(?:^|;\s*)mmd_admin_gate_v1=[^;\s]+/.test(cookies);
// Log only the non-sensitive path and booleans, never query strings or cookie values.
let handoffPath = "unparseable";
try { handoffPath = new URL(location, ORIGIN).pathname; } catch {}
console.log(JSON.stringify({ step: "canonical_admin_login", status: login.status, handoff_path: handoffPath, same_origin_admin_handoff: safeAdminHandoff(location), session_cookie_present: hasSession }));
assert.equal(login.status, 303, "Canonical owner login failed");
assert.ok(safeAdminHandoff(location), "Unsafe or missing same-origin admin handoff");
assert.ok(hasSession, "Canonical session cookie missing");

async function api(path, payload, key = "") {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response;
    try {
      response = await fetch(ORIGIN + path, {
        method: payload === undefined ? "GET" : "POST", redirect: "manual", signal: AbortSignal.timeout(20000),
        headers: { Cookie: cookies, Origin: ORIGIN, Accept: "application/json", ...(payload === undefined ? {} : { "Content-Type": "application/json", "Idempotency-Key": key }) },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      });
    } catch {
      if (attempt < 2) continue;
      throw new Error(`canonical_request_unavailable:${path}`);
    }
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
      continue;
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok !== true) {
      throw new Error(`canonical_request_failed:${path}:${response.status}:${String(body.error?.code || body.error || "unknown").slice(0, 100)}`);
    }
    return body;
  }
  throw new Error("unreachable_retry_state");
}
// A redirect is never accepted as authentication. Require the canonical session
// validator before any knowledge read/write; the knowledge endpoints enforce role.
await api("/v1/admin/auth/me");
const summary = [];
for (const [key, id] of entries) {
  const path = `/v1/admin/kenji/knowledge/${id}`;
  let detail = await api(path);
  let current = detail.card;
  assert.equal(current.knowledge_id, id);
  assert.equal(digest(current.customer_answer), SALES_REPLY_HASHES[key], `content_changed:${key}`);
  assert.equal(current.response_mode, "auto_reply_allowed", `response_mode_not_prepared:${key}`);
  assert.ok(current.allowed_channels?.includes("LINE_OFC"), `channel_not_prepared:${key}`);
  assert.ok(current.allowed_audience?.includes("Guest"), `audience_not_prepared:${key}`);
  assert.ok(publishedSalesCard({ ...current, status: "active", workflow_stage: "published" }, id), `candidate_validation_failed:${key}`);
  let audit = await api(`${path}/audit`);
  assert.equal(audit.revision_pending, false, `unexpected_pending_revision:${key}`);
  if (audit.stage === "draft") {
    await api(`${path}/review`, { expected_version: audit.version }, `kenji-sales-v2-review-${id}-v${audit.version}`);
    audit = await api(`${path}/audit`);
  }
  assert.ok(audit.events.some((item) => item.action === "submit_review"), `signed_review_missing:${key}`);
  if (audit.stage === "review") {
    await api(`${path}/qa`, {
      expected_version: audit.version,
      qa: {
        policy_path_match: true, sample_question: key === "care_back" ? "CARE BACK" : `V2 ${key}`,
        blocked_information: ["payment approval", "membership activation", "booking confirmation", "live availability", "private contacts", "internal notes"],
        privacy_checked: true, checked_at: new Date().toISOString(), channel: "LINE_OFC", audience: "customer",
      },
    }, `kenji-sales-v2-qa-${id}-v${audit.version}`);
    audit = await api(`${path}/audit`);
  }
  assert.ok(audit.events.some((item) => item.action === "record_qa"), `signed_qa_missing:${key}`);
  if (audit.stage === "qa_passed") {
    await api(`${path}/publish`, { expected_version: audit.version }, `kenji-sales-v2-publish-${id}-v${audit.version}`);
  } else assert.equal(audit.stage, "published", `unexpected_stage:${key}`);
  audit = await api(`${path}/audit`);
  detail = await api(path);
  current = detail.card;
  assert.equal(audit.stage, "published");
  assert.ok(audit.events.some((item) => item.action === "publish"), `signed_publish_missing:${key}`);
  assert.equal(current.status, "active");
  assert.equal(current.workflow_stage, "published");
  assert.equal(digest(current.customer_answer), SALES_REPLY_HASHES[key], `published_digest_changed:${key}`);
  assert.ok(publishedSalesCard(current, id));
  summary.push({ key, knowledge_id: id, status: current.status, stage: audit.stage, version: audit.version, digest: SALES_REPLY_HASHES[key], signed_audit_verified: true });
  console.log(`${id}: published v${audit.version}; exact digest and signed audit verified`);
}
const result = { ok: true, reply_pack_version: SALES_REPLY_VERSION, count: summary.length, cards: summary, deployment_verified: false, real_line_delivery_verified: false };
await writeFile(`${process.env.RUNNER_TEMP || "/tmp"}/kenji-sales-v2-publication.json`, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ ok: true, mode: "signed_publication_verified", count: summary.length, version: SALES_REPLY_VERSION }));
