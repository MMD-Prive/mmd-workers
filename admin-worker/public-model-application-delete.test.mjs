import { installReviewTestCoordinator } from './public-model-review-test-coordinator.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { handlePublicModelApplicationReviewRequest as handle, PUBLIC_MODEL_REVIEW_FIELDS as F, PUBLIC_MODEL_ASSET_FIELDS as A } from './src/public-model-application-review.js';
const ROOT='https://mmdbkk.com', ID='pma_fixture_delete01', OTHER='pma_fixture_other001', TABLE='tblwUa8ySWln8OfaJ';
const owner={id:'per',role:'owner',auth_method:'credential'};
function fixture(overrides={}) {
  const first={id:'recApplication001',fields:{[F.applicationId]:ID,[F.applicationType]:'public_model',[F.nickname]:'Fixture Alpha',[F.intakeStatus]:'private_review_pending',[F.summaryJson]:JSON.stringify({photos_count:1,keep:{important:true}}),[F.status]:'New',[F.reviewStatus]:'pending_review',[F.canonicalModel]:['recLinkedModel001'],[F.payloadJson]:'{"intro":"preserve"}',...overrides}};
  const other={id:'recApplication002',fields:{...first.fields,[F.applicationId]:OTHER,[F.nickname]:'Fixture Beta'}};
  const records=[first,other], calls=[];
  const env={AIRTABLE_API_KEY:'fixture-only',PUBLIC_MODEL_UPLOADS_R2:{async get(){return {body:new Uint8Array([1,2,3]),httpMetadata:{contentType:'image/jpeg'}}}},AIRTABLE_FETCH:async (url,init={})=>{
    const u=new URL(url),method=init.method||'GET',body=init.body&&JSON.parse(init.body);calls.push({u,method,body});
    if(method==='GET'&&u.pathname.endsWith('/'+TABLE)) {
      const f=u.searchParams.get('filterByFormula');
      let rows=records;
      const exact=f.match(/^\{application_id\}='([^']+)'$/);
      if(exact)rows=rows.filter(x=>x.fields[F.applicationId]===exact[1]);
      else if(f.includes("{public_model_intake_status}!='owner_deleted'"))rows=rows.filter(x=>x.fields[F.intakeStatus]!=='owner_deleted');
      else if(f.includes("{public_model_intake_status}='owner_deleted'"))rows=rows.filter(x=>x.fields[F.intakeStatus]==='owner_deleted');
      else throw new Error('Queue must filter in Airtable before applying limit');
      return Response.json({records:rows.slice(0,Number(u.searchParams.get('maxRecords')))});
    }
    if(method==='PATCH'&&u.pathname.includes('/'+TABLE+'/')){
      const rec=records.find(x=>u.pathname.endsWith('/'+x.id));assert.ok(rec);Object.assign(rec.fields,body.fields);return Response.json(rec);
    }
    if(method==='GET'&&u.pathname.endsWith('/tblEhg3dsFzPERpNQ'))return Response.json({records:[{id:'recAssetFixture01',fields:{[A.applicationId]:ID,[A.assetId]:'pmua_fixture00001',[A.kind]:'photo',[A.uploadStatus]:'attached',[A.bucket]:'mmd-private-public-model-uploads',[A.objectKey]:'fixture.jpg',[A.contentType]:'image/jpeg'}}]});
    throw new Error('Unexpected external action '+method+' '+u.pathname);
  }};
  installReviewTestCoordinator(env);
  return {env,records,calls};
}
const request=(action,body={confirm_application_id:ID},origin=ROOT)=>new Request(ROOT+'/v1/admin/model-applications/'+ID+'/'+action,{method:'POST',headers:{Origin:origin,'content-type':'application/json'},body:JSON.stringify(body)});
const read=(path,s)=>handle(new Request(ROOT+'/v1/admin/model-applications'+path),s.env,owner).then(r=>r.json());
test('delete moves only the selected application to trash, retains assets and linked Model, and restore returns original state',async()=>{
  const s=fixture(),before=structuredClone(s.records);
  assert.equal((await handle(request('delete'),s.env,owner)).status,200);
  assert.deepEqual(s.records[1],before[1]);
  const changed=Object.keys(s.records[0].fields).filter(k=>JSON.stringify(s.records[0].fields[k])!==JSON.stringify(before[0].fields[k]));
  assert.deepEqual(changed.sort(),[F.intakeStatus,F.summaryJson].sort());
  assert.deepEqual((await read('',s)).applications.map(x=>x.application_id),[OTHER]);
  assert.deepEqual((await read('?view=deleted',s)).applications.map(x=>x.application_id),[ID]);
  const detail=await read('/'+ID,s);assert.equal(detail.application.deleted,true);assert.equal(detail.application.assets.length,1);
  assert.equal((await handle(request('restore'),s.env,owner)).status,200);
  assert.equal(s.records[0].fields[F.intakeStatus],before[0].fields[F.intakeStatus]);
  const summary=JSON.parse(s.records[0].fields[F.summaryJson]);assert.deepEqual(summary.keep,{important:true});assert.equal(summary.photos_count,1);assert.equal(summary.owner_review_deletion.restored_by,'per');
  assert.equal((await read('?view=deleted',s)).applications.length,0);
  assert.equal((await read('',s)).applications.length,2);
  assert.ok(s.calls.filter(x=>x.method!=='GET').every(x=>x.method==='PATCH'&&x.u.pathname.endsWith('/'+before[0].id)));
});
test('repeated delete and restore calls are idempotent and do not overwrite the saved original status',async()=>{
  const s=fixture();for(const action of ['delete','delete','restore','restore'])assert.equal((await handle(request(action),s.env,owner)).status,200);
  assert.equal(s.calls.filter(x=>x.method==='PATCH').length,2);assert.equal(s.records[0].fields[F.intakeStatus],'private_review_pending');
});
test('delete/restore require the exact owner credential session and same origin before any backend read or write',async()=>{
  for(const action of ['delete','restore'])for(const actor of [null,{id:'per'},{id:'per',role:'owner',auth_method:'token'},{id:'other',role:'owner',auth_method:'credential'}]){
    const s=fixture();assert.equal((await handle(request(action),s.env,actor)).status,403);assert.equal(s.calls.length,0);
  }
  for(const origin of ['', 'https://evil.example','https://www.mmdbkk.com']){const s=fixture();assert.equal((await handle(request('delete',undefined,origin),s.env,owner)).status,403);assert.equal(s.calls.length,0);}
});
test('confirmation must name the exact application; malformed JSON does not write',async()=>{
  for(const body of [{},{confirm_application_id:OTHER},{confirm_application_id:[ID]}]){const s=fixture();assert.equal((await handle(request('delete',body),s.env,owner)).status,400);assert.equal(s.calls.length,0);}
  const s=fixture();const r=new Request(ROOT+'/v1/admin/model-applications/'+ID+'/delete',{method:'POST',headers:{Origin:ROOT},body:'{'});assert.equal((await handle(r,s.env,owner)).status,400);assert.equal(s.calls.length,0);
});
test('unknown application and wrong application type cannot mutate records',async()=>{
  const s=fixture({[F.applicationType]:'private_model'});assert.equal((await handle(request('delete'),s.env,owner)).status,409);assert.equal(s.calls.filter(x=>x.method==='PATCH').length,0);
  const r=new Request(ROOT+'/v1/admin/model-applications/pma_missing_fixture/delete',{method:'POST',headers:{Origin:ROOT},body:JSON.stringify({confirm_application_id:'pma_missing_fixture'})});assert.equal((await handle(r,s.env,owner)).status,404);
});
test('malformed summary and missing original state fail closed rather than discarding data or guessing',async()=>{
  for(const raw of ['{','[]','null']){const s=fixture({[F.summaryJson]:raw});assert.equal((await handle(request('delete'),s.env,owner)).status,409);assert.equal(s.calls.filter(x=>x.method==='PATCH').length,0);}
  const s=fixture({[F.intakeStatus]:'owner_deleted'});assert.equal((await handle(request('restore'),s.env,owner)).status,409);assert.equal(s.calls.filter(x=>x.method==='PATCH').length,0);
});
test('trash blocks decision, role publication and onboarding writes until restored',async()=>{
  const s=fixture();await handle(request('delete'),s.env,owner);const count=s.calls.filter(x=>x.method==='PATCH').length;
  for(const [action,body] of [['decision',{decision:'approve'}],['role-policy',{public_profile_approved:true}],['onboarding',{}]]){
    const r=await handle(request(action,body),s.env,owner);assert.equal(r.status,409);assert.equal((await r.json()).error,'application_deleted_restore_required');
  }
  assert.equal(s.calls.filter(x=>x.method==='PATCH').length,count);
});
test('backend failures and unverified write responses are never reported as success',async()=>{
  const s=fixture();const original=s.env.AIRTABLE_FETCH;
  s.env.AIRTABLE_FETCH=(url,init)=>init.method==='PATCH'?Response.json({error:{type:'FAILURE'}},{status:503}):original(url,init);
  assert.equal((await handle(request('delete'),s.env,owner)).status,502);assert.equal(s.records[0].fields[F.intakeStatus],'private_review_pending');
  s.env.AIRTABLE_FETCH=(url,init)=>init.method==='PATCH'?Response.json({id:s.records[0].id,fields:{}}):original(url,init);
  assert.equal((await handle(request('delete'),s.env,owner)).status,502);
});
test('missing intake status is restored as empty rather than inventing a business state',async()=>{
  const s=fixture({[F.intakeStatus]:''});await handle(request('delete'),s.env,owner);await handle(request('restore'),s.env,owner);assert.equal(s.records[0].fields[F.intakeStatus],'');
});
async function browserScript(actor=owner){const r=await handle(new Request(ROOT+'/internal/admin/model-applications'),{},actor);const html=await r.text();return {html,script:html.match(/<script>([\s\S]*?)<\/script>/)[1]};}
async function ui(confirmResult=true,fail=false){
  const {script}=await browserScript(),app={querySelectorAll:()=>[]},actions={querySelectorAll:()=>[]},button={disabled:false},calls=[],navigations=[],prompts=[],alerts=[];
  let resolvePost;const post=new Promise(r=>resolvePost=r);
  const context={document:{querySelector:s=>s==='#app'?app:actions,querySelectorAll:()=>[button]},URL,location:{href:ROOT+'/internal/admin/model-applications',assign:url=>navigations.push(url)},confirm:question=>{prompts.push(question);return confirmResult},alert:message=>alerts.push(message),fetch:async(path,init)=>{calls.push({path,init});if(init?.method==='POST'){await post;return Response.json(fail?{ok:false,error:'fixture_failure'}:{ok:true},{status:fail?502:200})}return Response.json({ok:true,applications:[]})}};
  vm.createContext(context);vm.runInContext(script,context);await new Promise(r=>setImmediate(r));
  return {context,app,actions,button,calls,navigations,prompts,alerts,resolvePost};
}
test('UI exposes trash navigation and owner-only deletion on list and detail; generated script compiles',async()=>{
  const {html,script}=await browserScript();new vm.Script(script);assert.match(html,/ถังขยะ \/ กู้คืน/);assert.match(script,/canManageApplications=true/);assert.match(script,/Delete · ลบใบสมัคร/);assert.match(script,/กู้คืนใบสมัคร/);
  assert.match((await browserScript({id:'other'})).script,/canManageApplications=false/);
});
test('Cancel leaves UI and data unchanged, with applicant name and id in confirmation',async()=>{
  const s=await ui(false);await vm.runInContext(`changeDeletion({application_id:'${ID}',nickname:'Fixture Alpha'})`,s.context);
  assert.equal(s.calls.filter(x=>x.init?.method==='POST').length,0);assert.equal(s.navigations.length,0);assert.match(s.prompts[0],/Fixture Alpha/);assert.ok(s.prompts[0].includes(ID));assert.equal(s.button.disabled,false);
});
test('UI serializes repeated clicks and navigates to trash only after confirmed success',async()=>{
  const s=await ui();const first=vm.runInContext(`changeDeletion({application_id:'${ID}',nickname:'Fixture Alpha'})`,s.context);
  await vm.runInContext(`changeDeletion({application_id:'${ID}',nickname:'Fixture Alpha'})`,s.context);
  assert.equal(s.button.disabled,true);assert.equal(s.navigations.length,0);assert.equal(s.calls.filter(x=>x.init?.method==='POST').length,1);
  s.resolvePost();await first;assert.deepEqual(s.navigations,['/internal/admin/model-applications?view=deleted']);assert.equal(s.button.disabled,false);
});
test('UI failure preserves current page and permits retry; restore returns to the active list',async()=>{
  const s=await ui(true,true);const promise=vm.runInContext(`changeDeletion({application_id:'${ID}',nickname:'Fixture Alpha'})`,s.context);s.resolvePost();await promise;assert.equal(s.navigations.length,0);assert.equal(s.alerts.length,1);assert.equal(s.button.disabled,false);
  const r=await ui();const restore=vm.runInContext(`changeDeletion({application_id:'${ID}',nickname:'Fixture Alpha',deleted:true})`,r.context);r.resolvePost();await restore;assert.deepEqual(r.navigations,['/internal/admin/model-applications']);assert.match(r.calls.find(x=>x.init?.method==='POST').path,/\/restore$/);
});

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};

