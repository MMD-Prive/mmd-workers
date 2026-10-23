import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {runInNewContext} from 'node:vm';
const source=await readFile(new URL('../src/index.ts',import.meta.url),'utf8');
const js=(await build({stdin:{contents:source,loader:'ts',resolveDir:new URL('../src/',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'neutral'})).outputFiles[0].text;
const worker=(await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))).default;
const env={ALLOWED_ORIGINS:'https://www.mmdbkk.com'};
const req=(body,origin='https://www.mmdbkk.com')=>new Request('https://www.mmdbkk.com/v1/partner/line/exchange',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
test('LINE entry is private, branded, and requires explicit login',async()=>{
  const r=await worker.fetch(new Request('https://mmdbkk.com/sigil/model/dashboard/partner-login'),env,{});
  assert.equal(r.status,200);
  assert.equal(r.headers.get('Cache-Control'),'no-store');
  const html=await r.text();
  assert.match(html,/SĪGIL Partner · Private Access/);
  assert.match(html,/Recognized Partner Access/);
  assert.match(html,/Partner Control Layer/);
  assert.match(html,/เข้าสู่ระบบด้วย LINE/);
  assert.doesNotMatch(html,/\.brand-mark\{[^}]*border:1px/);
  assert.doesNotMatch(html,/\.brand-mark\{[^}]*background:rgba/);
  assert.match(html,/รักษา identity เดิมของคุณตลอด flow/);
  assert.doesNotMatch(html,/ระบบไม่สร้างบัญชีซ้ำ/);
  assert.match(html,/class="line-arrow"/);
  assert.match(html,/class="line-dot" aria-hidden="true"><\/span>/);
  assert.doesNotMatch(html,/#go\{[^}]*background:var\(--green\)/);
  assert.match(html,/02 · Telegram/);
  assert.match(html,/03 · Dashboard/);
  assert.match(html,/6ab1323f4e443dd3ce36de09_Yuki%20Dash%20log%20mob\.webp/);
  assert.match(html,/6ab1323f7c4d9e972ff1d3ea_Yuki%20Dash%20log%20desk\.webp/);
  assert.match(html,/<picture>/);
  assert.match(html,/<meta name="robots" content="noindex,nofollow">/);
  assert.match(html,/aria-live="polite"/);
  const inlineScript=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
  assert.doesNotMatch(inlineScript,/localStorage|sessionStorage|console\.|sendBeacon/);
});
test('rejects foreign origin before identity lookup',async()=>{assert.equal((await worker.fetch(req({id_token:'fake'},'https://example.com'),env,{})).status,403);});
test('requires fresh LINE token',async()=>{assert.equal((await worker.fetch(req({}),env,{})).status,401);});
test('rejects wrong LINE channel without Airtable access',async()=>{const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({aud:'wrong',sub:'U'+'a'.repeat(32)});};try{assert.equal((await worker.fetch(req({id_token:'fake'}),env,{})).status,401);assert.equal(calls,1);}finally{globalThis.fetch=original;}});

test('www login canonicalizes to the LIFF apex before SDK initialization, preserving callback parameters',async()=>{
 const r=await worker.fetch(new Request('https://www.mmdbkk.com/sigil/model/dashboard/partner-login?code=fixture&state=fixture'),env,{});
 assert.equal(r.status,302);assert.equal(r.headers.get('Location'),'https://mmdbkk.com/sigil/model/dashboard/partner-login?code=fixture&state=fixture');assert.equal(r.headers.get('Cache-Control'),'no-store');
});

async function browser({loggedIn=false,token='fixture-line-token',target='https://sigil-partner.lovable.app/?t=fixture-partner-token',exchangeOk=true,initError=false,waitForInit=false,loginThrows=false,navigationThrows=false,errorCode='partner_line_review_required',reviewReason}={}){
 const response=await worker.fetch(new Request('https://mmdbkk.com/sigil/model/dashboard/partner-login'),env,{});const html=await response.text();
 const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];const go={},state={};const calls=[],logins=[],destinations=[];const events={};let finish;
 const init=waitForInit?new Promise(resolve=>{finish=resolve}):Promise.resolve();
 runInNewContext(script,{URL,window:{addEventListener:(name,listener)=>events[name]=listener},document:{getElementById:id=>id==='go'?go:state},liff:{init:async()=>{if(initError)throw Error('fixture');await init},isLoggedIn:()=>loggedIn,getIDToken:()=>token,login:params=>{if(loginThrows)throw Error('fixture');logins.push(params.redirectUri)}},fetch:async(path,options)=>{calls.push({path,options});return {ok:exchangeOk,json:async()=>exchangeOk?{ok:true,dashboard_url:target}:{ok:false,error:{code:errorCode,reason:reviewReason}}}},location:{replace:url=>{if(navigationThrows)throw Error('fixture');destinations.push(url)}}});
 await new Promise(setImmediate);return {go,state,calls,logins,destinations,finish,events};
}

