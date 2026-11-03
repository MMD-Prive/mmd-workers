import test from 'node:test';
import assert from 'node:assert/strict';
import {createCustomerProgress, renderCustomerProgress} from '../src/liff-customer-progress.js';
import {handleLiffMemberShell} from '../src/liff-member-shell.js';
const preview='/api/member/app/history/preview';
async function run(path,response){
  const states=[];let calls=0;
  const progress=createCustomerProgress({render:(panel,state)=>states.push({panel,...state}),request:async()=>{calls++;return response;}});
  const result=await progress.fetch(path);
  return {state:states.at(-1),result,calls,progress,states};
}
function progressDom(){
  const elements=new Map();let reloads=0;
  function element(id=''){
    const children=new Map();
    return {id,dataset:{},hidden:false,textContent:'',parentElement:null,attributes:{},classList:{contains:()=>true},
      setAttribute(key,value){this.attributes[key]=value;},addEventListener(){},prepend(child){child.parentElement=this;elements.set(child.id,child);},
      querySelector(selector){if(!children.has(selector))children.set(selector,element());return children.get(selector);}};
  }
  for(const id of ['customer-boot-progress','hype-progress','customer-boot-retry','profile','digital-news-progress','digital-news-feed'])elements.set(id,element(id));
  globalThis.window={location:{reload(){reloads++;}}};
  globalThis.document={getElementById:id=>elements.get(id)||null,createElement:()=>element(),};
  return {elements,reloads:()=>reloads,cleanup(){delete globalThis.window;delete globalThis.document;}};
}
test('exact semantic missing evidence remains HTTP 404 but is not an entry or panel failure',async()=>{
  const {state,result,calls}=await run(preview,Response.json({ok:false,error:'history_evidence_missing',data:null},{status:404}));
  assert.equal(result.status,404);assert.equal(state.error,false);assert.equal(state.entryError,false);assert.equal(calls,1);
});
test('route 404 and malformed preview remain critical failures',async()=>{
  for(const body of [{ok:false,error:'not_found',data:null},'not json']){
    const {state}=await run(preview,Response.json(body,{status:404}));
    assert.equal(state.entryError,true);assert.equal(state.error,true);
  }
});
test('empty infrastructure 404 cannot qualify as semantic missing evidence',async()=>{
  const {state,result}=await run(preview,new Response(null,{status:404}));
  assert.equal(result.status,404);assert.equal(state.entryError,true);assert.equal(state.optionalError,false);
});
test('optional 503 is local, auth failures remain critical on both optional paths',async()=>{
  for(const path of [preview,'/api/v1/member/updates/list?limit=10']){
    for(const status of [401,403,503]){
      const {state,calls}=await run(path,Response.json({ok:false},{status}));
      assert.equal(state.entryError,status!==503);assert.equal(state.optionalError,status===503);assert.equal(calls,1);
    }
  }
});
test('optional pending does not hold entry progress; membership failure is never cleared by optional success',async()=>{
  let resolve;const states=[];
  const p=createCustomerProgress({render:(panel,state)=>states.push(state),request:async(path)=>path===preview?await new Promise(r=>resolve=r):new Response(null,{status:503})});
  const pending=p.fetch(preview);assert.equal(states.at(-1).entryPending,0);
  await p.fetch('/member/api/liff/dashboard');assert.equal(states.at(-1).entryError,true);
  resolve(Response.json({ok:true}));await pending;assert.equal(states.at(-1).entryError,true);
  p.reset({memberOnly:true});assert.equal(states.at(-1).entryError,false);
});
test('updates progress has a dedicated shell host separate from the feed renderer',async()=>{
  const response=await handleLiffMemberShell(new Request('https://mmdbkk.com/member/liff'),{});
  const html=await response.text();
  assert.match(html,/<div id="digital-news-progress"><\/div>\s*<div class="digital-news-feed" id="digital-news-feed">/);
});
test('renderCustomerProgress keeps optional 503 local without global retry, while auth failure stays critical',async()=>{
  const dom=progressDom();
  try{
    const render=(panel,state)=>renderCustomerProgress(panel,state);
    const optional=await createCustomerProgress({render,request:async()=>Response.json({ok:false},{status:503})}).fetch('/api/v1/member/updates/list?limit=10');
    assert.equal(optional.status,503);
    const local=dom.elements.get('customer-progress-digital-news-progress');
    assert.ok(local);assert.equal(local.hidden,false);assert.equal(local.dataset.state,'error');
    assert.match(local.querySelector('span').textContent,/ข้อมูลเสริมส่วนนี้ยังไม่พร้อม/);
    assert.equal(local.querySelector('button').hidden,true);
    assert.equal(dom.elements.get('customer-boot-retry').hidden,true);
    assert.equal(dom.reloads(),0);
    assert.equal(dom.elements.get('digital-news-feed').parentElement,null);

    const authProgress=createCustomerProgress({render,request:async()=>Response.json({ok:false},{status:401})});
    await authProgress.fetch('/api/v1/member/updates/list?limit=10');
    assert.equal(local.dataset.state,'error');
    assert.match(local.querySelector('span').textContent,/เปิดหน้าใหม่เพื่อตรวจสอบอีกครั้ง/);
    assert.equal(local.querySelector('button').hidden,false);
    assert.equal(dom.elements.get('customer-boot-retry').hidden,false);
    assert.match(dom.elements.get('customer-boot-progress').textContent,/เปิดข้อมูลไม่สำเร็จ/);
    assert.equal(dom.reloads(),0);
    authProgress.reset({memberOnly:true});
    assert.equal(local.hidden,true);
    assert.equal(dom.elements.get('customer-boot-retry').hidden,true);
    await createCustomerProgress({render,request:async()=>Response.json({ok:false},{status:403})}).fetch('/api/v1/member/updates/list?limit=10');
    assert.equal(local.querySelector('button').hidden,false);
    assert.equal(dom.reloads(),0);
  }finally{dom.cleanup();}
});