test('every mutation fails closed without the coordinator before any Airtable access',async()=>{
  for(const action of ['delete','restore','decision','onboarding','role-policy']){
    const s=fixture();delete s.env.MODEL_ACTIVATION_COORDINATOR;
    const response=await handle(request(action),s.env,owner);
    assert.equal(response.status,503);assert.equal((await response.json()).error,'application_coordinator_not_ready');assert.equal(s.calls.length,0);
  }
});

test('in-flight decision finishes before deletion, so it cannot resurrect a successfully deleted application',async()=>{
  const s=fixture(),original=s.env.AIRTABLE_FETCH,entered=deferred(),release=deferred();
  let reads=0;
  s.env.AIRTABLE_FETCH=async(url,init={})=>{
    if(new URL(url).pathname.endsWith('/tblEhg3dsFzPERpNQ')){
      if(++reads===1){entered.resolve();await release.promise}
      return Response.json({records:[]});
    }
    return original(url,init);
  };
  const decision=handle(request('decision',{decision:'reject'}),s.env,owner);await entered.promise;
  let deleteFinished=false;
  const deletion=handle(request('delete'),s.env,owner).then(r=>{deleteFinished=true;return r});
  await tick();assert.equal(deleteFinished,false);assert.equal(s.calls.filter(x=>x.method==='PATCH').length,0);
  release.resolve();assert.equal((await decision).status,200);assert.equal((await deletion).status,200);
  assert.equal(s.records[0].fields[F.intakeStatus],'owner_deleted');
  assert.equal(JSON.parse(s.records[0].fields[F.summaryJson]).owner_review_deletion.previous_intake_status,'rejected');
  assert.equal((await handle(request('restore'),s.env,owner)).status,200);assert.equal(s.records[0].fields[F.intakeStatus],'rejected');
});

