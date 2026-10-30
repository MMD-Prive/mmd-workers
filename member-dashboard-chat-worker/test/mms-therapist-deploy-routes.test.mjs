import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const workflow=readFileSync(new URL('../../.github/workflows/deploy-member-dashboard-chat-worker.yml',import.meta.url),'utf8');
const routeBlock=workflow.split('- name: Verify existing MMS Therapist auth and AI smoke routes')[1].split('- name: Smoke production LINE and MMS route ownership')[0];
const script=routeBlock.split("<<'NODE'\n")[1].split('\n          NODE')[0].replace(/^          /gm,'');
const expected=['mmdbkk.com','www.mmdbkk.com'].flatMap(host=>['*','/login*','/me*','/app*','/api/auth/*','/api/app/*'].map(suffix=>host+'/male-massage/therapists'+suffix));
const desiredMatch=script.match(/const desired = (\[[\s\S]*?\]);/);
assert.ok(desiredMatch, 'Read-only route verifier must declare its required routes');
const desired=vm.runInNewContext(desiredMatch[1]);
async function simulate(existing=[]) {
 const routes=existing.map(r=>({...r})), writes=[];
 const context={process:{env:{CLOUDFLARE_ROUTES_API_TOKEN:'test',CLOUDFLARE_ZONE_ID:'test-zone',WORKER_NAME:'member-dashboard-chat-worker'}},console:{log(){}},setTimeout:fn=>fn(),fetch:async(url,options={})=>{
  if((options.method||'GET')!=='GET'){writes.push(options.method);throw new Error('Unexpected route write');}
  return {ok:true,status:200,text:async()=>JSON.stringify({success:true,result:routes})};
 }};
 try { await vm.runInNewContext('(async()=>{'+script+'})()',context); }
 finally { assert.equal(writes.length,0,'Route verification must never write'); }
 return {routes,writes};
}
test('existing complete route set passes read-only verification',async()=>{
 const existing=Array.from(desired,pattern=>({pattern,script:'member-dashboard-chat-worker'}));
 const result=await simulate(existing);assert.equal(result.writes.length,0);
 for(const pattern of expected)assert.ok(result.routes.some(r=>r.pattern===pattern));
});
test('missing routes fail without creating any route',async()=>{
 await assert.rejects(simulate(),/missing required route/);
});
test('conflicting owner fails without changing ownership',async()=>{
 await assert.rejects(simulate([{pattern:expected[1],script:'another-worker'}]),/route conflict/);
});
test('native UI smoke is required before reporting successful production deploy',()=>{
 const enforce=workflow.split('- name: Enforce production deploy success')[1];
 assert.match(enforce,/THERAPIST_UI_SMOKE_OUTCOME/);assert.match(enforce,/steps\.therapist_ui_smoke\.outcome == 'success'/);
 const smoke=workflow.split('- name: Verify native MY THERAPIST entrance and callbacks')[1].split('- name: Smoke MY MMD Private Teaser Viewer route')[0];
 for(const marker of ['native-workspace-v1','mms-therapist-invite-v1','liff.state','THERAPIST_SESSION_REQUIRED'])assert.ok(smoke.includes(marker));
 assert.ok(smoke.includes("for suffix in '' '/login'"));
 assert.ok(smoke.includes('male-massage-ai.4ed6770759e9.png'));
 assert.ok(smoke.includes('4ed6770759e92887e9c6c8eec7941ccb28fa58dd332fe44fea1e06511a9fb5b6'));
});
