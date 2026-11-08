import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { prepareConsoleSource, buildConsoleBundle } from './admin-console-isolated-build.mjs';
import {
  BASELINE_VERSION, BASELINE_DEPLOYMENT, BASELINE_SOURCE, LIVE_SHA256,
  SOURCE_HASHES, RUNTIME_PATHS, digest, validateSources, validateBaseline, patchConsoleHome,
} from './admin-console-home-overlay.mjs';
import { testConsoleHomeCandidate } from './admin-console-home-candidate-test.mjs';

const REPOSITORY = dirname(dirname(fileURLToPath(import.meta.url)));
const EXPECTED_PATHS = [
  'admin-worker/src/admin-login-hero-worker-core.js',
  'admin-worker/src/admin-login-hero-worker.js',
  'admin-worker/src/admin-login-page.js',
  'admin-worker/src/admin-console-page.js',
];
let directory;
let live;
let candidate;

before(() => {
  directory = mkdtempSync(join(tmpdir(), 'console-home-overlay-test-'));
  if (process.env.ADMIN_CONSOLE_HOME_BASELINE_FILE) {
    live = readFileSync(process.env.ADMIN_CONSOLE_HOME_BASELINE_FILE, 'utf8');
  } else {
    // CI recreates the previously deployed Console from its pinned baseline
    // and six reviewed source files, using the original compiler version.
    const prepared = prepareConsoleSource({ directory: join(directory, 'source'), repository: REPOSITORY });
    const built = buildConsoleBundle({
      prepared, directory: join(directory, 'build'), runtime: { compatibility_date: '2026-01-01' },
      wrangler: process.env.ADMIN_CONSOLE_WRANGLER || 'wrangler',
    });
    assert.equal(built.wranglerVersion, '4.158.0');
    live = built.code.toString('utf8');
  }
  assert.equal(digest(live), LIVE_SHA256, 'fixture must reproduce the exact deployed Console bytes');
  candidate = patchConsoleHome(live);
});
after(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
});

test('source guard binds exactly the four reviewed homepage files and rejects drift in each', () => {
  assert.deepEqual(RUNTIME_PATHS, EXPECTED_PATHS);
  assert.deepEqual(Object.keys(SOURCE_HASHES).sort(), [...EXPECTED_PATHS].sort());
  const read = path => readFileSync(join(REPOSITORY, path), 'utf8');
  validateSources(read);
  for (const changed of EXPECTED_PATHS) {
    assert.match(SOURCE_HASHES[changed], /^[a-f0-9]{64}$/);
    assert.throws(() => validateSources(path => read(path) + (path === changed ? '\n// unreviewed change\n' : '')),
      /reviewed Console-home source drift/);
  }
});

test('baseline guard requires the observed source, version, deployment, and entire traffic allocation', () => {
  const version = { id: BASELINE_VERSION, annotations: { 'workers/commit_sha': BASELINE_SOURCE } };
  const deployment = { id: BASELINE_DEPLOYMENT, strategy: 'percentage', versions: [{ version_id: BASELINE_VERSION, percentage: 100 }] };
  validateBaseline(version, deployment);
  for (const mutate of [
    ({ version }) => { version.id = '11111111-1111-4111-8111-111111111111'; },
    ({ version }) => { version.annotations['workers/commit_sha'] = 'f'.repeat(40); },
    ({ version }) => { delete version.annotations; },
    ({ deployment }) => { deployment.id = '11111111-1111-4111-8111-111111111111'; },
    ({ deployment }) => { deployment.strategy = 'gradual'; },
    ({ deployment }) => { deployment.versions[0].percentage = 99; },
    ({ deployment }) => { deployment.versions.push({ version_id: 'other', percentage: 0 }); },
    ({ deployment }) => { deployment.versions[0].version_id = 'other'; },
  ]) {
    const changed = structuredClone({ version, deployment });
    mutate(changed);
    assert.throws(() => validateBaseline(changed.version, changed.deployment), /Console-home baseline/);
  }
});

