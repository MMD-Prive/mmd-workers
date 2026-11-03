import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import { buildBundle } from '../../../scripts/build-my-model-workspace-bundle.mjs';

const source = fs.readFileSync(new URL('./my-model-workspace-20261016.js', import.meta.url), 'utf8');
const legacyJobWorld = fs.readFileSync(new URL('./dashboard-job-world-20261015.js', import.meta.url), 'utf8');
const common = {module:{exports:{}},URL,URLSearchParams}; vm.runInNewContext(source, common);
const {classify, world, safeUrl, miniAppLink, profilePatch} = common.module.exports;
const model = {working_name:'Fixture Model',readiness:{line_identity_verified:true},languages:['thai'],availability_status:'available',available_now:true,telegram_connected:false};

function fixture({profile={ok:true,model}, job={status:404,error:'active_session_not_found'}, origin='https://mmdbkk.com', search='', loggedIn=false, legacyRoot=false, workspaceRoot=true, runtime=source} = {}) {
  const calls=[], events=new Map(), nodes=new Map();
  function element(tag='DIV') {return {tagName:tag.toUpperCase(),dataset:{},hidden:false,disabled:false,textContent:'',value:'',checked:false,children:[],listeners:{},
    append(...items){this.children.push(...items);},replaceChildren(...items){this.children=[...items];this.textContent='';},removeAttribute(key){delete this[key];},
    addEventListener(key,fn){this.listeners[key]=fn;},querySelectorAll(){return [];},reset(){},remove(){},focus(){this.focused=true;}};}
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
  vm.runInNewContext(runtime,context);
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
    assert.equal(f.nodes.get('[data-mm-save-status]').textContent,status===401?'หมดเวลา · ตรวจ LINE':'บันทึกไม่ได้ · ตรวจสถานะ ลองใหม่');
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
  assert.equal(f.nodes.get('[data-mm-console]').href,'https://mmdbkk.com/sigil/model/console?t=fixture-signed&session_id=s1');
  assert.equal(f.calls.some(c=>c.url?.includes('/media?')),false);
  assert.match(f.nodes.get('[data-mm-job]').textContent,/Console/);
});
test('mismatched job and ambiguous selection reveal no job details or implicit empty success',async()=>{
  for(const job of [{ok:true,session:{session_id:'other',model_work_lane:'private_model'}},{status:409,error:'current_session_review_required'}]){
    const f=fixture({search:'?session_id=s1',job});await settle();
    assert.match(f.nodes.get('[data-mm-job]').textContent,/กำลังตรวจ/);
    assert.equal(f.nodes.get('[data-mm-console]').href,'https://mmdbkk.com/sigil/model/console?session_id=s1');
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

for (const error of ['session_not_found', 'active_session_not_found']) {
  test(`current job 404 ${error} shows no-job without locking verified profile`, async () => {
    const f = fixture({job:{ok:false,status:404,error}}); await settle();
    assert.equal(f.nodes.get('[data-mm-job]').textContent, 'ยังไม่มีงานที่กำลังใช้งาน');
    assert.equal(f.nodes.get('[data-mm-workspace]').hidden, false);
    assert.equal(f.nodes.get('[data-mm-name]').textContent, 'Fixture Model');
    assert.equal(f.nodes.get('[data-mm-console]').href, '/sigil/model/console');
    assert.equal(f.calls.some(c => c.options?.method || c.sdk), false);
  });
}
for (const [status,error] of [[401,'model_session_expired'],[403,'forbidden'],[503,'session_not_found'],[503,'session_lookup_unavailable'],[404,'route_not_found'],[404,''],[200,'session_not_found']]) {
  test(`current job ${status}/${error || 'missing code'} never claims no-job`, async () => {
    const f = fixture({job:{ok:false,status,error}}); await settle();
    assert.notEqual(f.nodes.get('[data-mm-job]').textContent, 'ยังไม่มีงานที่กำลังใช้งาน');
    assert.equal(f.calls.some(c => c.options?.method || c.sdk), false);
    if (status === 401) assert.equal(f.nodes.get('[data-mm-workspace]').hidden, true);
  });
}
test('packed workspace CSS decodes byte-for-byte and refuses token collisions',async()=>{
  const {workspaceStyleSource}=await import('../../../scripts/build-my-model-workspace-bundle.mjs');
  const css='#mmd-model-home-v4{color:red}#mmd-model-home-v4 button{padding:4px}';let style;
  vm.runInNewContext(workspaceStyleSource(css),{document:{createElement:()=>({}),head:{append:s=>{style=s;}}}});
  assert.equal(style.textContent,css);assert.equal(style.id,'mmd-workspace-style');
  assert.throws(()=>workspaceStyleSource('~R{}'),/token collision/);
});
function reconfirmJob(extra={}) {
  return {ok:true,session:{session_id:'session-reconfirm',state:'confirmed',model_work_lane:'private_model',job_date:'2026-11-01',
    start_time:'2026-11-01T19:00:00+07:00',location_name:'Fixture venue',allowed_actions:['acknowledge_reconfirm'],
    reconfirm:{status:'pending',required_at:'2026-10-31T18:00:00+07:00',notified_at:'2026-10-31T18:00:00+07:00'},...extra}};
}
function acknowledgedJob() {const data=reconfirmJob();data.session.allowed_actions=[];data.session.reconfirm={...data.session.reconfirm,status:'acknowledged',acknowledged_at:'2026-10-31T18:10:00+07:00'};return data;}

test('MY MODEL shows real job details and server-allowed acknowledgement without a write on boot',async()=>{
  const f=fixture({job:reconfirmJob()});await settle();
  assert.equal(f.nodes.get('[data-mm-reconfirm]').hidden,false);
  assert.equal(f.nodes.get('[data-mm-reconfirm-ack]').disabled,false);
  assert.equal(f.nodes.get('[data-mm-reconfirm-location]').textContent,'Fixture venue');
  assert.equal(f.calls.some(c=>c.options?.method),false);
});

test('acknowledgement rechecks the selected session and waits for server evidence, preserving signed context',async()=>{
  const f=fixture({job:reconfirmJob(),search:'?t=fixture-signed&session_id=session-reconfirm'});await settle();
  const original=f.window.fetch,writes=[];
  f.window.fetch=async(url,options={})=>{
    if(String(url)==='/v1/model/session/action'){writes.push({url,options});return Response.json(acknowledgedJob());}
    return original(url,options);
  };
  await f.nodes.get('[data-mm-reconfirm-ack]').listeners.click();
  assert.equal(writes.length,1);
  assert.deepEqual(JSON.parse(writes[0].options.body),{action:'acknowledge_reconfirm',session_id:'session-reconfirm',t:'fixture-signed'});
  assert.equal(writes[0].options.credentials,'include');
  assert.equal(f.nodes.get('[data-mm-reconfirm-ack]').textContent,'รับทราบแล้ว');
  assert.equal(f.nodes.get('[data-mm-reconfirm-ack]').disabled,true);
  assert.ok(!writes.some(x=>/start_travel|start_work/.test(x.options.body)));
});

for(const session of [reconfirmJob({allowed_actions:[]}),reconfirmJob({state:'work_started'}),reconfirmJob({reconfirm:null}),reconfirmJob({reconfirm:{status:'unknown'}})])
test('missing server capability or invalid lifecycle never enables acknowledgement: '+JSON.stringify(session.session),async()=>{
  const f=fixture({job:session});await settle();assert.equal(f.nodes.get('[data-mm-reconfirm-ack]').disabled,true);
});

test('changed details, cancelled state and another session all block the write and clear stale details',async()=>{
  for(const changed of [reconfirmJob({location_name:'Changed venue'}),reconfirmJob({state:'cancelled'}),reconfirmJob({session_id:'other-session'})]){
    const f=fixture({job:reconfirmJob()});await settle();let writes=0;
    f.window.fetch=async(url,options={})=>{if(options.method)writes++;return Response.json(changed);};
    await f.nodes.get('[data-mm-reconfirm-ack]').listeners.click();
    assert.equal(writes,0);assert.equal(f.nodes.get('[data-mm-reconfirm]').hidden,true);
    assert.equal(f.nodes.get('[data-mm-reconfirm-location]').textContent,'');
  }
});

test('an unconfirmed or failed acknowledgement never displays success',async()=>{
  for(const response of [()=>Response.json({ok:true,session:reconfirmJob().session}),()=>Response.json({ok:false,error:'unavailable'},{status:503}),()=>Response.json({ok:true,session:acknowledgedJob().session&&{...acknowledgedJob().session,session_id:'other'}})]){
    const f=fixture({job:reconfirmJob()});await settle();const original=f.window.fetch;
    f.window.fetch=(url,options={})=>options.method==='POST'?response():original(url,options);
    await f.nodes.get('[data-mm-reconfirm-ack]').listeners.click();
    assert.equal(f.nodes.get('[data-mm-reconfirm]').hidden,true);
    assert.doesNotMatch(f.nodes.get('[data-mm-reconfirm-status]').textContent,/บันทึกการรับทราบแล้ว/);
  }
});

test('duplicate clicks make one write and late success cannot reopen a locked workspace',async()=>{
  const f=fixture({job:reconfirmJob()});await settle();const original=f.window.fetch,pending=deferredResponse();let writes=0;
  f.window.fetch=async(url,options={})=>{if(options.method==='POST'){writes++;return pending.promise;}return original(url,options);};
  const first=f.nodes.get('[data-mm-reconfirm-ack]').listeners.click();await settle();
  await f.nodes.get('[data-mm-reconfirm-ack]').listeners.click();assert.equal(writes,1);
  f.window.fetch=()=>Promise.resolve(Response.json({ok:false,error:'private_access_required'},{status:403}));
  await f.nodes.get('[data-mm-refresh]').listeners.click();
  pending.resolve(Response.json(acknowledgedJob()));await first;
  assert.equal(f.nodes.get('[data-mm-workspace]').hidden,true);
  assert.equal(f.nodes.get('[data-mm-reconfirm]').hidden,true);
});

test('another device acknowledgement is read back without posting again',async()=>{
  const f=fixture({job:reconfirmJob()});await settle();let writes=0;
  f.window.fetch=async(url,options={})=>{if(options.method)writes++;return Response.json(acknowledgedJob());};
  await f.nodes.get('[data-mm-reconfirm-ack]').listeners.click();
  assert.equal(writes,0);assert.equal(f.nodes.get('[data-mm-reconfirm-ack]').textContent,'รับทราบแล้ว');
});

for (const review of [true,false,undefined]) test(`profile save pending single-flight and confirmed review=${review}`,async()=>{
  const f=fixture();await settle();const pending=deferredResponse();let writes=0;
  f.window.fetch=async(url,options={})=>{
    if(options.method==='PATCH'){writes++;return pending.promise;}
    return Response.json({ok:true,media:[]});
  };
  const first=f.form.listeners.submit({preventDefault(){}});
  assert.equal(f.nodes.get('[data-mss-save]').disabled,true);
  assert.equal(f.nodes.get('[data-mm-save-status]').textContent,'กำลังบันทึก');
  await f.form.listeners.submit({preventDefault(){}});
  assert.equal(writes,1);
  pending.resolve(Response.json({ok:true,model:{...model,working_name:'Saved Fixture'},...(review===undefined?{}:{review_required:review})}));
  await first;await settle();
  assert.equal(f.nodes.get('[data-mm-save-status]').textContent,review===true?'บันทึกแล้ว · รอตรวจ':'บันทึกสำเร็จ');
  assert.equal(f.nodes.get('[data-mm-name]').textContent,'Saved Fixture');
  assert.equal(f.nodes.get('[data-mss-save]').disabled,false);
  assert.equal(writes,1);
});

test('submit without a verified profile makes no write and focuses account refresh',async()=>{
  const f=fixture({profile:{ok:false,status:403,error:'model_not_linked'}});await settle();
  const before=f.calls.length;
  await f.form.listeners.submit({preventDefault(){}});
  assert.equal(f.calls.length,before);
  assert.equal(f.nodes.get('[data-mm-save-status]').textContent,'ยังไม่เชื่อม · ตรวจสถานะบัญชี');
  assert.equal(f.nodes.get('[data-mm-refresh]').focused,true);
});

for(const failure of ['validation','unavailable','network','missing-model'])test(`profile save ${failure} retains edits, releases same-snapshot guard and never auto-replays`,async()=>{
  const f=fixture();await settle();f.form.elements.skills_summary.value='keep my pending edit';let writes=0;
  f.window.fetch=async(url,options={})=>{
    if(options.method==='PATCH'){
      writes++;
      if(failure==='network')throw new TypeError('fixture network unavailable');
      if(failure==='missing-model')return Response.json({ok:true});
      const status=failure==='validation'?400:503;
      return Response.json({ok:false,error:'fixture_failure'},{status});
    }
    return Response.json({ok:true,media:[]});
  };
  await f.form.listeners.submit({preventDefault(){}});await settle();
  assert.equal(writes,1);
  assert.equal(f.nodes.get('[data-mm-save-status]').textContent,failure==='validation'?'ข้อมูลไม่ถูกต้อง · ตรวจใหม่':'บันทึกไม่ได้ · ตรวจสถานะ ลองใหม่');
  assert.equal(f.nodes.get('[data-mm-workspace]').hidden,false);
  assert.equal(f.form.elements.skills_summary.value,'keep my pending edit');
  assert.equal(f.nodes.get('[data-mss-save]').disabled,false);
  // A later explicit submit is allowed; no test or runtime auto-replays it.
  await f.form.listeners.submit({preventDefault(){}});
  assert.equal(writes,2);
});

test('successful profile refresh clears previous save error',async()=>{
  const f=fixture();await settle();
  f.nodes.get('[data-mm-save-status]').textContent='old save error';
  await f.nodes.get('[data-mm-refresh]').listeners.click();await settle();
  assert.equal(f.nodes.get('[data-mm-save-status]').textContent,'');
  assert.equal(f.nodes.get('[data-mm-name]').textContent,'Fixture Model');
});

test('built minified runtime preserves no-job and profile-save single-flight behavior',async()=>{
  const runtime=buildBundle().match(/<script id="my-model-workspace-bundle-20261016">([\s\S]*?)<\/script>/)[1];
  const f=fixture({runtime,job:{ok:false,status:404,error:'session_not_found'}});await settle();
  assert.equal(f.nodes.get('[data-mm-job]').textContent,'ยังไม่มีงานที่กำลังใช้งาน');
  const pending=deferredResponse();let writes=0;
  f.window.fetch=async(url,options={})=>{
    if(options.method==='PATCH'){writes++;return pending.promise;}
    return Response.json({ok:true,media:[]});
  };
  const saving=f.form.listeners.submit({preventDefault(){}});
  await f.form.listeners.submit({preventDefault(){}});
  assert.equal(writes,1);assert.equal(f.nodes.get('[data-mss-save]').disabled,true);
  pending.resolve(Response.json({ok:true,review_required:true,model}));await saving;await settle();
  assert.equal(f.nodes.get('[data-mm-save-status]').textContent,'บันทึกแล้ว · รอตรวจ');
  assert.equal(f.nodes.get('[data-mss-save]').disabled,false);
});

test('builder fails closed on an oversized embed rather than returning it',()=>{
  const read=fs.readFileSync;
  try {
    fs.readFileSync=function(file,...options){
      if(String(file).endsWith('my-model-workspace-20261016.html'))return 'x'.repeat(50000);
      return read.call(this,file,...options);
    };
    assert.throws(()=>buildBundle(),/exceeds 50,000 bytes/);
  } finally {fs.readFileSync=read;}
});

test('profile-save live status stays inside its form beside the save button',()=>{
  const dom=new JSDOM(buildBundle());
  try {
    const d=dom.window.document,status=d.querySelector('[data-mm-save-status]');
    assert.equal(d.querySelectorAll('[data-mm-save-status]').length,1);
    assert.equal(status.getAttribute('role'),'status');
    assert.equal(status.closest('form'),d.querySelector('[data-mss-profile-form]'));
    assert.equal(status.previousElementSibling,d.querySelector('[data-mss-save]'));
  } finally {dom.window.close();}
});

function consoleSession(f) { return new URL(f.nodes.get('[data-mm-console]').href, f.window.location.origin).searchParams.get('session_id'); }
test('Dashboard pins server-selected A into the Console link across refresh and reopen',async()=>{
  const options={job:{ok:true,session:{session_id:'sess_A'}},search:'?world=private&job_id=untrusted'};
  const f=fixture(options);await settle();
  assert.equal(consoleSession(f),'sess_A');
  assert.equal(new URL(f.nodes.get('[data-mm-console]').href).searchParams.size,1);
  await f.nodes.get('[data-mm-refresh]').listeners.click();await settle();
  assert.equal(consoleSession(f),'sess_A');
  const reopened=fixture(options);await settle();assert.equal(consoleSession(reopened),'sess_A');
  assert.equal([...f.calls,...reopened.calls].some(c=>c.options?.method),false);
});
test('a fresh Dashboard read can select B without retargeting an already captured A link',async()=>{
  const f=fixture({job:{ok:true,session:{session_id:'sess_A'}}});await settle();
  const old=f.nodes.get('[data-mm-console]').href;
  f.window.fetch=async(url)=>Response.json(String(url).includes('/session/current')?{ok:true,session:{session_id:'sess_B'}}:String(url).includes('/media')?{ok:true,media:[]}:{ok:true,model});
  await f.nodes.get('[data-mm-refresh]').listeners.click();await settle();
  assert.equal(consoleSession(f),'sess_B');assert.equal(new URL(old).searchParams.get('session_id'),'sess_A');
  const pinned=fixture({search:'?session_id=sess_A',job:{ok:true,session:{session_id:'sess_B'}}});await settle();
  assert.match(pinned.nodes.get('[data-mm-job]').textContent,/กำลังตรวจ/);
  assert.equal(consoleSession(pinned),'sess_A','review must not offer a silent generic redirect to B');
});

test('refresh keeps A pinned while current read is pending or unavailable; verified empty clears it',async()=>{
  const f=fixture({job:{ok:true,session:{session_id:'sess_A'}}});await settle();
  const pending=deferredResponse();
  f.window.fetch=async url=>String(url).includes('/session/current')?pending.promise:Response.json(String(url).includes('/media')?{ok:true,media:[]}:{ok:true,model});
  const refresh=f.nodes.get('[data-mm-refresh]').listeners.click();await settle();
  assert.equal(consoleSession(f),'sess_A');
  pending.resolve(Response.json({ok:false,error:'upstream_unavailable'},{status:503}));await refresh;await settle();
  assert.equal(consoleSession(f),'sess_A');
  f.window.fetch=async url=>String(url).includes('/session/current')?Response.json({ok:false,error:'session_not_found'},{status:404}):Response.json(String(url).includes('/media')?{ok:true,media:[]}:{ok:true,model});
  await f.nodes.get('[data-mm-refresh]').listeners.click();await settle();
  assert.equal(consoleSession(f),null);
  assert.match(f.nodes.get('[data-mm-job]').textContent,/ยังไม่มีงาน/);
});
test('a pinned Dashboard with missing A retains its link and requests review instead of selecting another job',async()=>{
  const f=fixture({search:'?session_id=sess_A',job:{status:404,error:'session_not_found'}});await settle();
  assert.equal(consoleSession(f),'sess_A');
  assert.match(f.nodes.get('[data-mm-job]').textContent,/กำลังตรวจ/);
});
