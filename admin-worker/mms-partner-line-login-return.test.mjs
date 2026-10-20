import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { APP_JS } from './src/mms-partner-line-ui.mjs';
import { VERIFY_RUNTIME, LIFF } from './src/mms-partner-line-verification.mjs';

const intentKey='mms_partner_submit_intent_v1';
const settle=async()=>{for(let n=0;n<12;n++)await new Promise(resolve=>setImmediate(resolve));};
function browser({shop='relax',loggedIn=false,storage=new Map(),failure='',token='fixture-id-token-never-save',search='?shop='+shop,version=VERIFY_RUNTIME,configFailure=false,scope,permissionState,origin='https://www.mmdbkk.com'}={}){
  const calls=[],logins=[],events=[],lifecycle={};
  function node(){return {style:{},dataset:{},hidden:false,checked:false,disabled:false,textContent:'',events:{},children:new Map(),setAttribute(){},append(){},before(){},addEventListener(event,fn){this.events[event]=fn;},querySelector(selector){if(!this.children.has(selector))this.children.set(selector,node());return this.children.get(selector);}};}
  const root=node(),select=root.querySelector('#mms-shop');select.value=shop;select.options=[{text:'Kalima Massage'},{text:'Relax Spa by 9'}];select.selectedIndex=shop==='relax'?1:0;
  const location={origin,pathname:'/male-massage/partner/verify',search};
  const context={document:{head:node(),getElementById:()=>root,createElement:()=>node()},location,URL,URLSearchParams,Date,console,
    sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    window:{addEventListener:(event,fn)=>{lifecycle[event]=fn;},liff:{init:async()=>{},isLoggedIn:()=>loggedIn,login:options=>logins.push(options),getIDToken:()=>token,getContext:()=>scope?{scope,userId:'fixture-private-context-never-log'}:null,permission:permissionState?{query:async name=>{assert.equal(name,'openid');return {state:permissionState};}}:undefined}},
    fetch:async(path,options)=>{if(path.endsWith('/config')){if(configFailure)throw Error('fixture network failure');return {ok:true,json:async()=>({ok:true,verify_runtime:version,liff_id:LIFF})};}const body=JSON.parse(options.body);if(path.endsWith('/event')){events.push({path,body,options});return {ok:true,json:async()=>({ok:true})};}calls.push({path,body});if(failure&&path.endsWith('/request'))return {ok:false,json:async()=>({ok:false,error:failure})};return {ok:true,json:async()=>path.endsWith('/status')?{ok:true,claim:null}:{ok:true,claim:{shop_key:body.shop_key,shop_name:body.shop_key==='relax'?'Relax Spa by 9':'Kalima Massage',claim_id:'fixture-claim',status:'Pending Owner Review'}}};},
  };
  vm.runInNewContext(APP_JS,context);
  return {root,storage,calls,logins,events,lifecycle,location,async submit(consent=true){root.querySelector('#mms-consent').checked=consent;await root.querySelector('#mms-line-button').events.click();await settle();},status:()=>root.querySelector('#mms-line-status').textContent};
}

test('login redirect resumes only the previously consented shop submission and does not replay on reload',async()=>{
  for(const shop of ['kalima','relax']){
    const storage=new Map(),before=browser({shop,storage});await settle();await before.submit();
    assert.equal(before.logins.length,1);assert.equal(before.calls.length,0);
    assert.equal(before.logins[0].redirectUri,'https://www.mmdbkk.com/male-massage/partner/verify?shop='+shop+'&verify_version='+VERIFY_RUNTIME);
    assert.ok(storage.has(intentKey));assert.ok(!JSON.stringify([...storage]).includes('fixture-id-token'));
    const after=browser({shop,loggedIn:true,storage,search:'?liff.state='+encodeURIComponent('?shop='+shop)+'&code=fixture-private-code'});await settle();
    const writes=after.calls.filter(c=>c.path.endsWith('/request'));
    assert.equal(writes.length,1);assert.equal(writes[0].body.shop_key,shop);assert.equal(writes[0].body.consent,true);
    assert.match(after.status(),/รอเปอร์ตรวจคำขอ/);assert.equal(storage.has(intentKey),false);
    assert.ok(after.events.some(e=>e.body.stage==='client_return_detected'));assert.doesNotMatch(JSON.stringify(after.events),/fixture-private-code/);
    const reload=browser({shop,loggedIn:true,storage});await settle();assert.equal(reload.calls.filter(c=>c.path.endsWith('/request')).length,0);
  }
});

