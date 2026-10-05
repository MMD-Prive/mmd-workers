import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const workflow=readFileSync(new URL('../../.github/workflows/deploy-member-dashboard-chat-worker.yml',import.meta.url),'utf8');
const routeBlock=workflow.split('- name: Sync MMS Therapist auth and AI smoke routes')[1].split('- name: Smoke production LINE and MMS route ownership')[0];
const script=routeBlock.split("<<'NODE'\n")[1].split('\n          NODE')[0].replace(/^          /gm,'');
const expected=['mmdbkk.com','www.mmdbkk.com'].flatMap(host=>['','/login*','/me*','/app*','/api/auth/*','/api/app/*'].map(suffix=>host+'/male-massage/therapists'+suffix));
async function simulate(existing=[]) {
 const routes=existing.map(r=>({...r})), writes=[];
 const context={process:{env:{CLOUDFLARE_ROUTES_API_TOKEN:'test',CLOUDFLARE_ZONE_ID:'test-zone',WORKER_NAME:'member-dashboard-chat-worker'}},console:{log(){}},setTimeout:fn=>fn(),fetch:async(url,options={})=>{
  if(options.method==='POST'){const body=JSON.parse(options.body);writes.push(body);routes.push(body);return {ok:true,status:200,text:async()=>JSON.stringify({success:true,result:body})};}
  return {ok:true,status:200,text:async()=>JSON.stringify({success:true,result:routes})};
 }};
 await vm.runInNewContext('(async()=>{'+script+'})()',context);
 return {routes,writes};
}
test('primary deploy installs native Therapist pages, callback endpoint and APIs for both hosts',async()=>{
 const result=await simulate();for(const pattern of expected)assert.ok(result.routes.some(r=>r.pattern===pattern&&r.script==='member-dashboard-chat-worker'),pattern);
 assert.ok(result.routes.every(r=>!r.pattern.includes('therapists/*')));
});
test('already synced routes are not created twice',async()=>{
 const first=await simulate(), second=await simulate(first.routes);assert.equal(second.writes.length,0);
});
test('route conflict fails before creating any route',async()=>{
 await assert.rejects(simulate([{pattern:expected[1],script:'another-worker'}]),/route conflict/);
});
test('native UI smoke is required before reporting successful production deploy',()=>{
 const enforce=workflow.split('- name: Enforce production deploy success')[1];
 assert.match(enforce,/THERAPIST_UI_SMOKE_OUTCOME/);assert.match(enforce,/steps\.therapist_ui_smoke\.outcome == 'success'/);
 const smoke=workflow.split('- name: Verify native MY THERAPIST entrance and callbacks')[1].split('- name: Smoke MY MMD Private Teaser Viewer route')[0];
 for(const marker of ['native-workspace-v1','mms-therapist-invite-v1','liff.state','THERAPIST_SESSION_REQUIRED'])assert.ok(smoke.includes(marker));
});
