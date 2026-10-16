import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBundle } from '../../../scripts/build-my-model-workspace-bundle.mjs';

const source = fs.readFileSync(new URL('./my-model-workspace-20261016.js', import.meta.url), 'utf8');
const legacyJobWorld = fs.readFileSync(new URL('./dashboard-job-world-20261015.js', import.meta.url), 'utf8');
const common = {module:{exports:{}},URL,URLSearchParams}; vm.runInNewContext(source, common);
const {classify, world, safeUrl, miniAppLink, profilePatch} = common.module.exports;
const model = {working_name:'Fixture Model',readiness:{line_identity_verified:true},languages:['thai'],availability_status:'available',available_now:true,telegram_connected:false};

function fixture({profile={ok:true,model}, job={status:404,error:'active_session_not_found'}, origin='https://mmdbkk.com', search='', loggedIn=false, legacyRoot=false, workspaceRoot=true} = {}) {
  const calls=[], events=new Map(), nodes=new Map();
  function element(tag='DIV') {return {tagName:tag.toUpperCase(),dataset:{},hidden:false,disabled:false,textContent:'',value:'',checked:false,children:[],listeners:{},
    append(...items){this.children.push(...items);},replaceChildren(...items){this.children=[...items];this.textContent='';},removeAttribute(key){delete this[key];},
    addEventListener(key,fn){this.listeners[key]=fn;},querySelectorAll(){return [];},reset(){},remove(){}};}
  const root=element();root.querySelector=selector=>{if(!nodes.has(selector))nodes.set(selector,element());return nodes.get(selector);};
  const roots=new Map(workspaceRoot?[['mmd-model-home-v4',root]]:[]);
  if(legacyRoot){const legacy=element('section');legacy.remove=()=>{roots.delete('mmd-model-home-v3');calls.push({retired:'mmd-model-home-v3'});};roots.set('mmd-model-home-v3',legacy);}
  const form=root.querySelector('[data-mss-profile-form]'); form.elements={};
  root.querySelector('[data-mm-save-status]');
  for(const key of ['height_cm','weight_kg','skills_summary','experience_summary','availability_status','available_now']) form.elements[key]=element('input');
  form.querySelectorAll=()=>[];
  const window={document:{title:'',getElementById:id=>roots.get(id)||null,createElement:element},
    location:{origin,search,assign(url){calls.push({navigation:url});}},
    liff:{async init(){calls.push({sdk:'init'});},isLoggedIn:()=>loggedIn,getIDToken:()=> 'fixture-id-token'},
    addEventListener(name,fn){if(!events.has(name))events.set(name,[]);events.get(name).push(fn);},
    dispatchEvent(event){for(const fn of events.get(event.type)||[])fn(event);},
    async fetch(url,options={}){
      calls.push({url:String(url),options});
      const payload=String(url).includes('/session/current')?job:String(url).includes('/media')?{ok:true,media:[]}:profile;
      return new Response(JSON.stringify(payload),{status:payload.status||200});
    }};
  const context={window,document:window.document,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,Intl,CustomEvent:class {constructor(type,init={}){this.type=type;this.detail=init.detail;}}};
  vm.runInNewContext(source,context);
  return {calls,nodes,form,window,events,roots,run:script=>vm.runInNewContext(script,context)};
}
async function settle(){for(let n=0;n<8;n++)await new Promise(setImmediate);}
function deferredResponse(){let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};}

// MMDModelHomeV3 1.0.0's entry contract: missing v3 root returns before
// scheduling load() or subscribing to model-session-ready. Use the existing
// footer runtime above, and a sentinel for the external loader's side effects.
const legacyHomeEntry=`(()=>{const r=document.getElementById('mmd-model-home-v3');if(!r)return;throw Error('legacy home loader still active');})();`;