test('overlay rejects wrong live bytes, duplicate anchors, a second application, and non-text input', () => {
  for (const changed of ['', 'export default {};', live + '\n', live.replace('/internal/admin/dashboard', '/internal/admin/changed'),
    live + '\nvar ADMIN_OWNER_DASHBOARD_PATH = "/internal/admin/dashboard";\n', candidate.code]) {
    assert.throws(() => patchConsoleHome(changed), /unreviewed live Worker bytes/);
  }
  assert.throws(() => patchConsoleHome(Buffer.from(live)), /must be text/);
});

test('all fifteen homepage edits stay within the four modules while every other bundled section and Kenji URL stays identical', () => {
  const { preservation } = candidate;
  assert.equal(preservation.baseline_sha256, LIVE_SHA256);
  assert.equal(preservation.candidate_sha256, digest(candidate.code));
  assert.notEqual(preservation.candidate_sha256, preservation.baseline_sha256);
  assert.deepEqual(preservation.runtime_paths, EXPECTED_PATHS);
  assert.deepEqual(preservation.source_hashes, SOURCE_HASHES);
  for (const key of ['unrelated_runtime_bytes_unchanged', 'reverse_patch_equals_baseline', 'routes_unchanged', 'no_dependency_or_compiler_changes']) {
    assert.equal(preservation[key], true, key);
  }
  assert.equal(preservation.edits.length, 15);
  assert.equal(new Set(preservation.edits.map(edit => edit.name)).size, 15);
  for (const edit of preservation.edits) {
    assert.ok(EXPECTED_PATHS.includes(edit.path));
    assert.match(edit.before_sha256, /^[a-f0-9]{64}$/);
    assert.match(edit.after_sha256, /^[a-f0-9]{64}$/);
    assert.notEqual(edit.before_sha256, edit.after_sha256);
  }

  const sections = code => {
    const markers = [...code.matchAll(/^\/\/ \.\.\/source\/([^\r\n]+)\r?\n/gm)];
    assert.ok(markers.length > 100, 'expected the actual multi-module Worker bundle');
    return [{ path: '<prelude>', text: code.slice(0, markers[0].index) },
      ...markers.map((marker, index) => ({
        path: marker[1], text: code.slice(marker.index, markers[index + 1]?.index ?? code.length),
      }))];
  };
  const before = sections(live);
  const after = sections(candidate.code);
  assert.deepEqual(after.map(section => section.path), before.map(section => section.path), 'compiled module inventory and order');
  const changedPaths = new Set();
  for (let index = 0; index < before.length; index++) {
    if (before[index].text !== after[index].text) {
      assert.ok(EXPECTED_PATHS.includes(before[index].path), 'unrelated bundled section changed: ' + before[index].path);
      changedPaths.add(before[index].path);
    }
  }
  assert.deepEqual([...changedPaths].sort(), [...EXPECTED_PATHS].sort());
  const kenjiUrls = code => code.match(/https:\/\/models\.mmdbkk\.com\/webflow\/internal\/admin\/kenji\/kenji-admin-v1\.(?:css|js)\?v=[a-f0-9]{40}\?v=[a-f0-9]{40}/g);
  assert.equal(kenjiUrls(live)?.length, 2);
  assert.deepEqual(kenjiUrls(candidate.code), kenjiUrls(live));
  assert.doesNotMatch(candidate.code, /handleStandardJoinIntakeRpc|isStandardJoinIntakeRpcRequest/);
});

test('patched deployed artifact passes the credential-isolated auth, login, diagnostic, home-link, and browser contracts', { timeout: 120000 }, () => {
  let result;
  try {
    result = testConsoleHomeCandidate(candidate.code);
    assert.equal(typeof result.output, 'string');
    assert.match(result.output, /(?:#|ℹ) pass 1/);
    assert.match(result.output, /(?:#|ℹ) fail 0/);
    assert.equal(readFileSync(result.artifact, 'utf8'), candidate.code);
  } finally {
    if (result) rmSync(result.directory, { recursive: true, force: true });
  }
  assert.throws(() => testConsoleHomeCandidate(''), /candidate module required/);
  assert.throws(() => testConsoleHomeCandidate(Buffer.from([0xff])), /UTF-8/);
});