test('fresh visitor never starts LINE login automatically; explicit click starts one canonical login',async()=>{
 const b=await browser();assert.equal(b.calls.length,0);assert.deepEqual(b.logins,[]);assert.equal(b.go.disabled,false);
 await b.go.onclick();assert.deepEqual(b.logins,['https://mmdbkk.com/sigil/model/dashboard/partner-login']);
});
test('resumes an existing LINE session automatically and exchanges once before navigating to LV10',async()=>{
 const b=await browser({loggedIn:true,waitForInit:true});assert.equal(b.go.disabled,true);await b.go.onclick();await b.go.onclick();assert.equal(b.calls.length,0);
 b.finish();await new Promise(setImmediate);assert.equal(b.calls.length,1);assert.equal(b.calls[0].path,'/v1/partner/line/exchange');assert.deepEqual(JSON.parse(b.calls[0].options.body),{id_token:'fixture-line-token'});assert.equal(b.calls[0].options.credentials,'omit');assert.equal(b.calls[0].options.referrerPolicy,'no-referrer');assert.equal(b.calls[0].options.cache,'no-store');assert.deepEqual(b.logins,[]);assert.deepEqual(b.destinations,['https://sigil-partner.lovable.app/?t=fixture-partner-token']);
});
test('missing token, failed initialization and rejected identity never navigate or restart LINE login',async()=>{
 for(const options of [{loggedIn:true,token:null},{loggedIn:true,initError:true},{loggedIn:true,exchangeOk:false}]){
  const b=await browser(options);assert.deepEqual(b.destinations,[]);assert.deepEqual(b.logins,[]);assert.equal(b.go.disabled,false);
 }
});
test('client fails closed on unapproved dashboard destinations and ambiguous token URLs',async()=>{
 for(const target of ['https://evil.example/?t=x','https://sigil-partner.lovable.app.evil.example/?t=x','https://www.mmdbkk.com/partner/dashboard?t=x','http://sigil-partner.lovable.app/?t=x','https://sigil-partner.lovable.app/other?t=x','https://user@sigil-partner.lovable.app/?t=x','https://sigil-partner.lovable.app/','https://sigil-partner.lovable.app/?t=','https://sigil-partner.lovable.app/?t=x&t=y','https://sigil-partner.lovable.app/?t=x&redirect=https://evil.example','https://sigil-partner.lovable.app/?t=x#secret']){
  const b=await browser({loggedIn:true,target});assert.deepEqual(b.destinations,[]);
 }
});

