// Protected observation only. This entry has no upload/deployment/state-write path.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyProductionApproval } from './admin-production-approval.mjs';
import { inspectEnvironment } from './admin-production-validation.mjs';
import { validateSourceState, activeVersion } from './admin-current-session-code-only.mjs';
import { validateManifestBytes, BASELINE_SHA256, digest } from '../release/events-porto-ems16-exclusion/build-candidate.mjs';
import { collectReadOnlyEvidence } from './events-porto-ems16-readonly-evidence.mjs';

export const ACCOUNT = 'b176eda1172b741fd2e58904cc9d77c5';
export const ROOT = `/accounts/${ACCOUNT}/workers/scripts/events-worker`;
export const WORKFLOW = '.github/workflows/read-events-porto-ems16-release-evidence.yml';
const REPOSITORY = 'MMD-Prive/mmd-workers';
const SHA = /^[a-f0-9]{40}$/;
const REQUIRED = ['build (18.x)', 'build (20.x)', 'build (22.x)'];
const MANIFEST = 'release/events-porto-ems16-exclusion/overlay-manifest.json';

export function validateReadInputs(env) {
  assert.equal(env.GITHUB_EVENT_NAME, 'workflow_dispatch');
  assert.equal(env.GITHUB_REF, 'refs/heads/main');
  assert.equal(env.GITHUB_REPOSITORY, REPOSITORY);
  assert.match(env.GITHUB_SHA || '', SHA);
  assert.equal(env.APPROVED_SHA, env.GITHUB_SHA);
  assert.equal(env.READ_APPROVED, 'true');
  assert.ok(typeof env.APPROVAL_REF === 'string' && /^[^\x00-\x1f\x7f]{1,200}$/.test(env.APPROVAL_REF) && env.APPROVAL_REF.trim());
  assert.match(env.GITHUB_RUN_ID || '', /^\d+$/);
  assert.match(env.GITHUB_RUN_ATTEMPT || '', /^[1-9]\d*$/);
  assert.ok(env.GH_TOKEN);
}

