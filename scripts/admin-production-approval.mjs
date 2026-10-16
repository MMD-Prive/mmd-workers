import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

export const environmentName = 'mmd-production-mutation';

// A dispatch checkbox alone is not a reviewer gate. Never create or weaken the
// environment here: missing/forbidden/ambiguous protection must stop the release.
export async function verifyProductionApproval(env, request = fetch) {
  assert.equal(env.GITHUB_EVENT_NAME, 'workflow_dispatch', 'manual dispatch required');
  assert.equal(env.GITHUB_REF, 'refs/heads/main', 'production must use main');
  assert.match(env.GITHUB_SHA || '', /^[a-f0-9]{40}$/, 'full run SHA required');
  assert.equal(env.APPROVED_SHA, env.GITHUB_SHA, 'approval must match the run SHA');
  assert.ok(env.APPROVAL_REF?.trim(), 'owner approval reference required');
  assert.match(env.GITHUB_REPOSITORY || '', /^[\w.-]+\/[\w.-]+$/, 'repository required');
  assert.ok(env.GH_TOKEN, 'GitHub protection-read token required');
  const response = await request(
    `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/environments/${environmentName}`,
    { method: 'GET', headers: {
      Authorization: `Bearer ${env.GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    } },
  );
  assert.equal(response.status, 200, 'cannot verify production environment protection');
  const protection = await response.json();
  assert.equal(protection.name, environmentName, 'wrong environment');
  assert.equal(protection.can_admins_bypass, false, 'admin protection bypass must be disabled');
  const reviewers = protection.protection_rules?.filter(rule => rule.type === 'required_reviewers');
  assert.equal(reviewers?.length, 1, 'one required-reviewer rule must exist');
  assert.equal(reviewers[0].prevent_self_review, true, 'self-review must be disabled');
  assert.ok(reviewers[0].reviewers?.some(entry =>
    ['User', 'Team'].includes(entry.type) && Number.isSafeInteger(entry.reviewer?.id) && entry.reviewer.id > 0),
  'required reviewer must be configured');
  return { environment: environmentName, approved_sha: env.GITHUB_SHA };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await verifyProductionApproval(process.env);
    console.log('Protection verified; the production job still requires environment reviewer approval.');
  } catch (error) {
    console.error(`Production approval blocked: ${error.message}`);
    process.exitCode = 1;
  }
}
