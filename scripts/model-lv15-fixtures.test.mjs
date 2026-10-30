import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {LV15_FONT_FACES} from '../webflow/sigil/model/model-lv15-fonts.mjs';
import {createModelLv15Preview} from './preview-model-lv15.mjs';
import {makeFixture,fixtureSession,applyFixtureAction} from './model-lv15-fixtures.mjs';

test('synthetic lifecycle enforces allowed actions and session identity without crossing payment gate',()=>{
 for(const world of ['public','private']){
  const f=makeFixture(world),id=fixtureSession(f).session_id;
  assert.equal(applyFixtureAction(f,{action:'start_travel',session_id:'sess_DIFFERENT'}).error,'fixture_session_mismatch');
  assert.equal(f.state,'confirmed');assert.equal(f.revision,1);
  assert.equal(applyFixtureAction(f,{action:'start_work',session_id:id}).ok,false);
  assert.equal(applyFixtureAction(f,{action:'start_travel',session_id:id}).ok,true);assert.equal(f.state,'en_route');
  f.state='final_payment_pending';assert.equal(applyFixtureAction(f,{action:'start_work',session_id:id}).ok,false);
  f.state='work_finished';assert.equal(applyFixtureAction(f,{action:'confirm_separated',session_id:id}).ok,true);assert.equal(f.state,'separated');
 }
});

test('real-source preview pages and in-memory API are isolated from Production',async t=>{
 const {server}=createModelLv15Preview();server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const origin='http://127.0.0.1:'+server.address().port;
 const ref=origin+'/sigil/model/dashboard?fixture_world=public&fixture_state=confirmed&fixture_run=test';
 const request=(pathname,init={})=>fetch(origin+pathname,{...init,headers:{referer:ref,...init.headers}});
 const home=await request('/sigil/model/dashboard?fixture_world=public');
 const homeHtml=await home.text();assert.equal(home.status,200);assert.match(home.headers.get('content-security-policy'),/connect-src 'self'/);
 assert.match(homeHtml,/my-model-workspace-bundle-20261016/);assert.match(homeHtml,/my-model-lovable-vnext-skin-20261017/);assert.match(homeHtml,/LOCAL FIXTURE/);
 assert.doesNotMatch(homeHtml,/<script\b[^>]*\bsrc=["']https?:/i);assert.doesNotMatch(homeHtml,/<script\b[^>]*src=["'](?:\.\/)?app\.js["']/i);
 const consoleHtml=await(await request('/sigil/model/console?fixture_world=public')).text();
 assert.match(consoleHtml,/id="sigil-model-console-v3"/);assert.match(consoleHtml,/i18nRuntimeReady/);assert.match(consoleHtml,/data-primary-actions/);assert.match(consoleHtml,/data-decline-options/);
 const profileHtml=await(await request('/sigil/model/dashboard/profile?fixture_world=public')).text();assert.match(profileHtml,/id="profile-form"/);assert.match(profileHtml,/__preview\/no-send/);
 // Fonts are emitted by the real source layer, never by a preview-only stylesheet.
 for(const html of [homeHtml,consoleHtml,profileHtml]){
  assert.doesNotMatch(html,/\/__lv15\/fonts\.css|\/Users\/|\/private\/tmp\//);
  for(const [, ,url] of LV15_FONT_FACES)assert.ok(html.includes(url),url);
 }
 assert.equal((await request('/__lv15/fonts.css')).status,404);
 const current=await(await request('/v1/model/session/current')).json();assert.equal(current.session.state,'confirmed');
 const wrong=await request('/v1/model/session/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'start_travel',session_id:'sess_WRONG'})});assert.equal(wrong.status,409);
 const action=await request('/v1/model/session/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'start_travel',session_id:current.session.session_id})});assert.equal(action.status,200);
 assert.equal((await(await request('/v1/model/session/current')).json()).session.state,'en_route');
 const blocked=await request('/v1/not-a-fixture',{method:'POST',body:'{}'});assert.equal(blocked.status,405);
 const unknown=await request('/v1/not-a-fixture');assert.equal(unknown.status,404);
 const receipt=await(await request('/__fixture/receipt')).json();assert.equal(receipt.production_requests,0);assert.equal(receipt.local_fixture_only,true);assert.ok(receipt.requests['POST /v1/model/session/action']>=2);assert.doesNotMatch(JSON.stringify(receipt),/sess_WRONG/);
});

test('default fixture resolves relative to the module from an empty working directory',()=>{
 const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'lv15-empty-cwd-'));
 try{
  const moduleUrl=new URL('./preview-model-lv15.mjs',import.meta.url).href;
  const code=`import {createModelLv15Preview} from ${JSON.stringify(moduleUrl)}; const {server}=createModelLv15Preview(); server.close();`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',code],{cwd,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.deepEqual(fs.readdirSync(cwd),[]);
 }finally{fs.rmdirSync(cwd);}
});

test('empty/auth/review/error remain distinct contracts in the mock transport',async t=>{
 const {server}=createModelLv15Preview();server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
 const origin='http://127.0.0.1:'+server.address().port;
 for(const [state,status,error] of [['auth',401,'model_session_required'],['review',403,'identity_review_required'],['error',503,'fixture_unavailable']]){
  const r=await fetch(origin+'/v1/model/session/current',{headers:{referer:origin+'/sigil/model/console?fixture_state='+state}});assert.equal(r.status,status);assert.equal((await r.json()).error,error);
 }
 const dashboard=await fetch(origin+'/v1/model/session/current',{headers:{referer:origin+'/sigil/model/dashboard?fixture_state=empty'}});assert.equal(dashboard.status,404);assert.equal((await dashboard.json()).error,'active_session_not_found');
 const consoleR=await fetch(origin+'/v1/model/session/current',{headers:{referer:origin+'/sigil/model/console?fixture_state=empty'}});assert.equal(consoleR.status,200);assert.equal((await consoleR.json()).session,null);
});