test('Dashboard retires the v3 root before reads and saved legacy entrypoints cannot start',async()=>{
  const f=fixture({legacyRoot:true});
  assert.equal(f.roots.has('mmd-model-home-v3'),false);
  assert.deepEqual(f.calls[0],{retired:'mmd-model-home-v3'});
  f.run(legacyJobWorld);f.run(legacyHomeEntry);await settle();
  assert.equal(f.window.__MODEL_JOB_WORLD_V1__,undefined,'saved footer must return before it initializes');
  assert.equal(f.events.has('mmd:model-session-ready'),false,'no legacy session listener');
  const counts={};for(const c of f.calls.filter(c=>c.url))counts[c.url]=(counts[c.url]||0)+1;
  assert.deepEqual(counts,{'/v1/model/profile':1,'/v1/model/media':1,'https://mmdbkk.com/v1/model/session/current':1});
  assert.equal(f.nodes.get('[data-mm-name]').textContent,'Fixture Model');
  assert.equal(f.calls.some(c=>c.options?.method),false,'no write or auth exchange from retirement');
});

test('repeated workspace initialization does not restart reads or add listeners',async()=>{
  const f=fixture({legacyRoot:true});await settle();
  assert.equal(f.roots.has('mmd-model-home-v3'),false);
  const calls=f.calls.length, listeners=[...f.events].map(([name,handlers])=>[name,handlers.length]);
  f.run(source);f.run(legacyJobWorld);f.run(legacyHomeEntry);await settle();
  assert.equal(f.calls.length,calls);
  assert.deepEqual([...f.events].map(([name,handlers])=>[name,handlers.length]),listeners);
  assert.equal(f.calls.filter(c=>c.retired).length,1);
});

test('pages without the v4 workspace keep their legacy root and perform no workspace work',async()=>{
  const f=fixture({legacyRoot:true,workspaceRoot:false});await settle();
  assert.equal(f.roots.has('mmd-model-home-v3'),true);
  assert.equal(f.calls.length,0);
  assert.equal(f.events.size,0);
});

for(const status of [401,403])test(`legacy shutdown stays effective when Dashboard identity returns ${status}`,async()=>{
  const f=fixture({legacyRoot:true,profile:{ok:false,status,error:status===401?'model_session_expired':'private_access_required'}});
  assert.equal(f.roots.has('mmd-model-home-v3'),false);
  f.run(legacyJobWorld);f.run(legacyHomeEntry);await settle();
  assert.equal(f.roots.has('mmd-model-home-v3'),false);
  assert.equal(f.nodes.get('[data-mm-workspace]').hidden,true);
  assert.equal(f.nodes.get('[data-mm-name]').textContent,'');
  assert.equal(f.calls.filter(c=>c.url).length,1,'only the authoritative profile read');
  assert.equal(f.calls.some(c=>c.options?.method),false);
  assert.equal(f.window.__MODEL_JOB_WORLD_V1__,undefined);
});

for(const status of [401,403])test(`late successful profile PATCH cannot reopen workspace after media ${status}`,async()=>{
  const f=fixture();await settle();const pending=deferredResponse();
  f.window.fetch=async(url,options={})=>options.method==='PATCH'?pending.promise:Response.json({ok:false,error:status===401?'model_session_expired':'private_access_required'},{status});
  const saving=f.form.listeners.submit({preventDefault(){}});
  f.window.dispatchEvent({type:'mmd:model-media-updated'});await settle();
  assert.equal(f.nodes.get('[data-mm-workspace]').hidden,true);
  let reopened=0;
  f.window.addEventListener('mmd:model-profile-ready',()=>{if(!f.nodes.get('[data-mm-workspace]').hidden)reopened++;});
  pending.resolve(Response.json({ok:true,model:{...model,working_name:'Stale Model'}}));await saving;await settle();
  assert.equal(reopened,0,'stale save must not emit profile-ready or restart uploader');
  assert.equal(f.nodes.get('[data-mm-workspace]').hidden,true);
  assert.equal(f.nodes.get('[data-mm-name]').textContent,'');
  assert.equal(f.nodes.get('[data-mm-gallery]').children.length,0);
  assert.notEqual(f.nodes.get('[data-mm-save-status]').textContent,'บันทึกข้อมูลแล้ว');
});

