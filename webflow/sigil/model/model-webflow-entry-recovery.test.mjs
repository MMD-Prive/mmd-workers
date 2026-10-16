import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import worker, { liffPrimaryBootstrapHtml, modelMiniAppHandoffUrl, shouldServeWebflowDashboard } from '../../../model-dashboard-presentation-worker/src/index.js';
import { modelOnboardingPhaseAHtml } from '../../../model-dashboard-presentation-worker/src/model-onboarding-phase-a-page.js';

const html=fs.readFileSync(new URL('./dashboard-active-mmd-mobile-20261016.html',import.meta.url),'utf8');
const boot=html.slice(html.indexOf('  async function boot(){'),html.indexOf('\n  boot();'));
async function run({profile={ok:true,model:{}},exchange={ok:true},loggedIn=true,origin='https://mmdbkk.com',loadError}={}){
 const calls=[],states=[],actions=[];let initialized=0,loaded=0;
 const sdk={init:async()=>{initialized++;},isLoggedIn:()=>loggedIn,getIDToken:()=> 'fixture-id-token'};
 const request=async(url)=>{calls.push(url);const value=url.includes('/exchange')?exchange:profile;if(value instanceof Error)throw value;return value;};
 const context={request,window:{liff:sdk},liff:sdk,location:{origin},LIFF_IDS:{published:'2010864854-N34SgCqq'},env:'published',setTimeout,clearTimeout,
 setState:(...s)=>states.push(s),entryAction:(...a)=>actions.push(a),reviewState:()=>states.push(['review']),load:async()=>{loaded++;if(loadError)throw loadError;}};
 await vm.runInNewContext(`${boot};boot()`,context);
 return {calls,states,actions,initialized,loaded};
}
const failure=(message,status)=>Object.assign(new Error(message),{status});
test('B: valid Model session loads existing data without fresh LINE exchange or application',async()=>{
 const x=await run();assert.deepEqual(x.calls,['/v1/model/profile']);assert.equal(x.initialized,0);assert.equal(x.loaded,1);
});
test('login flow=verify returns to Webflow after primary bootstrap rather than stalling in the digital shell',()=>{
 const endpoint='https://mmdbkk.com/sigil/model/dashboard?flow=verify';
 assert.equal(shouldServeWebflowDashboard(new Request(endpoint)),true);
 assert.equal(shouldServeWebflowDashboard(new Request(endpoint+'&liff.state=%3Fflow%3Dverify')),false);
 assert.equal(shouldServeWebflowDashboard(new Request(endpoint,{headers:{cookie:'mmd_liff_boot=1'}})),true);
});
test('A: unlinked account offers separate new-application and owner-link paths, never auto applies',async()=>{
 const x=await run({profile:failure('model_not_linked',401),exchange:failure('model_not_linked',403)});
 assert.equal(x.loaded,0);assert.equal(x.actions.length,2);assert.match(x.actions[1][1],/miniapp\.line\.me\/2010864854-N34SgCqq\/\?flow=apply$/);
 assert.equal(x.calls.some(p=>p.includes('application')),false);
});
test('B: ambiguous identity and pending review never load workspace or offer duplicate application',async()=>{
 for(const exchange of [failure('identity_review_required',202),{ok:true,state:'pending_review'}]){
  const x=await run({profile:failure('model_session_required',401),exchange});
  assert.equal(x.loaded,0);assert.deepEqual(x.states.at(-1),['review']);assert.equal(x.actions.length,0);
 }
});
test('expired session without LINE login gives a user-operated entry, not an automatic login loop',async()=>{
 const x=await run({profile:failure('model_session_expired',401),loggedIn:false});
 assert.equal(x.initialized,1);assert.equal(x.loaded,0);assert.equal(x.actions.length,1);assert.match(x.states.at(-1)[0],/ยังไม่ได้เชื่อม/);
});
test('invalid LINE token is visible rather than left loading or treated as no job',async()=>{
 const x=await run({profile:failure('model_session_required',401),exchange:failure('invalid_line_id_token',401)});
 assert.match(x.states.at(-1)[0],/ยืนยัน LINE ยังไม่สำเร็จ/);assert.equal(x.loaded,0);
});
test('private permission denial does not reinitialize LINE or offer new signup',async()=>{
 const x=await run({profile:failure('private_access_required',403)});
 assert.equal(x.initialized,0);assert.equal(x.loaded,0);assert.match(x.states.at(-1)[0],/ไม่มีสิทธิ์/);assert.equal(x.actions.length,1);
});
test('system failure is not an empty-job success; only authoritative no-active-session is empty',async()=>{
 const outage=await run({profile:failure('upstream_unavailable',503)});assert.match(outage.states.at(-1)[0],/ระบบยังเชื่อมต่อ/);assert.equal(outage.initialized,0);
 const empty=await run({loadError:failure('active_session_not_found',404)});assert.match(empty.states.at(-1)[0],/ยังไม่มีงาน/);
});
test('www cannot initialize LIFF at an unregistered endpoint',async()=>{
 const x=await run({profile:failure('model_session_required',401),origin:'https://www.mmdbkk.com'});assert.equal(x.initialized,0);assert.equal(x.actions[0][1],'https://mmdbkk.com/sigil/model/dashboard');
});
test('Console return uses an exact allowlisted route and still exchanges LINE on the receiver',async()=>{
 const request=new Request('https://mmdbkk.com/sigil/model/dashboard?return_to=console',{headers:{cookie:'mmd_liff_boot=1'}});
 const page=await (await worker.fetch(request)).text();assert.match(page,/window\.location\.replace\("\/sigil\/model\/console"\)/);assert.match(page,/\/v1\/model\/liff\/exchange/);assert.match(page,/exchange\.status===202/);
 assert.match(modelMiniAppHandoffUrl(request),/return_to=console/);
});
test('C: safe Broadcast job context survives entry; hostile next and return targets cannot open redirects',()=>{
 const job=new Request('https://mmdbkk.com/sigil/model/dashboard?intent=job_board&job_id=JOB-123&next=https://evil.invalid/private');
 const link=new URL(modelMiniAppHandoffUrl(job));assert.equal(link.searchParams.get('job_id'),'JOB-123');assert.equal(link.searchParams.get('next'),'https://sigil.mmdbkk.com/public/api/jobs/JOB-123');
 const page=liffPrimaryBootstrapHtml(new Request('https://mmdbkk.com/sigil/model/dashboard?return_to=https://evil.invalid'));
 assert.doesNotMatch(page,/location\.replace\("https:\/\/evil/);
});
test('C: applicant carries originating job through pending-review and existing binding resumes via backend gate',()=>{
 const page=modelOnboardingPhaseAHtml('published','','JOB-123');
 assert.match(page,/ORIGINATING_JOB="JOB-123"/);assert.match(page,/location\.replace\(ORIGINATING_JOB\?returnToJob/);
 assert.match(page,/addJobReturn\(\);return/);assert.match(page,/intent=job_board&job_id=/);
 assert.doesNotMatch(modelOnboardingPhaseAHtml('published','','https://evil.invalid'),/ORIGINATING_JOB="https:/);
 for(const script of page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
});
test('Console recovery never initializes LIFF at console or silently retries Model actions',()=>{
 const source=fs.readFileSync(new URL('./model-console-v3-i18n.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/l\.init|l\.login|liff\/exchange|return F\(q,b\)/);
 assert.match(source,/return_to","console/);assert.match(source,/u\.origin===location\.origin/);
});

test('exact login/confirmation front gates preserve apex without forwarding token/session to Webflow',async()=>{
 const original=globalThis.fetch,calls=[];
 globalThis.fetch=async request=>{calls.push(request);return new Response('<main>MY MODEL</main>',{headers:{'content-type':'text/html','set-cookie':'untrusted=1'}});};
 try{
  for(const path of ['/sigil/model/login','/sigil/confirm/job-model']){
   const response=await worker.fetch(new Request('https://mmdbkk.com'+path+'?t=fixture-token',{headers:{cookie:'mmd_model_session_v1=fixture',authorization:'Bearer fixture'}}));
   assert.equal(response.status,200);assert.equal(response.headers.get('location'),null);assert.equal(response.headers.get('set-cookie'),null);assert.match(response.headers.get('cache-control'),/no-store/);
   assert.equal(calls.at(-1).url,'https://mmdprive.webflow.io'+path);assert.equal(calls.at(-1).headers.get('cookie'),null);assert.equal(calls.at(-1).headers.get('authorization'),null);
   assert.equal((await worker.fetch(new Request('https://mmdbkk.com'+path,{method:'POST'}))).status,405);
  }
 }finally{globalThis.fetch=original;}
});

test('help recovery creates one card at the app bottom, not a top entry action',()=>{
 const line=html.split('\n').find(l=>l.includes('function entryAction('));
 let card=null;const shell={children:[],appendChild(node){this.children.push(node);card=node;}};
 const host={querySelector:s=>s==='[data-model-support-card]'?card:s==='.mdhome__shell'?shell:null,prepend(){throw Error('Help must not prepend');}};
 const document={getElementById:()=>host,createElement:()=>({dataset:{},children:[],appendChild(node){this.children.push(node);}})};
 const context={document,root:host};vm.runInNewContext(line+';entryAction("ให้ MMD ช่วย","https://lin.ee/xRqsALs");entryAction("ให้ MMD ช่วย","https://lin.ee/xRqsALs");',context);
 assert.equal(shell.children.length,1);assert.equal(card.children[0].textContent,'ให้ MMD ช่วย');assert.equal(card.children[0].href,'https://lin.ee/xRqsALs');
});
test('Hero uses the exact two-line heading and support card exists for normal home too',()=>{
 const source=fs.readFileSync(new URL('./dashboard-job-world-20261015.js',import.meta.url),'utf8');
 assert.match(source,/Your guide application<\/span><span class="model-guide-name">MY MODEL<\/span>/);
 assert.doesNotMatch(source,/text\('\.mdhome__title',world/);
 assert.match(source,/supportCard\(\);/);assert.match(source,/\(q\('\.mdhome__shell'\)\|\|root\)\.appendChild\(card\)/);
});
