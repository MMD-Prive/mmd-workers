// Offline only. Build a candidate from an exact, freshly downloaded module.
// No Cloudflare transport, upload, flag change or production deployment.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const manifest=JSON.parse(readFileSync(new URL('../release/renewal-recheck-20261104/artifact-delta.json',import.meta.url)));
const hash=s=>createHash('sha256').update(s).digest('hex');
export function buildRenewalRecheckArtifact(name,baseline) {
  const spec=manifest.workers[name]; assert.ok(spec,'unsupported Worker');
  assert.equal(hash(baseline),spec.baseline_sha256,'active artifact drift: rebase before release');
  let candidate=baseline;
  for(const e of spec.edits) {
    assert.equal(hash(e.before),e.before_sha256);assert.equal(hash(e.after),e.after_sha256);
    assert.equal(candidate.split(e.before).length,2,'ambiguous artifact anchor');
    candidate=candidate.replace(e.before,e.after);
  }
  assert.equal(hash(candidate),spec.candidate_sha256);
  let reversed=candidate;
  for(const e of [...spec.edits].reverse())reversed=reversed.replace(e.after,e.before);
  assert.equal(reversed,baseline,'unreviewed artifact changes');
  return candidate;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const [name,input,output]=process.argv.slice(2);
  assert.ok(input && output && input!==output,'usage: node scripts/renewal-recheck-artifact.mjs WORKER BASELINE OUTPUT');
  writeFileSync(output,buildRenewalRecheckArtifact(name,readFileSync(input,'utf8')),{flag:'wx'});
}
