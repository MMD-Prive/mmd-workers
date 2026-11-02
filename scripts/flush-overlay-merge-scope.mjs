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
export function isFlushClientOnlyMerge(event,files,before,after){
 if(event!=='push'||!files.includes('admin-ai-ops-worker/src/gate.js')||files.some(f=>!['admin-ai-ops-worker/src/gate.js','admin-ai-ops-worker/media-flush-client.test.mjs','scripts/flush-overlay-merge-scope.mjs','scripts/flush-overlay-merge-scope.test.mjs'].includes(f)))return false;
 const outside=source=>{const marker='const MEDIA_FLUSH_CLIENT_LAYER = String.raw`',start=source.indexOf(marker),stop=source.indexOf('\n})();`;',start),end=stop+'\n})();`;'.length;assert.ok(start>=0&&stop>=start,'FLUSH_CLIENT_BOUNDARY_INVALID');return [source.slice(0,start),source.slice(end)];};
 assert.deepEqual(outside(before),outside(after),'FLUSH_CLIENT_UNRELATED_DELTA');return true;
}
export function isAiOpsDashboardReadMerge(event,files,before,after){
 if(event!=='push'||!files.includes('admin-ai-ops-worker/src/index.js')||files.some(f=>!['admin-ai-ops-worker/src/index.js','admin-ai-ops-worker/test/ai-ops-worker.test.mjs','scripts/flush-overlay-merge-scope.mjs','scripts/flush-overlay-merge-scope.test.mjs'].includes(f)))return false;
 const outside=source=>{const start=source.indexOf('async function readAdminJson('),end=source.indexOf('\nfunction buildAdvisory(',start);assert.ok(start>=0&&end>start,'AI_OPS_READ_BOUNDARY_INVALID');return [source.slice(0,start).replace(/^      sources: intel\.map\(.*$/m,'      sources: dashboard read diagnostics'),source.slice(end)];};
 assert.deepEqual(outside(before),outside(after),'AI_OPS_READ_UNRELATED_DELTA');return true;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const event=process.env.EVENT_NAME;let files=[];
 if(event==='push'){
  for(const sha of [process.env.BEFORE_SHA,process.env.AFTER_SHA])assert.match(sha||'',/^(?!0{40}$)[a-f0-9]{40}$/);
  files=execFileSync('git',['diff','--name-only','--no-renames','-z',process.env.BEFORE_SHA,process.env.AFTER_SHA],{encoding:'utf8'}).split('\0').filter(Boolean);
 }
 const clientOnly=event==='push'&&!files.some(f=>f.startsWith('admin-worker/'))&&files.includes('admin-ai-ops-worker/src/gate.js');
 const gateAt=sha=>execFileSync('git',['show',sha+':admin-ai-ops-worker/src/gate.js'],{encoding:'utf8'});
 const dashboardRead=event==='push'&&files.includes('admin-ai-ops-worker/src/index.js');
 const indexAt=sha=>execFileSync('git',['show',sha+':admin-ai-ops-worker/src/index.js'],{encoding:'utf8'});
 if(isFlushOverlayMerge(event,files)||(clientOnly&&isFlushClientOnlyMerge(event,files,gateAt(process.env.BEFORE_SHA),gateAt(process.env.AFTER_SHA)))||(dashboardRead&&isAiOpsDashboardReadMerge(event,files,indexAt(process.env.BEFORE_SHA),indexAt(process.env.AFTER_SHA)))){
  appendFileSync(process.env.GITHUB_OUTPUT,'deploy_required=false\n');
  console.log('FLUSH-only merge: preserve the owner-approved tested overlays; skip full Worker deploy and route sync.');
 }else execFileSync(process.execPath,['scripts/kenji-pause-release-scope.mjs'],{stdio:'inherit',env:process.env});
}