async function identityExchange(options={}){
 const partnerId='recKendoFixture001',claimId='recClaimFixture001';let writes=0;let issuedHash='';
 const identity={aud:'2010864854',iss:'https://access.line.me',exp:Math.floor(Date.now()/1000)+600,sub:'U'+'a'.repeat(32),...options.identity};
 const claim={id:claimId,fields:{fld6PAywOhvDeelDJ:'verified_unlinked',fldGB7Raqm6O1NIhh:'published',fldaMlO1fRoazxfHg:[partnerId],...options.claim}};
 const partner={id:partnerId,fields:{fldXs6VyfXIHxBMpQ:[claimId],fldajmg66pf2ifGPu:'Active',fldwRzdtIoPbHKr7n:'recognized',...options.partner}};
 const original=globalThis.fetch;globalThis.fetch=async(input,init)=>{
  const url=String(input instanceof Request?input.url:input);
  if(url==='https://api.line.me/oauth2/v2.1/verify')return Response.json(identity,{status:options.lineStatus||200});
  if(url.includes('/tbluoZ5JiRcoUP6WT'))return Response.json({records:options.noClaims?[]:options.duplicateClaims?[claim,claim]:[claim]});
  if(url.includes('/partners/'+partnerId)){
   if(init?.method==='PATCH'){writes++;const fields=JSON.parse(init.body).fields;issuedHash=fields.fldoaCF4k4YqyuQ7Q;partner.fields={...partner.fields,...fields};}
   return Response.json(partner);
  }
  throw Error('Unexpected fixture request');
 };
 try{
  const response=await worker.fetch(req({id_token:'fixture-token',...options.bodyExtra}),{...env,AIRTABLE_API_KEY:'fixture-airtable',AIRTABLE_BASE_ID:'fixture-base',AIRTABLE_TABLE_MODEL_PARTNERS:'partners',TOKEN_SECRET:'fixture-signing-secret'},{});
  return {status:response.status,body:await response.json(),cacheControl:response.headers.get('Cache-Control'),writes,issuedHash};
 }finally{globalThis.fetch=original}
}
test('verified reciprocal active/recognized identity issues a signed Partner token for the fixed LV10 URL',async()=>{
 const r=await identityExchange();assert.equal(r.status,200);assert.equal(r.writes,1);assert.match(r.issuedHash,/^[a-f0-9]{64}$/);assert.equal(r.cacheControl,'no-store');
 const url=new URL(r.body.dashboard_url);assert.equal(url.origin,'https://sigil-partner.lovable.app');assert.equal(url.pathname,'/');const token=url.searchParams.get('t');assert.ok(token);assert.equal(token.split('.').length,2);
 const payload=JSON.parse(Buffer.from(token.split('.')[0].slice('sigil_'.length),'base64url').toString());assert.equal(payload.pid,'recKendoFixture001');assert.ok(payload.exp>Date.now());
});
test('invalid claims, LINE identity or Partner eligibility cannot rotate or mint Partner access',async()=>{
 for(const options of [
  {lineStatus:401},{identity:{aud:'wrong'}},{identity:{iss:'https://evil.example'}},{identity:{exp:0}},{identity:{sub:'not-a-line-subject'}},
  {duplicateClaims:true},{claim:{fld6PAywOhvDeelDJ:'pending'}},{claim:{fldGB7Raqm6O1NIhh:'developing'}},{claim:{fldaMlO1fRoazxfHg:[]}},{claim:{fldaMlO1fRoazxfHg:['one','two']}},
  {partner:{fldXs6VyfXIHxBMpQ:['different-claim']}},{partner:{fldajmg66pf2ifGPu:'Suspended'}},{partner:{fldwRzdtIoPbHKr7n:'pending_review'}}
 ]){const r=await identityExchange(options);assert.ok([401,403].includes(r.status));assert.equal(r.writes,0);assert.equal(r.body.dashboard_url,undefined);}
});

test('navigation holds the click lock until unload and prevents a second token rotation',async()=>{
 const b=await browser({loggedIn:true});assert.equal(b.calls.length,1);assert.equal(b.go.disabled,true);
 await b.go.onclick();await b.go.onclick();assert.equal(b.calls.length,1);assert.equal(b.destinations.length,1);
 const fresh=await browser();await fresh.go.onclick();assert.equal(fresh.go.disabled,true);await fresh.go.onclick();assert.equal(fresh.logins.length,1);
});
test('navigation failures restore retry, and back-cache restoration allows an explicit retry only',async()=>{
 for(const options of [{loggedIn:true,navigationThrows:true},{loginThrows:true}]){
  const b=await browser(options);if(!options.loggedIn)await b.go.onclick();assert.equal(b.go.disabled,false);assert.doesNotMatch(b.state.textContent,/fixture/);
 }
 const b=await browser({loggedIn:true});b.events.pageshow({persisted:false});assert.equal(b.go.disabled,true);
 b.events.pageshow({persisted:true});assert.equal(b.go.disabled,false);assert.equal(b.calls.length,1);
 await b.go.onclick();assert.equal(b.calls.length,2);assert.equal(b.go.disabled,true);
});
test('caller supplied Partner identifiers cannot replace the verified reciprocal claim owner',async()=>{
 const r=await identityExchange({bodyExtra:{partner_id:'attacker',partner_record_id:'recOther',pid:'recOther',dashboard_url:'https://evil.example/'}});
 assert.equal(r.status,200);const url=new URL(r.body.dashboard_url);assert.equal(url.origin,'https://sigil-partner.lovable.app');
 const payload=JSON.parse(Buffer.from(url.searchParams.get('t').split('.')[0].slice('sigil_'.length),'base64url').toString());assert.equal(payload.pid,'recKendoFixture001');
});

