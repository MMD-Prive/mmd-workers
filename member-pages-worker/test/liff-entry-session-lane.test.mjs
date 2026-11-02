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
