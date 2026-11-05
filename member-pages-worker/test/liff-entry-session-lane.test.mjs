import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {test} from 'node:test';
const source=readFileSync(process.env.MMD_ENTRY_SOURCE || new URL('../src/liff-member-shell.js',import.meta.url),'utf8');
const section=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));
const lane=section('  function memberApiFetch(', '  async function readOwnHistoryPreview(');
const welcome=section('  async function readWelcomeContext(', '  async function preflightWelcomeIdentity(');
const preflight=section('  async function preflightWelcomeIdentity(', '  async function resolveInitialWelcomeContext(');
function context(fetch,extra={}) {
 const ctx={fetch,AbortController,Response,Uint8Array,setTimeout,clearTimeout,CONFIG:{welcomeContextEndpoint:'/member/api/liff/welcome-context',startEndpoint:'/member/api/liff/start',liffId:'synthetic',intent:'status'},applyWorldTheme(){},...extra};
 runInNewContext('let memberApiChain=Promise.resolve();let preflightVerifiedSession=false;let existingProfilePromise;'+lane+welcome+preflight,ctx);
 return ctx;
}
test('welcome and profile share the rotating-cookie lane through the response body',async()=>{
 let active=0,max=0;const calls=[];let release;
 const bodyGate=new Promise(resolve=>release=resolve);
 const ctx=context(async url=>{
  calls.push(url);max=Math.max(max,++active);
  if(url.endsWith('welcome-context')) return new Response(new ReadableStream({async start(controller){await bodyGate;controller.enqueue(new TextEncoder().encode(JSON.stringify({ok:true,data:{audience:'existing'}})));active--;controller.close();}}),{headers:{'x-mmd-welcome-audience-authority':'canonical_member_profile'}});
  active--;return Response.json({ok:true});
 });
 const first=ctx.readWelcomeContext();const second=ctx.memberApiFetch('/member/api/liff/profile');
 await new Promise(resolve=>setTimeout(resolve,5));assert.deepEqual(calls,['/member/api/liff/welcome-context']);
 release();assert.equal(await first,true);await second;assert.equal(max,1);assert.equal(calls.length,2);
});
test('a stalled LINE start is aborted and the entry decision settles without login or replay',async()=>{
 let calls=0,aborted=false;
 const ctx=context((_url,{signal})=>{calls++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(new Error('aborted'));},{once:true}));},{
  setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,10)),
  window:{liff:{init:async()=>{},isLoggedIn:()=>true,getIDToken:()=> 'synthetic-only',login(){throw new Error('must not login');}}},
  customerLoading:{waitFor:fn=>fn()},readProfile:async()=>null
 });
 assert.equal(await ctx.preflightWelcomeIdentity(),false);assert.equal(aborted,true);assert.equal(calls,1);
});
test('failed welcome releases the queue for a later profile check without retrying the failed request',async()=>{
 const calls=[];const ctx=context(async url=>{calls.push(url);if(url.endsWith('welcome-context'))throw new Error('offline');return Response.json({ok:true});});
 assert.equal(await ctx.readWelcomeContext(),false);assert.equal((await ctx.memberApiFetch('/member/api/liff/profile')).status,200);assert.equal(calls.length,2);
});
test('caller abort is honored during the request and releases the lane',async()=>{
 const controller=new AbortController();let started;const began=new Promise(resolve=>started=resolve);let calls=0;
 const ctx=context(async (_url,{signal})=>{calls++;if(calls>1)return Response.json({ok:true});started();return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('caller aborted')),{once:true}));});
 const first=ctx.memberApiFetch('/member/api/liff/welcome-context',{signal:controller.signal});
 await began;controller.abort();await assert.rejects(first,/caller aborted/);
 assert.equal((await ctx.memberApiFetch('/member/api/liff/profile')).status,200);assert.equal(calls,2);
});
test('an aborted queued request never starts and does not block later profile reads',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);const calls=[];
 const ctx=context(async url=>{calls.push(url);if(calls.length===1)await gate;return Response.json({ok:true});});
 const first=ctx.memberApiFetch('/member/api/liff/profile');
 const controller=new AbortController();const cancelled=ctx.memberApiFetch('/member/api/liff/welcome-context',{signal:controller.signal});
 const rejected=assert.rejects(cancelled,/member_request_aborted/);controller.abort();release();await first;await rejected;
 await ctx.memberApiFetch('/member/api/liff/profile');assert.deepEqual(calls,['/member/api/liff/profile','/member/api/liff/profile']);
});