test('unconsented signed-out user can reach LINE login only after an explicit consented click',async()=>{
 for(const shop of ['kalima','relax']){
   const b=browser({shop,permissionState:'prompt',scope:['profile','openid']});await settle();
   assert.equal(b.root.querySelector('#mms-line-button').disabled,false);
   assert.equal(b.logins.length,0);assert.equal(b.calls.length,0);
   await b.submit(false);assert.equal(b.logins.length,0);
   await b.submit(true);assert.equal(b.logins.length,1);assert.equal(b.calls.length,0);
   assert.ok(b.storage.has(intentKey));
 }
});
test('LINE callback always uses the configured Published endpoint and a fixed version, never the incoming host or callback data',async()=>{
 for(const shop of ['kalima','relax'])for(const origin of ['https://mmdbkk.com','https://www.mmdbkk.com']){
   const b=browser({shop,origin,search:'?shop='+shop+'&code=fixture-private-code&liffRedirectUri=https://untrusted.invalid'});await settle();await b.submit();
   assert.equal(b.logins[0].redirectUri,'https://www.mmdbkk.com/male-massage/partner/verify?shop='+shop+'&verify_version='+VERIFY_RUNTIME);
   assert.doesNotMatch(JSON.stringify(b.logins),/fixture-private|untrusted/);
 }
});

test('callback phase is recorded using fixed events only; no intent never implies consent',async()=>{
 for(const shop of ['kalima','relax']){
   const b=browser({shop,loggedIn:true,search:'?liff.state='+encodeURIComponent('?shop='+shop)+'&code=fixture-private-code&liffClientId=fixture'});await settle();
   assert.equal(b.calls.filter(c=>c.path.endsWith('/request')).length,0);
   assert.ok(b.events.some(e=>e.body.stage==='client_return_detected'));
   assert.ok(b.events.some(e=>e.body.stage==='client_return_no_intent'));
   assert.ok(b.calls.every(c=>c.body.shop_key===shop));
   assert.doesNotMatch(JSON.stringify(b.events),/fixture-private-code|liffClientId|liff.state|https:/);
 }
});
test('conflicting shop in LINE state never checks or submits either shop until explicit selection',async()=>{
 const storage=new Map([[intentKey,JSON.stringify({shop_key:'relax',at:Date.now()})]]);
 const b=browser({loggedIn:true,storage,search:'?shop=relax&liff.state='+encodeURIComponent('?shop=kalima')});await settle();
 assert.equal(b.calls.length,0);assert.equal(storage.has(intentKey),false);assert.match(b.status(),/ข้อมูลร้านจากลิงก์ไม่ตรงกัน/);
 assert.ok(b.events.some(e=>e.body.stage==='client_return_shop_conflict'));
 await b.submit();assert.equal(b.calls.length,0);
});
test('stale or unavailable config prevents LINE login and callback replay',async()=>{
 for(const options of [{version:'older-runtime'},{version:undefined,configFailure:true}]){
   const storage=new Map([[intentKey,JSON.stringify({shop_key:'relax',at:Date.now()})]]);
   const b=browser({...options,storage,loggedIn:true});await settle();assert.equal(b.calls.length,0);
   assert.match(b.status(),options.configFailure?/ยังตรวจรุ่นหน้าไม่ได้/:/หน้านี้เป็นรุ่นเก่า/);
   await b.submit();assert.equal(b.calls.length,0);
   const before=browser(options);await settle();await before.submit();assert.equal(before.logins.length,0);
 }
});
test('page restored from browser cache clears consent and never replays a request',async()=>{
 const b=browser();await settle();await b.submit();assert.equal(b.logins.length,1);assert.ok(b.storage.has(intentKey));
 b.lifecycle.pageshow({persisted:true});await settle();assert.equal(b.storage.has(intentKey),false);assert.equal(b.calls.length,0);assert.equal(b.root.querySelector('#mms-consent').checked,false);
 assert.ok(b.events.some(e=>e.body.stage==='client_restored_page'));assert.equal(b.root.dataset.verifyRuntime,VERIFY_RUNTIME);
});
test('no consent, fresh login, wrong shop, expired or malformed intent never auto-submits',async()=>{
  const noConsent=browser();await settle();await noConsent.submit(false);assert.equal(noConsent.logins.length,0);assert.equal(noConsent.storage.size,0);
  for(const intent of [null,{shop_key:'kalima',at:Date.now()},{shop_key:'relax',at:1},{shop_key:'relax',at:Date.now()+60000},'bad']){
    const storage=new Map(intent===null?[]:[[intentKey,typeof intent==='string'?intent:JSON.stringify(intent)]]);
    const b=browser({shop:'relax',loggedIn:true,storage});await settle();assert.equal(b.calls.filter(c=>c.path.endsWith('/request')).length,0);
  }
});
test('failed save remains visible and can be retried explicitly without inventing a success',async()=>{
  const storage=new Map([[intentKey,JSON.stringify({shop_key:'relax',at:Date.now()})]]);
  const b=browser({shop:'relax',loggedIn:true,storage,failure:'REGISTRY_WRITE_UNAVAILABLE'});await settle();
  assert.equal(b.calls.filter(c=>c.path.endsWith('/request')).length,1);assert.match(b.status(),/บันทึกยังไม่สำเร็จ/);assert.doesNotMatch(b.status(),/รอเปอร์ตรวจคำขอ/);
  assert.equal(storage.has(intentKey),false);
  assert.ok(b.events.some(e=>e.body.stage==='client_request_failed'&&e.body.code==='REGISTRY_WRITE_UNAVAILABLE'));
  for(const e of b.events){assert.deepEqual(Object.keys(e.body),['shop_key','stage','code']);assert.equal(e.options.credentials,'omit');assert.equal(e.options.referrerPolicy,'no-referrer');assert.doesNotMatch(JSON.stringify(e.body),/fixture-id-token|id_token|claim_id/);}
});

