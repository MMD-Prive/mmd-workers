import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, webcrypto } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { createCredentialBoundAdminSession } from '../admin-worker/src/credential-bound-admin-session.js';
import {
  BASELINE, CONSOLE_PARENT, CONSOLE_HEAD, CONSOLE_MERGED, RUNTIME_PATHS,
  UNRELATED_INTAKE, removeUnreleasedIntake, prepareConsoleSource,
  preserveBaselineKenjiUrls, buildConsoleBundle,
} from './admin-console-isolated-build.mjs';

globalThis.crypto ??= webcrypto;
const REPOSITORY = dirname(dirname(fileURLToPath(import.meta.url)));
const HERO = 'admin-worker/src/admin-login-hero-worker.js';
const PRIOR_KENJI_PIN = '0caeb7176f642fb4866e9bf7687777271fc49f6a';
const EXPECTED_PATHS = [
  'admin-worker/src/admin-console-client.js',
  'admin-worker/src/admin-console-page.js',
  'admin-worker/src/admin-console-style.js',
  'admin-worker/src/admin-dashboard-jobs.js',
  'admin-worker/src/admin-login-hero-worker-core.js',
  HERO,
];
const git = (...args) => execFileSync('git', args, {
  cwd: REPOSITORY, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024,
});
const sourceAt = (revision, path) => git('show', `${revision}:${path}`);
const sha256 = value => createHash('sha256').update(value).digest('hex');
let temporary;
let prepared;

before(() => {
  temporary = mkdtempSync(join(tmpdir(), 'mmd-console-isolated-test-'));
  prepared = prepareConsoleSource({ directory: join(temporary, 'source'), repository: REPOSITORY });
});
after(() => {
  if (temporary) rmSync(temporary, { recursive: true, force: true });
});

test('reviewed parent matches live source after only the exact six unrelated Intake lines are removed', () => {
  assert.equal(
    removeUnreleasedIntake(sourceAt(CONSOLE_PARENT, HERO).toString('utf8')),
    sourceAt(BASELINE, HERO).toString('utf8'),
  );
  for (const path of EXPECTED_PATHS.slice(3, 5)) {
    assert.deepEqual(sourceAt(CONSOLE_PARENT, path), sourceAt(BASELINE, path), path);
  }
  const baselineNames = new Set(git('ls-tree', '-r', '--name-only', BASELINE).toString().trim().split('\n'));
  const parentNames = new Set(git('ls-tree', '-r', '--name-only', CONSOLE_PARENT).toString().trim().split('\n'));
  for (const path of EXPECTED_PATHS.slice(0, 3)) {
    assert.equal(baselineNames.has(path), false, path);
    assert.equal(parentNames.has(path), false, path);
  }
  assert.deepEqual(git('rev-parse', `${CONSOLE_HEAD}^{tree}`), git('rev-parse', `${CONSOLE_MERGED}^{tree}`));
  assert.throws(() => removeUnreleasedIntake(sourceAt(BASELINE, HERO).toString('utf8')), /unreviewed Standard Join Intake/);
  const parentHero = sourceAt(CONSOLE_PARENT, HERO).toString('utf8');
  assert.throws(() => removeUnreleasedIntake(UNRELATED_INTAKE[0] + parentHero), /unreviewed Standard Join Intake/);
  assert.throws(() => removeUnreleasedIntake(parentHero.replace('service-binding-only Standard', 'changed Standard')), /unreviewed Standard Join Intake/);
});

test('isolated source contains exactly the six reviewed overlays and preserves baseline pricing, configuration, and dependencies', () => {
  assert.deepEqual(RUNTIME_PATHS, EXPECTED_PATHS);
  assert.equal(prepared.manifest.baseline_source_sha, BASELINE);
  assert.equal(prepared.manifest.console_source_sha, CONSOLE_HEAD);
  assert.equal(prepared.manifest.console_parent_sha, CONSOLE_PARENT);
  assert.deepEqual(prepared.manifest.runtime_paths, EXPECTED_PATHS);
  assert.equal(prepared.manifest.all_other_baseline_files_unchanged, true);
  assert.equal(prepared.manifest.source_configuration_unchanged, true);
  assert.equal(prepared.manifest.unrelated_standard_join_intake_excluded, true);
  for (const path of EXPECTED_PATHS) {
    const approved = sourceAt(CONSOLE_HEAD, path).toString('utf8');
    const expected = path === HERO ? removeUnreleasedIntake(approved) : approved;
    assert.equal(readFileSync(join(prepared.directory, path), 'utf8'), expected, path);
  }
  for (const path of [
    'admin-worker/src/job-service-pricing.js',
    'admin-worker/src/credential-bound-admin-session.js',
    'admin-worker/wrangler.toml',
    'admin-worker/package.json',
    'package.json',
    'package-lock.json',
  ]) {
    assert.deepEqual(readFileSync(join(prepared.directory, path)), sourceAt(BASELINE, path), path);
  }
  const baselineEntries = git('ls-tree', '-r', '-z', BASELINE).toString().split('\0').filter(Boolean);
  assert.equal(prepared.manifest.baseline_file_count, baselineEntries.length);
  const candidateHero = readFileSync(join(prepared.directory, HERO), 'utf8');
  assert.doesNotMatch(candidateHero, /handleStandardJoinIntakeRpc|isStandardJoinIntakeRpcRequest|standard-join-intake\.js/);
  assert.equal(existsSync(join(prepared.directory, 'admin-worker/src/premium-group-cleanup/standard-join-intake.js')), false);
});