export async function verifyReadSource(env, request = fetch) {
  validateReadInputs(env);
  const get = async path => {
    const response = await request('https://api.github.com/repos/' + REPOSITORY + path, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: 'Bearer ' + env.GH_TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    assert.equal(response.status, 200); assert.notEqual(response.redirected, true);
    return response.json();
  };
  const list = async (path, key) => {
    const rows = []; let total;
    for (let page = 1; page <= 20; page++) {
      const value = await get(path + (path.includes('?') ? '&' : '?') + 'per_page=100&page=' + page);
      assert.ok(Number.isSafeInteger(value.total_count) && value.total_count >= 0 && value.total_count <= 2000);
      total ??= value.total_count; assert.equal(value.total_count, total);
      assert.ok(Array.isArray(value[key]) && value[key].length <= 100);
      rows.push(...value[key]); if (rows.length >= total) break;
      assert.equal(value[key].length, 100);
    }
    assert.equal(rows.length, total); assert.equal(new Set(rows.map(x => x.id)).size, rows.length);
    return rows;
  };
  const main = async () => assert.equal((await get('/git/ref/heads/main'))?.object?.sha, env.GITHUB_SHA);
  const validateRun = (run, path, event) => {
    assert.equal(run.head_sha, env.GITHUB_SHA); assert.equal(run.head_branch, 'main');
    assert.equal(run.head_repository?.full_name, REPOSITORY); assert.equal(run.path, path); assert.equal(run.event, event);
    assert.ok(Number.isSafeInteger(run.id) && Number.isSafeInteger(run.run_attempt) && run.run_attempt > 0);
    assert.equal(run.status, event === 'push' ? 'completed' : 'in_progress');
    assert.equal(run.conclusion, event === 'push' ? 'success' : null);
  };
  const jobs = async (run, names) => {
    const all = await list(`/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`, 'jobs');
    const result = names.map(name => {
      const matches = all.filter(x => x.name === name); assert.equal(matches.length, 1);
      const job = matches[0]; assert.equal(job.run_id, run.id); assert.equal(job.head_sha, env.GITHUB_SHA);
      assert.equal(job.status, 'completed'); assert.equal(job.conclusion, 'success');
      return { name, id: job.id };
    });
    const after = await get('/actions/runs/' + run.id);
    validateRun(after, run.path, run.event);
    assert.equal(after.id, run.id); assert.equal(after.run_attempt, run.run_attempt);
    return result;
  };
  await main();
  const all = await list('/actions/runs?head_sha=' + env.GITHUB_SHA, 'workflow_runs');
  const matches = all.filter(x => x.path === '.github/workflows/node.js.yml' && x.event === 'push' && x.head_branch === 'main').sort((a,b) => b.id-a.id);
  assert.ok(matches.length);
  const node = await get('/actions/runs/' + matches[0].id);
  assert.equal(node.id, matches[0].id); validateRun(node, '.github/workflows/node.js.yml', 'push');
  const nodeJobs = await jobs(node, REQUIRED);
  const run = await get('/actions/runs/' + env.GITHUB_RUN_ID);
  validateRun(run, WORKFLOW, 'workflow_dispatch');
  assert.equal(run.id, Number(env.GITHUB_RUN_ID)); assert.equal(run.run_attempt, Number(env.GITHUB_RUN_ATTEMPT));
  const contracts = await jobs(run, ['contracts']);
  await main();
  return { source_sha: env.GITHUB_SHA, node_run_id: node.id, node_jobs: nodeJobs, evidence_run_id: run.id, attempt: run.run_attempt, contracts };
}

// Only the fixed production Worker's read endpoints. R2 has its own stricter
// prefix/object allowlist in the collector. Neither helper accepts a write.
export function readOnlyWorkerFetch(token, request = fetch) {
  assert.ok(token && !/[\r\n]/.test(token));
  return async path => {
    assert.ok(new RegExp('^' + ROOT + '/(?:deployments|versions(?:/[a-f0-9-]{36})?|script-settings|schedules|subdomain|content/v2)$').test(path));
    const response = await request('https://api.cloudflare.com/client/v4' + path, { method: 'GET', redirect: 'error',
      signal: AbortSignal.timeout(30000), headers: { Authorization: 'Bearer ' + token } });
    assert.equal(response.status, 200); assert.notEqual(response.redirected, true);
    return response;
  };
}

// hashBytes is an offline test seam, never sourced from dispatch inputs or env.
// The executable entry always uses the default cryptographic digest.
export async function readBaseline(read, manifest, hashBytes = digest) {
  const get = async path => { const value = await (await read(path)).json(); assert.equal(value.success, true); return value.result; };
  const deployment = (await get(ROOT + '/deployments'))?.deployments?.[0];
  assert.equal(deployment?.id, manifest.expected_deployment); assert.equal(activeVersion(deployment), manifest.expected_version);
  const latest = (await get(ROOT + '/versions'))?.items?.[0]?.id;
  assert.equal(latest, manifest.expected_version);
  const version = await get(ROOT + '/versions/' + latest);
  const settings = await get(ROOT + '/script-settings');
  const schedules = await get(ROOT + '/schedules');
  const subdomain = await get(ROOT + '/subdomain');
  for (const [name, text] of Object.entries({HYPE_COMPCARD_ENABLED:'true',HYPE_STANDARD_ENABLED:'true',HYPE_INTAKE_ENABLED:'true',HYPE_PROMOTION_ENABLED:'false'})) {
    const rows = version.resources?.bindings?.filter(x => x.name === name);
    assert.equal(rows?.length, 1); assert.equal(rows[0].type, 'plain_text'); assert.equal(rows[0].text, text);
  }
  const buckets = version.resources.bindings.filter(x => x.name === 'HYPE_COMPCARD_STATE');
  assert.equal(buckets.length, 1); assert.equal(buckets[0].type, 'r2_bucket'); assert.equal(buckets[0].bucket_name, 'mmd-hype-compcard-state');
  const parts = [...(await (await read(ROOT + '/content/v2')).formData()).entries()];
  assert.equal(parts.length, 1); assert.equal(parts[0][0], manifest.module);
  assert.equal(parts[0][1].size, 207037);
  assert.equal(hashBytes(await parts[0][1].text()), BASELINE_SHA256);
  const after = (await get(ROOT + '/deployments'))?.deployments?.[0];
  assert.deepEqual(after, deployment); assert.equal((await get(ROOT + '/versions'))?.items?.[0]?.id, latest);
  // Hash configuration; never publish raw bindings, room IDs or secret names.
  return { version: latest, deployment: deployment.id, module_sha256: BASELINE_SHA256,
    configuration_sha256: digest(JSON.stringify({version,settings,schedules,subdomain})) };
}

async function main() {
  assert.ok(['--check-readiness','--collect-approved'].includes(process.argv[2]));
  const env = process.env;
  await verifyReadSource(env);
  if (process.argv[2] === '--check-readiness') return;
  // Config validation is not a receipt; the workflow job's environment is the
  // separate actual Per approval gate. These calls never change its settings.
  await verifyProductionApproval(env);
  assert.equal((await inspectEnvironment(env)).ready, true);
  const git = (...args) => execFileSync('git', args, {encoding:'utf8'}).trim();
  validateSourceState({expectedSha:env.GITHUB_SHA,headSha:git('rev-parse','HEAD'),dirtyStatus:git('status','--porcelain=v1','--untracked-files=all')});
  const manifest = validateManifestBytes(readFileSync(MANIFEST));
  const read = readOnlyWorkerFetch(env.CLOUDFLARE_API_TOKEN);
  const before = await readBaseline(read, manifest);
  const evidence = await collectReadOnlyEvidence({accountId:ACCOUNT,token:env.CLOUDFLARE_API_TOKEN});
  assert.deepEqual(await readBaseline(read, manifest), before);
  const source = await verifyReadSource(env);
  const artifact = { schema:'porto_ems16_protected_observation_v1', purpose:'observation_only_not_release_clearance',
    observed_at:new Date().toISOString(), source, baseline:before, evidence,
    production_mutations:0, release_policy_changed:false, protected_approval_is_separate:true };
  writeFileSync(join(env.RUNNER_TEMP, 'events-porto-ems16-readonly-evidence.json'), JSON.stringify(artifact,null,2), {mode:0o600,flag:'wx'});
  console.log('Protected read-only observation completed; no release clearance or production mutation.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Read-only evidence collection stopped; no production mutation or release clearance.'); process.exitCode=1; });
}
