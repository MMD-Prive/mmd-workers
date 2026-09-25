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
  assert.match(source, /mmd\.kenji_verified_identity_readiness\.v1/);
  assert.match(source, /mmd\.kenji_identity_evidence_recovery\.v1/);
  assert.match(source, /mmd\.kenji_identity_evidence_owner_review_protocol\.v1/);
  assert.match(source, /Verified Identity Readiness/);
  assert.match(source, /READY FOR PER REVIEW/);
  assert.match(source, /readiness\.status==="verified"/);
  assert.match(source, /readiness\.kenji_continuity_ready===true/);
  assert.match(source, /recovery\.status==="complete"/);
  assert.match(source, /recovery\.queue_eligible===false/);
  assert.match(source, /protocol\.status==="complete"/);
  assert.match(source, /protocol\.evidence_written===false/);
  assert.match(source, /readiness\?\.automatic_verification_allowed===false/);
  assert.match(source, /readiness\?\.identity_mutated===false/);
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

test("Member Intelligence builds a bounded read-only identity evidence recovery queue", () => {
  assert.match(source, /const recoveryScanLimit=24/);
  assert.match(source, /คิวเติมหลักฐานตัวตน/);
  assert.match(source, /data-recovery-filter="all"/);
  assert.match(source, /data-recovery-filter="pending"/);
  assert.match(source, /data-recovery-filter="evidence_required"/);
  assert.match(source, /data-recovery-filter="evidence_review"/);
  assert.match(source, /data-recovery-filter="owner_review_ready"/);
  assert.match(source, /data-recovery-filter="blocked"/);
  assert.match(source, /data-recovery-filter="complete"/);
  assert.match(source, /review_line_ofc_evidence/);
  assert.match(source, /review_liff_identity_evidence/);
  assert.match(source, /owner_review_verification_status/);
  assert.match(source, /resolve_identity_conflict/);
  assert.match(source, /retry_identity_evidence_read/);
  assert.match(source, /Math\.min\(3,ids\.length\)/);
  assert.match(source, /identityRecoveryContract\(payload\)/);
  assert.match(source, /identityEvidenceProtocolContract\(payload\)/);
  assert.match(source, /OWNER PROTOCOL/);
  assert.match(source, /reread_identity_evidence/);
  assert.match(source, /capture_verified_liff_session/);
  assert.match(source, /verification_status_mutated===false/);
  assert.match(source, /state\.intelligenceCache/);
  assert.match(source, /function lockSelectedDetailForRecoveryRefresh\(\)/);
  assert.match(source, /state\.selectionSeq\+=1/);
  assert.match(source, /Copy ถูกล็อกจนกว่าจะตรวจสถานะล่าสุดเสร็จ/);
  assert.match(source, /await selectRecord\(state\.selected\)/);
  assert.match(source, /เปิด Customer 360 เพื่อตรวจ/);
  assert.match(source, /automatic_recovery_allowed===false/);
  assert.match(source, /verification_status_mutated===false/);
  assert.match(source, /customer_send_allowed===false/);
  assert.doesNotMatch(source, /identity-evidence-recovery[^\n]*(?:method:\s*"POST"|method:\s*'POST')/i);
});

