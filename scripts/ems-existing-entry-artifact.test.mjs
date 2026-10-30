import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {execFileSync} from 'node:child_process';
import {resolveEmsAlbumReturnTarget} from '../shared/ems-album-navigation.mjs';
import {buildExistingEmsEntryArtifact,wrapExistingEmsEntry,EMS_ENTRY_BASELINE} from './ems-existing-entry-artifact.mjs';
const slug='ems99-123456abcdef';
const path='/my-mmd/ems';
test('legacy view and new return hint select only the allowlisted list/detail',()=>{
 for(const q of ['view=ems_albums','return_to=albums_ems','view=ems_albums&return_to=albums_ems']) {
  assert.equal(resolveEmsAlbumReturnTarget(new URLSearchParams(q)),path);
  assert.equal(resolveEmsAlbumReturnTarget(new URLSearchParams(),new URLSearchParams(q+'&album='+slug)),path+'/'+slug);
 }
 for(const q of ['view=ems_albums&album=../../private','view=ems_albums&album=EMs04','view=ems_albums&album=ems99-abcdefabcdef%2Fother','return_to=albums_ems&view=home','view=ems_albums&return_to=https://example.com','view=ems_albums&album=a&album=b','return_to=albums_ems&return_to=coupon'])assert.equal(resolveEmsAlbumReturnTarget(new URLSearchParams(q)),'',q);
 assert.equal(resolveEmsAlbumReturnTarget(new URLSearchParams('view=ems_albums'),new URLSearchParams('view=home')),'');
});
function fixture(){const calls=[];const original={scheduled(){return 'same scheduled';},async fetch(request,env,ctx){calls.push({request,env,ctx});return new Response('existing');}};return {calls,original,wrapped:wrapExistingEmsEntry(original)};}
test('new and legacy direct/nested hints normalize to the unchanged existing login contract',async()=>{
 for(const hint of ['view=ems_albums','return_to=albums_ems'])for(const nested of [false,true])for(const detail of [false,true]){
  const f=fixture(),q='intent=status&'+hint+(detail?'&album='+slug:'');
  const url='https://www.mmdbkk.com/member/liff?'+(nested?'liff.state='+encodeURIComponent('?'+q):q);
  const env={},ctx={};const r=await f.wrapped.fetch(new Request(url,{headers:{cookie:'fixture-only'}}),env,ctx);
  assert.equal(await r.text(),'existing');assert.equal(f.calls.length,1);
  const forwarded=new URL(f.calls[0].request.url);assert.equal(forwarded.searchParams.get('view'),'ems_albums');
  assert.equal(forwarded.searchParams.get('intent'),'status');assert.equal(forwarded.searchParams.get('album'),detail?slug:null);
  assert.equal(forwarded.searchParams.has('return_to'),false);assert.equal(f.calls[0].request.headers.get('cookie'),'fixture-only');
  assert.equal(f.calls[0].env,env);assert.equal(f.calls[0].ctx,ctx);
 }
});
test('duplicate/conflicting intent, hints and state containers fail before delegate',async()=>{
 for(const q of ['return_to=albums_ems&return_to=coupon','view=ems_albums&album=a','view=ems_albums&intent=status&intent=renew','view=ems_albums&intent=status&liff_intent=renew','view=ems_albums&liff.state='+encodeURIComponent('?view=home'),'view=ems_albums&liff.state=a&liff_state=b']){
  const f=fixture();assert.equal((await f.wrapped.fetch(new Request('https://www.mmdbkk.com/member/liff?'+q))).status,400);assert.equal(f.calls.length,0);
 }
});
test('payment/campaign and non-target requests preserve original Request object and scheduled hook',async()=>{
 for(const p of ['/member/liff?intent=continue_payment&return_to=albums_ems','/member/liff?intent=renew&view=ems_albums','/member/liff?intent=status&campaign=care_back&view=ems_albums','/my-mmd/ems','/api/member/app/ems-albums','/webhooks/line']){
  const f=fixture(),r=new Request('https://www.mmdbkk.com'+p);await f.wrapped.fetch(r);assert.equal(f.calls[0].request,r);assert.equal(f.wrapped.scheduled,f.original.scheduled);
 }
});
test('collection alias GET/HEAD uses fixed non-cached location and never reads an account',async()=>{
 for(const p of ['/my-mmd/albums/ems','/my-mmd/albums/ems/'])for(const method of ['GET','HEAD']){
  const f=fixture(),r=await f.wrapped.fetch(new Request('https://www.mmdbkk.com'+p,{method}));assert.equal(r.status,307);assert.equal(r.headers.get('location'),path);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(f.calls.length,0);
 }
});
const baselinePath=process.env.EMS_ENTRY_ACTIVE_BUNDLE;
test('real active bundle candidate preserves every non-target byte and named exports',{skip:!baselinePath},()=>{
 const input={version:EMS_ENTRY_BASELINE.version,mainModule:EMS_ENTRY_BASELINE.mainModule,moduleNames:[EMS_ENTRY_BASELINE.mainModule],bytes:readFileSync(baselinePath)};
 const built=buildExistingEmsEntryArtifact(input);assert.equal(built.receipt.nonTargetBytesUnchanged,true);
 const source=built.bytes.toString();assert.equal(source.split('ems_existing_entry_default as default').length,2);
 assert.throws(()=>buildExistingEmsEntryArtifact({...input,version:'drift'}),/version drift/);
 assert.throws(()=>buildExistingEmsEntryArtifact({...input,mainModule:'wrong.js'}),/module drift/);
 assert.throws(()=>buildExistingEmsEntryArtifact({...input,moduleNames:[EMS_ENTRY_BASELINE.mainModule,'unexpected.js']}),/inventory drift/);
 assert.throws(()=>buildExistingEmsEntryArtifact({...input,bytes:Buffer.concat([input.bytes,Buffer.from('x')])}),/bytes drift/);
 const raw=input.bytes.toString();const start=raw.indexOf('function liffAuthBridgeTarget(request) {'),end=raw.indexOf('\n__name(liffAuthBridgeTarget',start);
 const originalBridge=runInNewContext('('+raw.slice(start,end)+')',{URL,MEMBER_LIFF_SHELL_PATHS3:new Set(['/member/liff','/member/liff/']),liffStateSearchParams2:url=>{const v=url.searchParams.get('liff.state')||url.searchParams.get('liff_state')||'';return new URLSearchParams(v.includes('?')?v.slice(v.indexOf('?')+1):v);}});
 for(const [q,target] of [['intent=status&view=ems_albums',path],['intent=status&view=ems_albums&album='+slug,path+'/'+slug]])assert.equal(originalBridge(new Request('https://www.mmdbkk.com/member/liff?'+q)),target);
});

