import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
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
