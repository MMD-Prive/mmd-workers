import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { webcrypto, createHmac } from 'node:crypto';
import { travelClientBundle } from './model-travel-client-source.mjs';
import { travelFixture, MODEL, jpeg } from './model-travel-fixtures.mjs';
import modelWorker from '../admin-worker/src/model-liff-worker.js';
import { handleMemberAppSessionApi } from '../member-pages-worker/src/member-app-session.js';
import { deliverTravelNotice } from './model-travel-line.mjs';
import { notifyTravelEvent } from '../admin-worker/src/model-travel-notification.js';
import { buildConsoleEmbed } from '../scripts/build-model-console-atelier-embed.mjs';
import { buildLovableSkinEmbed } from '../scripts/build-my-model-lovable-skin-embed.mjs';
import { handleLiffMemberShell } from '../member-pages-worker/src/liff-member-shell.js';
import vm from 'node:vm';

const settle = async () => { for (let n=0;n<12;n++) await new Promise(resolve=>setImmediate(resolve)); };
const until = async predicate => { const deadline=Date.now()+4000;while(!predicate()){if(Date.now()>deadline)throw new Error('UI condition timed out');await new Promise(resolve=>setTimeout(resolve,5));} };
function windowFor() {
  const dom = new JSDOM('<main id="host"></main>', {url:'https://mmdbkk.com/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window, timers=new Map(); let serial=0;
  w.setTimeout=(callback,ms)=>{timers.set(++serial,{callback,ms});return serial;};w.clearTimeout=id=>timers.delete(id);
  Object.defineProperty(w,'crypto',{value:webcrypto});
  w.URL.createObjectURL=()=> 'blob:fixture'; w.URL.revokeObjectURL=()=>{};
  w.eval(travelClientBundle()+'window.mountFixture=mountTravelPanel;');
  return {dom,w,timers,host:w.document.getElementById('host'),close:()=>{w.document.getElementById('host')._mmdTravel?.destroy();w.close();}};
}
function clientServer(w, env, record, role='model') {
  const payload=Buffer.from(JSON.stringify({kind:'model_session',role:'model',model_record_id:MODEL,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
  const cookie='mmd_model_session_v1='+payload+'.'+createHmac('sha256',env.MODEL_SESSION_SIGNING_SECRET).update(payload).digest('hex');
  return async (url,options={})=>{
    const headers=new Headers(options.headers); headers.set('cookie',cookie);
    if(options.method && options.method!=='GET')headers.set('origin','https://mmdbkk.com');
    // Convert the DOM realm's signal at this in-process test transport boundary.
    const {signal,...requestOptions}=options;
    const request=new Request(new URL(url,'https://mmdbkk.com'),{...requestOptions,headers});
    const response=await (role==='model'?modelWorker.fetch(request,env,{}):handleMemberAppSessionApi(request,env,async()=>({lineUserId:record.fields.line_user_id,memberId:record.fields.member_id})));
    return response;
  };
}

test('live UI tick uses server time despite a wrong device clock, with no second countdown or per-tick API call',async()=>{
  const ui=windowFor();let elapsed=0,calls=0;
  Object.defineProperty(ui.w.performance,'now',{value:()=>elapsed});
  const server=Date.parse('2026-10-18T16:55:00Z');
  ui.w.Date.now=()=>server+30*86400000;
  ui.w.fetch=async()=>{calls++;return Response.json({ok:true,session_id:'sess_FIXTURE',state:'en_route',revision:0,binding:'fixture',server_now:new Date(server).toISOString(),submissions:[],eta:{status:'active',arrival_at:new Date(server+85*60000).toISOString(),updated_at:new Date(server).toISOString()}});};
  try{
    ui.w.mountFixture(ui.host,{role:'customer',sessionId:'sess_FIXTURE',state:'en_route',locale:'th'});await settle();
    assert.equal(ui.host.querySelector('section>strong').textContent,'คาดว่าจะถึงในอีก 1 ชม. 25 นาที');
    elapsed=60000;[...ui.timers.values()].find(t=>t.ms===60000).callback();
    assert.equal(ui.host.querySelector('section>strong').textContent,'คาดว่าจะถึงในอีก 1 ชม. 24 นาที');assert.equal(calls,1);
    ui.w.mountFixture(ui.host,{role:'customer',sessionId:'sess_FIXTURE',state:'en_route',locale:'en'});
    assert.match(ui.host.querySelector('section>strong').textContent,/1 hr 24 min/);
    assert.equal(ui.host.querySelectorAll('[data-mmd-travel]').length,1);
    assert.equal(ui.host.querySelector('section>strong').hasAttribute('aria-live'),false);
  }finally{ui.close();}
});

test('lost prepare response recovers the original receipt; model submission appears to the authorized customer once',async()=>{
  const {env,record}=travelFixture(),ui=windowFor(),server=clientServer(ui.w,env,record);
  let lost=true;
  ui.w.fetch=async(url,options)=>{const result=await server(url,options);if(lost && options?.method==='POST' && JSON.parse(options.body).action==='prepare'){lost=false;throw new Error('fixture response lost after persistence');}return result;};
  try{
    ui.w.mountFixture(ui.host,{role:'model',sessionId:record.fields.session_id,state:'en_route',locale:'th'});await settle();
    await until(()=>!ui.host.querySelector('input[type=file]').disabled);
    const textarea=ui.host.querySelector('textarea');textarea.value='<img src=x onerror=alert(1)> ถึงช้าเล็กน้อยครับ';
    const form=textarea.closest('form');form.dispatchEvent(new ui.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
    await until(()=>textarea.disabled && [...ui.host.querySelectorAll('button')].some(b=>b.textContent==='บันทึกรายการค้าง' && !b.disabled));
    assert.equal(textarea.value.includes('<img'),true);assert.equal(ui.host.querySelectorAll('article').length,0);
    assert.equal(ui.host.querySelector('button').textContent.length>0,true);
    const resume=[...ui.host.querySelectorAll('button')].find(b=>b.textContent==='บันทึกรายการค้าง');resume.click();await settle();
    await until(()=>ui.host.querySelectorAll('article').length===1);
    assert.equal(textarea.value,'');assert.equal(ui.host.querySelectorAll('article').length,1);
    assert.equal(ui.host.querySelector('article img'),null);
    assert.equal(ui.host.querySelector('article p').textContent.includes('<img'),true);
    const customer=windowFor();customer.w.fetch=clientServer(customer.w,env,record,'customer');
    try{customer.w.mountFixture(customer.host,{role:'customer',sessionId:record.fields.session_id,state:'en_route',locale:'th'});await until(()=>customer.host.querySelectorAll('article').length===1);assert.equal(customer.host.querySelector('details').hidden,true);}finally{customer.close();}
  }finally{ui.close();}
});

test('native file input keeps preview/removal and uploads an oriented, metadata-free image through the server quota',async()=>{
  const {env,record}=travelFixture(),ui=windowFor();ui.w.fetch=clientServer(ui.w,env,record);
  ui.w.createImageBitmap=async()=>({width:2,height:2,close(){}});
  ui.w.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){}});
  ui.w.HTMLCanvasElement.prototype.toBlob=function(callback){callback(new Blob([jpeg],{type:'image/jpeg'}));};
  try{
    ui.w.mountFixture(ui.host,{role:'model',sessionId:record.fields.session_id,state:'en_route',locale:'th'});await settle();
    await until(()=>!ui.host.querySelector('input[type=file]').disabled);
    const input=ui.host.querySelector('input[type=file]');
    assert.equal(input.hasAttribute('capture'),false);assert.equal(input.disabled,false);assert.equal(input.closest('label')!==null,true);
    Object.defineProperty(input,'files',{value:[new ui.w.File([jpeg],'fixture.jpg',{type:'image/jpeg'})],configurable:true});
    await input.onchange();assert.equal(ui.host.querySelectorAll('form img').length,1);
    ui.host.querySelector('textarea').closest('form').dispatchEvent(new ui.w.Event('submit',{bubbles:true,cancelable:true}));await settle();
    await until(()=>ui.host.querySelectorAll('article img').length===1);
    assert.equal(ui.host.querySelectorAll('article img').length,1);
    assert.match(ui.host.querySelector('article img').getAttribute('src'),/\/photo\?session_id=sess_FIXTURE&media_id=/);
    assert.equal(ui.host.querySelectorAll('form img').length,0);
  }finally{ui.close();}
});

test('obsolete response after a session switch cannot restore the prior customer or duplicate the media host',async()=>{
  const ui=windowFor();let finish;
  ui.w.fetch=async url=>String(url).includes('sess_OLD')?await new Promise(resolve=>finish=resolve):Response.json({ok:true,session_id:'sess_NEW',state:'arrived',revision:1,binding:'new',server_now:new Date().toISOString(),submissions:[],eta:{status:'inactive'}});
  try{
    ui.w.mountFixture(ui.host,{role:'customer',sessionId:'sess_OLD',state:'en_route',locale:'th'});
    ui.w.mountFixture(ui.host,{role:'customer',sessionId:'sess_NEW',state:'arrived',locale:'th'});await settle();
    finish(Response.json({ok:true,session_id:'sess_OLD',state:'en_route',revision:9,binding:'old',server_now:new Date().toISOString(),submissions:[{state:'saved',text:'MUST NOT RETURN',photos:[]}],eta:{status:'missing'}}));await settle();
    assert.doesNotMatch(ui.host.textContent,/MUST NOT RETURN/);assert.match(ui.host.textContent,/โมเดลถึงแล้ว/);assert.equal(ui.host.querySelectorAll('[data-mmd-travel]').length,1);
  }finally{ui.close();}
});

test('customer LINE notification goes through the existing authenticated service binding and one retry key',async()=>{
  const {env,record}=travelFixture();env.INTERNAL_TOKEN='fixture-peer-secret';
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async(url,options)=>{calls++;assert.equal(JSON.parse(options.body).to,record.fields.line_user_id);return Response.json({});};
  env.MEMBER_DASHBOARD_CHAT_WORKER={async fetch(request){assert.equal(request.headers.get('authorization'),'Bearer fixture-peer-secret');assert.equal(new URL(request.url).hostname,'member-dashboard-chat-worker.local');return Response.json(await deliverTravelNotice({...env,LINE_CHANNEL_ACCESS_TOKEN:'fixture-customer-token'},await request.json()));}};
  try{assert.equal((await notifyTravelEvent(env,record,'fixture-notice','eta')).delivered,true);assert.equal((await notifyTravelEvent(env,record,'fixture-notice','eta')).delivered,true);assert.equal(calls,1);}finally{globalThis.fetch=original;}
});

test('generated Console and LIFF shell scripts parse; Console byte budget and original selectors survive compression',async()=>{
  const bundle=buildConsoleEmbed();assert.ok(Buffer.byteLength(bundle,'utf8')<50000);new vm.Script(bundle.match(/<script>([\s\S]*)<\/script>/)[1]);
  const response=handleLiffMemberShell(new Request('https://mmdbkk.com/member/liff?intent=status'));
  const html=await response.text();
  for(const script of html.matchAll(/<script\b(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
});

test('compact model home only reads ETA and restores compressed CSS once despite the existing script ID',async()=>{
  const ui=windowFor();let calls=0;
  const server=Date.parse('2026-10-18T16:55:00Z');
  // One server snapshot must define both timestamps. Separate wall-clock reads
  // can produce 60,001ms, which correctly rounds to two minutes on a busy runner.
  Object.defineProperty(ui.w.performance,'now',{value:()=>0});
  ui.w.eval(travelClientBundle(true)+'window.mountSummary=mountTravelPanel;');
  ui.w.fetch=async url=>{calls++;assert.match(String(url),/^\/v1\/model\/session\/travel\?/);return Response.json({ok:true,session_id:'sess_FIXTURE',state:'en_route',server_now:new Date(server).toISOString(),eta:{status:'active',arrival_at:new Date(server+60000).toISOString()}});};
  try{
    ui.w.mountSummary(ui.host,{role:'model',sessionId:'sess_FIXTURE',state:'confirmed',locale:'th'});await settle();assert.equal(calls,0);
    ui.w.mountSummary(ui.host,{role:'model',sessionId:'sess_FIXTURE',state:'en_route',locale:'th'});await until(()=>ui.host.textContent.includes('1 นาที'));
    assert.equal(ui.host.querySelector('form'),null);assert.equal(ui.host.querySelectorAll('[data-mmd-travel]').length,1);
    ui.w.mountSummary(ui.host,{role:'model',sessionId:null,state:'checking',locale:'th'});assert.equal(ui.host.querySelectorAll('[data-mmd-travel]').length,0);
  }finally{ui.close();}
  const skin=buildLovableSkinEmbed();assert.ok(Buffer.byteLength(skin,'utf8')<50000);
  const dom=new JSDOM('<script id="my-model-lovable-vnext-skin-20261017"></script>',{url:'https://mmdbkk.com/sigil/model/dashboard',runScripts:'outside-only'});
  try{
    const js=skin.match(/<script[^>]*>([\s\S]*)<\/script>/)[1];dom.window.eval(js);dom.window.eval(js);
    const styles=dom.window.document.querySelectorAll('style[id="my-model-lovable-vnext-skin-20261017"]');
    assert.equal(styles.length,1);assert.match(styles[0].textContent,/#mmd-model-home-v4#mmd-model-home-v4/);assert.doesNotMatch(styles[0].textContent,/\$ROOT\$/);
  }finally{dom.window.close();}
});
