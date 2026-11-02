import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeBookingRoutes,createBookingReleaseAdapter} from './member-booking-release-adapter.mjs';
import {contract} from './member-booking-build.mjs';
const a={id:'a'.repeat(32),pattern:'example.test/member/*',script:'member-worker',request_limit_fail_open:false};
const b={id:'b'.repeat(32),pattern:'example.test/public/*',script:null,request_limit_fail_open:false};
test('route order is canonical while all IDs and security fields remain intact',()=>{
 const input=[b,a],result=normalizeBookingRoutes(input);assert.deepEqual(result,[a,b]);assert.deepEqual(input,[b,a]);assert.deepEqual(normalizeBookingRoutes([a,b]),result);
 assert.notDeepEqual(normalizeBookingRoutes([{...a,script:'foreign-worker'},b]),result);
 assert.notDeepEqual(normalizeBookingRoutes([{...a,request_limit_fail_open:true},b]),result);
});
test('truncated connector inventory is rejected rather than silently filtering or repinning',()=>{
 for(const rows of [[a,'--- TRUNCATED --- 534 more items'],[a,{omitted:534}],null,{},[a,{id:b.id,script:null}]])assert.throws(()=>normalizeBookingRoutes(rows),/incomplete/);
});
test('duplicate IDs cannot disguise missing routes',()=>assert.throws(()=>normalizeBookingRoutes([a,{...a,pattern:'foreign.test/*'}]),/duplicate route ID/));
test('provider schema permits an omitted script and opaque identifiers up to 32 characters',()=>{
 const unassigned={id:'opaque-route-id',pattern:'example.test/unassigned/*'};
 assert.deepEqual(normalizeBookingRoutes([unassigned]),[unassigned]);assert.equal(Object.hasOwn(normalizeBookingRoutes([unassigned])[0],'script'),false);
 for(const id of ['',42,'x'.repeat(33),{toString:()=>a.id}])assert.throws(()=>normalizeBookingRoutes([{...a,id}]),/incomplete/);
 assert.throws(()=>normalizeBookingRoutes([{...a,script:{name:'worker'}}]),/incomplete/);
});
test('actual read-only adapter rejects partial routes before it can prepare a release',async()=>{
 const methods=[];const adapter=createBookingReleaseAdapter({directory:'.',esbuild:'fixture-unused',save:()=>{},env:{CLOUDFLARE_API_TOKEN:'local-fixture-only',GITHUB_SHA:'a'.repeat(40)},request:async(url,options)=>{
  methods.push(options.method);const path=new URL(url).pathname;let result={};
  if(path.endsWith('/deployments'))result={deployments:[{id:contract.member.deployment,versions:[{version_id:contract.member.version,percentage:100}]}]};
  else if(path.endsWith('/versions'))result={items:[{id:contract.member.version}]};
  else if(path.endsWith('/workers/routes'))result=[a,'--- TRUNCATED --- 572 more items'];
  return Response.json({success:true,result});
 }});
 await assert.rejects(adapter.snapshot(contract.member.name),/incomplete\/truncated route inventory/);assert.ok(methods.length>0);assert.ok(methods.every(x=>x==='GET'));
});
