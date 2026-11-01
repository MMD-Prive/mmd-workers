import test from 'node:test';
import assert from 'node:assert/strict';
import {travelFixture,jpeg} from '../../shared/model-travel-fixtures.mjs';
import {createHash} from 'node:crypto';
import {handleMemberAppSessionApi} from '../src/member-app-session.js';

test('signed confirmation authorizes only its customer Session, including writes and private photo reads, without a login cookie',async()=>{
  const {env,record}=travelFixture();let role='customer',valid=true,checks=0;
  env.PAYMENTS_WORKER={fetch:async request=>{checks++;const body=await request.json();assert.equal(body.expected_role,'customer');return Response.json({ok:valid,role,session_id:record.fields.session_id});}};
  const request=(suffix='',method='GET',body=null)=>new Request('https://mmdbkk.com/api/member/app/session/travel'+suffix,{method,headers:{origin:'https://mmdbkk.com',authorization:'Bearer synthetic-confirmation','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const run=req=>handleMemberAppSessionApi(req,env,async()=>null);
  assert.equal((await run(request('?session_id=sess_FIXTURE'))).status,200);
  assert.equal((await run(request('?session_id=sess_OTHER'))).status,403);
  const prepared=await run(request('','POST',{action:'prepare',session_id:'sess_FIXTURE',key:'synthetic-message-key-123',text:'Original lobby please',photos:[]}));
  assert.equal(prepared.status,200);const receipt=await prepared.json();
  assert.equal((await run(request('','POST',{action:'commit',session_id:'sess_FIXTURE',id:receipt.id}))).status,200);
  const photoPrepare=await run(request('','POST',{action:'prepare',session_id:'sess_FIXTURE',key:'synthetic-photo-key-123',text:'',photos:[{type:'image/jpeg',size:jpeg.length,sha256:createHash('sha256').update(jpeg).digest('hex')}]}));
  const photo=await photoPrepare.json();assert.equal(photoPrepare.status,200);
  const uploaded=await run(new Request('https://mmdbkk.com/api/member/app/session/travel?session_id=sess_FIXTURE&id='+photo.id+'&index=0',{method:'PUT',headers:{origin:'https://mmdbkk.com',authorization:'Bearer synthetic-confirmation','content-type':'image/jpeg'},body:jpeg}));assert.equal(uploaded.status,200);
  assert.equal((await run(request('','POST',{action:'commit',session_id:'sess_FIXTURE',id:photo.id}))).status,200);
  assert.equal((await run(request('/photo?session_id=sess_FIXTURE&media_id='+photo.id+'_0'))).status,200);
  assert.equal((await run(request('/photo?session_id=sess_OTHER&media_id=none'))).status,403);
  valid=false;assert.equal((await run(request('?session_id=sess_FIXTURE'))).status,401);
  assert.equal((await run(request('/photo?session_id=sess_FIXTURE&media_id='+photo.id+'_0'))).status,401);
  valid=true;role='model';assert.equal((await run(request('?session_id=sess_FIXTURE'))).status,401);
  assert.ok(checks>=7);
});
