import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BASE, RUNTIME, OLD_SECTION_SHA, START, END, digest, patchViewer, normalizeViewerBuild, validateViewerSource, parseWranglerVersion, COPY_CHANGES, patchViewerCopy } from './admin-held-viewer-code-only.mjs';

test('Wrangler plain --version and banner output retain exact version without relaxing the guard', () => {
  for (const output of ['4.105.0\n', ' \u26c5\ufe0f wrangler 4.105.0\n', '\u001b[32m4.105.0\u001b[0m\n']) assert.equal(parseWranglerVersion(output), '4.105.0');
  assert.equal(parseWranglerVersion('4.104.0\n'), '4.104.0');
  for (const output of ['', 'unknown', '4.105.0\n4.104.0', '4.105.0-beta.1', 'some-tool 4.105.0']) assert.throws(() => parseWranglerVersion(output));
  const guard = readFileSync(new URL('./admin-current-session-code-only.mjs', import.meta.url), 'utf8');
  assert.match(guard, /assert.equal\(wranglerVersion, '4\.105\.0'/);
});

const old = START + 'var HELD_REVIEW_COPY = {};\nfunction renderHeldDocumentPage(){ return heldDocumentClient.toString(); }\n\n';
const before = 'var __name = (fn, name) => fn;\n// unrelated gateway, HYPE, MMS, session logic\n' + old + END + 'const unrelated = 42;\n';
const replacement = START + 'var HELD_DOCUMENT_CLIENT = String.raw`function heldDocumentClient(){}`;\n\n';
test('runtime source is fixed to the reviewed copy and regression delta', () => {
  const paths = ['admin-worker/src/held-document-review-ui.js', 'admin-worker/held-document-review-ui.test.mjs', 'admin-worker/held-document-review.test.mjs'];
  validateViewerSource(RUNTIME, paths);
  for (const altered of [[], [...paths, 'admin-worker/wrangler.toml'], [paths[0]]]) assert.throws(() => validateViewerSource(RUNTIME, altered));
  assert.throws(() => validateViewerSource(BASE, paths));
  assert.match(OLD_SECTION_SHA, /^[a-f0-9]{64}$/);
});
test('overlay preserves every unrelated runtime byte and receipts both digests', () => {
  const result = patchViewer(before, replacement, digest(old));
  assert.equal(result.code, before.replace(old, replacement));
  assert.equal(result.preservation.unrelated_runtime_bytes_unchanged, true);
  assert.equal(result.preservation.preserved_runtime_sha256, digest(before.replace(old, '')));
  assert.equal(result.preservation.old_viewer_sha256, digest(old));
});
test('wrong baseline, duplicate/missing markers, extra caller and absent helper stop before upload', () => {
  for (const code of [before.replace('COPY = {}', 'COPY = {changed:1}'), before + START, before + END, before.replace(END, '// missing\n'), before.replace('var __name', 'var different')]) {
    assert.throws(() => patchViewer(code, replacement, digest(old)));
  }
  assert.throws(() => patchViewer(before, replacement));
});
test('compiled overlay strips only compiler scaffolding and export tail', () => {
  const source = 'var __name = ()=>{};\nconst HELD_REVIEW_COPY = {};\nconst HELD_DOCUMENT_CLIENT = String.raw`function heldDocumentClient(copy){}`;\nexport {HELD_DOCUMENT_CLIENT, HELD_REVIEW_COPY, heldDocumentNavigation, renderHeldDocumentPage};\n';
  const value = normalizeViewerBuild(source);
  assert.ok(value.startsWith(START + 'const HELD_REVIEW_COPY'));
  assert.doesNotMatch(value, /export \{|var __name/);
  assert.throws(() => normalizeViewerBuild(source.replace('renderHeldDocumentPage}', 'otherExport}')));
  assert.throws(() => normalizeViewerBuild(source.replace('String.raw', 'heldDocumentClient.toString')));
});
test('release reuses original protected orchestrator and never changes auth/config/route settings', () => {
  const source = readFileSync(new URL('./admin-held-viewer-code-only.mjs', import.meta.url), 'utf8');
  assert.match(source, /await releaseCurrentSession\(/);
  assert.match(source, /await verifyProductionApproval\(/);
  assert.match(source, /inspectEnvironment\(process.env\)/);
  assert.match(source, /validateSourceState\(/);
  assert.match(source, /call: createTransport\(/);
  assert.doesNotMatch(source, /method: ['"](?:PATCH|PUT|DELETE)['"]/);
  assert.doesNotMatch(source, /wrangler.*(?:deploy|secret|triggers)/);
});
test('workflow uses existing protected environment, exact source/main approval and credential-free browser tests', () => {
  const source = readFileSync(new URL('../.github/workflows/deploy-admin-held-viewer-code-only.yml', import.meta.url), 'utf8');
  assert.match(source, /workflow_dispatch:/); assert.match(source, /default: false/);
  assert.match(source, /inputs.approved_sha == github.sha/);
  assert.match(source, /uses: \.\/\.github\/workflows\/admin-production-approval.yml/);
  assert.match(source, /environment: mmd-production-mutation/);
  const contracts = source.split('  production-approval:')[0].split('  contracts:')[1];
  assert.doesNotMatch(contracts, /secrets\.|environment:/);
  assert.match(contracts, /--test-bundle/);
  assert.match(source, /needs: \[production-approval, contracts\]/);
  assert.ok(source.includes("github.event_name == 'workflow_dispatch' && 'deploy-admin-worker-production'"));
  assert.match(source, /format\('held-viewer-contracts-\{0\}', github.ref\)/);
  assert.doesNotMatch(source, /workflow_run:|prevent_self_review|can_admins_bypass/);
});

test('copy-only overlay changes exactly three literals and preserves all other viewer/runtime bytes', () => {
  const fields = COPY_CHANGES.map(c => '  ' + c.key + ': ' + JSON.stringify(c.from) + ',').join('\n');
  const section = START + 'var HELD_REVIEW_COPY = Object.freeze({\n' + fields + '\n  notice: "still unverified",\n});\nconst codeUntouched = 42;\n';
  const code = 'const unrelatedBefore = 1;\n' + section + END + 'const unrelatedAfter = 2;\n';
  const result = patchViewerCopy(code, digest(section));
  for (const c of COPY_CHANGES) assert.ok(result.code.includes(JSON.stringify(c.to)));
  assert.ok(result.code.includes('notice: "still unverified"')); assert.ok(result.code.endsWith(END + 'const unrelatedAfter = 2;\n'));
  assert.equal(result.preservation.non_copy_viewer_bytes_unchanged, true);
  assert.deepEqual(result.preservation.changed_copy_keys, ['title','navigation_label','loading']);
  assert.throws(() => patchViewerCopy(code));
  for (const bad of [section.replace('still unverified', 'changed'), section.replace('title:', 'other:'), section.replace('ภาพรอตรวจ', 'unexpected'), section.replace('  title:', '  title: "duplicate",\n  title:')]) {
    const input = 'before\n' + bad + END;
    if (bad.includes('changed')) assert.throws(() => patchViewerCopy(input, digest(section)));
    else assert.throws(() => patchViewerCopy(input, digest(bad)));
  }
});
test('production adapter uses only the fixed copy patch, never full UI replacement', () => {
  const source = readFileSync(new URL('./admin-held-viewer-code-only.mjs', import.meta.url), 'utf8');
  assert.match(source, /const result = patchViewerCopy\(live.code\)/);
  assert.doesNotMatch(source, /patchViewer\(live.code/);
  assert.match(source, /assert.equal\(baseline.annotations/);
});
