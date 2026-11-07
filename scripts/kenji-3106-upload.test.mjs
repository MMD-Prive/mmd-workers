import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {loadManifest,transport,buildCandidate} from './kenji-3106-upload.mjs';

test('manifest and transport restrict mutations to one Kenji version endpoint',async()=>{
 const m=loadManifest();
 assert.deepEqual(m.upload_targets,['member-dashboard-chat-worker']);
 assert.equal(m.dependencies['admin-worker'].mode,'read_only');
 const writes=[];
 const call=transport('fixture',async(url,init)=>{
  writes.push([url,init.method]);
  return Response.json({success:true,result:{}});
 });
 const root='/accounts/b176eda1172b741fd2e58904cc9d77c5/workers/scripts/';
 const post={method:'POST',body:new FormData()};
 for(const worker of ['admin-worker','member-dashboard-chat-worker']){
  for(const path of ['/deployments','/routes','/secrets','/script-settings'])await assert.rejects(call(root+worker+path,post));
 }
 await assert.rejects(call(root+'admin-worker/versions?bindings_inherit=strict',post));
 await assert.rejects(call(root+'member-dashboard-chat-worker/versions',post));
 assert.throws(()=>buildCandidate(Buffer.from('wrong bytes'),m.workers['member-dashboard-chat-worker']),/baseline bytes drift/);
 assert.deepEqual(writes,[]);
 await call(root+'member-dashboard-chat-worker/versions?bindings_inherit=strict',post);
 assert.equal(writes.length,1);
});

test('workflow limits upload to manual main dispatch and existing Owner approval',()=>{
 const y=readFileSync(new URL('../.github/workflows/kenji-3106-upload-only.yml',import.meta.url),'utf8');
 assert.doesNotMatch(y,/^  push:|^  workflow_run:|^  pull_request_target:/m);
 assert.match(y,/uses: \.\/\.github\/workflows\/admin-production-approval\.yml/);
 assert.match(y,/needs: \[contracts, production-approval\]/);
 assert.match(y,/environment: mmd-production-mutation/);
 assert.equal((y.match(/if: github.event_name == 'workflow_dispatch' && github.ref == 'refs\/heads\/main'/g)||[]).length,2);
 assert.doesNotMatch(y,/wrangler deploy|route-sync|inputs\.mode/);
});
