import test from 'node:test';
import assert from 'node:assert/strict';
import {isFlushOverlayMerge,isFlushClientOnlyMerge,FLUSH_OVERLAY_PATHS} from './flush-overlay-merge-scope.mjs';
test('the exact FLUSH merge preserves the tested production overlays',()=>{
 assert.equal(isFlushOverlayMerge('push',[...FLUSH_OVERLAY_PATHS]),true);
});
test('client-only FLUSH merges skip full deploy only when all bytes outside the client are identical',()=>{
 const before='const auth="preserve";\nconst MEDIA_FLUSH_CLIENT_LAYER = String.raw`old\n})();`;\nconst tail="preserve";',after=before.replace('`old','`new'),files=['admin-ai-ops-worker/src/gate.js','admin-ai-ops-worker/media-flush-client.test.mjs','scripts/flush-overlay-merge-scope.mjs','scripts/flush-overlay-merge-scope.test.mjs'];
 assert.equal(isFlushClientOnlyMerge('push',files,before,after),true);assert.throws(()=>isFlushClientOnlyMerge('push',files,before,after.replace('auth="preserve"','auth="changed"')),/UNRELATED/);assert.throws(()=>isFlushClientOnlyMerge('push',files,before,after.replace('tail="preserve"','tail="changed"')),/UNRELATED/);assert.equal(isFlushClientOnlyMerge('push',[...files,'admin-ai-ops-worker/src/smart-matching.js'],before,after),false);assert.equal(isFlushClientOnlyMerge('workflow_dispatch',files,before,after),false);
});
test('manual dispatch and unrelated AI Ops releases retain the existing policy',()=>{
 assert.equal(isFlushOverlayMerge('workflow_dispatch',[...FLUSH_OVERLAY_PATHS]),false);
 assert.equal(isFlushOverlayMerge('push',['admin-ai-ops-worker/src/gate.js','admin-ai-ops-worker/src/smart-matching.js']),false);
});
test('a mixed FLUSH delta fails closed instead of falling through to route sync',()=>{
 for(const extra of ['payments-worker/src/index.js','admin-worker/wrangler.toml','admin-worker/src/credential-bound-admin-session.js']){
  assert.throws(()=>isFlushOverlayMerge('push',['admin-worker/src/model-media-flush-preview.js',extra]),/FLUSH_MIXED_DELTA/);
 }
 assert.throws(()=>isFlushOverlayMerge('push',[]),/Empty merge delta/);
});
