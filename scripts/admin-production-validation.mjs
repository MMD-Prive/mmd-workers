// Validation only: GitHub GETs, sanitized local receipt, never Cloudflare access.
import { writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { environmentName, soloReviewer } from './admin-production-approval.mjs';

export async function inspectEnvironment(env, request = fetch) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY || '') || !env.GH_TOKEN) {
    return { status: 'permission_context_missing', ready: false };
  }
  const prefix = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}`;
  const get = async path => {
    try {
      const response = await request(prefix + path, { method: 'GET', redirect: 'error',
        headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(15000) });
      return { status: response.status, value: await response.json().catch(() => null) };
    } catch { return { status: 0, value: null }; }
  };
  const list = await get('/environments?per_page=100');
  const exact = await get('/environments/' + environmentName);
  const report = { environment: environmentName, ready: false,
    list_http: list.status, protection_http: exact.status };
  if ([401, 403].includes(exact.status) || [401, 403].includes(list.status)) {
    return { ...report, status: 'permission_denied' };
  }
  if (list.status === 200 && Array.isArray(list.value?.environments) &&
      list.value.total_count <= 100 && exact.status === 404 &&
      !list.value.environments.some(item => item.name === environmentName)) {
    return { ...report, status: 'missing_environment' };
  }
  if (exact.status !== 200 || exact.value?.name !== environmentName) {
    return { ...report, status: 'protection_read_unverified' };
  }
  const p = exact.value;
  const rules = p.protection_rules?.filter(rule => rule.type === 'required_reviewers');
  const validReviewers = rules?.length === 1 && rules[0].reviewers?.length === 1 &&
    rules[0].reviewers[0].type === 'User' &&
    rules[0].reviewers[0].reviewer?.login === soloReviewer.login &&
    rules[0].reviewers[0].reviewer?.id === soloReviewer.id;
  report.required_reviewers = validReviewers ? [{ type: 'User', id: soloReviewer.id }] : [];
  report.self_review_allowed = rules?.[0]?.prevent_self_review === false;
  report.admin_bypass_disabled = p.can_admins_bypass === false;
  if (!validReviewers || !report.self_review_allowed || !report.admin_bypass_disabled) {
    return { ...report, status: 'missing_protection' };
  }
  if (p.deployment_branch_policy?.custom_branch_policies !== true ||
      p.deployment_branch_policy?.protected_branches !== false) {
    return { ...report, status: 'branch_restriction_unverified' };
  }
  const branches = await get('/environments/' + environmentName + '/deployment-branch-policies?per_page=100');
  report.branch_policy_http = branches.status;
  if (branches.status !== 200 || branches.value?.total_count !== 1 ||
      branches.value.branch_policies?.length !== 1 ||
      branches.value.branch_policies[0].name !== 'main' || branches.value.branch_policies[0].type !== 'branch') {
    return { ...report, status: branches.status === 403 ? 'permission_denied' : 'branch_restriction_unverified' };
  }
  return { ...report, status: 'protection_verified', ready: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await inspectEnvironment(process.env);
  const receipt = { ...result, run_id: process.env.GITHUB_RUN_ID,
    source_sha: process.env.GITHUB_SHA, event: process.env.GITHUB_EVENT_NAME,
    actor: process.env.GITHUB_ACTOR, token_context: 'github.token; contents:read actions:read',
    production_mutation: false, reviewer_gate_passed: false };
  writeFileSync(join(process.env.RUNNER_TEMP || '.', 'admin-production-validation.json'), JSON.stringify(receipt, null, 2));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `ready=${result.ready}\nstatus=${result.status}\n`);
  console.log(JSON.stringify(receipt));
}