test('source preparation refuses an existing destination or any path inside the approved checkout', () => {
  assert.throws(() => prepareConsoleSource({ directory: prepared.directory, repository: REPOSITORY }), /already exists/);
  assert.throws(() => prepareConsoleSource({ directory: join(REPOSITORY, 'forbidden-console-test-source'), repository: REPOSITORY }), /outside the approved checkout/);
  assert.equal(existsSync(join(REPOSITORY, 'forbidden-console-test-source')), false);
});

test('Kenji preservation reproduces both exact live double pins without changing surrounding bytes', () => {
  const stable = extension => `https://models.mmdbkk.com/webflow/internal/admin/kenji/kenji-admin-v1.${extension}`;
  const original = Buffer.from(`const css = "${stable('css')}?v=${PRIOR_KENJI_PIN}";\nconst js = '${stable('js')}?v=${PRIOR_KENJI_PIN}';\n// retain this unrelated source\n`);
  const preserved = preserveBaselineKenjiUrls(original);
  let expected = original.toString();
  for (const extension of ['css', 'js']) {
    expected = expected.replace(`${stable(extension)}?v=${PRIOR_KENJI_PIN}`, `${stable(extension)}?v=${BASELINE}?v=${PRIOR_KENJI_PIN}`);
  }
  assert.equal(preserved.code.toString(), expected);
  assert.deepEqual(preserved.urls, ['css', 'js'].map(extension => `${stable(extension)}?v=${BASELINE}?v=${PRIOR_KENJI_PIN}`));
  assert.equal(preserved.before_sha256, sha256(original));
  assert.equal(preserved.after_sha256, sha256(Buffer.from(expected)));
  assert.throws(() => preserveBaselineKenjiUrls(preserved.code), /unreviewed baseline Kenji version tail/);
  assert.throws(() => preserveBaselineKenjiUrls(Buffer.from(original.toString().replace(PRIOR_KENJI_PIN, 'unreviewed'))), /unreviewed baseline Kenji version tail/);
  assert.throws(() => preserveBaselineKenjiUrls(Buffer.concat([original, Buffer.from(stable('css'))])), /ambiguous baseline Kenji asset URL/);
  assert.throws(() => preserveBaselineKenjiUrls(Buffer.from([0xff])), /UTF-8/);
});

test('build rejects unprepared sources, changed runtime settings, and an unreviewed compiler', () => {
  const call = (options = {}) => buildConsoleBundle({
    prepared, directory: join(temporary, 'rejected-build'),
    runtime: { compatibility_date: '2026-01-01' }, ...options,
  });
  assert.throws(() => call({ prepared: {} }), /unprepared baseline/);
  assert.throws(() => call({ prepared: { ...prepared, manifest: { ...prepared.manifest, console_source_sha: BASELINE } } }), /unreviewed Console source/);
  assert.throws(() => call({ runtime: { compatibility_date: '2026-02-01' } }), /unreviewed runtime date/);
  assert.throws(() => call({ runtime: { compatibility_date: '2026-01-01', compatibility_flags: ['nodejs_compat'] } }), /unreviewed runtime flags/);
  const wrongWrangler = join(temporary, 'wrong-wrangler');
  writeFileSync(wrongWrangler, '#!/bin/sh\nprintf "%s\\n" "4.105.0"\n', { mode: 0o700 });
  assert.throws(() => call({ wrangler: wrongWrangler }), /reviewed Wrangler compiler required/);
  assert.equal(existsSync(join(temporary, 'rejected-build', 'bundle')), false);
});

