import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { BASELINE_VERSION, BASELINE_DEPLOYMENT, BASELINE_SOURCE, REVIEW_PATH, ACTIVATION_PATH,
  EXPOSED, validateBaseline, validateSources, reviewClosure, mutationHook, patchApplicationDelete, validateReviewReferences } from './admin-application-delete-overlay.mjs';
import { readLiveModule } from './admin-application-delete-release.mjs';
const review = readFileSync(REVIEW_PATH, 'utf8'), activation = readFileSync(ACTIVATION_PATH, 'utf8');
test('exact reviewed source hashes, not arbitrary main source', () => {
  validateSources();
  assert.throws(() => reviewClosure(review + '\n'), /unreviewed/);
  assert.throws(() => mutationHook(activation + '\n'), /unreviewed/);
  assert.throws(() => validateSources(() => ''), /drift/);
});
test('review closure exports only entrypoints and mutation helper, keeps helpers private', () => {
  const context = { issueModelActivation() {}, resolvePublicCanonicalModel() {}, Response, Request, URL, Headers };
  vm.runInNewContext(reviewClosure(review), context);
  assert.deepEqual(Object.keys(context).filter(x => !['issueModelActivation', 'resolvePublicCanonicalModel', 'Response', 'Request', 'URL', 'Headers'].includes(x)).sort(), [...EXPOSED].sort());
  assert.equal(context.isPublicModelApplicationReviewRequest('/internal/admin/model-applications'), true);
  assert.equal(context.isPublicModelApplicationReviewRequest('/unrelated'), false);
});
test('hook transform removes only lazy helper import; preserves queue and dispatch', () => {
  const block = mutationHook(activation);
  assert.doesNotMatch(block, /import\(/);
  assert.match(block, /this.publicModelReviewQueue \|\| Promise.resolve\(\)/);
  assert.match(block, /handlePublicModelReviewDurableMutation\(this.env, input\)/);
  assert.match(block, /pending.catch\(\(\) => \{\}\)/);
});
test('unknown or modified live bytes fail before replacement', () => {
  assert.throws(() => patchApplicationDelete('unknown', review, activation), /unreviewed live/);
});
test('AST reference guard includes identifiers inside template expressions and rejects private leakage', () => {
  const section = 'function isPublicModelApplicationReviewRequest(){}\nfunction handlePublicModelApplicationReviewRequest(){}\nconst privateHelper=1;\n';
  const good = section + 'isPublicModelApplicationReviewRequest();handlePublicModelApplicationReviewRequest();';
  assert.equal(validateReviewReferences(good, 0, section.length).removed_private_bindings_unreferenced, true);
  assert.throws(() => validateReviewReferences(good + '`${privateHelper}`;', 0, section.length), /outside reference/);
});
test('baseline UUID, source and allocation are all pinned', () => {
  const v = {id: BASELINE_VERSION, annotations: {'workers/commit_sha': BASELINE_SOURCE}, resources: {bindings: [{name:'MODEL_ACTIVATION_COORDINATOR',type:'durable_object_namespace',class_name:'ModelActivationCoordinator',namespace_id:'b660132736884480905af348e5f1b5a4'}]}};
  const d = {id: BASELINE_DEPLOYMENT, strategy:'percentage', versions:[{version_id:BASELINE_VERSION,percentage:100}]};
  validateBaseline(v,d);
  assert.throws(() => validateBaseline({...v,resources:{bindings:[]}},d), /binding missing/);
  for(const key of ['type','class_name','namespace_id']) assert.throws(() => validateBaseline({...v,resources:{bindings:[{...v.resources.bindings[0],[key]:'drift'}]}},d), /drift/);
  assert.throws(() => validateBaseline({...v,id:'drift'},d));
  assert.throws(() => validateBaseline(v,{...d,id:'drift'}));
  assert.throws(() => validateBaseline(v,{...d,versions:[{version_id:BASELINE_VERSION,percentage:50}]}));
});
test('live content reader rejects additional runtime/debug files and wrong filename', async () => {
  const response = entries => { const form = new FormData(); for(const name of entries)form.append(name,new Blob(['test']),name);return new Response(form); };
  assert.equal(await readLiveModule('fixture',async()=>response(['worker.js'])),'test');
  await assert.rejects(readLiveModule('fixture',async()=>response(['worker.js','extra.js'])),/inventory/);
  await assert.rejects(readLiveModule('fixture',async()=>response(['other.js'])),/name/);
});