test('pending deletion blocks all same-application mutations but not a different application',async()=>{
  const s=fixture(),original=s.env.AIRTABLE_FETCH,entered=deferred(),release=deferred();
  s.env.AIRTABLE_FETCH=async(url,init={})=>{
    if(init.method==='PATCH'&&new URL(url).pathname.endsWith('/recApplication001')){entered.resolve();await release.promise}
    return original(url,init);
  };
  const deletion=handle(request('delete'),s.env,owner);await entered.promise;
  const before=s.calls.length;
  const queued=[['decision',{decision:'reject'}],['onboarding',{}],['role-policy',{}]].map(([action,body])=>handle(request(action,body),s.env,owner));
  await tick();assert.equal(s.calls.length,before,'queued mutations must not read stale application state');
  const otherRequest=new Request(ROOT+'/v1/admin/model-applications/'+OTHER+'/delete',{method:'POST',headers:{Origin:ROOT},body:JSON.stringify({confirm_application_id:OTHER})});
  assert.equal((await handle(otherRequest,s.env,owner)).status,200,'another application has an independent coordinator');
  release.resolve();assert.equal((await deletion).status,200);
  for(const response of await Promise.all(queued)){assert.equal(response.status,409);assert.equal((await response.json()).error,'application_deleted_restore_required')}
  assert.equal(s.records[0].fields[F.intakeStatus],'owner_deleted');
});

test('concurrent duplicate deletes and restores preserve original status and write once per transition',async()=>{
  const s=fixture();
  for(const action of ['delete','restore']){
    const responses=await Promise.all(Array.from({length:4},()=>handle(request(action),s.env,owner)));
    for(const response of responses)assert.equal(response.status,200);
  }
  assert.equal(s.calls.filter(x=>x.method==='PATCH').length,2);
  assert.equal(s.records[0].fields[F.intakeStatus],'private_review_pending');
});