test('start has a bounded 30s deadline; ordinary reads and mutations retain 10s',async()=>{
 const deadlines=[];const ctx=context(async()=>Response.json({ok:true}),{setTimeout:(fn,ms)=>{deadlines.push(ms);return setTimeout(fn,1000);}});
 for(const [url,method]of [['/member/api/liff/start','POST'],['/member/api/liff/start','GET'],['/api/member/app/history','GET'],['/member/api/liff/renewal/purchase','POST']])await ctx.memberApiFetch(url,{method});
 assert.deepEqual(deadlines,[30000,10000,10000,10000]);
});
test('start survives the old deadline without replay and still aborts at its own deadline',async()=>{
 let signal,calls=0,release,now=0,next=0;const timers=new Map();
 const advance=ms=>{now+=ms;for(const [id,t]of timers)if(t.at<=now){timers.delete(id);t.fn();}};
 const ctx=context(async(_url,init)=>{calls++;signal=init.signal;return new Promise((resolve,reject)=>{release=resolve;signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true});});},{setTimeout:(fn,ms)=>{assert.equal(ms,30000);const id=++next;timers.set(id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)});
 const first=ctx.memberApiFetch('/member/api/liff/start',{method:'POST'});await new Promise(r=>setImmediate(r));
 advance(10001);assert.equal(signal.aborted,false);release(Response.json({ok:true}));await first;assert.equal(calls,1);
 const second=ctx.memberApiFetch('/member/api/liff/start',{method:'POST'});const rejected=assert.rejects(second,/aborted/);await new Promise(r=>setImmediate(r));advance(29999);assert.equal(signal.aborted,false);advance(1);await rejected;assert.equal(calls,2);
});
test('editorial GET waits for prior auth but cannot block History or rotating profile body',async()=>{
 let authBody,newsBody,historyBody;const calls=[];
 const ctx=context(async url=>{calls.push(url);return new Response(new ReadableStream({start(c){if(url.includes('profile'))authBody=c;else if(url.includes('updates'))newsBody=c;else historyBody=c;}}));});
 const profile=ctx.memberApiFetch('/member/api/liff/profile');
 const news=ctx.memberApiFetch('/api/member/app/updates?limit=10');
 const history=ctx.memberApiFetch('/api/member/app/history');
 await new Promise(r=>setImmediate(r));assert.deepEqual(calls,['/member/api/liff/profile']);
 authBody.close();await profile;await new Promise(r=>setImmediate(r));
 assert.deepEqual(calls,['/member/api/liff/profile','/api/member/app/updates?limit=10','/api/member/app/history']);
 historyBody.close();await history;
 assert.equal((await ctx.memberApiFetch('/member/api/liff/welcome-context',{signal:AbortSignal.abort()}).catch(()=>null)),null);
 newsBody.close();await news;
});
test('only canonical editorial GET bypasses the lane; POST and lookalikes stay serialized',async()=>{
 for(const [url,method]of [['/api/member/app/updates','POST'],['/api/member/app/updates-extra','GET'],['https://untrusted.invalid/api/member/app/updates','GET'],['/api/v1/member/updates/list','GET']]){
  const calls=[];let release;const ctx=context(async path=>{calls.push(path);if(calls.length===1)await new Promise(r=>release=r);return Response.json({ok:true});});
  const first=ctx.memberApiFetch(url,{method}),next=ctx.memberApiFetch('/api/member/app/history');await new Promise(r=>setImmediate(r));assert.equal(calls.length,1);release();await first;await next;
 }
});
test('an aborted editorial read settles once and does not poison the protected lane',async()=>{
 let signal;const ctx=context(async(url,init)=>{if(url.includes('updates'))return new Promise((resolve,reject)=>{signal=init.signal;signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true});});return Response.json({ok:true});});
 const control=new AbortController(),news=ctx.memberApiFetch('/api/member/app/updates',{signal:control.signal});const rejected=assert.rejects(news,/cancelled/);await new Promise(r=>setImmediate(r));
 assert.equal((await ctx.memberApiFetch('/api/member/app/history')).status,200);control.abort();await rejected;assert.equal(signal.aborted,true);
});
