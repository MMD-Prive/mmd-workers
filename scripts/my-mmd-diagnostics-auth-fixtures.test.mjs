// Local-only fixture wrapper imports the byte-exact candidate; no production access.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const baselineControl=process.env.MMD_DIAG_BASELINE==='1';
const baselinePath=process.env.MMD_DIAGNOSTICS_BASELINE;
const entry=String.raw`
import worker from './worker.js';
const map=new Map(),devices=new Map(),labels=new Map();
const label=key=>{if(!labels.has(key))labels.set(key,'fixture-session-'+(labels.size+1));return labels.get(key);};
const kv={async get(k,type){const v=map.get(k);return v==null?null:type==='json'?JSON.parse(v):v;},async put(k,v){map.set(k,String(v));},async delete(k){map.delete(k);}};
export default {async fetch(request,env,ctx){
 const mode=request.headers.get('x-fixture-case')||'ok',timings=[];let verifyCalls=0,resolverCalls=0,writes=0;
 const realNow=Date.now;
 if(mode==='after-grace')Date.now=()=>realNow()+31001;
 const sessionCount=()=>[...map.keys()].filter(k=>k.startsWith('liff:session:')).length;
 const beforeSessionCount=sessionCount();
 if(mode==='expired-session')for(const [k,v]of map)if(k.startsWith('liff:session:')){const s=JSON.parse(v);s.expires_at=0;map.set(k,JSON.stringify(s));}
 const previous=console.info;console.info=value=>{if(value?.event==='liff_start_timing')timings.push({stage:value.stage,outcome:value.outcome,status:value.status});};
 const gateway={async upsertSession(s,id){writes++;if(mode==='storage-fail')throw Error('local-fixture-storage');return {record_id:id||'rec'+'g'.repeat(14)};},async recordDecision(){},async loadScreen(){return null;},async resolvePackage(){return null;},async hasHallAudienceInventory(){return false;},async resolveMembershipReview(){return null;}};
 const runtime={...env,LINE_LOGIN_CHANNEL_ID:'2000000000',LINE_DASHBOARD_CHANNEL_ID:'2000000000',LIFF_SESSION_SECRET:'synthetic-session-secret-more-than-32-characters',MEMBER_STATUS_RESOLVER_SECRET:'synthetic-resolver-secret-more-than-32-characters',LIFF_IDENTITY_KV:kv,LIFF_GATEWAY_STORE:gateway,
  LIFF_REMEMBERED_LOGIN_DEVICE:{idFromName:x=>x,get:id=>({fetch:async req=>{if(req.method==='PUT'){devices.set(id,await req.json());return Response.json({ok:true});}if(req.method==='DELETE'){devices.delete(id);return Response.json({ok:true});}return devices.has(id)?Response.json({ok:true,data:devices.get(id)}):Response.json({ok:false},{status:404});}})},
  LINE_ID_TOKEN_VERIFIER:{fetch:async req=>{verifyCalls++;const token=new URLSearchParams(await req.text()).get('id_token');if(mode==='invalid-token')return Response.json({error:'invalid_token'},{status:400});return Response.json({sub:'U'+(token==='fixture-b'?'b':'a').repeat(32),aud:mode==='wrong-audience'?'9999999999':'2000000000',exp:Math.floor(Date.now()/1000)+600});}},
  MEMBER_STATUS_RESOLVER:{fetch:async req=>{resolverCalls++;if(mode==='resolver-fail')return Response.json({ok:false},{status:503});const b=await req.json();const exists=mode!=='no-member';return Response.json({ok:true,data:{member_exists:exists,member_id:exists?'rec'+(b.line_user_id.endsWith('b')?'b':'a').repeat(14):null,profile:exists?{display_name:'Synthetic member',tier:'SVIP',membership_status:'active',expires_at:'2028-09-17',history:[]}:null}});}}
 };
 try{const response=await worker.fetch(request,runtime,ctx);const h=new Headers(response.headers);
 const grace=[...map].filter(([k,v])=>k.startsWith('liff:session:')&&JSON.parse(v).read_grace_only===true).map(([k,v])=>{const s=JSON.parse(v);return {slot:label(k),expiresAt:s.expires_at,graceExpiresAt:s.read_grace_expires_at,remainingMs:s.expires_at-Date.now()};});
 h.set('x-fixture-proof',JSON.stringify({verifyCalls,resolverCalls,writes,timings,beforeSessionCount,afterSessionCount:sessionCount(),grace}));return new Response(response.body,{status:response.status,statusText:response.statusText,headers:h});}
 finally{console.info=previous;Date.now=realNow;}
}};`;
test('candidate active authenticated start + Owner overlay fixtures use synthetic bindings only',{skip:!baselinePath?'requires explicit local MMD_DIAGNOSTICS_BASELINE; never fetch production from CI':false},async()=>{
 const {Miniflare}=await import('../member-pages-worker/test-runtime/node_modules/miniflare/dist/src/index.js');
 const {sha,buildDiagnosticsDelta,BASELINE_HASH}=await import('./my-mmd-flow-diagnostics-delta.mjs');
 const baseline=fs.readFileSync(baselinePath);assert.equal(sha(baseline),BASELINE_HASH);
 const candidate=baselineControl?baseline.toString():buildDiagnosticsDelta(baseline).candidate.toString();
 assert.equal(sha(candidate),baselineControl?BASELINE_HASH:'a882ddb90ceea1cb15c6ea5c49c9e65e874877f7b1dc99b5fc53ba59f1426e04');
 let external=0;const mf=new Miniflare({workers:[{config:{name:'fixtures',type:'worker',compatibilityDate:'2026-06-20',compatibilityFlags:[],manifest:{mainModule:'fixture-entry.mjs',modulesRoot:'/private/tmp',modules:{'fixture-entry.mjs':{type:'esm',contents:entry},'worker.js':{type:'esm',contents:candidate}}}},dev:{outboundService:{type:'fetcher',handler:()=>{external++;throw Error('external forbidden');}}}}]});
 const call=async(mode='ok',body={id_token:'fixture-a',liff_intent:'status'},extra={})=>{
  const r=await mf.dispatchFetch('https://mmdbkk.com/member/api/liff/start',{method:'POST',headers:{origin:'https://mmdbkk.com','content-type':'application/json','x-fixture-case':mode,...extra},body:JSON.stringify(body)});
  return {r,body:await r.json(),proof:JSON.parse(r.headers.get('x-fixture-proof'))};
 };
 try{
  const success=await call();assert.equal(success.r.status,200);assert.equal(success.body.ok,true);assert(success.r.headers.get('set-cookie')?.includes('__Host-mmd_liff_session='));
  if(!baselineControl)for(const stage of ['verify_token','resolve_member','issue_session','persist_gateway','save_session','remembered_login','safe_view'])assert(success.proof.timings.some(x=>x.stage===stage&&x.outcome==='returned'),'missing active timing '+stage);
  for(const mode of ['invalid-token','wrong-audience']){const x=await call(mode);assert(x.r.status>=400);assert.equal(x.proof.resolverCalls,0);assert.equal(x.proof.writes,0);assert(!x.r.headers.has('set-cookie'));}
  const hint=await call('ok',{id_token:'fixture-a',line_user_id:'U'+'b'.repeat(32)});assert.equal(hint.r.status,400);assert.equal(hint.proof.verifyCalls,0);
  const failed=await call('storage-fail');assert(failed.r.status>=400);assert(!failed.r.headers.has('set-cookie'));assert.equal(failed.proof.afterSessionCount,failed.proof.beforeSessionCount,'failed persistence leaves no orphan session');
  const missing=await call('no-member');assert.equal(missing.r.status,200);if(!baselineControl)assert(missing.proof.timings.some(x=>x.stage==='pending_identity'));
  const cookie=r=>(r.headers.get('set-cookie')||'').match(/__Host-mmd_liff_session=[^;, ]+/)?.[0];
  const b=await call('ok',{id_token:'fixture-b',liff_intent:'status'});assert.equal(b.r.status,200);assert.notEqual(cookie(b.r),cookie(success.r));
  const profile=async(session,mode='ok')=>mf.dispatchFetch('https://mmdbkk.com/member/api/liff/profile',{headers:{cookie:session,'x-fixture-case':mode}});
  const profileA=await profile(cookie(success.r));assert.equal(profileA.status,200);
  const profileB=await profile(cookie(b.r));assert.equal(profileB.status,200);
  const bodyA=await profileA.json(),bodyB=await profileB.json();
  assert.notEqual(bodyA.data.member_binding,bodyB.data.member_binding,'two accounts must retain separate canonical bindings');
  assert(!JSON.stringify(bodyA).includes('U'+'a'.repeat(32)));
  const rotated=cookie(profileA);assert(rotated);assert.notEqual(rotated,cookie(success.r));
  // The stable-session contract intentionally allows GET overlap for at most 30s.
  const firstProof=JSON.parse(profileA.headers.get('x-fixture-proof'));
  assert.equal(firstProof.grace.length,1);const originalGrace=firstProof.grace[0];
  assert(originalGrace.remainingMs>0&&originalGrace.remainingMs<=30000);
  assert.equal(originalGrace.expiresAt,originalGrace.graceExpiresAt);
  const replay=await profile(cookie(success.r));const replayStatus=replay.status;
  assert.equal(replayStatus,200,'GET within bounded read grace must not falsely sign the member out');
  assert.equal(replay.headers.get('x-mmd-liff-session-overlap'),'read-only-30s-v1');
  const replayProof=JSON.parse(replay.headers.get('x-fixture-proof'));
  const repeatedGrace=replayProof.grace.find(x=>x.slot===originalGrace.slot);
  assert(repeatedGrace);assert(repeatedGrace.expiresAt<=originalGrace.expiresAt,'replayed GET cannot extend original grace deadline');
  const staleWrite=await call('ok',{id_token:'fixture-a',liff_intent:'status'},{cookie:cookie(success.r)});
  assert.equal(staleWrite.r.status,401);assert.equal(staleWrite.r.headers.get('x-mmd-liff-session-overlap'),'stale-write-rejected-v1');
  assert.equal(staleWrite.proof.verifyCalls,0);assert.equal(staleWrite.proof.writes,0);
  // Clock offset is local to this fixture wrapper; no real wait or production call.
  const afterGrace=await profile(cookie(success.r),'after-grace');assert.equal(afterGrace.status,401);
  const expired=await profile(rotated,'expired-session');assert.equal(expired.status,401);
  // Preserve public denial and service-binding-only Owner RPC contract.
  const path='/__internal/admin/my-mmd/recovery-diagnostic';
  const owner=async(host,headers,body)=>mf.dispatchFetch('https://'+host+path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
  const denied=await owner('mmdbkk.com',{},{});assert.equal(denied.status,404);
  const wrong=await owner('member-pages-worker.internal',{'x-mmd-internal-call':'true','x-mmd-service-binding':'other-worker'},{});assert.equal(wrong.status,404);
  const authorized=await owner('member-pages-worker.internal',{'x-mmd-internal-call':'true','x-mmd-service-binding':'admin-worker'},{merge_request_id:'IMR-FIXTURE1'});
  assert.equal(authorized.status,200);const result=await authorized.json();assert.equal(result.authority,'mmd.owner_my_mmd_recovery_diagnostic.v1');assert.equal(result.guardrails.raw_line_user_id_exposed,false);
  assert.equal(external,0);
  console.log(JSON.stringify({baselineControl,candidateHash:sha(candidate),activeAuthenticatedStart200:true,allStartTimingStages:!baselineControl,invalidTokenAndAudienceRejected:true,browserIdentityRejected:true,storageFailureRollback:true,pendingIdentityPreserved:true,twoCanonicalBindingsIndependent:true,profileCookieRotates:true,readOnlyGraceGet200:true,readGraceAtMost30Seconds:true,graceDeadlineNotExtended:true,stalePost401BeforeWrites:true,afterGraceGet401:true,expiredSessionRejected:true,ownerPublicAndWrongCallerDenied:true,ownerAuthorizedRead200:true,realNetworkCalls:external}));
 }finally{await mf.dispose();}
});
