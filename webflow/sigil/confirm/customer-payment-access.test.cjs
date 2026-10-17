const assert = require('node:assert/strict');
const { test } = require('node:test');
const api = require('./customer-payment-access.js');
const TOKEN = 'syntheticpayload.' + 'a'.repeat(64);
const URL_BASE = 'https://mmdbkk.com/sigil/confirm/job-confirmation';
const input = () => ({ok:true,authority:'payments-worker',schema:'mmd_payment_instructions_v1',available:true,instructions:{bank_transfer:{enabled:true,bank_name_th:'TEST BANK',account_name_th:'TEST RECEIVER',account_number:'000-0-000000'}}});
class Element {
  constructor(tag) { this.tagName=tag; this.children=[]; this.attrs={}; this.handlers={}; this.hidden=false; this.disabled=false; this.textContent=''; this.parentNode=null; }
  setAttribute(k,v){this.attrs[k]=v;}
  removeAttribute(k){delete this.attrs[k]; if(k==='hidden')this.hidden=false;}
  append(...nodes){for(const n of nodes){if(n.parentNode){n.parentNode.children=n.parentNode.children.filter(x=>x!==n);}n.parentNode=this;this.children.push(n);}}
  appendChild(n){this.append(n);return n;}
  prepend(n){this.append(n);this.children=[n,...this.children.filter(x=>x!==n)];}
  querySelector(sel){return walk(this).find(n=>n!==this&&(sel.startsWith('#')?n.id===sel.slice(1):Object.hasOwn(n.attrs,sel.slice(1,-1))))||null;}
  addEventListener(k,fn){this.handlers[k]=fn;}
  click(){return this.handlers.click?.();}
}
function walk(n){return [n,...n.children.flatMap(walk)];}
function setup(payload=input(),options={}){
  const root=new Element('div');root.id='mmd-job-confirm-v16';
  const success=new Element('div');success.hidden=true;success.setAttribute('data-c-success','');
  const old=new Element('a');old.setAttribute('data-mmd-payment-liff','1');old.textContent='old hidden CTA';success.append(old);root.append(success);
  const head=new Element('head'),calls=[],copied=[];let signal;
  const env={
    document:{getElementById:id=>walk(root).find(n=>n.id===id)||null,createElement:t=>new Element(t),head},
    location:{href:URL_BASE+'?t='+TOKEN+'&utm_source=chatgpt.com'},
    AbortController,setTimeout,clearTimeout,
    navigator:{clipboard:{writeText:async t=>copied.push(t)}},
    fetch:async(url,init)=>{calls.push({url,init});signal=init.signal;return{ok:true,json:async()=>payload};},
    ...options
  };
  api.mount(env);
  const card=root.children[0];
  const button=()=>card.children.find(n=>n.tagName==='button');
  const output=()=>card.children.find(n=>n.tagName==='div');
  const status=()=>card.children.find(n=>n.attrs.role==='status');
  return {env,root,success,old,head,calls,copied,card,button,output,status,signal:()=>signal};
}
test('direct customer token tolerates UTM but rejects wrong route, missing or duplicate token',()=>{
  assert.equal(api.tokenFromUrl(URL_BASE+'?t='+TOKEN+'&utm_source=chatgpt.com'),TOKEN);
  for(const url of [URL_BASE,URL_BASE+'?t=bad',URL_BASE+'?t='+TOKEN+'&t='+TOKEN,'https://mmdbkk.com/sigil/confirm/job-model?t='+TOKEN])assert.equal(api.tokenFromUrl(url),'');
});
test('account is returned only from complete authoritative enabled instructions',()=>{
  assert.deepEqual(api.bankView(input()).bank,{provider:'TEST BANK',name:'TEST RECEIVER',number:'000-0-000000'});
  for(const patch of [{ok:false},{authority:'browser'},{schema:'other'}])assert.throws(()=>api.bankView({...input(),...patch}));
});
for(const reason of ['payment_verified','proof_received_waiting_verification','no_amount_due','payment_not_accepting','unknown'])test('unavailable '+reason+' never exposes even populated bank data',()=>{
  const view=api.bankView({...input(),available:false,reason});assert.equal(view.bank,null);assert.ok(view.message);
});
test('disabled or incomplete bank never supplies a guessed destination',()=>{
  const x=input();x.instructions.bank_transfer.enabled=false;assert.equal(api.bankView(x).bank,null);
  for(const key of ['account_number','account_name_th','bank_name_th']){const d=input();delete d.instructions.bank_transfer[key];assert.throws(()=>api.bankView(d));}
});
test('number is not shown or requested until explicit reveal; CTA escapes hidden success container',()=>{
  const h=setup();assert.equal(h.calls.length,0);assert.equal(h.output().hidden,true);
  assert.equal(h.card.id,'mmd-customer-payment-access');assert.equal(h.card.parentNode,h.root);
  assert.equal(h.old.parentNode,h.card);assert.equal(h.success.hidden,true);
  assert.equal(h.old.hidden,false);assert.equal(new URL(h.old.href).searchParams.get('t'),TOKEN);
  assert.equal(new URL(h.old.href).searchParams.has('utm_source'),false);
  const n=h.root.children.length;api.mount(h.env);assert.equal(h.root.children.length,n);
});
test('explicit reveal displays exact returned bank/name/digits and copies number',async()=>{
  const h=setup();await h.button().click();assert.equal(h.output().hidden,false);
  assert.deepEqual(h.output().children.slice(0,3).map(n=>n.textContent),['TEST BANK','TEST RECEIVER','000-0-000000']);
  await h.output().children[3].click();assert.deepEqual(h.copied,['0000000000']);assert.match(h.status().textContent,/คัดลอกเลขบัญชีแล้ว/);
  assert.equal(h.calls.length,1);const c=h.calls[0];assert.equal(c.url,'https://sigil.mmdbkk.com/v1/confirm/payment-instructions');assert.equal(c.init.method,'POST');assert.equal(c.init.credentials,'omit');assert.deepEqual(JSON.parse(c.init.body),{t:TOKEN});
});
for(const reason of ['payment_verified','proof_received_waiting_verification'])test('UI explains '+reason+' rather than inviting a second transfer',async()=>{
  const h=setup({...input(),available:false,reason});await h.button().click();assert.equal(h.output().hidden,true);assert.match(h.status().textContent,/ไม่ต้องโอน/);assert.equal(h.output().children[2].textContent,'');
});
test('network/body timeout settles with retry and no late account reveal',async()=>{
  let resolve,signal;
  const h=setup(null,{setTimeout:(f,ms)=>{assert.equal(ms,15000);return setTimeout(f,20);},fetch:async(u,i)=>{signal=i.signal;return{ok:true,json:()=>new Promise(r=>resolve=r)};}});
  await h.button().click();assert.equal(signal.aborted,true);assert.equal(h.output().hidden,true);assert.equal(h.button().disabled,false);assert.match(h.status().textContent,/ยังโหลดเลขบัญชีไม่สำเร็จ/);
  resolve(input());await new Promise(r=>setTimeout(r,5));assert.equal(h.output().hidden,true);assert.equal(h.output().children[2].textContent,'');
});
test('HTTP error cannot expose bank even if JSON resembles successful instructions',async()=>{
  const h=setup(null,{fetch:async()=>({ok:false,json:async()=>input()})});await h.button().click();assert.equal(h.output().hidden,true);assert.match(h.status().textContent,/ก่อนโอน/);
});
test('a refresh erases previously revealed digits when server state becomes verified',async()=>{
  const h=setup();await h.button().click();h.env.fetch=async()=>({ok:true,json:async()=>({...input(),available:false,reason:'payment_verified'})});await h.button().click();assert.equal(h.output().hidden,true);assert.equal(h.output().children[2].textContent,'');await h.output().children[3].click();assert.equal(h.copied.length,0);
});
test('clipboard restriction shows manual-copy guidance without claiming copy success',async()=>{
  const h=setup(null,{navigator:{clipboard:{writeText:async()=>{throw new Error('denied')}}}});h.env.fetch=async()=>({ok:true,json:async()=>input()});await h.button().click();await h.output().children[3].click();assert.match(h.status().textContent,/แตะค้าง/);
});
test('rapid clicks do not issue duplicate requests',async()=>{
  let finish,count=0;const h=setup(null,{fetch:async()=>{count++;return new Promise(r=>finish=()=>r({ok:true,json:async()=>input()}));}});const first=h.button().click();await h.button().click();assert.equal(count,1);finish();await first;assert.equal(h.output().hidden,false);
});
test('new shortcut leaves all payment/ack/slip writes untouched',()=>{
  const fs=require('node:fs'),source=fs.readFileSync(__dirname+'/customer-payment-access.js','utf8');
  assert.doesNotMatch(source,/\/v1\/confirm\/ack|\/v1\/pay\/slip\/evidence|session_id\s*:/);
  const h=setup();const links=h.card.children.filter(n=>n.tagName==='a');assert.equal(links.length,3);
  const web=new URL(links[0].href);assert.equal(web.origin,'https://sigil.mmdbkk.com');assert.equal(web.searchParams.get('t'),TOKEN);assert.equal(links[2].href,'https://lin.ee/xRqsALs');
});