test("Member Intelligence provides a one-client source evidence owner workbench without mutations", () => {
  const workbenchSource = source.slice(
    source.indexOf("function ensureSourceEvidenceWorkbenchUi()"),
    source.indexOf("function resetIdentityReadinessUi("),
  );
  assert.match(source, /mmd\.kenji_source_evidence_owner_workbench\.v1/);
  assert.match(source, /Source Evidence Capture Workbench/);
  assert.match(source, /ONE CLIENT AT A TIME/);
  assert.match(source, /EVIDENCE REVIEW FIRST/);
  assert.match(source, /sourceEvidenceWorkbenchContract\(payload\)/);
  assert.match(source, /review_line_ofc_evidence/);
  assert.match(source, /capture_verified_liff_session/);
  assert.match(source, /reread_identity_evidence/);
  assert.match(source, /owner_review_verification_status/);
  assert.match(source, /client_scope_required:protocol\?\.handoff\?\.client_scope_required===true/);
  assert.match(source, /fresh_reread_required:protocol\?\.review\?\.fresh_read_required===true/);
  assert.match(source, /automatic_capture_allowed:false/);
  assert.match(source, /automatic_verification_allowed:false/);
  assert.match(source, /verification_status_mutated:false/);
  assert.match(source, /identity_mutated:false/);
  assert.match(source, /entitlement_changed:false/);
  assert.match(source, /customer_send_allowed:false/);
  assert.match(workbenchSource, /link\.hidden=true;link\.removeAttribute\("href"\)/);
  assert.match(workbenchSource, /const locked=workbench\.status\.startsWith\("locked_"\)/);
  assert.match(workbenchSource, /if\(locked\)link\.removeAttribute\("href"\)/);
  assert.match(workbenchSource, /reread\.disabled=!workbench\.reread_allowed\|\|state\.sourceEvidenceRereading/);
  assert.doesNotMatch(workbenchSource, /method\s*:\s*["']POST["']/);
  assert.match(workbenchSource, /if\(currentClientId&&state\.intelligence\)renderSourceEvidenceWorkbench\(state\.intelligence,currentClientId\)/);
  assert.doesNotMatch(workbenchSource, /currentClientId===clientId&&state\.intelligence/);
  assert.match(source, /bulk_owner_action_allowed:false/);
  assert.match(source, /state\.intelligenceCache\.delete\(clientId\)/);
  assert.match(source, /await selectRecord\(record\)/);
  assert.match(source, /workbench\.handoff_path\}\?client_id=/);
  assert.doesNotMatch(workbenchSource, /method:\s*["']POST["']/);
  assert.doesNotMatch(workbenchSource, /identity\/(?:verify|merge|commit)/i);
  assert.doesNotMatch(workbenchSource, /membership[_-](?:activate|renew|grant)/i);
});

test("Member Intelligence records bounded operator quality feedback before enabling copy", () => {
  assert.match(source, /mmd\.kenji_continuity_operator_feedback\.v1/);
  assert.match(source, /data-feedback-outcome="accepted"/);
  assert.match(source, /data-feedback-outcome="needs_edit"/);
  assert.match(source, /data-feedback-outcome="rejected"/);
  assert.match(source, /tone_adjustment/);
  assert.match(source, /missing_context/);
  assert.match(source, /unsafe_or_inaccurate/);
  assert.match(source, /feedback_schema:feedbackSchema/);
  assert.match(source, /recordDraftAudit\("feedback"/);
  assert.match(source, /result\?\.operator_feedback_recorded!==true/);
  assert.match(source, /result\?\.copy_eligible!==copyEligible/);
  assert.match(source, /state\.feedbackReceipt=copyEligible\?clean\(result\.feedback_receipt\):""/);
  assert.match(source, /&&state\.feedbackRecorded/);
  assert.match(source, /&&clean\(state\.feedbackReceipt\)\.length>0/);
  assert.match(source, /&&state\.feedbackOutcome!=="rejected"/);
  assert.match(source, /!state\.feedbackRecorded\|\|!clean\(state\.feedbackReceipt\)\|\|state\.feedbackOutcome==="rejected"/);
  assert.match(source, /recordDraftAudit\("copy",clientId,true,\{feedback_receipt:state\.feedbackReceipt\}\)/);
  assert.match(source, /operator_feedback_receipt_required/);
  assert.ok(
    source.indexOf('await recordDraftAudit("feedback"') < source.indexOf('await recordDraftAudit("copy"'),
    "quality feedback receipt must be recorded before the copy path can run",
  );
  assert.doesNotMatch(source, /miDraftFeedback(?:Note|Text)|feedback_(?:note|text)/i);
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
  assert.match(source, /Readiness \/ Recovery \/ Owner Protocol contract ไม่ครบ · Kenji ถูกล็อกแบบ fail-closed/);
  assert.match(source, /\/internal\/admin\/customer-data\?client_id=/);
});

test("Member Intelligence does not mutate payment, membership or entitlement truth", () => {
  assert.doesNotMatch(source, /\/v1\/admin\/access\/(?:grant|revoke)/);
  assert.doesNotMatch(source, /verified_at\s*=/);
  assert.doesNotMatch(source, /membership[_-](?:activate|renew|grant)/i);
  assert.doesNotMatch(source, /telegram\/(?:grant|add|remove)|drive\/(?:grant|add|remove)/i);
  assert.doesNotMatch(source, /Verification Status["']?\s*[:=]/);
  assert.doesNotMatch(source, /identity\/(?:verify|merge|commit)/i);
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
