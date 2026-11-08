// Approved Console source overlay. Imports/tests never contact production.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { releaseCurrentSession, createTransport, uploadMetadata, versionConfiguration,
  validateSourceState, ROOT } from './admin-current-session-code-only.mjs';
import { verifyProductionApproval } from './admin-production-approval.mjs';
import { inspectEnvironment } from './admin-production-validation.mjs';
import { BASELINE, CONSOLE_HEAD, RUNTIME_PATHS, prepareConsoleSource, buildConsoleBundle } from './admin-console-isolated-build.mjs';
import { activateConsoleRoutes, createConsoleRoutesTransport,
  validateConsoleRouteBaseline, CONSOLE_ROUTES_PATH } from './admin-console-route-activation.mjs';

export const BASELINE_VERSION = '030b5c09-2394-4fdd-9547-6461707f6dd7';
export const BASELINE_DEPLOYMENT = '7db93a14-c9bd-43a6-88fb-00e837ef4c3a';
export const CONSOLE_MERGED = '86d68328a86c39a12b089566fc64efb5646a362a';
export const BASELINE_CI = Object.freeze({ repository: 'MMD-Prive/mmd-workers', repositoryId: 1121397236,
  runId: 42346835895, attempt: 1, workflowId: 333112512, jobId: 128326354592,
  workflowPath: '.github/workflows/deploy-admin-worker.yml' });
const hash = value => createHash('sha256').update(value).digest('hex');
const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
const canonical = value => JSON.stringify(sorted(value));
const same = (a, b, message) => assert.equal(canonical(a), canonical(b), message);
const ordered = items => [...items].sort((a, b) => canonical(a).localeCompare(canonical(b)));
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

