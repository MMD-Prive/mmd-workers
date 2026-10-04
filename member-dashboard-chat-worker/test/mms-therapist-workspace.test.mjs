import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { maybeHandleTherapistWorkspace, renderTherapistWorkspace, therapistClient } from '../src/mms-therapist-workspace.js';
const origin='https://www.mmdbkk.com';
const path='/male-massage/therapists';
test('native work route gates session, entitlement and backend failure before returning a work page',async()=>{
  for(const [status,body,expected] of [[401,{ok:false},302],[403,{ok:false},403],[200,{ok:true,data:{access:'locked',can_open:false}},403],[200,{ok:true,data:{access:'approved',can_open:true}},200],[200,{ok:false},503]]){
    const calls=[];
    const res=await maybeHandleTherapistWorkspace(new Request(origin+path+'/app?source=miniapp',{headers:{cookie:'test-cookie'}}),{MMS_THERAPIST_UI_SOURCE:'native',MMS_WORKER:{async fetch(req){calls.push(req);return Response.json(body,{status});}}});
    assert.equal(res.status,expected);assert.equal(new URL(calls[0].url).pathname,path+'/api/app/access');assert.equal(new URL(calls[0].url).search,'');assert.equal(calls[0].headers.get('cookie'),'test-cookie');assert.match(res.headers.get('cache-control'),/no-store/);
  }
});
test('native pages own only login/profile/app and can defer to Lovable',async()=>{
  assert.equal(await maybeHandleTherapistWorkspace(new Request(origin+path+'/app'),{}),null);
  assert.equal(await maybeHandleTherapistWorkspace(new Request(origin+'/male-massage'),{MMS_THERAPIST_UI_SOURCE:'native'}),null);
  for(const suffix of ['login','me']){const res=await maybeHandleTherapistWorkspace(new Request(origin+path+'/'+suffix),{MMS_THERAPIST_UI_SOURCE:'native'});assert.equal(res.status,200);assert.match(await res.text(),/native-workspace-v1/);}
  const head=await maybeHandleTherapistWorkspace(new Request(origin+path+'/me',{method:'HEAD'}),{MMS_THERAPIST_UI_SOURCE:'native'});assert.equal(await head.text(),'');
});
test('rendered client parses without interpolating backend data',()=>{
  for(const login of [false,true]){const html=renderTherapistWorkspace(login);const script=html.match(/<script>\(([\s\S]*)\)\(\);<\/script>/)[1];new vm.Script('('+script+')');assert.equal(html.includes('innerHTML'),false);}
});

