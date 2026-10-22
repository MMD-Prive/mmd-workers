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

test('real session reader permits read grace but rejects stale preference PUT before any write',async()=>{
 const {readMemberAppSession}=await import('../src/member-app-api-runtime.js');
 const secret='personal-main-test-secret-not-production-12345',token='fixture-token';
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const hash=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('session:'+token))),b=>b.toString(16).padStart(2,'0')).join('');
 const store=new Map();const writes=[];
 const e={LIFF_SESSION_SECRET:secret,LIFF_IDENTITY_KV:{get:async k=>store.get(k)||null,put:async(k,v)=>{writes.push(k);store.set(k,JSON.parse(v));}}};
 const sessionKey='liff:session:'+hash;
 const stored={member_exists:true,member_id:'recTestA',line_user_id:'U'+'a'.repeat(32),member_profile:{membership_status:'active',member_id:'recTestA'},expires_at:Date.now()+30000,read_grace_only:true,read_grace_expires_at:Date.now()+30000};
 store.set(sessionKey,stored);
 function req(method){return new Request('https://mmdbkk.com/api/member/app/personal-main',{method,headers:{cookie:'__Host-mmd_liff_session='+token,origin:'https://mmdbkk.com','content-type':'application/json'},...(method==='PUT'?{body:'{"id":"hito"}'}:{})});}
 const snapshot=await readMemberAppSession(req('GET'),e);assert.equal(snapshot.readGraceOnly,true);
 assert.equal((await handlePersonalMain(req('GET'),e,readMemberAppSession)).status,200);
 const stale=await handlePersonalMain(req('PUT'),e,readMemberAppSession);assert.equal(stale.status,401);assert.equal((await stale.json()).error,'member_session_superseded');assert.equal(writes.length,0);
 store.set(sessionKey,{...stored,read_grace_only:false});
 assert.equal((await handlePersonalMain(req('PUT'),e,readMemberAppSession)).status,200);assert.equal(writes.length,1);
 store.set(sessionKey,{...stored,expires_at:Date.now()-1});
 assert.equal((await handlePersonalMain(req('GET'),e,readMemberAppSession)).status,401);assert.equal(writes.length,1);
});
