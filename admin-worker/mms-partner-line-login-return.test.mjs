import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { APP_JS } from './src/mms-partner-line-ui.mjs';

const intentKey='mms_partner_submit_intent_v1';
const settle=async()=>{for(let n=0;n<12;n++)await new Promise(resolve=>setImmediate(resolve));};
function browser({shop='relax',loggedIn=false,storage=new Map(),failure='',token='fixture-id-token-never-save'}={}){
  const calls=[],logins=[];
  function node(){return {style:{},dataset:{},hidden:false,checked:false,disabled:false,textContent:'',events:{},children:new Map(),setAttribute(){},append(){},before(){},addEventListener(event,fn){this.events[event]=fn;},querySelector(selector){if(!this.children.has(selector))this.children.set(selector,node());return this.children.get(selector);}};}
  const root=node(),select=root.querySelector('#mms-shop');select.value=shop;select.options=[{text:'Kalima Massage'},{text:'Relax Spa by 9'}];select.selectedIndex=shop==='relax'?1:0;
  const location={origin:'https://www.mmdbkk.com',pathname:'/male-massage/partner/verify',search:'?shop='+shop};
  const context={document:{head:node(),getElementById:()=>root,createElement:()=>node()},location,URL,URLSearchParams,Date,console,
    sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    window:{liff:{init:async()=>{},isLoggedIn:()=>loggedIn,login:options=>logins.push(options),getIDToken:()=>token}},
    fetch:async(path,options)=>{const body=JSON.parse(options.body);calls.push({path,body});if(failure&&path.endsWith('/request'))return {ok:false,json:async()=>({ok:false,error:failure})};return {ok:true,json:async()=>path.endsWith('/status')?{ok:true,claim:null}:{ok:true,claim:{shop_key:body.shop_key,shop_name:body.shop_key==='relax'?'Relax Spa by 9':'Kalima Massage',claim_id:'fixture-claim',status:'Pending Owner Review'}}};},
  };
  vm.runInNewContext(APP_JS,context);
  return {root,storage,calls,logins,async submit(consent=true){root.querySelector('#mms-consent').checked=consent;await root.querySelector('#mms-line-button').events.click();await settle();},status:()=>root.querySelector('#mms-line-status').textContent};
}

test('login redirect resumes only the previously consented shop submission and does not replay on reload',async()=>{
  for(const shop of ['kalima','relax']){
    const storage=new Map(),before=browser({shop,storage});await settle();await before.submit();
    assert.equal(before.logins.length,1);assert.equal(before.calls.length,0);
    assert.ok(storage.has(intentKey));assert.ok(!JSON.stringify([...storage]).includes('fixture-id-token'));
    const after=browser({shop,loggedIn:true,storage});await settle();
    const writes=after.calls.filter(c=>c.path.endsWith('/request'));
    assert.equal(writes.length,1);assert.equal(writes[0].body.shop_key,shop);assert.equal(writes[0].body.consent,true);
    assert.match(after.status(),/รอเปอร์ตรวจคำขอ/);assert.equal(storage.has(intentKey),false);
    const reload=browser({shop,loggedIn:true,storage});await settle();assert.equal(reload.calls.filter(c=>c.path.endsWith('/request')).length,0);
  }
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
});
