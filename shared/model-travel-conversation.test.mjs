import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {travelFixture, MODEL, jpeg} from './model-travel-fixtures.mjs';
import {handleMemberAppSessionApi} from '../member-pages-worker/src/member-app-session.js';
import modelWorker from '../admin-worker/src/model-liff-worker.js';
import {handleMemberAppApi} from '../member-pages-worker/src/member-app-api-runtime.js';
import {prepareTravelSubmission, commitTravelSubmission, projectTravel} from './model-travel-store.mjs';

function fixture() {
  const {env,record}=travelFixture();
  record.fields.model_session_state='arrived';
  const identity={lineUserId:record.fields.line_user_id,memberId:record.fields.member_id};
  const original=env.AIRTABLE_HTTP.fetch;
  env.AIRTABLE_HTTP.fetch=async request=>{assert.equal(request.method,'GET','conversation must not write appointment or payment records');return original(request);};
  const call=async(body,options={})=>{
    const method=options.method || (body?'POST':'GET');
    const url='https://mmdbkk.com/api/member/app/session/travel'+(options.photo?'/photo':'')+(options.query || (method==='POST'?'':'?session_id=sess_FIXTURE'));
    const request=new Request(url,{method,headers:{origin:'https://mmdbkk.com','content-type':'application/json',...options.headers},
      ...(body?{body:options.raw?body:JSON.stringify({session_id:record.fields.session_id,...body})}:{})});
    return handleMemberAppSessionApi(request,env,async()=>Object.hasOwn(options,'identity')?options.identity:identity);
  };
  const modelCall=async(body)=>{
    const payload=Buffer.from(JSON.stringify({kind:'model_session',role:'model',model_record_id:MODEL,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
    const cookie='mmd_model_session_v1='+payload+'.'+createHmac('sha256',env.MODEL_SESSION_SIGNING_SECRET).update(payload).digest('hex');
    return modelWorker.fetch(new Request('https://mmdbkk.com/v1/model/session/travel?session_id=sess_FIXTURE',{
      method:body?'POST':'GET',headers:{cookie,origin:'https://mmdbkk.com','content-type':'application/json'},...(body?{body:JSON.stringify({session_id:record.fields.session_id,...body})}:{})
    }),env,{});
  };
  const prepare=async(key='customer-fixture-0001',text='Please meet at the east entrance',photos=[])=>{
    const response=await call({action:'prepare',key,text,photos});assert.equal(response.status,200);return response.json();
  };
  return {env,record,identity,call,modelCall,prepare};
}

test('customer replies persist in the shared conversation and have immutable sender labels',async()=>{
  const f=fixture(),before=structuredClone(f.record);
  const own=await f.prepare();
  const modelDraft=await prepareTravelSubmission(f.env,f.record,MODEL,{key:'model-fixture-reserved',text:'Which entrance?',photos:[]});
  const customerDraft=await (await f.call()).json(),modelView=await (await f.modelCall()).json();
  assert.deepEqual(customerDraft.submissions.map(x=>x.id),[own.id]);
  assert.deepEqual(modelView.submissions.map(x=>x.id),[modelDraft.id]);
  assert.equal((await f.call({action:'commit',id:own.id})).status,200);
  await commitTravelSubmission(f.env,f.record,MODEL,modelDraft.id);
  for(const [role,response] of [['model',await f.modelCall()],['customer',await f.call()]]){
    const view=await response.json();assert.equal(view.can_send,true);assert.equal(view.submissions.length,2);
    assert.deepEqual(new Set(view.submissions.map(x=>x.sender_role)),new Set(['customer','model']));
    for(const entry of view.submissions)assert.equal(Object.hasOwn(entry,'request_key'),entry.sender_role===role);
    assert.doesNotMatch(JSON.stringify(view),/recModel|recMember|line_user_id|sender_id|model_id|uploads\//);
  }
  assert.deepEqual(f.record,before);
  for(const body of [{sender_role:'model'},{sender_id:MODEL},{model_id:MODEL},{role:'model'}]){
    assert.equal((await f.call({action:'prepare',key:'spoof-customer-sender',text:'No',photos:[],...body})).status,400);
    assert.equal((await f.modelCall({action:'prepare',key:'spoof-model-sender',text:'No',photos:[],...body})).status,400);
  }
});

test('customer writes require authenticated ownership, exact selectors and same-origin requests',async()=>{
  const f=fixture(),body={action:'prepare',key:'customer-auth-check',text:'A private meeting point',photos:[]};
  assert.equal((await f.call(body,{identity:null})).status,401);
  assert.equal((await f.call(body,{identity:{lineUserId:'Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',memberId:'recOther'}})).status,404);
  assert.equal((await f.call(body,{identity:{...f.identity,memberId:'recOther'}})).status,404);
  assert.equal((await f.call(body,{identity:{...f.identity,readGraceOnly:true}})).status,401);
  for(const headers of [{origin:''},{origin:'https://foreign.invalid'},{'sec-fetch-site':'cross-site'}])assert.equal((await f.call(body,{headers})).status,403);
  for(const query of ['?session_id=a&session_id=b','?session_id=other','?member_id=recOther','?sender_role=model'])assert.equal((await f.call(body,{query})).status,400);
  assert.equal((await f.call('{bad',{raw:true})).status,400);
  assert.equal((await f.call(JSON.stringify({...body,text:'x'.repeat(9000)}),{raw:true})).status,413);
  assert.equal((await f.call(body,{photo:true})).status,405);
  assert.equal(f.env.PRIVATE_MODEL_MEDIA.objects.size,0);
});

test('meeting instructions and transport use only their own authenticated writer and reject stale appointment context',async()=>{
  const f=fixture();f.record.fields.location_name='Agreed hotel';f.record.fields.model_session_state='confirmed';
  const view=await (await f.call()).json();
  const details={venue_type:'hotel',meeting_point:'Lobby',house_number:'',building:'A',floor:'12',room_number:'0012',security_requires_room:true,pickup_required:true,vehicle_access_note:'Drop off at the lobby'};
  const body={action:'save_meeting_details',details,context_binding:view.context_binding};
  assert.equal((await f.call(body)).status,200);assert.equal((await f.modelCall(body)).status,400);
  const transport={action:'save_transport',details:{mode:'grab_taxi'},context_binding:view.context_binding};
  assert.equal((await f.modelCall(transport)).status,200);assert.equal((await f.call(transport)).status,400);
  assert.equal((await (await f.modelCall()).json()).meeting_details.room_number,'0012');
  f.record.fields.location_name='A different canonical appointment';
  assert.equal((await f.call(body)).status,409);assert.equal((await f.modelCall(transport)).status,409);
  assert.equal((await (await f.modelCall()).json()).meeting_details,null);
});

test('real MY MMD cookie dispatch allows the current owner and keeps expired or read-only sessions from writing',async()=>{
  const f=fixture(),token='synthetic-conversation-cookie';
  f.env.LIFF_SESSION_SECRET='synthetic-conversation-secret-12345678901234567890';
  const key='liff:session:'+createHmac('sha256',f.env.LIFF_SESSION_SECRET).update('session:'+token).digest('hex');
  const session={line_user_id:f.identity.lineUserId,member_id:f.identity.memberId,member_exists:true,expires_at:Date.now()+60000};
  f.env.LIFF_IDENTITY_KV={get:async wanted=>wanted===key?structuredClone(session):null};
  const call=(method='GET',cookie=token)=>handleMemberAppApi(new Request('https://mmdbkk.com/api/member/app/session/travel?session_id=sess_FIXTURE',{
    method,headers:{origin:'https://mmdbkk.com',cookie:'__Host-mmd_liff_session='+cookie,'content-type':'application/json'},
    ...(method==='POST'?{body:JSON.stringify({session_id:'sess_FIXTURE',action:'prepare',key:'customer-cookie-reply',text:'Meet at the east entrance',photos:[]})}:{})
  }),f.env);
  assert.equal((await call('POST','unknown-cookie')).status,401);
  assert.equal((await call()).status,200);
  session.read_grace_only=true;
  assert.equal((await (await call()).json()).can_send,false);
  assert.equal((await call('POST')).status,401);
  session.read_grace_only=false;
  assert.equal((await call('POST')).status,200);
  session.expires_at=Date.now()-1;
  assert.equal((await call('POST')).status,401);
});

test('each participant owns their pending receipt and has an independent bounded quota',async()=>{
  const f=fixture(),draft=await f.prepare();
  for(const action of ['commit','cancel'])assert.equal((await f.modelCall({action,id:draft.id})).status,404);
  const modelDraft=await prepareTravelSubmission(f.env,f.record,MODEL,{key:'model-fixture-private',text:'Model draft',photos:[]});
  for(const action of ['commit','cancel'])assert.equal((await f.call({action,id:modelDraft.id})).status,404);
  for(let n=0;n<3;n++){
    const entry=n===0?draft:await f.prepare('customer-quota-000'+n,'Customer '+n);
    assert.equal((await f.call({action:'commit',id:entry.id})).status,200);
    assert.equal((await f.call({action:'commit',id:entry.id})).status,200);
  }
  const replay=await f.prepare();assert.equal(replay.id,draft.id);
  assert.equal((await f.call({action:'prepare',key:'customer-quota-over',text:'Fourth message',photos:[]})).status,409);
  const customer=await (await f.call()).json(),model=await (await f.modelCall()).json();
  assert.equal(customer.messages_used,3);assert.equal(customer.messages_remaining,0);
  assert.equal(model.messages_remaining,2);assert.equal(model.messages_used,0);
  const fresh=await projectTravel(f.env,structuredClone(f.record),'model');
  assert.equal(fresh.submissions.filter(e=>e.state==='saved').length,3);
});

test('simultaneous customer devices cannot spend the same final reply slot twice',async()=>{
  const f=fixture();
  await f.prepare('customer-quota-one');await f.prepare('customer-quota-two');
  const body=key=>({action:'prepare',key,text:'Final slot',photos:[]});
  const responses=await Promise.all([f.call(body('customer-final-one')),f.call(body('customer-final-two'))]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
});

test('customer photos use the same private validation and appear to the assigned model only after commit',async()=>{
  const f=fixture(),sha256=Buffer.from(await crypto.subtle.digest('SHA-256',jpeg)).toString('hex');
  const receipt=await f.prepare('customer-photo-fixture','East entrance',[{type:'image/jpeg',size:jpeg.length,sha256}]);
  const query='?session_id=sess_FIXTURE&id='+receipt.id+'&index=0';
  assert.equal((await f.call(jpeg,{raw:true,method:'PUT',query,headers:{'content-type':'image/jpeg'}})).status,200);
  assert.equal((await (await f.modelCall()).json()).submissions.length,0);
  assert.equal((await f.call({action:'commit',id:receipt.id})).status,200);
  const model=await (await f.modelCall()).json();assert.equal(model.submissions[0].sender_role,'customer');
  const photoQuery='?session_id=sess_FIXTURE&media_id='+receipt.id+'_0';
  const photo=await f.call(null,{photo:true,query:photoQuery});assert.equal(photo.status,200);assert.equal(photo.headers.get('cache-control'),'private, no-store');
  assert.deepEqual(Buffer.from(await photo.arrayBuffer()),jpeg);
  assert.equal((await f.call(null,{photo:true,query:photoQuery,identity:null})).status,401);
  f.record.fields['Canonical Model']=['recReplacement'];
  assert.equal((await f.call(null,{photo:true,query:photoQuery})).status,404);
});

test('fresh lifecycle and participant binding prevent stale replies or appointment mutation',async()=>{
  for(const state of ['confirmed','met_customer','work_started','separated','closed','cancelled']){
    const f=fixture();f.record.fields.model_session_state=state;
    assert.equal((await f.call({action:'prepare',key:'customer-locked-state',text:'No write',photos:[]})).status,409,state);
    assert.equal((await (await f.call()).json()).can_send,false,state);
    assert.equal(f.env.PRIVATE_MODEL_MEDIA.objects.size,0);
  }
  for(const change of [f=>f.record.fields.model_session_state='met_customer',f=>f.record.fields['Canonical Model']=['recReplacement'],f=>f.record.fields.line_user_id='Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']){
    const f=fixture();
    const receipt=await f.prepare(),snapshot=structuredClone(f.record);change(f);
    const serial=f.env.PRIVATE_MODEL_MEDIA.serial;
    await assert.rejects(commitTravelSubmission(f.env,snapshot,f.identity,receipt.id,Date.now(),'customer'));
    assert.equal(f.env.PRIVATE_MODEL_MEDIA.serial,serial);
  }
  const f=fixture();f.record.fields.session_state='en_route';
  assert.equal((await f.call({action:'prepare',key:'customer-state-conflict',text:'No write',photos:[]})).status,409);
});
