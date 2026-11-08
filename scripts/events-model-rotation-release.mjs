// Exact reviewed compiled overlay, never rebuilds current-main Worker runtime.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyProductionApproval } from './admin-production-approval.mjs';
import { inspectEnvironment } from './admin-production-validation.mjs';
import { validateSourceState } from './admin-current-session-code-only.mjs';
import { releaseEventsRotation, createTransport, ROOT } from './events-rotation-release-transport.mjs';
export const digest = value => createHash('sha256').update(value).digest('hex');
export const MANIFEST = 'release/events-model-rotation/overlay-manifest.json';
export function applyRotationOverlay(code, manifest) {
  assert.equal(manifest.worker, 'events-worker');
  assert.equal(manifest.module, 'model-eta-wrapper.js');
  assert.equal(digest(code), manifest.baseline_sha256, 'active module differs from reviewed baseline');
  const allowed = ['compcard-policy', 'compcard-journal', 'compcard-daily'];
  let next = code;
  for (const change of manifest.replacements) {
    assert.ok(allowed.includes(change.section), 'unapproved source section');
    assert.ok(change.before && change.after && change.before !== change.after);
    const pos = next.indexOf(change.before);
    assert.ok(pos >= 0 && next.indexOf(change.before, pos + change.before.length) === -1, 'ambiguous overlay anchor');
    const section = next.slice(0, pos).match(/\/\/ src\/[^\n]+/g)?.at(-1);
    assert.equal(section, '// src/' + change.section + '.js', 'anchor outside approved module');
    next = next.slice(0, pos) + change.after + next.slice(pos + change.before.length);
  }
  assert.equal(digest(next), manifest.candidate_sha256, 'candidate digest mismatch');
  let restored = next;
  for (const change of [...manifest.replacements].reverse()) {
    const pos = restored.indexOf(change.after);
    assert.ok(pos >= 0 && restored.indexOf(change.after, pos + change.after.length) === -1);
    restored = restored.slice(0, pos) + change.before + restored.slice(pos + change.after.length);
  }
  assert.equal(restored, code, 'unrelated bytes changed');
  return next;
}
export function testCandidateBundle(candidate) {
  const directory = mkdtempSync(join(tmpdir(), 'events-rotation-tests-'));
  const names = new Set(['buildCompcardCaption']);
  const files = ['compcard-policy.test.mjs', 'compcard-journal.test.mjs', 'compcard-intake.test.mjs', 'compcard-cadence.test.mjs'];
  for (const file of files) {
    let text = readFileSync('events-worker/' + file, 'utf8');
    for (const match of text.matchAll(/import\s*{([^}]+)}\s*from\s*["']\.\/src\/[^"']+["']/gs)) {
      for (const name of match[1].split(',').map(value => value.trim()).filter(Boolean)) names.add(name);
    }
    text = text.replace(/(["'])\.\/src\/[^"']+\1/g, "'./testable-candidate.mjs'");
    writeFileSync(join(directory, file), text);
  }
  writeFileSync(join(directory, 'testable-candidate.mjs'), candidate + '\nexport { ' + [...names].sort().join(', ') + ' };\n');
  execFileSync(process.execPath, ['--test', '--test-skip-pattern=the approved manifest', ...files.slice(0, 3)], { cwd: directory, stdio: 'inherit', timeout: 60000 });
  execFileSync(process.execPath, ['--test', '--test-name-pattern=excluded Tinn|frozen not_sent|one remaining|legacy frozen plan is|pending legacy Tinn|already sent legacy Tinn|single-room|afternoon and Standard|Standard repeats|uncertain Standard|empty Standard|legacy frozen sibling', files[3]], { cwd: directory, stdio: 'inherit', timeout: 60000 });
}
async function readModule(token, expectedName = "model-eta-wrapper.js") {
  const response = await fetch('https://api.cloudflare.com/client/v4' + ROOT + '/content/v2', {
    headers: { Authorization: 'Bearer ' + token }, redirect: 'error', signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200, 'cannot read active module');
  const form = await response.formData();
  const entries = [...form.entries()];
  assert.equal(entries.length, 1, 'unexpected extra module or source map');
  assert.equal(entries[0][0], expectedName);
  assert.ok(typeof entries[0][1] !== 'string' && entries[0][1].size < 1024 * 1024);
  return entries[0][1].text();
}
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
async function main() {
  assert.equal(process.argv[2], '--execute-approved');
  assert.equal(process.env.PRODUCTION_APPROVED, 'true');
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const sha = process.env.GITHUB_SHA;
  const approve = async () => {
    await verifyProductionApproval(process.env);
    assert.equal((await inspectEnvironment(process.env)).ready, true, 'protected main-only reviewer environment required');
    validateSourceState({ expectedSha: sha, headSha: git('rev-parse', 'HEAD'), dirtyStatus: git('status', '--porcelain=v1', '--untracked-files=all') });
  };
  assert.equal(process.env.EXPECTED_VERSION, manifest.expected_version);
  assert.equal(process.env.EXPECTED_DEPLOYMENT, manifest.expected_deployment);
  const releaseId = process.env.GITHUB_RUN_ID + '.' + process.env.GITHUB_RUN_ATTEMPT;
  assert.match(releaseId, /^\d+\.\d+$/);
  const journal = join(process.env.RUNNER_TEMP, 'events-model-rotation-release.json');
  await releaseEventsRotation({
    sha, approve, expectedVersion: manifest.expected_version, expectedDeployment: manifest.expected_deployment,
    call: createTransport(process.env.CLOUDFLARE_API_TOKEN),
    sourceCheck: async version => {
      assert.equal(version.resources.bindings.find(row => row.name === 'HYPE_PROMOTION_ENABLED')?.text, 'false', 'promotion must remain disabled');
      return { commit_sha: sha, dirty_tree: false, method: 'exact-live-hash-pinned-three-module-overlay',
        baseline_module_sha256: manifest.baseline_sha256, candidate_module_sha256: manifest.candidate_sha256 };
    },
    bundle: async () => {
      const candidate = applyRotationOverlay(await readModule(process.env.CLOUDFLARE_API_TOKEN), manifest);
      const file = join(mkdtempSync(join(tmpdir(), 'events-rotation-')), 'candidate.mjs');
      writeFileSync(file, candidate, { mode: 0o600 });
      execFileSync(process.execPath, ['--check', file], { stdio: 'ignore' });
      testCandidateBundle(candidate);
      return new TextEncoder().encode(candidate);
    },
    buildEvidence: code => ({ release_id: releaseId, toolchain: { node: process.version, compiler: 'none-exact-overlay' },
      artifact: { digest: { algorithm: 'sha256', value: digest(code) } },
      preservation: { unrelated_bytes_preserved: true, sections: manifest.sections, manifest_sha256: digest(readFileSync(MANIFEST)) } }),
    verifyActiveModule: async expected => assert.equal(digest(await readModule(process.env.CLOUDFLARE_API_TOKEN, "worker.js")), expected, 'active module digest mismatch'),
    now: () => new Date().toISOString(),
    save: state => writeFileSync(journal, JSON.stringify(state, null, 2), { mode: 0o600 }),
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Rotation release stopped. Inspect receipt; do not retry an uncertain mutation.'); process.exitCode = 1; });
}