for(const oldStatus of [200,403])test(`old PATCH ${oldStatus} cannot replace or lock a reverified profile or enable its pending save`,async()=>{
  const f=fixture();await settle();const old=deferredResponse(),fresh=deferredResponse();let writes=0,expired=true;
  f.window.fetch=async(url,options={})=>{
    if(options.method==='PATCH')return ++writes===1?old.promise:fresh.promise;
    if(String(url).includes('/media'))return expired?Response.json({ok:false,error:'model_session_expired'},{status:401}):Response.json({ok:true,media:[]});
    if(String(url).includes('/session/current'))return Response.json({ok:false,error:'active_session_not_found'},{status:404});
    return Response.json({ok:true,model:{...model,working_name:'Reverified Model'}});
  };
  const savingOld=f.form.listeners.submit({preventDefault(){}});
  f.window.dispatchEvent({type:'mmd:model-media-updated'});await settle();
  assert.equal(f.nodes.get('[data-mm-workspace]').hidden,true);
  expired=false;await f.nodes.get('[data-mm-refresh]').listeners.click();await settle();
  assert.equal(f.nodes.get('[data-mm-name]').textContent,'Reverified Model');
  const savingFresh=f.form.listeners.submit({preventDefault(){}});
  old.resolve(oldStatus===200?Response.json({ok:true,model:{...model,working_name:'Stale Model'}}):Response.json({ok:false,error:'private_access_required'},{status:403}));
  await savingOld;await settle();
  const afterOld={hidden:f.nodes.get('[data-mm-workspace]').hidden,name:f.nodes.get('[data-mm-name]').textContent,saveDisabled:f.nodes.get('[data-mss-save]').disabled};
  fresh.resolve(Response.json({ok:true,model:{...model,working_name:'Fresh Saved Model'}}));await savingFresh;await settle();
  assert.equal(afterOld.hidden,false,'stale denial must not lock the freshly verified profile');
  assert.equal(afterOld.name,'Reverified Model','stale success must not replace the freshly verified profile');
  assert.equal(afterOld.saveDisabled,true,'stale finally must not enable another pending save');
  assert.equal(f.nodes.get('[data-mm-name]').textContent,'Fresh Saved Model');
  assert.equal(f.nodes.get('[data-mss-save]').disabled,false);
  assert.equal(writes,2,'no automatic PATCH replay');
});

test('current profile save still enforces auth denial and surfaces ordinary source failures',async()=>{
  for(const status of [401,403,503]){
    const f=fixture();await settle();
    f.window.fetch=async()=>Response.json({ok:false,error:status===401?'model_session_expired':status===403?'private_access_required':'upstream_unavailable'},{status});
    await f.form.listeners.submit({preventDefault(){}});await settle();
    assert.equal(f.nodes.get('[data-mm-workspace]').hidden,status!==503);
    assert.match(f.nodes.get('[data-mm-save-status]').textContent,/ยังยืนยันการบันทึกไม่ได้/);
    if(status===503)assert.equal(f.nodes.get('[data-mss-save]').disabled,false);
  }
});

test('primary media action requires explicit backend capability; delete remains independent',async()=>{
  for(const capability of [undefined,null,false,'true',true]){
    const f=fixture();await settle();
    f.window.fetch=async()=>Response.json({ok:true,media:[{media_id:'media_fixture',media_type:'public_gallery',self_managed:true,review_status:capability===true?'approved':'pending_review',can_request_main:capability,can_delete:true}]});
    f.window.dispatchEvent({type:'mmd:model-media-updated'});await settle();
    const buttons=f.nodes.get('[data-mm-gallery]').children[0].children.filter(node=>node.tagName==='BUTTON');
    assert.equal(buttons.some(node=>node.textContent==='ขอใช้เป็นรูปหลัก'),capability===true,String(capability));
    assert.equal(buttons.some(node=>node.textContent==='ลบรายการนี้'),true);
  }
});

