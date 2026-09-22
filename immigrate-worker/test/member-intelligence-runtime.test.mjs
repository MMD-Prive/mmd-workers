import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../public/a/member-intelligence.js", import.meta.url), "utf8");
const canonicalCore = await readFile(new URL("../src/canonical-admin-login-core.ts", import.meta.url), "utf8");
const wrangler = await readFile(new URL("../wrangler.toml", import.meta.url), "utf8");

test("Member Intelligence reads only canonical same-origin admin projections", () => {
  assert.match(source, /\/v1\/admin\/clients\/recent/);
  assert.match(source, /\/v1\/admin\/clients\/lineage-lookup/);
  assert.match(source, /\/v1\/admin\/clients\/intelligence/);
  assert.doesNotMatch(source, /\/v1\/admin\/kenji\/control\/memory\?client_id=/);
  assert.match(source, /credentials:\s*"same-origin"/);
  assert.match(source, /cache:\s*"no-store"/);
  assert.doesNotMatch(source, /admin-worker\.malemodel-bkk\.workers\.dev/);
  assert.doesNotMatch(source, /AIRTABLE_API_KEY|ADMIN_BEARER|CONFIRM_KEY|X-Confirm-Key/);
});

test("Member Intelligence renders a fail-closed reviewed operator draft without a send path", () => {
  assert.match(source, /mmd\.kenji_continuity_operator_draft\.v1/);
  assert.match(source, /draft\.send_allowed===false/);
  assert.match(source, /guards\.customer_auto_send===false/);
  assert.match(source, /guards\.business_truth_claims===false/);
  assert.match(source, /draft\.requires_owner_review===true/);
  assert.match(source, /continuity\.freshness==="fresh"/);
  assert.match(source, /continuity\.live_truth_wins===true/);
  assert.match(source, /miDraftReview/);
  assert.match(source, /miDraftMatrix/);
  assert.match(source, /miDraftKill/);
  assert.match(source, /runtime\.operator_copy_allowed===true/);
  assert.match(source, /recordDraftAudit\("view"/);
  assert.match(source, /recordDraftAudit\("copy"/);
  assert.match(source, /navigator\.clipboard\.writeText/);
  assert.ok(
    source.indexOf('await recordDraftAudit("copy"') < source.indexOf("navigator.clipboard.writeText"),
    "copy authorization audit must succeed before clipboard mutation",
  );
  assert.doesNotMatch(source, /api\.line\.me|\/messages\/.+\/send|pushMessage|replyMessage/);
});

test("Member Intelligence explains unavailable drafts and locks copy on audit or runtime-control failure", () => {
  assert.match(source, /phase4_mode_off/);
  assert.match(source, /matrix_stale_or_expired/);
  assert.match(source, /AUDIT UNAVAILABLE · Copy ถูกล็อกแบบ fail-closed/);
  assert.match(source, /UNKNOWN · COPY LOCKED/);
  assert.match(source, /COPY LOCKED/);
});

test("Member Intelligence fails closed on unresolved identity and browser auth loss", () => {
  assert.match(source, /manual_public_only/);
  assert.match(source, /IDENTITY REVIEW/);
  assert.match(source, /Resolve Identity First/);
  assert.match(source, /response\.status===401\|\|response\.status===403/);
  assert.match(source, /\/internal\/admin\/login\?next=/);
  assert.match(source, /BACKEND WAITING/);
});

test("Member Intelligence does not mutate payment, membership or entitlement truth", () => {
  assert.doesNotMatch(source, /\/v1\/admin\/access\/(?:grant|revoke)/);
  assert.doesNotMatch(source, /verified_at\s*=/);
  assert.doesNotMatch(source, /membership[_-](?:activate|renew|grant)/i);
  assert.doesNotMatch(source, /telegram\/(?:grant|add|remove)|drive\/(?:grant|add|remove)/i);
  assert.match(source, /My MMD Resolver/);
});

test("Member Intelligence hands canonical clients to the correct operator surfaces", () => {
  assert.match(source, /\/internal\/admin\/membership-access\?client_id=/);
  assert.match(source, /\/internal\/admin\/jobs\/create-job\?client_id=/);
  assert.match(source, /\/internal\/admin\/customer-data/);
  assert.doesNotMatch(source, /\/internal\/admin\/jobs\/create-session\?client_id=/);
});

test("Member Intelligence browser code is served inside the existing Worker-owned Control Room route family", () => {
  assert.match(canonicalCore, /MEMBER_INTELLIGENCE_RUNTIME_PATH\s*=\s*"\/internal\/admin\/control-room\/member-intelligence-runtime"/);
  assert.match(canonicalCore, /BUNDLED_MEMBER_INTELLIGENCE_RUNTIME_PATH\s*=\s*"\/a\/member-intelligence\.js"/);
  assert.match(canonicalCore, /assetUrl\.pathname\s*=\s*BUNDLED_MEMBER_INTELLIGENCE_RUNTIME_PATH/);
  assert.match(canonicalCore, /assetUrl\.search\s*=\s*""/);
  assert.match(canonicalCore, /control-room-lane-v1/);
  assert.match(canonicalCore, /x-mmd-member-intelligence-authority/);
  assert.match(wrangler, /run_worker_first\s*=\s*\[[^\]]*\/internal\/admin\/control-room\/member-intelligence-runtime/);
  assert.match(wrangler, /pattern = "mmdbkk\.com\/internal\/admin\/control-room\*"/);
  assert.match(wrangler, /pattern = "www\.mmdbkk\.com\/internal\/admin\/control-room\*"/);
  assert.doesNotMatch(wrangler, /pattern = "(?:www\.)?mmdbkk\.com\/internal\/admin\/member-intelligence\/runtime"/);
  assert.doesNotMatch(wrangler, /pattern = "(?:www\.)?mmdbkk\.com\/a\/member-intelligence\.js"/);
});