test('built candidate dispatches alias, existing album UI/API and login bridge through real entry',{skip:!process.env.EMS_ENTRY_CANDIDATE},()=>{
 const shim='data:text/javascript,'+encodeURIComponent('export class WorkerEntrypoint {}');
 const loader='data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,next){if(s==='cloudflare:workers')return {url:${JSON.stringify(shim)},shortCircuit:true};return next(s,c);}`);
 const script=`
  import assert from 'node:assert/strict';
  import {pathToFileURL} from 'node:url';
  const candidate=await import(pathToFileURL(process.env.EMS_ENTRY_CANDIDATE));
  globalThis.fetch=async()=>{throw Error('No external network allowed');};
  const worker=candidate.default,calls=[];
  const env={MEMBER_PAGES_WORKER:{async fetch(request){calls.push(new URL(request.url));return request.url.includes('/member/liff')?new Response('<html><body><script nonce="fixture">const existing=1;</script></body></html>',{headers:{'content-type':'text/html'}}):Response.json({ok:false,error:'LOGIN_REQUIRED'},{status:401,headers:{'cache-control':'private, no-store'}});}}};
  const run=path=>worker.fetch(new Request('https://www.mmdbkk.com'+path),env,{});
  const alias=await run('/my-mmd/albums/ems/');assert.equal(alias.status,307);assert.equal(alias.headers.get('location'),'/my-mmd/ems');assert.equal(calls.length,0);
  const ui=await run('/my-mmd/ems');assert.equal(ui.status,200);assert.match(await ui.text(),/view=ems_albums/);assert.equal(calls.length,0);
  assert.equal((await run('/api/member/app/ems-albums')).status,401);assert.equal(calls.at(-1).pathname,'/api/member/app/ems-albums');
  for(const hint of ['view=ems_albums','return_to=albums_ems']){
    const response=await run('/member/liff?intent=status&'+hint);const html=await response.text();
    assert.equal(response.status,200);assert.match(html,/mmd-ems-login-return/);assert.match(html,/const target="\\/my-mmd\\/ems"/);
  }
  for(const name of ['GuideOwnerNotifications','KenjiModelIdempotency','stabilizeStatusShell','statusReturnTarget'])assert.ok(name in candidate,name);
 `;
 execFileSync(process.execPath,['--experimental-global-webcrypto','--experimental-loader',loader,'--input-type=module','-e',script],{stdio:'pipe',env:process.env});
});
