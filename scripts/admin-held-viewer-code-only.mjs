// Scoped overlay: importing or testing this module never contacts production.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { releaseCurrentSession, createTransport, validateSourceState, createBuildEvidence, ROOT } from './admin-current-session-code-only.mjs';
import { verifyProductionApproval } from './admin-production-approval.mjs';
import { inspectEnvironment } from './admin-production-validation.mjs';

export const BASE = 'cf0eb6baa1eee7c1339b881ae92a5f1de2d171f6';
export const RUNTIME = '8a6a1ba43c1e1c8753fecee368107dc8d39c0a61';
export const OLD_SECTION_SHA = '938360b3fd86da99ac2a307f7b2e24ddad18dec0bb3cb3934e9ca11f323ff11d';
export const START = '// src/held-document-review-ui.js\n';
export const END = '// src/money-control-worker-home.js\n';
const UI = 'admin-worker/src/held-document-review-ui.js';
const PATHS = [UI, 'admin-worker/held-document-review-ui.test.mjs'].sort();
export const digest = value => createHash('sha256').update(value).digest('hex');
const require = createRequire(import.meta.url);

export function validateViewerSource(runtime, changedPaths) {
  assert.equal(runtime, RUNTIME, 'unreviewed runtime source');
  assert.deepEqual([...changedPaths].sort(), PATHS, 'unreviewed runtime paths');
}
export function viewerBounds(code) {
  const start = code.indexOf(START), end = code.indexOf(END, start + START.length);
  assert.ok(start >= 0 && end > start, 'viewer section markers missing');
  assert.equal(code.indexOf(START, start + START.length), -1, 'duplicate viewer marker');
  assert.equal(code.indexOf(END, end + END.length), -1, 'duplicate caller marker');
  return { start, end };
}
export function normalizeViewerBuild(code) {
  const start = code.search(/^(?:var|const) HELD_REVIEW_COPY\s*=/m);
  assert.ok(start >= 0, 'compiled copy declaration missing');
  const match = code.match(/\nexport\s*\{([\s\S]*?)\};?\s*$/);
  assert.ok(match && match.index > start, 'compiled export boundary missing');
  const exports = match[1].split(',').map(x => x.trim()).filter(Boolean).sort();
  assert.deepEqual(exports, ['HELD_DOCUMENT_CLIENT', 'HELD_REVIEW_COPY', 'heldDocumentNavigation', 'renderHeldDocumentPage'].sort());
  const section = code.slice(start, match.index);
  assert.match(section, /HELD_DOCUMENT_CLIENT = String\.raw/);
  assert.doesNotMatch(section, /heldDocumentClient\.toString\(/);
  return START + section + '\n\n';
}
export function patchViewer(code, replacement, expectedDigest = OLD_SECTION_SHA) {
  const { start, end } = viewerBounds(code);
  const old = code.slice(start, end);
  assert.equal(digest(old), expectedDigest, 'active viewer bytes differ from reviewed baseline');
  assert.ok(replacement.startsWith(START) && !replacement.includes(END));
  assert.match(code.slice(0, start), /\bvar __name\s*=/, 'shared keepNames helper missing');
  const next = code.slice(0, start) + replacement + code.slice(end);
  const nextBounds = viewerBounds(next);
  const beforeOutside = code.slice(0, start) + code.slice(end);
  const afterOutside = next.slice(0, nextBounds.start) + next.slice(nextBounds.end);
  assert.equal(afterOutside, beforeOutside, 'unrelated runtime bytes changed');
  return { code: next, preservation: { baseline_sha256: digest(code), candidate_sha256: digest(next),
    old_viewer_sha256: digest(old), new_viewer_sha256: digest(replacement),
    preserved_runtime_sha256: digest(beforeOutside), unrelated_runtime_bytes_unchanged: true } };
}
function git(...args) { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
function compiler() {
  const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  return require(join(root, 'wrangler/node_modules/esbuild'));
}
async function readActiveModule(token) {
  const response = await fetch('https://api.cloudflare.com/client/v4' + ROOT + '/content/v2', {
    method: 'GET', redirect: 'error', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200, 'active module read failed');
  assert.match(response.headers.get('content-type') || '', /multipart\/form-data/);
  const form = await response.formData();
  const files = [...form.entries()];
  assert.ok(files.every(([name, value]) => typeof value !== 'string' &&
    ['admin-login-hero-worker.js', 'admin-login-hero-worker.js.map'].includes(name)), 'unreviewed module part');
  assert.equal(files.filter(([name]) => name.endsWith('.js')).length, 1);
  assert.ok(files.length <= 2);
  const main = form.get('admin-login-hero-worker.js');
  assert.ok(main && main.size <= 20 * 1024 * 1024, 'active module too large');
  const map = form.get('admin-login-hero-worker.js.map');
  // Do not attach stale source mappings to changed code. This is a debug-only
  // omission, not a runtime/config mutation; its original digest is receipted.
  return { code: await main.text(), omitted_debug_map: map ? { name: map.name, sha256: digest(new Uint8Array(await map.arrayBuffer())) } : null };
}
function sourceScope() {
  validateViewerSource(RUNTIME, git('diff', '--name-only', BASE, RUNTIME).split('\n').filter(Boolean));
  git('merge-base', '--is-ancestor', RUNTIME, 'HEAD');
  assert.equal(git('show', `${RUNTIME}:${UI}`), readFileSync(UI, 'utf8').trim(), 'checked-out UI differs from reviewed runtime');
}
async function main() {
  sourceScope();
  const esbuild = compiler();
  if (process.argv[2] === '--test-bundle') {
    const dir = mkdtempSync(join(tmpdir(), 'held-viewer-browser-test-'));
    const module = join(dir, 'page.mjs');
    esbuild.buildSync({ entryPoints: ['admin-worker/src/money-control-worker-home.js'], bundle: true,
      format: 'esm', platform: 'neutral', target: 'es2022', keepNames: true, outfile: module });
    execFileSync(process.execPath, ['--test', 'admin-worker/held-document-review-ui.test.mjs'], {
      stdio: 'inherit', env: { ...process.env, HELD_DOCUMENT_PAGE_MODULE: module }, timeout: 60000,
    });
    return;
  }
  assert.equal(process.argv[2], '--execute-approved');
  assert.equal(process.env.PRODUCTION_APPROVED, 'true');
  const sha = process.env.GITHUB_SHA;
  const approve = async () => {
    await verifyProductionApproval(process.env);
    assert.equal((await inspectEnvironment(process.env)).ready, true, 'protected main-only environment required');
    validateSourceState({ expectedSha: sha, headSha: git('rev-parse', 'HEAD'), dirtyStatus: git('status', '--porcelain=v1', '--untracked-files=all') });
    sourceScope();
  };
  const releaseId = `${process.env.GITHUB_RUN_ID}.${process.env.GITHUB_RUN_ATTEMPT}`;
  const journal = join(process.env.RUNNER_TEMP, 'held-viewer-code-only-receipt.json');
  const source = git('show', `${RUNTIME}:${UI}`);
  const section = normalizeViewerBuild(esbuild.transformSync(source, { loader: 'js', format: 'esm', target: 'es2022', keepNames: true }).code);
  let preservation;
  await releaseCurrentSession({ sha, approve, expectedVersion: process.env.EXPECTED_VERSION,
    expectedDeployment: process.env.EXPECTED_DEPLOYMENT, call: createTransport(process.env.CLOUDFLARE_API_TOKEN),
    sourceCheck: async baseline => {
      assert.equal(baseline.annotations?.['workers/message'], `GitHub Actions ${BASE}`, 'baseline source message differs');
      assert.equal(baseline.annotations?.['workers/tag'], `gha-${BASE.slice(0, 12)}`, 'baseline tag differs');
      return { commit_sha: sha, dirty_tree: false, dirty_path_count: 0, method: 'pinned-viewer-overlay-with-exact-active-section-digest',
        baseline_source_sha: BASE, runtime_source_sha: RUNTIME, runtime_paths: PATHS };
    },
    bundle: async () => {
      const live = await readActiveModule(process.env.CLOUDFLARE_API_TOKEN);
      const result = patchViewer(live.code, section);
      const syntaxFile = join(mkdtempSync(join(tmpdir(), 'held-viewer-syntax-')), 'candidate.mjs');
      writeFileSync(syntaxFile, result.code, { mode: 0o600 });
      execFileSync(process.execPath, ['--check', syntaxFile], { stdio: 'ignore', timeout: 60000 });
      preservation = { ...result.preservation, omitted_debug_map: live.omitted_debug_map };
      return new TextEncoder().encode(result.code);
    },
    buildEvidence: code => ({ ...createBuildEvidence({ code, releaseId, nodeVersion: process.version,
      wranglerVersion: execFileSync('wrangler', ['--version'], { encoding: 'utf8' }).match(/wrangler\s+([\d.]+)/i)?.[1],
      lockfile: readFileSync('package-lock.json'), wranglerConfig: new TextEncoder().encode(JSON.stringify({ overlay: UI, runtime: RUNTIME })) }), preservation }),
    now: () => new Date().toISOString(), save: state => writeFileSync(journal, JSON.stringify(state, null, 2), { mode: 0o600 }),
  });
  console.log('Held-viewer-only artifact promoted and configuration read back; no business writes.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(`Held viewer release stopped: ${error.message}; inspect receipt, never retry blindly.`); process.exitCode = 1; });
}