export function validateBaselineReceipt({ run, job, log }) {
  for (const repository of [run?.repository, run?.head_repository]) {
    assert.equal(repository?.full_name, BASELINE_CI.repository, 'baseline repository mismatch');
    assert.equal(repository?.id, BASELINE_CI.repositoryId, 'baseline repository identity mismatch');
  }
  assert.equal(run?.id, BASELINE_CI.runId, 'baseline run mismatch');
  assert.equal(run?.run_attempt, BASELINE_CI.attempt, 'baseline run attempt mismatch');
  assert.equal(run?.workflow_id, BASELINE_CI.workflowId, 'baseline workflow mismatch');
  assert.equal(run?.path, BASELINE_CI.workflowPath, 'baseline workflow path mismatch');
  assert.equal(run?.event, 'workflow_dispatch', 'baseline was not manually released');
  assert.equal(run?.head_branch, 'main', 'baseline branch mismatch');
  assert.equal(run?.head_sha, BASELINE, 'baseline source mismatch');
  assert.equal(run?.status, 'completed', 'baseline run incomplete');
  assert.equal(run?.conclusion, 'success', 'baseline run failed');
  assert.equal(job?.id, BASELINE_CI.jobId, 'baseline job mismatch');
  assert.equal(job?.run_id, BASELINE_CI.runId, 'baseline job/run mismatch');
  assert.equal(job?.run_attempt, BASELINE_CI.attempt, 'baseline job attempt mismatch');
  assert.equal(job?.head_sha, BASELINE, 'baseline job source mismatch');
  assert.equal(job?.name, 'validate-and-deploy', 'baseline job name mismatch');
  assert.equal(job?.status, 'completed', 'baseline job incomplete');
  assert.equal(job?.conclusion, 'success', 'baseline job failed');
  for (const name of ['Check out repository', 'Run tests and source validation',
    'Pin Kenji admin shell assets to deploy SHA', 'Validate Cloudflare version upload',
    'Upload admin-worker version', 'Resolve uploaded version ID',
    'Deploy uploaded admin-worker version', 'Require verified live deployment']) {
    const steps = job.steps?.filter(step => step.name === name);
    assert.equal(steps?.length, 1, 'baseline critical step missing or ambiguous');
    assert.equal(steps[0].conclusion, 'success', 'baseline critical step failed');
  }
  const migration = job.steps?.filter(step => step.name === 'Apply Durable Object migration with direct deploy');
  assert.equal(migration?.length, 1, 'baseline migration outcome missing');
  assert.equal(migration[0].conclusion, 'skipped', 'baseline used migration fallback');
  assert.ok(typeof log === 'string' && log.length > 0 && Buffer.byteLength(log) < 2 * 1024 * 1024,
    'baseline log missing or oversized');
  const records = log.replace(/\r\n/g, '\n').split('\n').map(line => {
    const match = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z) (.*)$/.exec(line);
    return match ? { at: match[1], text: match[2] } : null;
  }).filter(Boolean);
  const one = pattern => {
    const found = records.map((record, index) => ({ ...record, index })).filter(record => pattern.test(record.text));
    assert.equal(found.length, 1, 'baseline log record missing or ambiguous');
    return found[0];
  };
  const checkout = one(/^\[command\]\/usr\/bin\/git log -1 --format=%H$/);
  assert.equal(records[checkout.index + 1]?.text, BASELINE, 'baseline checkout linkage failed');
  const pinned = one(/^Pinned Kenji admin shell JS\/CSS to [a-f0-9]{40}$/);
  assert.equal(pinned.text, 'Pinned Kenji admin shell JS/CSS to ' + BASELINE, 'baseline shell pin mismatch');
  const uploaded = one(/^Worker Version ID: [a-f0-9-]+$/);
  assert.equal(uploaded.text, 'Worker Version ID: ' + BASELINE_VERSION, 'baseline uploaded version mismatch');
  const resolved = one(/^Resolved version [a-f0-9-]+ from versions upload output$/);
  assert.equal(resolved.text, 'Resolved version ' + BASELINE_VERSION + ' from versions upload output', 'baseline resolved version mismatch');
  const deployed = records.map((record, index) => {
    try { return { ...record, index, value: JSON.parse(record.text) }; } catch { return null; }
  }).filter(record => record?.value?.worker === 'admin-worker');
  assert.equal(deployed.length, 1, 'baseline promotion receipt ambiguous');
  same(deployed[0].value, { ok: true, worker: 'admin-worker', version: BASELINE_VERSION,
    deployment: BASELINE_DEPLOYMENT }, 'baseline deployment linkage mismatch');
  const chain = [checkout, pinned, uploaded, resolved, deployed[0]];
  chain.forEach((record, index) => {
    assert.ok(Number.isFinite(Date.parse(record.at)), 'invalid baseline timestamp');
    if (index) assert.ok(record.index > chain[index - 1].index && Date.parse(record.at) >= Date.parse(chain[index - 1].at),
      'baseline receipt ordering mismatch');
  });
  assert.ok(records.some(record => record.text === 'node: v22.23.4'), 'baseline Node version missing');
  assert.ok(records.some(record => /^\s*⛅️?\s+wrangler 4\.158\.0\s*$/.test(record.text)), 'baseline Wrangler version missing');
  return { method: 'pinned-baseline-github-ci-receipt', source_sha: BASELINE,
    version_id: BASELINE_VERSION, deployment_id: BASELINE_DEPLOYMENT,
    run_id: BASELINE_CI.runId, run_attempt: BASELINE_CI.attempt, job_id: BASELINE_CI.jobId,
    workflow_path: BASELINE_CI.workflowPath, node: 'v22.23.4', wrangler: '4.158.0',
    build_transformations: ['kenji-shell-assets-pinned-to-baseline-source'],
    uploaded_at: uploaded.at, deployed_at: deployed[0].at };
}

