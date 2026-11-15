import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {registerHooks,createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {assemble,digest} from './liff-reference-local-candidate.mjs';
const directory=process.argv[2];
assert(directory,'Pass the directory containing the hash-pinned baseline modules');
const built=assemble(directory),out=fs.mkdtempSync(path.join(os.tmpdir(),'mmd-reference-smoke-'));
fs.writeFileSync(path.join(out,'candidate.mjs'),built.code);
fs.writeFileSync(path.join(out,'app-branding-module.mjs'),built.branding);
fs.writeFileSync(path.join(out,'instrumented.mjs'),built.code+'\nexport {handleLiffMemberShell,handleLiffMemberShell2,index_default,handleStart2};\n');
registerHooks({resolve(s,c,n){return s==='cloudflare:workers'?{url:'data:text/javascript,export class WorkerEntrypoint {};export class DurableObject {}',shortCircuit:true}:n(s,c)}});
globalThis.fetch=()=>{throw Error('NETWORK_DISABLED');};
const w=await import(pathToFileURL(path.join(out,'instrumented.mjs')));
const require=createRequire(import.meta.url);
const browserRequire=createRequire(new URL('../tools/browser/package.json',import.meta.url));
const {chromium}=process.env.MMD_PLAYWRIGHT_MODULE ? require(process.env.MMD_PLAYWRIGHT_MODULE) : browserRequire('playwright');
const rows=[],tasks=[],old=console.info;
console.info=value=>{if(value?.event==='liff_request_reference'||value?.event==='liff_start_timing')rows.push(value);};
const env={LINE_KENJI_MODEL_ENABLED:'false',LIFF_ID:'2010862595-synthetic',LIFF_IDENTITY_KV:{get:async()=>null,put:async()=>{}}};
const ctx={waitUntil(p){assert.equal(this,ctx);tasks.push(p);}};
const results=[];
let browser;
try{
 // Real outer entry + real Owner Overlay + real unauthenticated handler.
 const denied=await w.default.fetch(new Request('https://mmdbkk.com/member/api/liff/profile'),env,ctx);
 assert(denied.status>=400);assert(denied.headers.has('x-mmd-diag-request'));
 results.push({case:'real_overlay_unauthenticated',status:denied.status,pass:true});
 const base=w.index_default.fetch;
 let ready=false;
 // Mock only the business boundary underneath the real Owner Overlay.
 // No real session, LINE identity, external resolver or delivery is used.
 w.index_default.fetch=async(request,_env,context)=>{
  assert.equal(context,ctx);
  const p=new URL(request.url).pathname;
  if(p.endsWith('/start'))return Response.json({ok:true,audience:'returning',data:{}});
  if(p.endsWith('/profile'))return Response.json(ready?{ok:true,data:{}}:{ok:false,error:{code:'SYNTHETIC_PROFILE_UNAVAILABLE'}},{status:ready?200:503});
  return Response.json({ok:true,data:{}});
 };
 browser=await chromium.launch({...(process.env.MMD_BROWSER_CHANNEL?{channel:process.env.MMD_BROWSER_CHANNEL}:{}),args:['--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND']});
 for(const shell of ['handleLiffMemberShell','handleLiffMemberShell2']){
  ready=false;const offset=rows.length,requests=[];let nav=0;
  const html=await w[shell](new Request('https://mmdbkk.com/member/liff?intent=status'),env).text();
  assert(html.includes('const referenceFetch = (function createReferenceFetch'));
  const page=await browser.newPage({serviceWorkers:'block'});
  await page.addInitScript(()=>{window.auth={init:0,login:0};window.liff={init:async()=>auth.init++,login:()=>auth.login++,isLoggedIn:()=>true,isInClient:()=>true,getIDToken:()=> 'synthetic-not-a-real-token'};});
  await page.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());
   if(u.origin!=='https://mmdbkk.com')return route.abort();
   if(req.isNavigationRequest()){nav++;return route.fulfill({contentType:'text/html',body:html});}
   if(u.pathname.endsWith('.js'))return route.fulfill({contentType:'application/javascript',body:''});
   if(['/member/api/liff/start','/member/api/liff/profile'].includes(u.pathname)){
    const headers=await req.allHeaders();
    const response=await w.default.fetch(new Request(req.url(),{method:req.method(),headers,...(req.method()==='POST'?{body:req.postData()}: {})}),env,ctx);
    requests.push({path:u.pathname,status:response.status,flow:headers['x-mmd-diag-flow'],retry:headers['x-mmd-diag-retry-of'],ref:response.headers.get('x-mmd-diag-request')});
    return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
   }
   return route.fulfill({json:{ok:true,data:{},audience:'returning'}});
  });
  await page.goto('https://mmdbkk.com/member/liff?intent=status');
  const retry=page.getByRole('button',{name:'ลองโหลดโปรไฟล์อีกครั้ง',exact:true});
  await retry.waitFor({timeout:7000});await page.waitForTimeout(300);
  const before={start:requests.filter(x=>x.path.endsWith('/start')).length,profile:requests.filter(x=>x.path.endsWith('/profile')).length,auth:await page.evaluate(()=>auth)};
  assert(before.start>0,'Must exercise start, not only profile/retry');
  ready=true;await retry.click();await retry.waitFor({state:'hidden',timeout:7000});
  const profiles=requests.filter(x=>x.path.endsWith('/profile'));
  assert.equal(profiles.length,before.profile+1);assert.equal(profiles.at(-1).status,200);
  assert.equal(profiles.at(-1).retry,profiles.at(-2).ref);
  assert.equal(new Set(requests.map(x=>x.flow)).size,1);assert(requests.every(x=>x.flow&&x.ref));
  assert.equal(requests.filter(x=>x.path.endsWith('/start')).length,before.start);
  assert.deepEqual(await page.evaluate(()=>auth),before.auth);assert.equal(before.auth.login,0);assert.equal(nav,1);
  const completed=rows.slice(offset).filter(x=>x.event==='liff_request_reference'&&x.outcome==='complete');
  assert.equal(completed.length,requests.length);
  for(const r of requests){const row=completed.find(x=>x.request_ref===r.ref);assert(row);assert.equal(row.status,r.status);assert.equal(row.client_flow_ref,r.flow);}
  results.push({case:shell,pass:true,start_attempts:before.start,profile_attempts:profiles.length,login_repeated:false,navigation_count:nav,overlay_delivery_correlated:true});
  await page.close();
 }
 w.index_default.fetch=base;
 await Promise.all(tasks);
 assert(!JSON.stringify(rows).includes('synthetic-not-a-real-token'));
 assert.equal(digest(fs.readFileSync(path.join(out,'candidate.mjs'))),built.receipt.candidate_sha256);
 fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify({...built.receipt,results,network:'mock-only',production_acceptance:false},null,2));
} finally {console.info=old;await browser?.close();}
console.log(JSON.stringify({out,...built.receipt,results},null,2));