test('profile-only configuration blocks both shops before login, status or submission without profile fallback',async()=>{
 for(const shop of ['kalima','relax'])for(const loggedIn of [false,true]){
   const storage=new Map([[intentKey,JSON.stringify({shop_key:shop,at:Date.now()})]]);
   const b=browser({shop,loggedIn,scope:['profile'],storage});await settle();
   assert.match(b.status(),/ยังไม่ได้เปิดสิทธิ์ยืนยันตัวตน/);assert.equal(b.root.querySelector('#mms-line-button').disabled,true);
   assert.equal(b.calls.length,0);assert.equal(b.logins.length,0);assert.equal(b.storage.has(intentKey),false);
   assert.ok(b.events.some(e=>e.body.stage==='client_openid_unavailable'&&e.body.code==='LINE_OPENID_SCOPE_MISSING'));
   assert.doesNotMatch(JSON.stringify(b.events),/fixture-private-context|userId|id_token/);
   await b.submit();assert.equal(b.calls.length,0);assert.equal(b.logins.length,0);
 }
});
test('permission missing, consent pending, and granted-without-token are different fail-closed states',async()=>{
 for(const [permissionState,expected]of [['unavailable','LINE_OPENID_SCOPE_MISSING'],['prompt','LINE_OPENID_CONSENT_REQUIRED'],['granted','LINE_SESSION_INCOMPLETE']]){
   const b=browser({loggedIn:true,token:null,permissionState});await settle();assert.equal(b.calls.length,0);assert.equal(b.logins.length,0);
   assert.ok(b.events.some(e=>e.body.code===expected));assert.doesNotMatch(b.status(),/รอเปอร์ตรวจคำขอ/);
 }
});
test('corrected openid configuration retains server verification and explicit consent per shop',async()=>{
 for(const shop of ['kalima','relax']){
   const b=browser({shop,loggedIn:true,scope:['profile','openid'],permissionState:'granted'});await settle();
   assert.equal(b.calls.filter(c=>c.path.endsWith('/request')).length,0);
   await b.submit(false);assert.equal(b.calls.filter(c=>c.path.endsWith('/request')).length,0);
   await b.submit(true);const writes=b.calls.filter(c=>c.path.endsWith('/request'));assert.equal(writes.length,1);assert.equal(writes[0].body.shop_key,shop);assert.equal(writes[0].body.consent,true);
 }
});
