import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {BASELINE_HASH,sha,buildStartPersistenceDelta} from './my-mmd-start-persistence-delta.mjs';
const path=process.env.MMD_START_PERSISTENCE_BASELINE;
test('local persistence builder cannot mutate production or release pins',()=>{
 const source=fs.readFileSync(new URL('./my-mmd-start-persistence-delta.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\bfetch\(|writeFile|CLOUDFLARE_API_TOKEN|allowWrites/);
 assert.match(source,/handleStart = IdentityPatch.handleStart/);
 assert.match(source,/releaseReady:false/);
});
test('exact active artifact delta is reversible, syntax valid and preserves Overlay bytes',{skip:!path},()=>{
 const baseline=fs.readFileSync(path);assert.equal(sha(baseline),BASELINE_HASH);
 const r=buildStartPersistenceDelta(baseline);assert.equal(r.patches.length,4);
 execFileSync(process.execPath,['--input-type=module','--check'],{input:r.candidate,stdio:['pipe','pipe','pipe']});
 assert.equal(sha(r.candidate),'35fa34af68b3990eb028e7f058076a7d373d1a628c707d01e5daae63e9bbe170');
 assert.throws(()=>buildStartPersistenceDelta(Buffer.concat([baseline,Buffer.from(' ')])),/drift/);
 assert.equal(r.candidate.toString().split('await handleStart(request, env, ctx);').length-1,2);
 assert(!r.candidate.includes('await handleStart(request, env);'));
});
test('workerd entry through active Overlay persists safe timing and preserves auth/Owner isolation',{skip:!path},async()=>{
 const {Miniflare}=await import('../member-pages-worker/test-runtime/node_modules/miniflare/dist/src/index.js');
 const source=fs.readFileSync(new URL('./my-mmd-diagnostics-auth-fixtures.test.mjs',import.meta.url),'utf8');
 const start=source.indexOf('const entry=String.raw`')+'const entry=String.raw`'.length;
 const end=source.indexOf('\n}};`;',start);assert(start>20&&end>start);
 let entry=source.slice(start,end)+'\n}};';
 const before='try{const response=await worker.fetch(request,runtime,ctx);const h=new Headers(response.headers);';
 assert.equal(entry.split(before).length,2);
 entry=entry.replace(before,`const keysBefore=new Set(map.keys()),pending=[];
 const execution={waitUntil(p){if(this!==execution)throw Error('invalid context receiver');pending.push(p);ctx.waitUntil(p);}};
 try{const response=await worker.fetch(request,runtime,execution);await Promise.all(pending);
 const rows=[...map].filter(([k])=>k.startsWith('liff_start_timing:')&&!keysBefore.has(k)).map(([,v])=>JSON.parse(v));
 const h=new Headers(response.headers);h.set('x-fixture-persistence',JSON.stringify({rows,waitUntil:pending.length}));`);
 let external=0;const baseline=fs.readFileSync(path),candidate=buildStartPersistenceDelta(baseline).candidate;
 const make=bytes=>new Miniflare({workers:[{config:{name:'fixtures',type:'worker',compatibilityDate:'2026-06-20',compatibilityFlags:[],manifest:{mainModule:'fixture-entry.mjs',modulesRoot:'/private/tmp',modules:{'fixture-entry.mjs':{type:'esm',contents:entry},'worker.js':{type:'esm',contents:bytes.toString()}}}},dev:{outboundService:{type:'fetcher',handler:()=>{external++;throw Error('external forbidden');}}}}]});
 const base=make(baseline),patched=make(candidate);
 const call=async(mf,mode='ok',body={id_token:'fixture-a',liff_intent:'status'})=>{
  const r=await mf.dispatchFetch('https://mmdbkk.com/member/api/liff/start',{method:'POST',headers:{origin:'https://mmdbkk.com','content-type':'application/json','x-fixture-case':mode},body:JSON.stringify(body)});
  return {r,body:await r.json(),proof:JSON.parse(r.headers.get('x-fixture-proof')),persist:JSON.parse(r.headers.get('x-fixture-persistence'))};
 };
 try {
  for(const mode of ['ok','invalid-token','wrong-audience','storage-fail','no-member','resolver-fail']) {
   const a=await call(base,mode),b=await call(patched,mode);
   assert.equal(b.r.status,a.r.status,mode+' status parity');assert.equal(b.body.ok,a.body.ok);
   assert.equal(b.proof.verifyCalls,a.proof.verifyCalls);assert.equal(b.proof.resolverCalls,a.proof.resolverCalls);assert.equal(b.proof.writes,a.proof.writes);
   assert.equal(a.persist.rows.length,0);assert(b.persist.rows.length>0);assert(b.persist.rows.length<=24);assert(b.persist.waitUntil>=b.persist.rows.length);
   for(const row of b.persist.rows) {
    assert.deepEqual(Object.keys(row).sort(),['event','ref','stage','outcome','duration_ms','observed_at',...(row.status?['status']:[])].sort());
    assert.equal(row.event,'liff_start_timing');assert.match(row.ref,/^[0-9a-f-]{36}$/);
    assert(!JSON.stringify(row).includes('fixture'));assert(!JSON.stringify(row).includes('rec'));
   }
   if(mode==='ok') for(const stage of ['verify_token','resolve_member','issue_session','persist_gateway','save_session','remembered_login','safe_view']) assert(b.persist.rows.some(x=>x.stage===stage&&x.outcome==='returned'),'missing '+stage);
  }
  const one=await call(patched),two=await call(patched,'ok',{id_token:'fixture-b',liff_intent:'status'});
  assert.notEqual(one.persist.rows[0].ref,two.persist.rows[0].ref);
  const cookie=x=>x.r.headers.get('set-cookie').match(/__Host-mmd_liff_session=[^;, ]+/)[0];
  const profile=async c=>{const r=await patched.dispatchFetch('https://mmdbkk.com/member/api/liff/profile',{headers:{cookie:c}});assert.equal(r.status,200);return r.json();};
  const [p1,p2]=await Promise.all([profile(cookie(one)),profile(cookie(two))]);assert.notEqual(p1.data.member_binding,p2.data.member_binding);
  for(const [host,headers,status] of [['mmdbkk.com',{},404],['member-pages-worker.internal',{'x-mmd-internal-call':'true','x-mmd-service-binding':'other-worker'},404],['member-pages-worker.internal',{'x-mmd-internal-call':'true','x-mmd-service-binding':'admin-worker'},200]]) {
   const r=await patched.dispatchFetch('https://'+host+'/__internal/admin/my-mmd/recovery-diagnostic',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify({merge_request_id:'IMR-FIXTURE1'})});assert.equal(r.status,status);
  }
  assert.equal(external,0);
 } finally {await Promise.all([base.dispose(),patched.dispose()]);}
});
