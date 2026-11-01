import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const FLUSH_OVERLAY_PATHS=new Set([
 'admin-worker/src/model-media-flush-preview.js','admin-worker/src/new-model-production.mjs',
 'admin-worker/new-model-production.test.mjs','admin-worker/model-media-flush-preview.test.mjs',
 'admin-ai-ops-worker/src/gate.js','admin-ai-ops-worker/media-flush-client.test.mjs',
 'admin-ai-ops-worker/test/manual-media-flush.test.mjs',
 '.github/workflows/per-ai-ops-manual-flush-ci.yml','.github/workflows/deploy-admin-ai-ops-worker.yml',
 'scripts/flush-overlay-merge-scope.mjs','scripts/flush-overlay-merge-scope.test.mjs',
]);
export function isFlushOverlayMerge(event,files){
 if(event!=='push')return false;
 assert.ok(files.length,'Empty merge delta; stop');
 if(!files.some(f=>f==='admin-worker/src/model-media-flush-preview.js'||f==='admin-worker/src/new-model-production.mjs'))return false;
 assert.ok(files.every(f=>FLUSH_OVERLAY_PATHS.has(f)),'FLUSH_MIXED_DELTA: stop; separately review the release');
 return true;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const event=process.env.EVENT_NAME;let files=[];
 if(event==='push'){
  for(const sha of [process.env.BEFORE_SHA,process.env.AFTER_SHA])assert.match(sha||'',/^(?!0{40}$)[a-f0-9]{40}$/);
  files=execFileSync('git',['diff','--name-only','--no-renames','-z',process.env.BEFORE_SHA,process.env.AFTER_SHA],{encoding:'utf8'}).split('\0').filter(Boolean);
 }
 if(isFlushOverlayMerge(event,files)){
  appendFileSync(process.env.GITHUB_OUTPUT,'deploy_required=false\n');
  console.log('FLUSH-only merge: preserve the owner-approved tested overlays; skip full Worker deploy and route sync.');
 }else execFileSync(process.execPath,['scripts/kenji-pause-release-scope.mjs'],{stdio:'inherit',env:process.env});
}
