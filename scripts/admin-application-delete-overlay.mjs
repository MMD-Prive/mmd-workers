// Pure, pinned overlay builder. Importing this file never accesses production.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parse } from 'acorn';
export const BASELINE_VERSION = '51ae638f-55b5-40f2-a0fb-2a0f7e40c8f5';
export const BASELINE_DEPLOYMENT = '8eb1667c-28d0-4410-896d-9357f979b8a4';
export const BASELINE_SOURCE = '4339243b286e2c4844abd49172a828f25c4f5c1e';
export const FEATURE_SOURCE = 'b830606cdc626db876751b62f938e7d84bec5c4b';
export const LIVE_SHA256 = 'ae3509889e56ea7756be7a913f706461c9cfa5a37b223c45c40b7345904457e5';
export const SECTION_SHA256 = '2aa4b26d11834653bd14d9f0f792443e85d4a84923fbead6eb37f69e8fe4d6ae';
export const REVIEW_PATH = 'admin-worker/src/public-model-application-review.js';
export const ACTIVATION_PATH = 'admin-worker/src/model-first-time-activation.js';
export const SOURCE_HASHES = Object.freeze({
  [REVIEW_PATH]: 'f543c4a7c2052cbf7586c71cbc44bb4ae4aa571d1982dda0dec1b3cfa552f36a',
  [ACTIVATION_PATH]: '3b458a0147f62eb8e4804495665be320387000c8b5bb2ea0af1e8c2aa89b42f5',
});
export const START = '// ../source/admin-worker/src/public-model-application-review.js\n';
export const END = '\n// ../source/admin-worker/src/admin-login-hero-worker-core.js\n';
export const HOOK = '  async fetch(request) {\n    const url = new URL(request.url);\n    if (url.pathname === "/phase-a") return handlePhaseADurableRequest(this.state, this.env, request);';
export const EXPOSED = ['isPublicModelApplicationReviewRequest', 'handlePublicModelApplicationReviewRequest', 'handlePublicModelReviewDurableMutation'];
export const digest = value => createHash('sha256').update(value).digest('hex');
export function validateSources(read = path => readFileSync(path, 'utf8')) {
  for (const [path, hash] of Object.entries(SOURCE_HASHES)) assert.equal(digest(read(path)), hash, 'reviewed source drift: ' + path);
}
export function validateBaseline(version, deployment) {
  assert.equal(version.id, BASELINE_VERSION, 'active version drift');
  assert.equal(deployment.id, BASELINE_DEPLOYMENT, 'active deployment drift');
  assert.equal(version.annotations?.['workers/commit_sha'], BASELINE_SOURCE, 'baseline source drift');
  const coordinator = version.resources?.bindings?.filter(binding => binding.name === 'MODEL_ACTIVATION_COORDINATOR');
  assert.equal(coordinator?.length, 1, 'application coordinator binding missing or ambiguous');
  assert.equal(coordinator[0].type, 'durable_object_namespace', 'application coordinator binding type drift');
  assert.equal(coordinator[0].class_name, 'ModelActivationCoordinator', 'application coordinator class drift');
  assert.equal(coordinator[0].namespace_id, 'b660132736884480905af348e5f1b5a4', 'application coordinator namespace drift');
  assert.deepEqual(deployment.versions, [{ version_id: BASELINE_VERSION, percentage: 100 }]);
  assert.equal(deployment.strategy, 'percentage');
}
export function reviewClosure(source) {
  assert.equal(digest(source), SOURCE_HASHES[REVIEW_PATH], 'unreviewed review source');
  const imports = source.match(/^import .*;$/gm);
  assert.deepEqual(imports, ['import { issueModelActivation, resolvePublicCanonicalModel } from "./model-first-time-activation.js";']);
  const plain = source.replace(imports[0], '').replace(/^export /gm, '');
  assert.doesNotMatch(plain, /^import |^export /m);
  // No compiler/global identifier rewriting: native source stays inside one lexical scope.
  return START + 'var { ' + EXPOSED.join(', ') + ' } = ((issueModelActivation, resolvePublicCanonicalModel) => {\n'
    + plain + '\nreturn { ' + EXPOSED.join(', ') + ' };\n})(issueModelActivation, resolvePublicCanonicalModel);\n';
}
export function mutationHook(source) {
  assert.equal(digest(source), SOURCE_HASHES[ACTIVATION_PATH], 'unreviewed activation source');
  const start = source.indexOf('    if (url.pathname === "/public-model-review"');
  const end = source.indexOf('    if (url.pathname === "/phase-a")', start);
  assert.ok(start > 0 && end > start, 'review mutation block missing');
  const block = source.slice(start, end);
  const lazy = '        const { handlePublicModelReviewDurableMutation } = await import("./public-model-application-review.js");\n';
  assert.equal(block.split(lazy).length, 2);
  // The same trusted module is already initialized in the enclosing Worker. Only
  // substitute dependency resolution; retain queue, error and response behavior.
  return block.replace(lazy, '').replace('        // Lazy import avoids a static cycle with the review module\'s activation helpers.\n', '');
}
export function validateReviewReferences(live, start, end) {
  const ast = parse(live, { ecmaVersion: 'latest', sourceType: 'module' });
  const names = ast.body.filter(n => n.start >= start && n.end <= end).flatMap(n =>
    n.type === 'FunctionDeclaration' ? [n.id.name] : n.type === 'VariableDeclaration'
      ? n.declarations.map(d => { assert.equal(d.id.type, 'Identifier'); return d.id.name; }) : []);
  const wanted = new Set(names), outside = new Set();
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.start >= start && node.end <= end) return;
    if (node.type === 'Identifier' && wanted.has(node.name)) outside.add(node.name);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  }
  walk(ast);
  assert.deepEqual([...outside].sort(), EXPOSED.slice(0, 2).sort(), 'removed review binding has an outside reference');
  return { old_top_level_binding_count: names.length, referenced_outside_section: [...outside].sort(),
    removed_private_bindings_unreferenced: true, method: 'acorn-all-outside-identifiers-including-template-expressions' };
}
export function patchApplicationDelete(live, review, activation) {
  assert.equal(digest(live), LIVE_SHA256, 'unreviewed live module bytes');
  assert.equal(live.split(START).length, 2, 'ambiguous review section');
  const start = live.indexOf(START), end = live.indexOf(END, start);
  assert.ok(end > start, 'missing review section end');
  const old = live.slice(start, end);
  assert.equal(digest(old), SECTION_SHA256, 'review section drift');
  assert.equal(live.split(HOOK).length, 2, 'ambiguous activation hook');
  assert.doesNotMatch(live, /\bhandlePublicModelReviewDurableMutation\b/, 'mutation name collision');
  const references = validateReviewReferences(live, start, end);
  const replacement = reviewClosure(review), block = mutationHook(activation);
  const hook = HOOK.replace('    if (url.pathname === "/phase-a")', block + '    if (url.pathname === "/phase-a")');
  const next = (live.slice(0, start) + replacement + live.slice(end)).replace(HOOK, hook);
  const restored = next.replace(replacement, old).replace(hook, HOOK);
  assert.equal(restored, live, 'unrelated live runtime bytes changed');
  const outside = live.slice(0, start) + live.slice(end);
  return { code: next, closure: replacement, hook: block, preservation: {
    reference_contract: references, baseline_sha256: digest(live), candidate_sha256: digest(next), old_review_sha256: digest(old),
    new_review_sha256: digest(replacement), old_hook_sha256: digest(HOOK), new_hook_sha256: digest(hook),
    unrelated_runtime_bytes_unchanged: true, reverse_patch_equals_baseline: true,
    runtime_paths: [REVIEW_PATH, ACTIVATION_PATH], dependency_resolution_transform: 'direct-same-module-helper',
    preserved_runtime_sha256: digest(outside.replace(HOOK, '')),
  } };
}