function readBaselineReceipt() {
  assert.ok(process.env.GH_TOKEN, 'baseline receipt read token required');
  const prefix = 'repos/' + BASELINE_CI.repository + '/actions/';
  const get = (path, isLog = false) => {
    const result = execFileSync('gh', ['api', '--hostname', 'github.com', '--method', 'GET',
      ...(isLog ? ['--allow-escape-sequences'] : []), prefix + path], {
      encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, GH_HOST: 'github.com', GH_DEBUG: '' },
    });
    return isLog ? result : JSON.parse(result);
  };
  return validateBaselineReceipt({ run: get('runs/' + BASELINE_CI.runId),
    job: get('jobs/' + BASELINE_CI.jobId), log: get('jobs/' + BASELINE_CI.jobId + '/logs', true) });
}

export function validateLiveBaseline(version, deployment) {
  assert.equal(version?.id, BASELINE_VERSION, 'reviewed baseline version drift');
  assert.equal(deployment?.id, BASELINE_DEPLOYMENT, 'reviewed baseline deployment drift');
  assert.equal(deployment?.strategy, 'percentage', 'unexpected baseline strategy');
  same(deployment?.versions, [{ version_id: BASELINE_VERSION, percentage: 100 }], 'baseline must serve 100%');
  assert.equal(version.annotations?.['workers/message'], 'GitHub Actions ' + BASELINE, 'baseline message mismatch');
  assert.equal(version.annotations?.['workers/tag'], 'gha-' + BASELINE.slice(0, 12), 'baseline source tag mismatch');
}

export function consoleBuildEvidence({ code, releaseId, nodeVersion, wranglerVersion, sourceManifest, buildConfig, compiledPreservation }) {
  assert.ok(code instanceof Uint8Array && code.byteLength > 0, 'candidate module missing');
  assert.match(releaseId || '', /^\d+\.\d+$/, 'release run identity missing');
  assert.equal(nodeVersion, 'v22.23.4', 'reviewed Node toolchain required');
  assert.equal(wranglerVersion, '4.158.0', 'reviewed Wrangler toolchain required');
  assert.equal(sourceManifest?.baseline_source_sha, BASELINE, 'candidate baseline mismatch');
  assert.equal(sourceManifest?.console_source_sha, CONSOLE_HEAD, 'candidate Console source mismatch');
  same([...sourceManifest.runtime_paths].sort(), [...RUNTIME_PATHS].sort(), 'candidate source scope mismatch');
  assert.equal(compiledPreservation?.compiled_after_asset_transform_sha256, hash(code), 'preserved artifact digest mismatch');
  assert.match(compiledPreservation?.compiled_before_asset_transform_sha256 || '', /^[a-f0-9]{64}$/, 'original compiled digest missing');
  assert.equal(compiledPreservation?.baseline_asset_transform, 'reproduce-original-prepend-preserving-existing-tail', 'baseline asset transform mismatch');
  assert.equal(compiledPreservation?.kenji_asset_urls?.length, 2, 'baseline asset URL evidence missing');
  for (const url of compiledPreservation.kenji_asset_urls) {
    assert.ok(typeof url === 'string' && Buffer.from(code).includes(Buffer.from(url)), 'preserved asset URL absent from artifact');
  }
  const modules = [{ name: 'worker.js', bytes: code.byteLength, digest: { algorithm: 'sha256', value: hash(code) } }];
  return { release_id: releaseId, toolchain: { node: nodeVersion, wrangler: wranglerVersion },
    artifact: { digest: modules[0].digest, modules, module_manifest_digest: { algorithm: 'sha256', value: hash(canonical(modules)) } },
    additional_inputs: [{ path: 'isolated-build-config.json', digest: { algorithm: 'sha256', value: hash(canonical(buildConfig)) } }],
    preservation: { ...sourceManifest, ...compiledPreservation, kenji_shell_asset_pin: BASELINE,
      production_configuration_inherited: true, source_configuration_overlaid: false } };
}

