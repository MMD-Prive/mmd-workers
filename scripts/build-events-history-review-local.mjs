// Local preparation only. No API, credentials, upload, dispatch, or production execution.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { applyRotationOverlay, digest } from './events-model-rotation-release.mjs';
const read = path => readFileSync(path, 'utf8');
const old = JSON.parse(read('release/events-model-rotation/pr3138-overlay-manifest.json'));
const baseline = read('live-baseline.mjs');
let candidate = applyRotationOverlay(baseline, old);
const reviewedRunner = read('release/events-model-rotation/reviewed-compcard-daily.js');
const expectedRunner = ("import { checkPublicationHistory } from './compcard-history-review.js';\n" + reviewedRunner)
 .replace('    model_ready: false, standard_ready:', '    publication_review: { status: "required_at_plan_and_presend", clearance_cached: false },\n    model_ready: false, standard_ready:')
 .replace('      const destinations = destinationsForModelSlot(card.category, slot);', '      const destinations = destinationsForModelSlot(card.category, slot);\n      const review = await checkPublicationHistory(bucket, card, manifest.destinations, slot, wallClock(), destinations);\n      if (!review.allowed) return { date, slot, status: "publication_review_hold", sent: 0, review };')
 .replace('        if (modelSlot) await reserveCompcardExposure(bucket, card, date, now);', '        if (modelSlot) {\n          const review = await checkPublicationHistory(bucket, card, manifest.destinations, slot, wallClock(), plan.destinations);\n          if (!review.allowed) throw problem("compcard_publication_review_hold", false);\n          await reserveCompcardExposure(bucket, card, date, now);\n        }')
 .replace('["no_approved_promotion", "no_eligible_card", "not_ready"].includes(result.status)', '["no_approved_promotion", "no_eligible_card", "not_ready", "publication_review_hold"].includes(result.status)');
assert.equal(read('events-worker/src/compcard-daily.js').trimEnd(), expectedRunner.trimEnd(), 'source runner changed beyond reviewed history hooks');
const history = read('events-worker/src/compcard-history-review.js');
let body = history.replace("import { readCompcardJson, writeCompcardJson } from './compcard-journal.js';\n", '').replace("import { automaticModelAllowed } from './compcard-policy.js';\n", '').replace(/^export /gm, '');
assert.doesNotMatch(body, /^\s*(?:import|export)\b/m, 'unsupported module import/export');
assert.doesNotMatch(candidate, /\bpublicationHistoryReview\b|\bcheckPublicationHistory\b/);
const exports = [...history.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map(match => match[1]);
assert.ok(exports.includes('checkPublicationHistory'));
const insertion = `const publicationHistoryReview = (() => {\n${body}\nreturn { ${exports.join(', ')} };\n})();\nconst checkPublicationHistory = publicationHistoryReview.checkPublicationHistory;\n`;
const changes = [
 { section:'compcard-daily', before:'    business_writes: 0,\n    model_ready: false,', after:'    business_writes: 0,\n    publication_review: { status: "required_at_plan_and_presend", clearance_cached: false },\n    model_ready: false,' },
 { section:'compcard-daily', before:'var TELEGRAM_ORIGIN = "https://telegram-worker.malemodel-bkk.workers.dev";', after:insertion + 'var TELEGRAM_ORIGIN = "https://telegram-worker.malemodel-bkk.workers.dev";' },
 { section:'compcard-daily', before:'      const destinations = destinationsForModelSlot(card2.category, slot);\n', after:'      const destinations = destinationsForModelSlot(card2.category, slot);\n      const review = await checkPublicationHistory(bucket, card2, manifest.destinations, slot, wallClock(), destinations);\n      if (!review.allowed) return { date, slot, status: "publication_review_hold", sent: 0, review };\n' },
 { section:'compcard-daily', before:'          if (modelSlot) await reserveCompcardExposure(bucket, card, date, now);', after:'          if (modelSlot) {\n            const review = await checkPublicationHistory(bucket, card, manifest.destinations, slot, wallClock(), plan.destinations);\n            if (!review.allowed) throw problem("compcard_publication_review_hold", false);\n            await reserveCompcardExposure(bucket, card, date, now);\n          }' },
 { section:'compcard-daily', before:'["no_approved_promotion", "no_eligible_card", "not_ready"].includes(result2.status)', after:'["no_approved_promotion", "no_eligible_card", "not_ready", "publication_review_hold"].includes(result2.status)' }
];
for (const change of changes) {
 const index = candidate.indexOf(change.before);
 assert.ok(index >= 0 && candidate.indexOf(change.before, index+change.before.length) < 0, 'anchor missing/ambiguous');
 candidate = candidate.slice(0,index)+change.after+candidate.slice(index+change.before.length);
}
let reversed = candidate;
for (const change of [...changes].reverse()) reversed = reversed.replace(change.after, change.before);
assert.equal(digest(reversed), old.candidate_sha256, 'unrelated byte drift');
const manifest = { status:'safe_hold_candidate_requires_protected_release', production_execution_permitted:false,
 baseline_sha256:old.baseline_sha256, prior_candidate_sha256:old.candidate_sha256,
 candidate_sha256:digest(candidate), source_module_sha256:digest(history),
 source_runner_sha256:digest(read('events-worker/src/compcard-daily.js')),
 expected_version:old.expected_version, expected_deployment:old.expected_deployment,
 provenance:'existing reviewed overlay plus isolated history module and three runner hook replacements',
 warning_delivery:'outbox only; no verified owner notification route',
 requirements:['new source and overlay review','protected environment review','fresh baseline/configuration checks'],
 replacements:changes };
writeFileSync('release/events-model-rotation/history-review-local-candidate.mjs', candidate);
writeFileSync('release/events-model-rotation/history-review-local-manifest.json',JSON.stringify(manifest,null,2)+'\n');
writeFileSync('release/events-model-rotation/history-review-testable.mjs',candidate+'\nexport { publicationHistoryReview };\n');
const releaseManifest = { ...old, release_scope: 'safe_hold_all_models_three_calendar_month_review', candidate_sha256:manifest.candidate_sha256, source_module_sha256:manifest.source_module_sha256, source_runner_sha256:manifest.source_runner_sha256, warning_delivery:manifest.warning_delivery, operational_effect:'all model posts may pause until contemporaneous complete evidence exists; warnings remain undelivered', replacements:[...old.replacements,...changes] };
const section = (code,name) => { const start=code.indexOf('// src/'+name+'.js'); const end=code.indexOf('\n// src/',start+1); return code.slice(start,end<0?undefined:end); };
releaseManifest.sections = old.sections.map(row=>({...row,baseline_sha256:digest(section(baseline,row.name)),candidate_sha256:digest(section(candidate,row.name))}));
assert.equal(applyRotationOverlay(baseline, releaseManifest), candidate);
writeFileSync('release/events-model-rotation/overlay-manifest.json',JSON.stringify(releaseManifest,null,2)+'\n');
console.log(JSON.stringify({candidate_sha256:manifest.candidate_sha256,baseline_sha256:old.baseline_sha256,source_module_sha256:manifest.source_module_sha256,reversible:true,production_execution_permitted:false}));