const reviewCases=[
 [{noClaims:true},'claim_not_found','partner_line_review_required'],
 [{duplicateClaims:true},'claim_ambiguous','partner_line_review_required'],
 [{claim:{fld6PAywOhvDeelDJ:'pending'}},'claim_status','partner_line_review_required'],
 [{claim:{fldGB7Raqm6O1NIhh:'developing'}},'claim_environment','partner_line_review_required'],
 [{claim:{fldaMlO1fRoazxfHg:[]}},'claim_partner_link','partner_line_review_required'],
 [{partner:{fldXs6VyfXIHxBMpQ:['recOtherClaim']}},'partner_claim_link','partner_not_recognized'],
 [{partner:{fldajmg66pf2ifGPu:'Suspended'}},'partner_inactive','partner_not_recognized'],
 [{partner:{fldwRzdtIoPbHKr7n:'pending_review'}},'partner_approval','partner_not_recognized']
];
for(const [options,reason,code] of reviewCases){
 test(`verified LINE denial identifies ${reason} without changing access or leaking identity`,async()=>{
  const r=await identityExchange(options);
  assert.equal(r.status,403);assert.equal(r.body.error.code,code);assert.equal(r.body.error.reason,reason);
  assert.equal(r.body.error.retryable,false);assert.equal(r.cacheControl,'no-store');assert.equal(r.writes,0);assert.equal(r.issuedHash,'');assert.equal(r.body.dashboard_url,undefined);
  assert.match(r.body.meta.request_id,/^req_[a-f0-9-]{36}$/);
  const serialized=JSON.stringify(r.body);
  for(const value of ['fixture-token','fixture-signing-secret','recKendoFixture001','recClaimFixture001','U'+'a'.repeat(32)])assert.equal(serialized.includes(value),false);
 });
 test(`browser shows bounded ${reason} instead of claiming a review is underway`,async()=>{
  const b=await browser({loggedIn:true,exchangeOk:false,errorCode:code,reviewReason:reason});
  assert.ok(b.state.textContent.includes('['+reason+']'));assert.doesNotMatch(b.state.textContent,/กำลังดำเนินการ/);
  assert.equal(b.go.disabled,false);assert.equal(b.calls.length,1);assert.deepEqual(b.logins,[]);assert.deepEqual(b.destinations,[]);
 });
}
test('unverified LINE identity never receives claim diagnostics',async()=>{
 for(const options of [{lineStatus:401},{identity:{aud:'wrong'}},{identity:{iss:'https://evil.example'}},{identity:{exp:0}},{identity:{sub:'not-a-line-subject'}}]){
  const r=await identityExchange(options);assert.equal(r.status,401);assert.equal(r.body.error.reason,undefined);assert.equal(r.writes,0);
 }
});
test('unknown, inherited or hostile reasons cannot render response text or trigger sign-in/navigation',async()=>{
 for(const reviewReason of [undefined,'constructor','__proto__','<img src=x onerror=alert(1)>','fixture-secret']){
  const b=await browser({loggedIn:true,exchangeOk:false,reviewReason});assert.match(b.state.textContent,/ยังไม่ผ่านการตรวจสิทธิ์/);assert.doesNotMatch(b.state.textContent,/กำลังดำเนินการ|fixture|<img|constructor|__proto__/);
  assert.equal(b.go.disabled,false);assert.deepEqual(b.logins,[]);assert.deepEqual(b.destinations,[]);
 }
 const b=await browser({loggedIn:true,exchangeOk:false,errorCode:'line_identity_invalid',reviewReason:'partner_inactive'});assert.equal(b.state.textContent,'พร้อมยืนยัน LINE อีกครั้ง');
});
test('caller cannot supply a denial reason or substitute a Partner to bypass review',async()=>{
 const r=await identityExchange({noClaims:true,bodyExtra:{reason:'partner_approval',partner_id:'partner_kendo',partner_record_id:'recKendoFixture001'}});
 assert.equal(r.status,403);assert.equal(r.body.error.reason,'claim_not_found');assert.equal(r.writes,0);
});