export async function verifyPublicConsoleGates(request = fetch) {
  const results = [];
  for (const host of ['mmdbkk.com', 'www.mmdbkk.com']) {
    for (const path of ['/internal/admin/console', '/internal/admin/console/', '/internal/admin/console?date=all']) {
    const target = 'https://' + host + path;
    const response = await request(target, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 303, 'Console signed-out gate not active');
    const location = new URL(response.headers.get('location'), target);
    assert.equal(location.origin, 'https://' + host, 'Console login origin changed');
    assert.equal(location.pathname, '/internal/admin/login', 'Console login target changed');
    assert.equal(location.searchParams.get('next'), path.replace(/\/$/, ''), 'Console login return lost');
    assert.equal(await response.text(), '', 'signed-out Console leaked a document');
    const head = await request(target, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(15000) });
    assert.equal(head.status, 401, 'Console HEAD must fail closed without a session');
    results.push({ host, path, get: response.status, head: head.status, login_return_preserved: true });
    }
  }
  return results;
}

async function main() {
  assert.equal(process.argv[2], '--execute-approved', 'explicit execution argument required');
  assert.equal(process.env.PRODUCTION_APPROVED, 'true', 'owner dispatch approval required');
  assert.equal(process.env.PRODUCTION_ENVIRONMENT_NAME, 'mmd-production-mutation', 'protected environment mismatch');
  assert.equal(process.env.EXPECTED_VERSION, BASELINE_VERSION, 'unreviewed expected version');
  assert.equal(process.env.EXPECTED_DEPLOYMENT, BASELINE_DEPLOYMENT, 'unreviewed expected deployment');
  const sha = process.env.GITHUB_SHA;
  const releaseId = process.env.GITHUB_RUN_ID + '.' + process.env.GITHUB_RUN_ATTEMPT;
  const dir = mkdtempSync(join(tmpdir(), 'admin-console-release-'));
  const journal = join(process.env.RUNNER_TEMP || dir, 'admin-console-isolated-receipt.json');
  const state = { scope: 'admin-console-only', source_sha: sha, runtime_source_sha: CONSOLE_HEAD,
    baseline_source_sha: BASELINE, release_id: releaseId, phase: 'preflight' };
  const save = phase => { state.phase = phase; writeFileSync(journal, JSON.stringify(state, null, 2), { mode: 0o600 }); };
  let sourceState;
  const approve = async () => {
    await verifyProductionApproval(process.env);
    assert.equal((await inspectEnvironment(process.env)).ready, true, 'protected main-only environment required');
    sourceState = validateSourceState({ expectedSha: sha, headSha: git('rev-parse', 'HEAD'),
      dirtyStatus: git('status', '--porcelain=v1', '--untracked-files=all') });
    // GitHub squash-merged the approved PR. Prove its tree, then use the actual
    // main-line commit for ancestry rather than requiring the PR head itself.
    same(git('rev-parse', CONSOLE_HEAD + '^{tree}'), git('rev-parse', CONSOLE_MERGED + '^{tree}'), 'approved Console merge tree mismatch');
    git('merge-base', '--is-ancestor', CONSOLE_MERGED, sha);
  };
  const clean = value => String(value || '').replace(/[\u2028\u2029\r\n]/g, '').trim();
  const call = createTransport(clean(process.env.CLOUDFLARE_API_TOKEN));
  const callRoutes = createConsoleRoutesTransport(clean(process.env.CLOUDFLARE_ROUTES_API_TOKEN));
  try {
    await approve();
    const baselineRoutes = await callRoutes(CONSOLE_ROUTES_PATH);
    validateConsoleRouteBaseline(baselineRoutes);
    state.route_baseline_sha256 = hash(canonical(ordered(baselineRoutes)));
    const baselineSettings = await call(ROOT + '/script-settings');
    const baselineSchedules = await call(ROOT + '/schedules');
    const baselineSubdomain = await call(ROOT + '/subdomain');
    const ci = readBaselineReceipt();
    let baselineConfiguration, prepared, built;
    const released = await releaseCurrentSession({ sha, approve,
      expectedVersion: BASELINE_VERSION, expectedDeployment: BASELINE_DEPLOYMENT,
      call, now: () => new Date().toISOString(),
      save: receipt => { state.code = receipt; save('code:' + receipt.phase); },
      metadataFactory: (version, sourceSha) => {
        const metadata = uploadMetadata(version, sourceSha);
        metadata.annotations['workers/message'] = 'Console-only source overlay baseline=' + BASELINE + ' patch=' + CONSOLE_HEAD + ' release=' + sourceSha;
        return metadata;
      },
      sourceCheck: async (version, deployment) => {
        validateLiveBaseline(version, deployment);
        baselineConfiguration = versionConfiguration(version);
        prepared = prepareConsoleSource({ directory: join(dir, 'source') });
        return { ...sourceState, method: 'pinned-production-source-plus-six-console-modules',
          baseline_source_sha: BASELINE, runtime_source_sha: CONSOLE_HEAD,
          runtime_paths: [...RUNTIME_PATHS], configuration_diff: false,
          baseline_ci: ci, isolated_source: prepared.manifest };
      },
      bundle: async version => {
        built = await buildConsoleBundle({ prepared, directory: join(dir, 'build'),
          runtime: version.resources.script_runtime });
        return built.code;
      },
      buildEvidence: code => consoleBuildEvidence({ code, releaseId, nodeVersion: process.version,
        wranglerVersion: built.wranglerVersion, sourceManifest: prepared.manifest, buildConfig: built.config,
        compiledPreservation: built.preservation }),
    });
    assert.equal(released.phase, 'complete', 'code deployment must complete before route activation');
    const routeApproval = async () => {
      await approve();
      assert.equal((await call(ROOT + '/versions')).items?.[0]?.id, released.uploaded_version, 'latest upload drift before route activation');
      same(versionConfiguration(await call(ROOT + '/versions/' + released.uploaded_version)), baselineConfiguration, 'version configuration drift');
      same(await call(ROOT + '/script-settings'), baselineSettings, 'operational settings drift');
      same(await call(ROOT + '/schedules'), baselineSchedules, 'cron drift');
      same(await call(ROOT + '/subdomain'), baselineSubdomain, 'subdomain drift');
    };
    state.routes = await activateConsoleRoutes({ baselineRoutes, callRoutes, approve: routeApproval,
      expectedDeployment: { id: released.deployment, strategy: 'percentage',
        versions: [{ version_id: released.uploaded_version, percentage: 100 }] },
      readDeployment: async () => (await call(ROOT + '/deployments')).deployments?.[0],
      now: () => new Date().toISOString(),
      save: receipt => { state.routes = receipt; save('routes:' + receipt.phase); },
    });
    await routeApproval();
    save('public-gate-verification');
    state.public_gates = await verifyPublicConsoleGates();
    await routeApproval();
    const finalDeployment = (await call(ROOT + '/deployments')).deployments?.[0];
    assert.equal(finalDeployment?.id, released.deployment, 'deployment drift during public acceptance');
    assert.equal(finalDeployment?.strategy, 'percentage', 'deployment strategy drift during public acceptance');
    same(finalDeployment?.versions, [{ version_id: released.uploaded_version, percentage: 100 }], 'traffic drift during public acceptance');
    const finalRoutes = await callRoutes(CONSOLE_ROUTES_PATH);
    assert.ok(Array.isArray(finalRoutes), 'final route inventory missing');
    assert.equal(finalRoutes.length, state.routes.last_verified_inventory.count, 'route count drift during public acceptance');
    assert.equal(hash(canonical([...finalRoutes].sort((a, b) => a.id.localeCompare(b.id)))),
      state.routes.last_verified_inventory.sha256, 'route inventory drift during public acceptance');
    state.final_readback_at = new Date().toISOString();
    save('complete');
    console.log('Console-only release complete: exact uploaded version, two route additions and signed-out gates verified.');
    console.log(JSON.stringify({ version: released.uploaded_version, deployment: released.deployment,
      console: 'https://www.mmdbkk.com/internal/admin/console', baseline_source: BASELINE, console_source: CONSOLE_HEAD }));
  } catch {
    state.stopped_after = state.phase;
    save('stopped-no-automatic-retry');
    throw new Error('Console release stopped; inspect the sanitized receipt before any recovery.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