test('actual isolated Wrangler artifact enforces Console auth and boots its serialized client on both production hosts', { timeout: 180000 }, async () => {
  const built = buildConsoleBundle({
    prepared, directory: join(temporary, 'build'), runtime: { compatibility_date: '2026-01-01' },
    wrangler: process.env.ADMIN_CONSOLE_WRANGLER || 'wrangler',
  });
  assert.equal(built.wranglerVersion, '4.158.0');
  assert.deepEqual(readFileSync(built.artifact), built.code);
  assert.equal(built.config.main, join(prepared.directory, HERO));
  const code = built.code.toString('utf8');
  assert.doesNotMatch(code, /handleStandardJoinIntakeRpc|isStandardJoinIntakeRpcRequest/);
  for (const url of built.preservation.kenji_asset_urls) {
    assert.ok(code.includes(url));
    assert.ok(url.includes(`?v=${BASELINE}?v=${PRIOR_KENJI_PIN}`));
  }
  const worker = (await import(pathToFileURL(built.artifact).href)).default;
  const env = { ADMIN_LOGIN_CREDENTIAL: 'isolated-console-fixture', ADMIN_SESSION_SECRET: 'isolated-console-session-fixture' };
  const token = await createCredentialBoundAdminSession(new Request('https://mmdbkk.com'), { id: 'fixture-owner', role: 'admin' }, env);
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async () => { upstreamCalls++; throw new Error('Unexpected upstream request during Console shell rendering'); };
  try {
    for (const host of ['mmdbkk.com', 'www.mmdbkk.com']) {
      const origin = `https://${host}`;
      const url = `${origin}/internal/admin/console?date=all`;
      for (const headers of [{}, { Cookie: 'mmd_admin_gate_v1=invalid' }, {
        Authorization: `Bearer ${env.ADMIN_LOGIN_CREDENTIAL}`,
        'x-mmd-admin-actor': 'fixture-owner', 'x-mmd-admin-role': 'admin',
      }]) {
        const denied = await worker.fetch(new Request(url, { headers }), env, {});
        assert.equal(denied.status, 303, host);
        const login = new URL(denied.headers.get('location'));
        assert.equal(login.origin, origin);
        assert.equal(login.pathname, '/internal/admin/login');
        assert.equal(login.searchParams.get('next'), '/internal/admin/console?date=all');
      }
      const headers = { Cookie: `mmd_admin_gate_v1=${token}` };
      const response = await worker.fetch(new Request(url, { headers }), env, {});
      assert.equal(response.status, 200, host);
      assert.equal(response.headers.get('x-mmd-admin-console'), 'rebuild-v1');
      assert.match(response.headers.get('cache-control'), /no-store/);
      assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
      assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
      const head = await worker.fetch(new Request(url, { method: 'HEAD', headers }), env, {});
      assert.equal(head.status, 200);
      assert.equal(await head.text(), '');
      const post = await worker.fetch(new Request(url, { method: 'POST', headers }), env, {});
      assert.equal(post.status, 405);
      assert.equal(post.headers.get('allow'), 'GET, HEAD');
      const html = await response.text();
      assert.doesNotMatch(html, /isolated-console-fixture|isolated-console-session-fixture/);
      const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
      try {
        const calls = [];
        dom.window.fetch = async (path, options) => {
          calls.push({ path, options });
          return Response.json({
            ok: true, view: 'jobs', layer: 'core', source: 'admin-worker', generated_at: new Date().toISOString(),
            filters: { q: null, job_date: null, session_id: null, job_id: null, client_id: null },
            pagination: { page: 1, page_size: 20, total: 0, total_pages: 1, has_prev: false, has_next: false },
            counts: { all: 0, filtered: 0, today: 0, upcoming: 0, past: 0, undated: 0 }, jobs: [],
          });
        };
        assert.equal(Object.hasOwn(dom.window, '__name'), false);
        const client = dom.window.document.querySelector('script[data-admin-console-client]');
        assert.ok(client, 'bundled client must be present');
        dom.window.eval(client.textContent);
        for (let index = 0; index < 10; index++) await new Promise(resolve => setImmediate(resolve));
        assert.equal(calls.length, 1, host);
        const dataUrl = new URL(calls[0].path, origin);
        assert.equal(dataUrl.origin, origin);
        assert.equal(dataUrl.pathname, '/v1/admin/dashboard');
        assert.equal(dataUrl.searchParams.get('view'), 'jobs');
        assert.equal(calls[0].options.method || 'GET', 'GET');
        assert.equal(calls[0].options.credentials, 'include');
        assert.equal(calls[0].options.cache, 'no-store');
        assert.equal(dom.window.document.querySelector('#ac-empty').hidden, false);
        assert.equal(dom.window.document.querySelector('#ac-error').hidden, true);
        assert.equal(dom.window.document.querySelector('[data-count=all]').textContent, '0');
        assert.equal(Object.hasOwn(dom.window, '__name'), false);
      } finally { dom.window.close(); }
    }
    assert.equal(upstreamCalls, 0);
  } finally { globalThis.fetch = originalFetch; }
});
