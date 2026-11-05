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
import {stripTravelJpegMetadata} from './model-travel-client.mjs';
import {validateTravelJpeg} from './model-travel-store.mjs';

const settle = async () => { for (let n=0;n<12;n++) await new Promise(resolve=>setImmediate(resolve)); };
test('model travel panel explains inactive stages without inventing ETA or actions', async () => {
  for (const state of ['offered', 'work_finished']) {
    const ui = windowFor();
    ui.w.fetch = async () => Response.json({ok:true,session_id:'sess_FIXTURE',state,revision:1,server_now:new Date().toISOString(),submissions:[],can_send:false,eta:{status:'inactive'}});
    try {
      ui.w.mountFixture(ui.host,{role:'model',sessionId:'sess_FIXTURE',state,locale:'th'});
      await settle();
      assert.equal(ui.host.querySelector('section>strong').textContent,'ขั้นตอนนี้ไม่แสดงเวลาถึง');
      assert.equal(ui.host.querySelector('[data-travel-actions]').hidden,true);
    } finally { ui.close(); }
  }
});
const until = async predicate => { const deadline=Date.now()+4000;while(!predicate()){if(Date.now()>deadline)throw new Error('UI condition timed out');await new Promise(resolve=>setTimeout(resolve,5));} };
function windowFor() {
  const dom = new JSDOM('<main id="host"></main>', {url:'https://mmdbkk.com/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window, timers=new Map(); let serial=0;
  w.setTimeout=(callback,ms)=>{timers.set(++serial,{callback,ms});return serial;};w.clearTimeout=id=>timers.delete(id);
  Object.defineProperty(w,'crypto',{value:webcrypto});
  w.Blob=Blob;
  w.URL.createObjectURL=()=> 'blob:fixture'; w.URL.revokeObjectURL=()=>{};
  w.eval(travelClientBundle()+'window.mountFixture=mountTravelPanel;');
  return {dom,w,timers,host:w.document.getElementById('host'),close:()=>{w.document.getElementById('host')._mmdTravel?.destroy();w.close();}};
}
function clientServer(w, env, record, role='model') {
  const payload=Buffer.from(JSON.stringify({kind:'model_session',role:'model',model_record_id:MODEL,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
  const cookie='mmd_model_session_v1='+payload+'.'+createHmac('sha256',env.MODEL_SESSION_SIGNING_SECRET).update(payload).digest('hex');
  const customerIdentity={lineUserId:record.fields.line_user_id,memberId:record.fields.member_id};
  return async (url,options={})=>{
    const headers=new Headers(options.headers); headers.set('cookie',cookie);
    if(options.method && options.method!=='GET')headers.set('origin','https://mmdbkk.com');
    // Convert the DOM realm's signal at this in-process test transport boundary.
    const {signal,...requestOptions}=options;
    const request=new Request(new URL(url,'https://mmdbkk.com'),{...requestOptions,headers});
    const response=await (role==='model'?modelWorker.fetch(request,env,{}):handleMemberAppSessionApi(request,env,async()=>customerIdentity));
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
    try{customer.w.mountFixture(customer.host,{role:'customer',sessionId:record.fields.session_id,state:'en_route',locale:'th'});await until(()=>customer.host.querySelectorAll('article').length===1);assert.equal(customer.host.querySelector('[data-travel-actions]').hidden,false);}finally{customer.close();}
  }finally{ui.close();}
});

test('browser-added ICC and EXIF segments are removed without weakening server JPEG validation',()=>{
  const metadata=Buffer.from('ICC_PROFILE GPS synthetic-only');
  const app=marker=>Buffer.concat([Buffer.from([255,marker,(metadata.length+2)>>8,(metadata.length+2)&255]),metadata]);
  const encoded=Buffer.concat([jpeg.subarray(0,2),app(226),app(225),app(254),jpeg.subarray(2)]);
  assert.throws(()=>validateTravelJpeg(encoded),/metadata/);
  const clean=stripTravelJpegMetadata(encoded);
  assert.equal(validateTravelJpeg(clean),true);
  assert.deepEqual(Buffer.from(clean),jpeg);
  for(const bad of [Buffer.from('bad'),Buffer.from([255,216,255,226,255,255])])assert.throws(()=>stripTravelJpegMetadata(bad),/invalid_jpeg/);
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

test('arrived model can use the camera and ask about a different meeting point without ETA or an automatic send',async()=>{
  const {env,record}=travelFixture(),ui=windowFor();record.fields.model_session_state='arrived';record.fields.location_name='Agreed Hotel';
  const server=clientServer(ui.w,env,record),writes=[];
  ui.w.fetch=async(url,options)=>{if(options?.method==='POST')writes.push(JSON.parse(options.body));return server(url,options);};
  ui.w.createImageBitmap=async()=>({width:2,height:2,close(){}});
  ui.w.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){}});
  ui.w.HTMLCanvasElement.prototype.toBlob=function(callback){callback(new Blob([jpeg],{type:'image/jpeg'}));};
  try{
    ui.w.mountFixture(ui.host,{role:'model',sessionId:record.fields.session_id,state:'arrived',locale:'th'});
    const camera=ui.host.querySelector('input[capture]');
    await until(()=>!camera.disabled);
    assert.equal(camera.getAttribute('capture'),'environment');
    assert.equal(ui.host.querySelector('input[type=file]:not([capture])').hasAttribute('capture'),false);
    const etaForm=ui.host.querySelector('[data-travel-eta]');
    assert.equal(etaForm.hidden,true);
    etaForm.dispatchEvent(new ui.w.Event('submit',{cancelable:true}));await settle();
    assert.equal(writes.length,0);
    const point=[...ui.host.querySelectorAll('button')].find(b=>b.textContent==='แจ้งไปผิดสถานที่');
    point.click();assert.equal(writes.length,0);
    assert.equal(ui.host.querySelector('[data-wrong-location]').closest('details').open,true);
    const textarea=ui.host.querySelector('textarea');assert.equal(textarea.value,'');
    textarea.value='Keep my draft';point.click();assert.equal(textarea.value,'Keep my draft');
    Object.defineProperty(camera,'files',{value:[new ui.w.File([jpeg],'meeting-point.jpg',{type:'image/jpeg'})],configurable:true});
    camera.dispatchEvent(new ui.w.Event('change'));await until(()=>ui.host.querySelectorAll('form img').length===1);
    textarea.closest('form').dispatchEvent(new ui.w.Event('submit',{bubbles:true,cancelable:true}));
    await until(()=>ui.host.querySelectorAll('article img').length===1);
    assert.deepEqual(writes.map(x=>x.action),['prepare','commit']);
    assert.equal(record.fields.model_session_state,'arrived');
    assert.match(ui.host.querySelector('section>strong').textContent,/ถึงแล้ว/);
    assert.equal(ui.host.querySelector('[data-travel-eta] input').disabled,true);
  }finally{ui.close();}
});

test('a state hint cannot grant customer-update permission while the fresh read is pending',async()=>{
  const ui=windowFor();let resolveRead;
  const snapshot=state=>({ok:true,session_id:'sess_FIXTURE',state,revision:1,binding:'fixture',server_now:new Date().toISOString(),submissions:[],can_send:false,eta:{status:'inactive'}});
  ui.w.fetch=async()=>Response.json(snapshot('confirmed'));
  try{
    ui.w.mountFixture(ui.host,{role:'model',sessionId:'sess_FIXTURE',state:'confirmed',locale:'th'});await settle();
    ui.w.fetch=()=>new Promise(resolve=>resolveRead=resolve);
    ui.w.mountFixture(ui.host,{role:'model',sessionId:'sess_FIXTURE',state:'arrived',locale:'th'});
    assert.equal(ui.host.querySelector('[data-travel-actions]').hidden,true);
    assert.equal(ui.host.querySelector('input[capture]').disabled,true);
    resolveRead(Response.json(snapshot('arrived')));await settle();
    assert.equal(ui.host.querySelector('[data-travel-actions]').hidden,true);
  }finally{ui.close();}
});

test('both real UI clients exchange meeting-point replies with correct sender labels and no customer ETA mutation',async()=>{
  const {env,record}=travelFixture(),model=windowFor(),customer=windowFor();record.fields.model_session_state='arrived';
  const send=async(ui,message)=>{const textarea=ui.host.querySelector('textarea');textarea.value=message;textarea.closest('form').dispatchEvent(new ui.w.Event('submit',{bubbles:true,cancelable:true}));await until(()=>textarea.value==='');};
  const poll=async ui=>{const tick=[...ui.timers.values()].find(t=>t.ms===5000);assert.ok(tick);await tick.callback();await settle();};
  for(const [ui,role] of [[model,'model'],[customer,'customer']]){ui.w.fetch=clientServer(ui.w,env,record,role);ui.w.mountFixture(ui.host,{role,sessionId:record.fields.session_id,state:'arrived',locale:'th'});}
  try{
    await until(()=>!model.host.querySelector('textarea').disabled&&!customer.host.querySelector('textarea').disabled);
    assert.equal(customer.host.querySelector('[data-travel-actions]').open,true);
    assert.equal(customer.host.querySelector('[data-travel-eta]').hidden,true);
    assert.equal(customer.host.querySelector('[data-travel-eta] button').disabled,true);
    await send(model,'Which entrance should I use?');await poll(customer);
    assert.equal(customer.host.querySelector('article small').textContent.startsWith('นายแบบ'),true);
    await send(customer,'ทางเข้าฝั่งตะวันออกครับ <script>not executable</script>');await poll(model);
    assert.equal(model.host.querySelectorAll('article').length,2);
    const reply=model.host.querySelectorAll('article')[1];assert.equal(reply.dataset.senderRole,'customer');
    assert.match(reply.querySelector('small').textContent,/ลูกค้า/);assert.match(reply.querySelector('p').textContent,/ทางเข้าฝั่งตะวันออก/);
    assert.equal(reply.querySelector('script'),null);
    assert.doesNotMatch(customer.host.textContent,/LINE รับการแจ้งเตือนแล้ว|ยังยืนยันการแจ้ง LINE ไม่ได้/);
    assert.equal(customer.host.querySelectorAll('article')[1].querySelector('small').textContent.startsWith('คุณ'),true);
    await send(model,'รับทราบครับ กำลังไปทางเข้าฝั่งตะวันออก');await poll(customer);
    assert.equal(customer.host.querySelectorAll('article').length,3);
    const firstArticle=customer.host.querySelector('article'),draft=customer.host.querySelector('textarea');
    draft.value='Unsent customer draft';draft.focus();await poll(customer);
    assert.equal(customer.host.querySelector('article'),firstArticle);
    assert.equal(draft.value,'Unsent customer draft');assert.equal(customer.w.document.activeElement,draft);
    assert.equal(record.fields.model_session_state,'arrived');
    customer.w.mountFixture(customer.host,{role:'customer',sessionId:record.fields.session_id,state:'arrived',locale:'en'});
    assert.equal(customer.host.querySelector('[data-travel-actions]>summary').textContent,'Reply to the model');
    assert.equal([...customer.host.querySelectorAll('button')].some(b=>b.textContent==='Send to model'),true);
    customer.w.mountFixture(customer.host,{role:'customer',sessionId:record.fields.session_id,state:'arrived',locale:'zh'});
    assert.equal([...customer.host.querySelectorAll('button')].some(b=>b.textContent==='发送给模特'),true);
  }finally{model.close();customer.close();}
});

test('customer recovery is role-scoped and revoked login removes the conversation and disables replies',async()=>{
  const {env,record}=travelFixture(),ui=windowFor(),server=clientServer(null,env,record,'customer');
  ui.w.sessionStorage.setItem('mmd-travel-pending:sess_FIXTURE',JSON.stringify({id:'model-only-draft',key:'model-key'}));
  let lost=true;
  ui.w.fetch=async(url,options)=>{const response=await server(url,options);if(lost&&options?.method==='POST'&&JSON.parse(options.body).action==='prepare'){lost=false;throw Error('response lost');}return response;};
  try{
    ui.w.mountFixture(ui.host,{role:'customer',sessionId:record.fields.session_id,state:'en_route',locale:'th'});
    await until(()=>!ui.host.querySelector('textarea').disabled);
    const textarea=ui.host.querySelector('textarea');textarea.value='Lobby east entrance';textarea.closest('form').dispatchEvent(new ui.w.Event('submit',{bubbles:true,cancelable:true}));
    await until(()=>[...ui.host.querySelectorAll('button')].some(b=>b.textContent==='บันทึกรายการค้าง'&&!b.disabled));
    assert.match(ui.w.sessionStorage.getItem('mmd-travel-pending:sess_FIXTURE'),/model-only-draft/);
    assert.ok(ui.w.sessionStorage.getItem('mmd-travel-pending:sess_FIXTURE:customer'));
    [...ui.host.querySelectorAll('button')].find(b=>b.textContent==='บันทึกรายการค้าง').click();await until(()=>ui.host.querySelectorAll('article').length===1);
    assert.equal(ui.w.sessionStorage.getItem('mmd-travel-pending:sess_FIXTURE:customer'),null);
    ui.w.fetch=async()=>Response.json({ok:false,error:'member_session_required'},{status:401});
    await [...ui.timers.values()].find(t=>t.ms===5000).callback();await settle();
    assert.equal(ui.host.querySelectorAll('article').length,0);assert.equal(ui.host.querySelector('textarea').disabled,true);
    assert.equal(ui.host.querySelector('[data-travel-actions]').hidden,true);
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
