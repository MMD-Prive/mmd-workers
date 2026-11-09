import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,cpSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const read=p=>readFileSync(p,'utf8');
function run(mutator) {
 const dir=mkdtempSync(join(tmpdir(),'history-overlay-contract-'));
 try {
  for(const entry of ['scripts','events-worker','release','live-baseline.mjs']) cpSync(entry,join(dir,entry),{recursive:true});
  mutator?.(dir);
  const result=spawnSync(process.execPath,['scripts/build-events-history-review-local.mjs'],{cwd:dir,encoding:'utf8'});
  return {result,manifest:result.status===0?JSON.parse(read(join(dir,'release/events-model-rotation/history-review-local-manifest.json'))):null};
 } finally {rmSync(dir,{recursive:true,force:true});}
}
test('local generator is reproducible and explicitly not release-approved',()=>{
 const a=run(),b=run();assert.equal(a.result.status,0,a.result.stderr);assert.equal(b.result.status,0,b.result.stderr);
 assert.equal(a.manifest.candidate_sha256,b.manifest.candidate_sha256);assert.equal(a.manifest.production_execution_permitted,false);
 assert.equal(a.manifest.replacements.length,5);
});
test('live byte drift fails closed',()=>{const {result}=run(dir=>writeFileSync(join(dir,'live-baseline.mjs'),read(join(dir,'live-baseline.mjs'))+'\n'));assert.notEqual(result.status,0);assert.match(result.stderr,/baseline/);});
test('unreviewed runner delta fails closed',()=>{const {result}=run(dir=>writeFileSync(join(dir,'events-worker/src/compcard-daily.js'),read(join(dir,'events-worker/src/compcard-daily.js'))+'\nconst unreviewed = true;'));assert.notEqual(result.status,0);assert.match(result.stderr,/source runner changed/);});
test('unapproved module import fails closed',()=>{const {result}=run(dir=>writeFileSync(join(dir,'events-worker/src/compcard-history-review.js'),read(join(dir,'events-worker/src/compcard-history-review.js'))+"\nimport external from './external.js';"));assert.notEqual(result.status,0);assert.match(result.stderr,/unsupported module/);});
