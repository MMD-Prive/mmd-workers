import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto,createHmac} from 'node:crypto';

// Both actual reviewed artifact modules execute; only provider storage/transport is in memory.
async function fixture(options={}){
 const rows=[],calls=[],actors=new Map(),kv=new Map();let writes=0,uncertain=false,malformed=false;
 const serviceSecret='local-only-service-secret-12345678901234567890';
 const sessionSecret='local-only-session-secret-12345678901234567890';
 for(const a of ['a','b','expired','blocked']){
  const token=(a==='a'?'a':a==='b'?'b':a==='expired'?'c':'d').repeat(64);
  const key='liff:session:'+createHmac('sha256',sessionSecret).update('session:'+token).digest('hex');
  kv.set(key,{line_user_id:'U'+(a==='b'?'b':'a').repeat(32),member_exists:true,member_id:'member_'+a,member_profile:{membership_status:a==='blocked'?'revoked':'active'},expires_at:a==='expired'?1:Date.now()+600000});
 }
 const context=vm.createContext({Request,Response,Headers,URL,URLSearchParams,TextEncoder,TextDecoder,Blob,FormData,AbortController,AbortSignal,crypto:webcrypto,console,setTimeout,clearTimeout,structuredClone,atob,btoa,fetch:async(input,init={})=>{
  const url=new URL(input instanceof Request?input.url:String(input));const method=init.method||(input instanceof Request?input.method:'GET');calls.push({host:url.hostname,method});assert.equal(url.hostname,'api.airtable.com','no real network or notification allowed');
  const table=decodeURIComponent(url.pathname.split('/')[3]||'');
  if(method!=='GET'){
   assert.equal(table,'Bookings','only in-memory booking creation allowed');writes++;const fields=JSON.parse(init.body).fields;rows.push({id:'recBookingFixture',fields});if(uncertain)throw Error('simulated lost response after persistence');return Response.json(rows.at(-1));
  }
  const formula=url.searchParams.get('filterByFormula')||'';
  if(table==='Clients')return Response.json({records:[{id:'recClient'+(formula.includes('U'+'b'.repeat(32))?'B':'A')+'00000001',fields:{}}]});
  if(table==='Members'){const who=formula.includes('member_b')?'b':'a';const row={id:'recMember'+who.toUpperCase()+'0000001',fields:{member_id:'member_'+who,'MMD — Member Entitlements':['recEntitlement0001']}};return Response.json(url.pathname.split('/').length>4?row:{records:[row]});}
  if(table==='MMD — Member Entitlements')return Response.json({records:[{id:'recEntitlement0001',fields:{member:['recMemberA0000001'],capability:options.private?'private_premium':options.unpaid?'guest_pass':'public_member',member_status:'active',access_status:'active',start_at:'2020-01-01',expire_at:'2099-01-01'}}]});
  if(table==='Models'&&options.manyModels&&!formula.includes('RECORD_ID()'))return Response.json({records:Array.from({length:9},(_,i)=>({id:i===8?'recEligible0000001':'recOtherModel0000'+i,fields:{working_name:'Other '+i,status:'active',can_work_public:true,orientation:'straight',private_tier:'premium'}}))});
  if(table==='Models')return Response.json({records:[{id:'recEligible0000001',fields:{working_name:'Local model',status:options.hidden?'hidden':'active',can_work_public:true,orientation:'straight',private_tier:'premium'}}]});
  if(table==='Bookings')return Response.json({records:rows.filter(r=>formula.startsWith('FIND(')||formula.includes(r.fields.booking_ref))});
  return Response.json({records:[]});
 }});
 async function load(path){const cloudflare=new vm.SyntheticModule(['WorkerEntrypoint','DurableObject'],function(){this.setExport('WorkerEntrypoint',class{});this.setExport('DurableObject',class{});},{context});const m=new vm.SourceTextModule(fs.readFileSync(path,'utf8'),{context});await m.link(s=>{assert.equal(s,'cloudflare:workers');return cloudflare;});await m.evaluate();return m.namespace;}
 const member=await load(process.env.BOOKING_MEMBER_ARTIFACT),sigil=await load(process.env.BOOKING_SIGIL_ARTIFACT);
 const common={AUTH_SERVICE_SIGIL_BOOKING_TO_MEMBER_PAGES:serviceSecret,AIRTABLE_API_KEY:'local-fixture',AIRTABLE_BASE_ID:'local-fixture',AIRTABLE_TABLE_CLIENTS:'Clients',AIRTABLE_TABLE_BOOKING_REQUESTS_ID:'Bookings',AIRTABLE_TABLE_MODELS_ID:'Models',AIRTABLE_TABLE_MODEL_OFFER_RULES:'Rules',AIRTABLE_TABLE_MODEL_MEDIA_ID:'Media',TELEGRAM_NOTIFY_ENABLED:'false'};
 const memberEnv={...common,LIFF_SESSION_SECRET:sessionSecret,LIFF_IDENTITY_KV:{get:async k=>kv.get(k)||null}};
 const sigilEnv={...common,AUTH_SERVICE_SIGIL_BOOKING_TO_MEMBER_PAGES:options.wrongSecret?'different-local-service-secret-123456789012345':serviceSecret};
 const ctx={waitUntil(){}};
 sigilEnv.MEMBER_PAGES_WORKER={fetch:r=>member.default.fetch(r,memberEnv,ctx)};
 memberEnv.SIGIL_BOOKING_WORKER={fetch:async r=>malformed?Response.json({ok:true,request_ref:'mismatch'}):sigil.default.fetch(r,sigilEnv,ctx)};
 memberEnv.MEMBER_BOOKING_COORDINATOR={idFromName:id=>id,get:id=>{if(!actors.has(id)){const data=new Map();let lane=Promise.resolve();const state={storage:{get:async k=>data.get(k),put:async(k,v)=>data.set(k,structuredClone(v))},blockConcurrencyWhile(fn){const p=lane.then(fn);lane=p.catch(()=>{});return p;}};actors.set(id,new member.MemberBookingCoordinator(state,memberEnv));}return actors.get(id);}};
 const token=a=>(a==='a'?'a':a==='b'?'b':a==='expired'?'c':a==='blocked'?'d':'e').repeat(64);
 const request=(account,action='requests',body,host='mmdbkk.com')=>member.default.fetch(new Request('https://'+host+'/member/api/liff/booking/'+action,{method:body?'POST':'GET',headers:{origin:'https://'+host,cookie:'__Host-mmd_liff_session='+token(account),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),memberEnv,ctx);
 const input=()=>({request_id:'12345678-1234-1234-1234-123456789abc',model_id:'recEligible0000001',date:'2099-01-01',time:'18:30',area:'Bangkok',scope:'public'});
 const browser=(body)=>sigil.default.fetch(new Request('https://mmdbkk.com/sigil/api/booking/intake',{method:'POST',headers:{'content-type':'application/json',cookie:'__Host-mmd_liff_session='+token('a')},body:JSON.stringify(body)}),sigilEnv,ctx);
 return{browser,request,input,rows,calls,writes:()=>writes,setUncertain:v=>uncertain=v,setMalformed:v=>malformed=v};
}
test('actual Member/SIGIL artifacts: verified KV session → canonical Client → search → concurrent intake → owned readback',async()=>{
 const f=await fixture();const search=await f.request('a','search?q=Local');assert.equal(search.status,200,await search.clone().text());assert.equal((await search.json()).items[0].model_id,f.input().model_id);
 const res=await Promise.all([f.request('a','requests',f.input()),f.request('a','requests',f.input())]);assert.deepEqual(res.map(x=>x.status).sort(),[200,201]);assert.equal(f.writes(),1);
 const saved=await res[0].json();assert.equal(saved.status,'request_pending_admin_review');assert.equal(saved.job_id,undefined);assert.equal(saved.session_id,undefined);
 const own=await (await f.request('a')).json();assert.equal(own.items[0].request_ref,saved.request_ref);assert.equal((await (await f.request('b')).json()).items.length,0);
 assert.equal((await f.request('a','requests',{...f.input(),time:'19:00'})).status,409);assert.equal(f.writes(),1);
});
test('actual artifact session/auth rejects unknown, expired, revoked and mismatched service secret',async()=>{
 const f=await fixture();for(const a of ['unknown','expired','blocked'])assert.ok([401,403].includes((await f.request(a)).status));assert.equal(f.writes(),0);
 const wrong=await fixture({wrongSecret:true});assert.equal((await wrong.request('a','search?q=Local')).status,401);assert.equal(wrong.writes(),0);
});
test('actual artifact pending outcome after downstream persistence reconciles by original ref and never repeats intake',async()=>{
 const f=await fixture();f.setUncertain(true);const first=await f.request('a','requests',f.input());assert.equal(first.status,409);assert.equal((await first.json()).error,'submission_outcome_pending');
 await f.request('a','requests',f.input());assert.equal(f.writes(),1);assert.equal((await (await f.request('a','requests?request_id='+f.input().request_id)).json()).items.length,1);
 assert.equal((await (await f.request('b','requests?request_id='+f.input().request_id)).json()).items.length,0);
});
test('malformed successful service response is held pending; forged private selection never writes',async()=>{
 const f=await fixture();f.setMalformed(true);assert.equal((await f.request('a','requests',f.input())).status,409);f.setMalformed(false);await f.request('a','requests',f.input());assert.equal(f.writes(),0);
 const denied=await fixture();assert.ok([401,403,422].includes((await denied.request('a','requests',{...denied.input(),scope:'private'})).status));assert.equal(denied.writes(),0);
});

test('active public intake preserves both signed owners and rejects alternate browser references',async()=>{
 const f=await fixture();assert.equal((await f.request('a','requests',f.input())).status,201);const meta=JSON.parse(f.rows[0].fields.resolver_payload_json);assert.ok(meta.my_mmd_owner.signature);assert.ok(meta.public_booking_owner);
 const ref=f.rows[0].fields.booking_ref;
 for(const key of ['booking_ref','request_id','session_id'])assert.equal((await f.browser({[key]:ref})).status,403);
 assert.equal(f.writes(),1);
});

test('proposal builders reproduce exact candidate bytes and fail on modified baselines',async()=>{
 const {buildAadcBookingProposal}=await import('./member-booking-aadc-proposal.mjs');
 const {buildCurrentSigilProposal}=await import('./sigil-booking-current-proposal.mjs');
 for(const [build,basePath,candidatePath] of [[buildAadcBookingProposal,process.env.BOOKING_MEMBER_BASELINE,process.env.BOOKING_MEMBER_ARTIFACT],[buildCurrentSigilProposal,process.env.BOOKING_SIGIL_BASELINE,process.env.BOOKING_SIGIL_ARTIFACT]]){
  assert.ok(basePath,'explicit baseline fixture path required');const base=fs.readFileSync(basePath),result=build(base);assert.ok(result.bytes.equals(fs.readFileSync(candidatePath)));assert.equal(result.proposalOnly,true);assert.equal(result.releaseAuthorized,false);assert.throws(()=>build(Buffer.concat([base,Buffer.from('drift')])));
 }
});

test('selected record beyond initial search slice still reaches current intake',async()=>{const f=await fixture({manyModels:true});assert.equal((await f.request('a','requests',f.input())).status,201);assert.equal(f.writes(),1);});
test('active paid-public gate remains enforced for unpaid entitlement',async()=>{const f=await fixture({unpaid:true});assert.equal((await f.request('a','requests',f.input())).status,409);assert.equal(f.writes(),0);});


test('private premium verified account searches and submits; other account cannot inherit entitlement or read request',async()=>{
 const f=await fixture({private:true});
 const search=await f.request('a','search?scope=private&q=Local');assert.equal(search.status,200,await search.clone().text());
 assert.equal((await search.json()).items[0]?.model_id,f.input().model_id);
 const input={...f.input(),scope:'private'};
 const sent=await f.request('a','requests',input);assert.equal(sent.status,201,await sent.clone().text());
 assert.equal(f.writes(),1);assert.equal(JSON.parse(f.rows[0].fields.resolver_payload_json).my_mmd_owner.scope,'private');
 assert.equal((await (await f.request('b')).json()).items.length,0);
 assert.ok([403,409,422].includes((await f.request('b','requests',input)).status));assert.equal(f.writes(),1);
});
test('current hidden model cannot enter private search or intake despite account entitlement',async()=>{
 const f=await fixture({private:true,hidden:true});const search=await f.request('a','search?scope=private&q=Local');assert.equal(search.status,200,await search.clone().text());assert.deepEqual((await search.json()).items,[]);
 assert.ok([403,409,422].includes((await f.request('a','requests',{...f.input(),scope:'private'})).status));assert.equal(f.writes(),0);
});

test('private model hidden after search is rechecked at submit; no stale search authority',async()=>{
 const options={private:true};const f=await fixture(options);
 assert.equal((await (await f.request('a','search?scope=private&q=Local')).json()).items.length,1);
 options.hidden=true;
 assert.ok([403,409,422].includes((await f.request('a','requests',{...f.input(),scope:'private'})).status));assert.equal(f.writes(),0);
});

test('SIGIL builder rejects either reviewed source changing without returning a candidate',async(t)=>{
 const {buildCurrentSigilProposal}=await import('./sigil-booking-current-proposal.mjs');
 const base=fs.readFileSync(process.env.BOOKING_SIGIL_BASELINE),original=fs.readFileSync;
 for(const name of ['member-booking-service.js','current-private-access.js']){
  const mocked=t.mock.method(fs,'readFileSync',function(path,...args){
   const value=original.call(this,path,...args);
   return String(path).endsWith('/'+name)?Buffer.concat([Buffer.from(value),Buffer.from('\n// source drift')]):value;
  });
  try{assert.throws(()=>buildCurrentSigilProposal(base),new RegExp('SIGIL reviewed source drift: '+name.replaceAll('.','\\.')));}
  finally{mocked.mock.restore();}
 }
});
test('SIGIL guard conversion rejects changed, absent or duplicated replacement anchors',async()=>{
 const {hardenMemberReferenceGuard}=await import('./sigil-booking-current-proposal.mjs');
 const service=fs.readFileSync(new URL('../sigil-booking-worker/src/member-booking-service.js',import.meta.url),'utf8');
 const anchors=[['reference-aliases','if(!REF.test(ref))return null;'],['reference-owner-lookup',"try {const rows=await read(env,`{booking_ref}='${ref}'`);if(rows.length)return json({ok:false,error:'member_owned_request'},403);}"]];
 for(const [label,anchor] of anchors){
  for(const replacement of ['',anchor+'\n'+anchor,anchor.replace('return','return /* changed */')]){
   assert.throws(()=>hardenMemberReferenceGuard(service.replace(anchor,()=>replacement)),new RegExp('missing/ambiguous guard '+label));
  }
 }
 assert.throws(()=>hardenMemberReferenceGuard(hardenMemberReferenceGuard(service)),/missing\/ambiguous guard/);
});
