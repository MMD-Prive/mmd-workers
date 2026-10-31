// Owner-control-only overlay; tests/imports never contact production.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { releaseCurrentSession, createTransport, validateSourceState, createBuildEvidence, ROOT } from './admin-current-session-code-only.mjs';
import { verifyProductionApproval } from './admin-production-approval.mjs';
import { inspectEnvironment } from './admin-production-validation.mjs';
import { digest, parseWranglerVersion } from './admin-held-viewer-code-only.mjs';
export const START = '// src/kenji-owner-line-unlock.js\n';
export const END = '// src/admin-login-hero-worker-core.js\n';
export const OLD_SHA = '0f9856b26c3e8ff8ea122d01eb640c40d8cc9a2d32a5c8529b8a8e286aa21023';
export const BASE_VERSION = '7200b410-db73-4fdf-9b85-5ae14d35d9c1';
const UI = 'admin-worker/src/kenji-owner-line-unlock.js';
export function patchOwner(code, replacement, oldSha = OLD_SHA) {
  const a = code.indexOf(START), b = code.indexOf(END, a + START.length);
  assert.ok(a >= 0 && b > a, 'owner section markers missing');
  assert.equal(code.indexOf(START, a + START.length), -1, 'duplicate owner marker');
  assert.equal(code.indexOf(END, b + END.length), -1, 'duplicate caller marker');
  assert.equal(digest(code.slice(a, b)), oldSha, 'active owner section differs from reviewed baseline');
  assert.ok(replacement.startsWith(START) && !replacement.includes(END));
  const next = code.slice(0, a) + replacement + code.slice(b);
  const outside = code.slice(0, a) + code.slice(b);
  assert.equal(next.slice(0, a) + next.slice(a + replacement.length), outside);
  return { code: next, preservation: { baseline_sha256: digest(code), candidate_sha256: digest(next),
    old_owner_sha256: oldSha, new_owner_sha256: digest(replacement),
    preserved_runtime_sha256: digest(outside), unrelated_runtime_bytes_unchanged: true } };
}
export function compileOwner(esbuild, source) {
  assert.match(source, /^import \{ readKenjiRuntimeControlVersions \} from '\.\/kenji-control-actions.js';/);
  const plain = source.replace(/^import[^\n]+\n/, '').replace(/^export /gm, '');
  const compiled = esbuild.transformSync(plain, { loader: 'js', format: 'esm', target: 'es2022', keepNames: true }).code;
  const a = compiled.indexOf('const OWNER_LINE_PAGE');
  assert.ok(a > 0 && !compiled.includes('\nexport '), 'unexpected compiled owner module');
  assert.match(compiled.slice(0, a), /var __name/);
  return START + 'init_kenji_control_actions();\n' + compiled.slice(a) + '\n';
}
const require = createRequire(import.meta.url);
function compiler() {
  const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
  return require(join(root, 'wrangler/node_modules/esbuild'));
}
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim();
async function main() {
  const replacement = compileOwner(compiler(), readFileSync(UI, 'utf8'));
  const dir = mkdtempSync(join(tmpdir(), 'kenji-owner-unpause-'));
  const syntax = join(dir, 'owner.mjs'); writeFileSync(syntax, replacement);
  execFileSync(process.execPath, ['--check', syntax], { stdio: 'ignore' });
  if (process.argv[2] === '--test-bundle') return console.log('Owner-only compiled module syntax passed.');
  assert.equal(process.argv[2], '--execute-approved');
  assert.equal(process.env.PRODUCTION_APPROVED, 'true');
  assert.equal(process.env.EXPECTED_VERSION, BASE_VERSION);
  const sha = process.env.GITHUB_SHA, releaseId = `${process.env.GITHUB_RUN_ID}.${process.env.GITHUB_RUN_ATTEMPT}`;
  const approve = async () => {
    await verifyProductionApproval(process.env);
    assert.equal((await inspectEnvironment(process.env)).ready, true);
    validateSourceState({ expectedSha: sha, headSha: git('rev-parse','HEAD'), dirtyStatus: git('status','--porcelain=v1','--untracked-files=all') });
  };
  let preservation;
  await releaseCurrentSession({ sha, approve, expectedVersion: process.env.EXPECTED_VERSION,
    expectedDeployment: process.env.EXPECTED_DEPLOYMENT, call: createTransport(process.env.CLOUDFLARE_API_TOKEN),
    sourceCheck: async baseline => {
      assert.equal(baseline.id, BASE_VERSION);
      return { commit_sha: sha, dirty_tree: false, dirty_path_count: 0, method: 'exact-reviewed-owner-section-overlay', baseline_version: BASE_VERSION, runtime_paths: [UI] };
    },
    bundle: async () => {
      const response = await fetch('https://api.cloudflare.com/client/v4' + ROOT + '/content/v2', {
        headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` }, redirect: 'error', signal: AbortSignal.timeout(30000) });
      assert.equal(response.status, 200);
      const parts = [...(await response.formData()).entries()];
      assert.ok(parts.length <= 2 && parts.every(([n,v]) => typeof v !== 'string' && ['admin-login-hero-worker.js','admin-login-hero-worker.js.map'].includes(n)));
      const mainPart = parts.find(([n]) => n === 'admin-login-hero-worker.js')?.[1];
      assert.ok(mainPart && mainPart.size < 20*1024*1024);
      const result = patchOwner(await mainPart.text(), replacement);
      const map = parts.find(([n]) => n.endsWith('.map'))?.[1];
      preservation = { ...result.preservation, omitted_debug_map: map ? { sha256: digest(new Uint8Array(await map.arrayBuffer())) } : null };
      writeFileSync(syntax, result.code); execFileSync(process.execPath, ['--check', syntax], { stdio: 'ignore' });
      return new TextEncoder().encode(result.code);
    },
    buildEvidence: code => ({ ...createBuildEvidence({ code, releaseId, nodeVersion: process.version,
      wranglerVersion: parseWranglerVersion(execFileSync('wrangler',['--version'],{encoding:'utf8'})),
      lockfile: readFileSync('package-lock.json'), wranglerConfig: new TextEncoder().encode(JSON.stringify({overlay:UI,baseline:BASE_VERSION})) }), preservation }),
    now: () => new Date().toISOString(), save: state => writeFileSync(join(process.env.RUNNER_TEMP, 'kenji-owner-unpause-receipt.json'), JSON.stringify(state,null,2), {mode:0o600}) });
  console.log('Owner control overlay deployed; configuration and unrelated runtime preserved.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(error => { console.error(`Owner unpause release stopped: ${error.message}; inspect receipt, no automatic retry.`); process.exitCode=1; });