class Element {
  constructor(tag='div'){this.tag=tag;this.children=[];this.dataset={};this.attrs={};this.hidden=false;this.disabled=false;this.value='';this.textContent='';this.listeners={};}
  append(...items){this.children.push(...items);for(const item of items)item.parent=this;}
  replaceChildren(...items){this.children=[];this.append(...items);}
  addEventListener(name,fn){this.listeners[name]=fn;}
  setAttribute(name,value){this.attrs[name]=value;}
  scrollIntoView(){}
  remove(){this.parent.children=this.parent.children.filter(x=>x!==this);}
  querySelectorAll(selector){return this.children.flatMap(c=>[...(selector==='[data-field]'&&c.dataset.field?[c]:[]),...c.querySelectorAll(selector)]);}
  querySelector(){return this.submit || null;}
  async click(){if(!this.disabled){if(this.onclick)await this.onclick();if(this.listeners.click)await this.listeners.click();}}
}
function clientHarness({access={can_open:true,matching_enabled:true,verified_skills:['Sport'],availability_status:'Available',display_name:'Boss'},failure=null}={}) {
  const ids=['notice','entry','workspace','line-login','greeting','readiness','availability','save-availability','refresh','retry','offers','jobs','profile','offer-list','job-list','profile-form','display-name','intro','visibility','courses','photos','upload','save-photos','add-course','logout','detail'];
  const els=Object.fromEntries(ids.map(id=>[id,new Element()]));els.workspace.hidden=true;
  els['profile-form'].submit=new Element('button');
  const tabs=['offers','jobs','profile'].map(tab=>{const el=new Element('button');el.dataset.tab=tab;return el;});
  const jobId='mmsjob_'+'a'.repeat(24);let state='OFFERED';const calls=[];
  let failed=false;
  const context={document:{getElementById:id=>els[id],createElement:tag=>new Element(tag),querySelector:()=>({dataset:{login:'false'}}),querySelectorAll:selector=>selector==='[data-tab]'?tabs:[]},fetch:async(url,options={})=>{
    calls.push({url,options});let data;
    if(url.endsWith('/access'))data=access;
    else if(url.endsWith('/availability'))data={...access,availability_status:JSON.parse(options.body).availability_status};
    else if(url.endsWith('/profile'))data={display_name:'Boss',intro:'',profile_visibility:'hidden',courses:[],photos:[]};
    else if(url.endsWith('/offers'))data=[{jobId,state,serviceLabel:'Sport',expiresAt:new Date(Date.now()+60000).toISOString()}];
    else if(url.endsWith('/jobs'))data=state==='OFFERED'?[]:[{jobId,state,serviceLabel:'Sport'}];
    else if(/\/(accept|start|complete)$/.test(url)){
      if(failure&&!failed){failed=true;return Response.json({ok:false,error:{code:failure}},{status:409});}
      state=url.endsWith('/accept')?'ACCEPTED':url.endsWith('/start')?'IN_PROGRESS':'COMPLETED';data={state};
    }else if(url.endsWith(jobId))data={jobId,state,serviceLabel:'Sport',payoutLabel:'1,610 บาท',expiresAt:new Date(Date.now()+60000).toISOString(),disclosure:{locationUnlocked:false}};
    else throw new Error('unmocked '+url);
    return Response.json({ok:true,data});
  },Response,URLSearchParams,Date,Map,Set,Array,Object,Number,String,JSON,setTimeout,clearTimeout,AbortController,crypto:globalThis.crypto,location:{assign(){},replace(){},pathname:path+'/app',href:origin+path+'/app',hash:''},history:{replaceState(){}},window:{confirm:()=>true}};
  vm.runInNewContext('('+therapistClient.toString()+')()',context);
  return {els,tabs,calls,jobId,get state(){return state;}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function findButton(panel,label){return panel.children.find(el=>el.tag==='button'&&el.textContent===label);}
test('client completes offer → accept → start → complete using exact job and existing APIs',async()=>{
  const h=clientHarness();await settle();assert.equal(h.els.workspace.hidden,false);
  await findButton(h.els['offer-list'].children[0],'ดูรายละเอียด').click();
  await findButton(h.els.detail,'รับงานนี้').click();assert.equal(h.state,'ACCEPTED');
  await h.tabs[1].click();await findButton(h.els['job-list'].children[0],'ดูรายละเอียด').click();
  await findButton(h.els.detail,'เริ่มให้บริการ').click();assert.equal(h.state,'IN_PROGRESS');
  await findButton(h.els['job-list'].children[0],'ดูรายละเอียด').click();
  await findButton(h.els.detail,'ยืนยันจบงาน').click();assert.equal(h.state,'COMPLETED');
  assert.equal(h.calls.filter(c=>c.options.method==='POST').length,3);
  for(const call of h.calls.filter(c=>c.options.method==='POST'))assert.ok(JSON.parse(call.options.body).requestKey);
});
test('failed job action stays unsuccessful and retry reuses its idempotency key',async()=>{
  const h=clientHarness({failure:'INVALID_JOB_TRANSITION'});await settle();await findButton(h.els['offer-list'].children[0],'ดูรายละเอียด').click();
  const accept=findButton(h.els.detail,'รับงานนี้');await accept.click();assert.equal(h.state,'OFFERED');assert.equal(h.els.notice.className,'error');
  await accept.click();const calls=h.calls.filter(c=>c.url.endsWith('/accept'));assert.equal(calls[0].options.body,calls[1].options.body);
});
test('locked app shows approval reason without reading jobs',async()=>{
  const h=clientHarness({access:{can_open:false,access:'locked'}});await settle();assert.match(h.els.readiness.textContent,/รออนุมัติ/);assert.equal(h.els['save-availability'].disabled,true);assert.equal(h.calls.some(c=>c.url.endsWith('/offers')),false);
});
test('availability self-service sends only the availability field',async()=>{
  const h=clientHarness();await settle();h.els.availability.value='Paused';await h.els['save-availability'].click();const call=h.calls.find(c=>c.url.endsWith('/availability'));assert.deepEqual(JSON.parse(call.options.body),{availability_status:'Paused'});assert.match(h.els.notice.textContent,/บันทึก/);
});


test('LIFF callbacks at the registered endpoint use native login while public visits keep marketing', async () => {
  const env={MMS_THERAPIST_UI_SOURCE:'native'};
  assert.equal(await maybeHandleTherapistWorkspace(new Request(origin+path),env),null);
  for(const query of ['?code=oauth&state=state','?liff.state=%3Finvite%3Dtest','?invite=test']) {
    const res=await maybeHandleTherapistWorkspace(new Request(origin+path+query),env);
    assert.equal(res.status,200);assert.match(await res.text(),/data-login="true"/);
  }
});
function loginHarness({url=origin+path+'/login?invite=test-invite', saved=null, loggedIn=true, token='valid-token', error=null, unavailableStorage=false}={}) {
  const ids=['notice','entry','workspace','line-login','greeting','readiness','availability','save-availability','refresh','retry','offers','jobs','profile','offer-list','job-list','profile-form','display-name','intro','visibility','courses','photos','upload','save-photos','add-course','logout','detail'];
  const els=Object.fromEntries(ids.map(id=>[id,new Element()]));
  const data=new Map(saved||[]), requests=[], redirects=[];let logouts=0;
  const parsed=new URL(url);
  const context={document:{getElementById:id=>els[id],querySelector:()=>({dataset:{login:'true'}}),querySelectorAll:()=>[]},
    fetch:async(url,options={})=>{requests.push({url,options});if(url.endsWith('/me'))return Response.json({ok:false,error:{code:'THERAPIST_SESSION_REQUIRED'}},{status:401});return error?Response.json({ok:false,error:{code:error}},{status:401}):Response.json({ok:true,data:{}});},
    window:{sessionStorage:{getItem(k){if(unavailableStorage)throw Error();return data.get(k)||null;},setItem(k,v){if(unavailableStorage)throw Error();data.set(k,v);},removeItem(k){data.delete(k);}},liff:{async init(){},isLoggedIn:()=>loggedIn,getIDToken:()=>token,logout(){logouts++;},login(o){redirects.push(o.redirectUri);}}},
    location:{href:url,hash:parsed.hash,pathname:parsed.pathname,assign(u){redirects.push(u);},replace(u){redirects.push(u);}},history:{replaceState(){}},URL,URLSearchParams,Response,Date,Map,Set,Array,Object,Number,String,JSON,AbortController,setTimeout,clearTimeout,crypto:globalThis.crypto};
  vm.runInNewContext('('+therapistClient.toString()+')()',context);
  return {els,data,requests,redirects,get logouts(){return logouts;}};
}
test('query invite reaches backend and is removed only after success',async()=>{
  const h=loginHarness();await settle();await h.els['line-login'].click();
  assert.deepEqual(JSON.parse(h.requests[0].options.body),{id_token:'valid-token',invite_token:'test-invite'});
  assert.equal(h.data.has('mms-therapist-invite-v1'),false);assert.equal(h.redirects.at(-1),path+'/app');
});
test('failed LINE verification retains invite and triggers bounded fresh login',async()=>{
  const h=loginHarness({error:'LINE_ID_TOKEN_INVALID'});await settle();await h.els['line-login'].click();
  assert.equal(h.logouts,1);assert.ok(h.data.has('mms-therapist-invite-v1'));
  const redirect=new URL(h.redirects[0]);assert.equal(redirect.pathname,path+'/login');assert.equal(redirect.searchParams.get('line_recovery'),'1');assert.equal(new URLSearchParams(redirect.hash.slice(1)).get('invite'),'test-invite');
  await h.els['line-login'].click();assert.equal(h.logouts,1);assert.match(h.els.notice.textContent,/ติดต่อพี่เปอร์/);
});
test('OAuth callback resumes saved invitation without a second tap',async()=>{
  const h=loginHarness({url:origin+path+'?code=test&state=state',saved:[['mms-therapist-invite-v1',JSON.stringify({token:'saved-invite',until:Date.now()+60000})]]});
  await settle();assert.equal(JSON.parse(h.requests[0].options.body).invite_token,'saved-invite');assert.equal(h.redirects.at(-1),path+'/app');
});
test('missing ID token recovers once even when browser storage is blocked',async()=>{
  const h=loginHarness({token:null,unavailableStorage:true});await settle();await h.els['line-login'].click();assert.equal(h.requests.length,0);assert.equal(h.logouts,1);
  const h2=loginHarness({url:h.redirects[0],token:null,unavailableStorage:true});await settle();await h2.els['line-login'].click();assert.equal(h2.logouts,0);assert.match(h2.els.notice.textContent,/ติดต่อพี่เปอร์/);
});
test('expired saved invitation is never used and failed access keeps current invitation',async()=>{
  const h=loginHarness({error:'THERAPIST_ACCESS_DENIED'});await settle();await h.els['line-login'].click();assert.ok(h.data.has('mms-therapist-invite-v1'));assert.equal(h.redirects.length,0);
  const expired=loginHarness({url:origin+path+'/login',saved:[['mms-therapist-invite-v1',JSON.stringify({token:'expired',until:Date.now()-1})]]});await settle();await expired.els['line-login'].click();assert.equal(JSON.parse(expired.requests.at(-1).options.body).invite_token,undefined);
});

const webflowLogin = readFileSync(new URL('../../webflow/mms/therapist-login/therapist-login.js', import.meta.url), 'utf8');
function webflowHarness({error=null, callback=false}={}) {
  const button=new Element(), state=new Element(), values=new Map(), calls=[], redirects=[];
  const url=origin+path+'/login?invite=webflow-invite'+(callback?'&code=oauth':'');
  const root={dataset:{authReady:'true',liffId:'dedicated-liff',authEndpoint:path+'/api/auth/line'},querySelector:selector=>selector.includes('state-copy')?state:button};
  const window={location:{href:url,assign:target=>redirects.push(target)},history:{replaceState(){}},sessionStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},liff:{async init(){},isLoggedIn:()=>true,getIDToken:()=> 'token',logout(){},login:options=>redirects.push(options.redirectUri)}};
  vm.runInNewContext(webflowLogin,{window,document:{getElementById:()=>root},URL,URLSearchParams,Date,JSON,String,fetch:async(url,options)=>{calls.push(JSON.parse(options.body));return error?Response.json({ok:false,error:{code:error}},{status:401}):Response.json({ok:true,data:{}});}});
  return {button,state,values,calls,redirects};
}
test('Webflow compatibility login sends query invite and resumes callbacks',async()=>{
  const h=webflowHarness();await h.button.click();assert.equal(h.calls[0].invite_token,'webflow-invite');assert.equal(h.values.has('mms-therapist-invite-v1'),false);
  const callback=webflowHarness({callback:true});await settle();assert.equal(callback.calls[0].invite_token,'webflow-invite');
});
test('Webflow failed LINE authentication keeps invite and bounds fresh login',async()=>{
  const h=webflowHarness({error:'LINE_ID_TOKEN_INVALID'});await h.button.click();assert.ok(h.values.has('mms-therapist-invite-v1'));assert.equal(new URLSearchParams(new URL(h.redirects[0]).hash.slice(1)).get('invite'),'webflow-invite');
  await h.button.click();assert.equal(h.redirects.length,1);assert.match(h.state.textContent,/ติดต่อพี่เปอร์/);
});
