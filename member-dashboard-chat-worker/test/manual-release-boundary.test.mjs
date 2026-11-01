import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('Worker release and route sync cannot be triggered by merge or workflow completion',()=>{
 for(const name of ['deploy-member-dashboard-chat-worker','reconcile-my-mmd-liff-routes','sync-mms-line-routes']){
  const source=readFileSync(new URL('../../.github/workflows/'+name+'.yml',import.meta.url),'utf8');
  const events=source.split('\non:\n')[1].split(/\n\S/)[0];
  assert.match(events,/workflow_dispatch:/);
  assert.doesNotMatch(events,/push:|workflow_run:|pull_request:|schedule:/);
 }
});
test('manual release cannot deploy a sibling, fall back to direct deploy, or create routes',()=>{
 const source=readFileSync(new URL('../../.github/workflows/deploy-member-dashboard-chat-worker.yml',import.meta.url),'utf8');
 assert.match(source,/inputs.approved_sha == github.sha/);
 assert.match(source,/inputs.production_approved == true/);
 assert.doesNotMatch(source,/working-directory: mms-member-worker/);
 assert.doesNotMatch(source,/wrangler(?:@4)? deploy/);
 assert.doesNotMatch(source,/await cf\(routePath, \{ method: "POST"/);
 assert.match(source,/separate route approval required/);
 assert.match(source,/versions deploy/);
 assert.doesNotMatch(source,/public-membership\/purchase|service-binding-smoke\)"/);
 assert.doesNotMatch(source,/name: Authenticated My MMD Payment Center acceptance|name: Smoke internal AI service binding/);
 assert.match(source,/Kenji production model-off contract did not pass/);
});
