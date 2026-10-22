import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePersonalMain,readPersonalMain} from '../src/member-personal-main.js';
import {PERSONAL_MAINS} from '../../shared/personal-main-catalog.mjs';
const session={memberExists:true,memberId:'recTestA',lineUserId:'test-identity-a',memberProfile:{membership_status:'active'}};
const request=(body,origin='https://mmdbkk.com')=>new Request('https://mmdbkk.com/api/member/app/personal-main',{method:body?'PUT':'GET',headers:{origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
function env(){const store=new Map();return {store,LIFF_IDENTITY_KV:{get:async k=>JSON.parse(store.get(k)||'null'),put:async(k,v)=>store.set(k,v)}};}
test('all four selections persist through Worker scoped to member AND LINE identity',async()=>{
 const e=env();for(const p of PERSONAL_MAINS){const r=await handlePersonalMain(request({id:p.id}),e,async()=>session);assert.equal(r.status,200);assert.equal((await r.json()).selected.id,p.id);assert.equal((await readPersonalMain(e,session)).id,p.id);}
 assert.equal(await readPersonalMain(e,{...session,memberId:'recTestB'}),null);assert.equal(await readPersonalMain(e,{...session,lineUserId:'test-identity-b'}),null);
 for(const key of e.store.keys())assert.match(key,/^personal-main:v1:[a-f0-9]{64}$/);
 const r=await handlePersonalMain(request(),e,async()=>session);assert.match(r.headers.get('cache-control'),/no-store/);assert.equal((await r.json()).authority,'member-pages-worker');
});
test('reject identity spoofing, CSRF, unknown personas and unverified session before writes',async()=>{
 const e=env();for(const body of [{id:'kenji'},{id:'hito',member_id:'recTestB'},{id:'Hito'},{id:'__proto__'}])assert.equal((await handlePersonalMain(request(body),e,async()=>session)).status,400);
 assert.equal((await handlePersonalMain(request({id:'hito'},'https://evil.test'),e,async()=>session)).status,403);
 for(const s of [null,{...session,memberExists:false},{...session,memberProfile:{membership_status:'blocked'}}])assert.equal((await handlePersonalMain(request({id:'hito'}),e,async()=>s)).status,401);
 assert.equal(e.store.size,0);
});
test('storage failures fail closed without claiming a saved selection',async()=>{
 const r=await handlePersonalMain(request({id:'hito'}),{LIFF_IDENTITY_KV:{put:async()=>{throw Error('private detail')}}},async()=>session);
 assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/private detail/);
});
test('mismatched profile identity and unknown membership fail closed without accessing preferences',async()=>{
 const e=env();
 for(const profile of [{membership_status:'active',member_id:'recOther'},{membership_status:'checking'},{}]){
  const s={...session,memberProfile:profile};
  assert.equal((await handlePersonalMain(request({id:'hito'}),e,async()=>s)).status,401);
  assert.equal(await readPersonalMain(e,s),null);
 }
 assert.equal(e.store.size,0);
});
test('invalid JSON and oversized streams return 400 without writes',async()=>{
 const e=env();
 for(const body of ['{',JSON.stringify({id:'hito',padding:'x'.repeat(200)})]){
  const r=await handlePersonalMain(new Request('https://mmdbkk.com/api/member/app/personal-main',{method:'PUT',headers:{origin:'https://mmdbkk.com','content-type':'application/json'},body}),e,async()=>session);
  assert.equal(r.status,400);assert.equal((await r.json()).error,'invalid_preference');
 }
 assert.equal(e.store.size,0);
});