test('approved primary action uses the existing endpoint and videos never get a primary action',async()=>{
  const f=fixture();await settle();const writes=[];
  f.window.fetch=async(url,options={})=>{
    if(options.method){writes.push({url:String(url),method:options.method});return Response.json({ok:true});}
    return Response.json({ok:true,media:[
      {media_id:'media_photo',media_type:'public_gallery',self_managed:true,can_request_main:true,can_delete:false},
      {media_id:'media_clip',media_type:'intro_video',self_managed:true,can_request_main:true,can_delete:false},
    ]});
  };
  f.window.dispatchEvent({type:'mmd:model-media-updated'});await settle();
  const cards=f.nodes.get('[data-mm-gallery]').children;
  const buttons=cards[0].children.filter(node=>node.tagName==='BUTTON');
  assert.equal(buttons.length,1);
  assert.equal(cards[1].children.filter(node=>node.tagName==='BUTTON').length,0);
  await buttons[0].listeners.click();
  assert.deepEqual(writes,[{url:'/v1/model/media/media_photo/set-main',method:'POST'}]);
});

test('linked account with no job retains profile, availability and Telegram entry without signup or auth exchange',async()=>{
  const f=fixture();await settle();
  assert.equal(f.nodes.get('[data-mm-workspace]').hidden,false);
  assert.equal(f.nodes.get('[data-mm-apply]').hidden,true);
  assert.equal(f.nodes.get('[data-mm-primary]').hidden,true);
  assert.match(f.nodes.get('[data-mm-job]').textContent,/ยังไม่มีงาน/);
  assert.equal(f.nodes.get('[data-mm-name]').textContent,'Fixture Model');
  assert.equal(f.nodes.get('[data-mm-telegram-connect]').hidden,false);
  assert.equal(f.calls.some(c=>c.sdk||c.options?.method),false);
});
test('job outage never becomes an empty-job success and does not discard an independently authorized profile',async()=>{
  const f=fixture({job:{status:503,error:'upstream_unavailable'}});await settle();
  assert.match(f.nodes.get('[data-mm-job]').textContent,/ยังตรวจงานไม่สำเร็จ/);
  assert.equal(f.nodes.get('[data-mm-workspace]').hidden,false);
});
test('identity review, unlinked, denial and upstream failures stay distinct and never create an application',async()=>{
  for(const [status,error,apply] of [[202,'identity_review_required',false],[401,'model_not_linked',true],[403,'private_access_required',false],[503,'upstream_unavailable',false]]){
    const f=fixture({profile:{ok:false,status,error}});await settle();
    assert.equal(f.nodes.get('[data-mm-workspace]').hidden,true,error);
    assert.equal(f.nodes.get('[data-mm-apply]').hidden,!apply,error);
    assert.equal(f.calls.some(c=>c.sdk||c.url?.includes('/session/current')||c.options?.method),false,error);
  }
});
test('expired identity only initializes the registered apex LIFF endpoint, with explicit login CTA',async()=>{
  const f=fixture({profile:{ok:false,status:401,error:'model_session_expired'}});await settle();
  assert.equal(f.calls.filter(c=>c.sdk).length,1);
  assert.equal(f.nodes.get('[data-mm-primary]').hidden,false);
  assert.equal(f.nodes.get('[data-mm-workspace]').hidden,true);
  const www=fixture({origin:'https://www.mmdbkk.com',profile:{ok:false,status:401,error:'model_session_required'}});await settle();
  assert.equal(www.calls.some(c=>c.sdk),false);
  assert.equal(www.nodes.get('[data-mm-primary]').href,'https://mmdbkk.com/sigil/model/dashboard');
});
test('canonical session is server-gated; signed query is not sent to media or arbitrary endpoints',async()=>{
  const f=fixture({search:'?t=fixture-signed&session_id=s1&world=private',job:{ok:true,session:{session_id:'s1',model_work_lane:'private_model'}}});await settle();
  assert.equal(f.calls.find(c=>c.url?.includes('/session/current')).url,'https://mmdbkk.com/v1/model/session/current?t=fixture-signed');
  assert.equal(f.nodes.get('[data-mm-console]').href,'https://mmdbkk.com/sigil/model/console?t=fixture-signed');
  assert.equal(f.calls.some(c=>c.url?.includes('/media?')),false);
  assert.match(f.nodes.get('[data-mm-job]').textContent,/Console/);
});
test('mismatched job and ambiguous selection reveal no job details or implicit empty success',async()=>{
  for(const job of [{ok:true,session:{session_id:'other',model_work_lane:'private_model'}},{status:409,error:'current_session_review_required'}]){
    const f=fixture({search:'?session_id=s1',job});await settle();
    assert.match(f.nodes.get('[data-mm-job]').textContent,/กำลังตรวจ/);
    assert.equal(f.nodes.get('[data-mm-console]').href,'/sigil/model/console');
  }
});
test('session expiry after profile read hides workspace and clears profile/gallery context',async()=>{
  const f=fixture({job:{status:401,error:'model_session_expired'}});await settle();
  assert.equal(f.nodes.get('[data-mm-workspace]').hidden,true);
  assert.equal(f.nodes.get('[data-mm-name]').textContent,'');
  assert.equal(f.nodes.get('[data-mm-gallery]').children.length,0);
});
test('page boot is read-only for canonical session holders; profile PATCH occurs only on form submission',async()=>{
  const f=fixture();await settle();assert.equal(f.calls.some(c=>c.options?.method),false);
  f.form.elements.height_cm.value='180';f.form.elements.weight_kg.value='';f.form.elements.skills_summary.value='  sport  ';
  await f.form.listeners.submit({preventDefault(){}});
  const patch=f.calls.find(c=>c.options?.method==='PATCH');assert.ok(patch);
  assert.deepEqual(JSON.parse(patch.options.body),{height_cm:180,languages:[],skills_summary:'sport',experience_summary:'',availability_status:'available',available_now:true});
  assert.equal(Object.hasOwn(JSON.parse(patch.options.body),'minimum_rate_90m'),false);
});
test('broadcast context is retained but cannot supply redirects or private authorization',()=>{
  const url=new URL(miniAppLink('?intent=job_board&job_id=JOB-123&next=https://evil.invalid&return_to=console&world=private','apply'));
  assert.equal(url.searchParams.get('job_id'),'JOB-123');assert.equal(url.searchParams.get('flow'),'apply');
  assert.equal(url.searchParams.get('next'),'https://sigil.mmdbkk.com/public/api/jobs/JOB-123');
  assert.equal(url.searchParams.has('return_to'),false);assert.equal(url.searchParams.has('world'),false);
  assert.equal(new URL(miniAppLink('?intent=job_board&job_id=https://evil.invalid')).searchParams.has('job_id'),false);
});
test('private design only follows a consistent authorized current-job lane',()=>{
  assert.equal(world({ok:true,session:{session_id:'s',model_work_lane:'private_model'}}),'private');
  for(const payload of [{ok:false,session:{session_id:'s',model_work_lane:'private_model'}},{ok:true,world:'private',session:{session_id:'s'}},{ok:true,session:{session_id:'s',model_work_lane:'private_model',payout_terms:{money_lane:'public_model'}}}])assert.equal(world(payload),'public');
  assert.equal(world({ok:true,session:{session_id:'s',model_work_lane:'private_model'}},'other'),'public');
});
test('URL validation and profile allowlist reject empty/executable URLs and omit money fields',()=>{
  for(const value of ['',null,'javascript:alert(1)','data:image/svg+xml,x','https://secret@example.com/'])assert.equal(safeUrl(value,'https://mmdbkk.com'),'');
  assert.equal(safeUrl('https://evil.invalid','https://mmdbkk.com','t.me'),'');
  assert.equal(safeUrl('/v1/model/media/a/file','https://mmdbkk.com'),'https://mmdbkk.com/v1/model/media/a/file');
  assert.equal(classify({status:409,message:'current_session_review_required'}),'review');
});
test('assembled Webflow bundle contains one UI owner, working profile/media hosts and parseable scripts',()=>{
  const html=buildBundle();assert.equal((html.match(/id="mmd-model-home-v4"/g)||[]).length,1);
  for(const name of ['data-mss-profile-form','data-mm-media-host','data-mm-telegram-connect','/sigil/model/dashboard/jobs','/rules/public-model-work'])assert.ok(html.includes(name),name);
  assert.match(html,/mmd:model-workspace-locked/);assert.match(html,/root.remove\(\)/);
  assert.doesNotMatch(html,/data-action="|liff\.login\(|localStorage|window\.location\.reload/);
  for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
  assert.ok(Buffer.byteLength(html)<50000,'Webflow embed fits 50,000-byte budget');
});
