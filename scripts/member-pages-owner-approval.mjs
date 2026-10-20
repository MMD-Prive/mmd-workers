// Dedicated member-pages code-only policy. GET-only; never provisions protection.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
export const environmentName = 'member-pages-code-only-owner';
const owner = user => user?.login === 'mmdprive' && user.id === 216427112;
// Diagnostics accept only fixed codes; never exception messages or API bodies.
const diagnosticReasons = Object.freeze({
  PREFLIGHT: 'PREFLIGHT_FAILED', OWNER_INPUT: 'OWNER_INPUT_INVALID',
  OWNER_RUN_CHECK: 'RUN_IDENTITY_INVALID', OWNER_MAIN_CHECK: 'MAIN_DRIFT',
  OWNER_POLICY_CHECK: 'OWNER_POLICY_INVALID', OWNER_BRANCH_CHECK: 'BRANCH_POLICY_INVALID',
  OWNER_APPROVAL_CHECK: 'APPROVAL_RECEIPT_INVALID', SOURCE_CHECKOUT: 'CHECKOUT_INVALID',
  SOURCE_HISTORY: 'SOURCE_HISTORY_INVALID', SOURCE_BASE_SCOPE: 'BASE_SOURCE_SCOPE_INVALID',
  SOURCE_RUNTIME_BRIDGE: 'RUNTIME_BRIDGE_DRIFT', SOURCE_GRAPHICS_SCOPE: 'GRAPHICS_SCOPE_INVALID',
  SOURCE_STARTUP_BRIDGE: 'STARTUP_BRIDGE_INVALID', SOURCE_STARTUP_SCOPE: 'STARTUP_SCOPE_INVALID',
  SOURCE_CONFIG: 'SOURCE_CONFIG_DRIFT', RELEASE_SOURCE_PIN: 'SOURCE_PIN_INVALID',
  CF_DEPLOYMENT_READ: 'DEPLOYMENT_READ_FAILED', CF_BASELINE_CHECK: 'BASELINE_MISMATCH',
  CF_VERSION_READ: 'VERSION_READ_FAILED', CF_CONFIG_CHECK: 'VERSION_CONFIG_INVALID',
  CF_SETTINGS_READ: 'SETTINGS_READ_FAILED', CF_BOUNDARY_READ: 'BOUNDARY_READ_FAILED',
  CF_LATEST_CHECK: 'LATEST_VERSION_MISMATCH', CF_BASELINE_RECHECK: 'BASELINE_DRIFT',
  BUNDLE_BUILD: 'BUNDLE_BUILD_FAILED', BUNDLE_CHECK: 'BUNDLE_INVALID',
});
export function createSafePreflightDiagnostics() {
  let current = {stage:'PREFLIGHT', reason:diagnosticReasons.PREFLIGHT};
  return {
    mark(stage, status) {
      if (typeof stage === 'string' && Object.hasOwn(diagnosticReasons, stage)) {
        current = {stage, reason:diagnosticReasons[stage]};
      } else if (typeof stage === 'string' && /^OWNER_(RUN|MAIN|POLICY|BRANCH|APPROVAL)_(REQUEST|HTTP|JSON)$/.test(stage)) {
        current = {stage, reason:stage.endsWith('_REQUEST') ? 'EVIDENCE_REQUEST_FAILED'
          : stage.endsWith('_HTTP') ? ([401,403,404,409,422,429,500,502,503,504].includes(status)
            ? 'EVIDENCE_HTTP_' + status : 'EVIDENCE_HTTP_STATUS') : 'EVIDENCE_JSON_INVALID'};
      } else current = {stage:'UNKNOWN', reason:'DIAGNOSTIC_UNAVAILABLE'};
    },
    snapshot() { return {...current}; },
  };
}
export async function verifyOwnerApproval(env, request = fetch, {preflight = false, diagnostic = () => {}} = {}) {
  diagnostic('OWNER_INPUT');
  assert.equal(env.GITHUB_EVENT_NAME, 'workflow_dispatch');
  assert.equal(env.GITHUB_REF, 'refs/heads/main');
  assert.equal(env.GITHUB_REPOSITORY?.toLowerCase(), 'mmd-prive/mmd-workers');
  assert.equal(env.GITHUB_REPOSITORY_ID, '1121397236');
  assert.equal(env.GITHUB_ACTOR, 'mmdprive');
  assert.equal(env.GITHUB_ACTOR_ID, '216427112');
  assert.equal(env.GITHUB_TRIGGERING_ACTOR, 'mmdprive');
  assert.match(env.GITHUB_SHA || '', /^[a-f0-9]{40}$/);
  assert.equal(env.APPROVED_SHA, env.GITHUB_SHA);
  assert.ok(env.APPROVAL_REF?.trim());
  assert.match(env.GITHUB_RUN_ID || '', /^[1-9][0-9]*$/);
  // Review history is run-scoped, not attempt-scoped. Never reuse it on a rerun.
  // Require a new dispatch and fresh environment approval instead.
  assert.equal(env.GITHUB_RUN_ATTEMPT, '1', 'reruns require a fresh dispatch');
  assert.ok(env.GH_TOKEN);
  const get = async (path, stage) => {
    diagnostic(stage + '_REQUEST');
    const res = await request(`https://api.github.com/repos/MMD-Prive/mmd-workers${path}`, {
      method:'GET', redirect:'error', signal:AbortSignal.timeout(15000),
      headers:{Authorization:`Bearer ${env.GH_TOKEN}`, Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28'},
    });
    diagnostic(stage + '_HTTP', res.status);
    assert.equal(res.status, 200, 'owner gate evidence unavailable');
    diagnostic(stage + '_JSON');
    return res.json();
  };
  const run = await get(`/actions/runs/${env.GITHUB_RUN_ID}`, 'OWNER_RUN');
  diagnostic('OWNER_RUN_CHECK');
  assert.equal(String(run.id), env.GITHUB_RUN_ID);
  assert.equal(run.repository?.id, 1121397236);
  assert.equal(run.event, 'workflow_dispatch');
  assert.equal(run.head_branch, 'main');
  assert.equal(run.head_sha, env.GITHUB_SHA);
  assert.ok(['.github/workflows/deploy-member-pages-worker-code-only.yml',
    '.github/workflows/deploy-member-pages-worker-code-only.yml@main'].includes(run.path), 'wrong workflow or ref');
  assert.ok(owner(run.actor) && owner(run.triggering_actor), 'only owner may dispatch or rerun');
  assert.equal(String(run.run_attempt), env.GITHUB_RUN_ATTEMPT);
  const main = await get('/git/ref/heads/main', 'OWNER_MAIN');
  diagnostic('OWNER_MAIN_CHECK');
  assert.equal(main.object?.sha, env.GITHUB_SHA, 'main drift');
  const p = await get(`/environments/${environmentName}`, 'OWNER_POLICY');
  diagnostic('OWNER_POLICY_CHECK');
  assert.equal(p.name, environmentName);
  assert.equal(p.can_admins_bypass, false);
  const reviewers = p.protection_rules?.filter(r => r.type === 'required_reviewers');
  assert.equal(reviewers?.length, 1);
  assert.equal(reviewers[0].prevent_self_review, false);
  assert.equal(reviewers[0].reviewers?.length, 1);
  assert.equal(reviewers[0].reviewers[0].type, 'User');
  assert.ok(owner(reviewers[0].reviewers[0].reviewer));
  assert.deepEqual(p.deployment_branch_policy, {protected_branches:false, custom_branch_policies:true});
  const branches = await get(`/environments/${environmentName}/deployment-branch-policies?per_page=100`, 'OWNER_BRANCH');
  diagnostic('OWNER_BRANCH_CHECK');
  assert.equal(branches.total_count, 1);
  assert.equal(branches.branch_policies?.length, 1);
  assert.equal(branches.branch_policies[0].name, 'main');
  assert.equal(branches.branch_policies[0].type, 'branch');
  if (!preflight) {
    assert.ok(Number.isSafeInteger(p.id) && p.id > 0, 'environment identity unavailable');
    const history = await get(`/actions/runs/${env.GITHUB_RUN_ID}/approvals`, 'OWNER_APPROVAL');
    diagnostic('OWNER_APPROVAL_CHECK');
    assert.ok(Array.isArray(history), 'approval history unavailable');
    // Reject ambiguous/foreign/rejected receipts without assuming history order.
    assert.equal(history.length, 1, 'exactly one owner approval receipt required');
    const receipt = history[0];
    assert.equal(receipt.state, 'approved');
    assert.ok(owner(receipt.user), 'owner approval receipt required');
    assert.equal(receipt.environments?.length, 1);
    assert.equal(receipt.environments[0].id, p.id);
    assert.equal(receipt.environments[0].name, environmentName);
  }
  return {environment:environmentName, approved_sha:env.GITHUB_SHA};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const preflight = process.argv.length === 3 && process.argv[2] === '--preflight';
  if (!preflight && process.argv.length !== 2) throw new Error('Unsupported approval mode');
  verifyOwnerApproval(process.env, fetch, {preflight}).then(() => console.log(preflight
    ? 'Owner-only protection verified; environment approval is still required.'
    : 'Current run owner approval verified.'))
    .catch(() => { console.error('Owner-only code release blocked.'); process.exitCode = 1; });
}
