const assert = require('node:assert/strict');
const { test } = require('node:test');
const api = require('./customer-payment-access.js');
const token = 'synthetic.' + 'a'.repeat(64);
const fixture = () => ({ ok:true, authority:'payments-worker', schema:'mmd_payment_instructions_v1', available:true, stage:'final', amount_due_thb:14000, instructions:{
  promptpay:{enabled:true,qr_url:'https://qr.example.invalid/14000.00.png',qr_strategy:'dynamic_amount',amount_entry:'embedded'},
  bank_transfer:{enabled:true,bank_name_th:'TEST BANK',account_name_th:'TEST RECEIVER',account_number:'0000000000'}
}});
class Element {
  constructor(tag){this.tagName=tag;this.children=[];this.attrs={};this.handlers={};this.textContent='';this.hidden=false;this.parentNode=null;}
  append(...nodes){for(const n of nodes){if(n.parentNode)n.parentNode.children=n.parentNode.children.filter(x=>x!==n);n.parentNode=this;this.children.push(n);}}
  appendChild(n){this.append(n);return n;}
  prepend(n){this.append(n);this.children=[n,...this.children.filter(x=>x!==n)];}
  setAttribute(k,v){this.attrs[k]=v;}
  removeAttribute(k){delete this.attrs[k];if(k==='src'||k==='href')delete this[k];}
  addEventListener(k,fn){this.handlers[k]=fn;}
  querySelector(sel){return nodes(this).find(n=>n!==this&&(sel.startsWith('#')?n.id===sel.slice(1):Object.hasOwn(n.attrs,sel.slice(1,-1))))||null;}
  click(){return this.handlers.click?.();}
}
function nodes(root){return[root,...root.children.flatMap(nodes)];}
function setup(){
  const root=new Element('div');root.id='mmd-job-confirm-v16';const head=new Element('head');
  const env={document:{getElementById:id=>nodes(root).find(n=>n.id===id)||null,createElement:t=>new Element(t),head},location:{href:'https://mmdbkk.com/sigil/confirm/job-confirmation?t='+token},AbortController,setTimeout,clearTimeout,navigator:{clipboard:{writeText:async()=>{}}},fetch:async()=>({ok:true,json:async()=>fixture()})};
  api.mount(env);const card=root.children[0];
  return {env,card,button:card.children.find(n=>n.tagName==='button'),amount:card.querySelector('[data-mmd-pay-amount]'),qr:card.querySelector('[data-mmd-pay-qr]'),bank:card.children.find(n=>n.tagName==='div')};
}
test('explicit reveal shows final 14,000 amount with server URL, bank and embedded-amount caption',async()=>{
  const h=setup();assert.equal(h.amount.hidden,true);assert.equal(h.qr.hidden,true);assert.equal(h.bank.hidden,true);
  await h.button.click();assert.equal(h.amount.hidden,false);assert.match(h.amount.textContent,/ยอดคงเหลือ.*14,000\.00/);assert.equal(h.qr.hidden,false);assert.equal(h.qr.children[0].src,fixture().instructions.promptpay.qr_url);assert.match(h.qr.children[1].textContent,/QR ระบุยอด/);assert.equal(h.qr.children[2].href,h.qr.children[0].src);assert.equal(h.bank.hidden,false);
});
test('static QR explicitly instructs customer to enter amount rather than claiming embedded amount',async()=>{
  const h=setup(),f=fixture();f.instructions.promptpay.qr_strategy='static_url';f.instructions.promptpay.amount_entry='customer_manual';h.env.fetch=async()=>({ok:true,json:async()=>f});await h.button.click();assert.match(h.qr.children[1].textContent,/ต้องกรอกยอดเอง/);
});
test('pending final evidence clears previously displayed QR and bank so stale payment cannot be reused',async()=>{
  const h=setup();await h.button.click();h.env.fetch=async()=>({ok:true,json:async()=>({...fixture(),available:false,reason:'proof_received_waiting_verification'})});await h.button.click();assert.equal(h.qr.hidden,true);assert.equal(h.qr.children[0].src,undefined);assert.equal(h.qr.children[2].href,undefined);assert.equal(h.amount.hidden,true);assert.equal(h.bank.hidden,true);
});
test('verified, no-due and unavailable states never include a QR in the view model',()=>{
  for(const reason of ['payment_verified','no_amount_due','payment_not_accepting']){const r=api.paymentView({...fixture(),available:false,reason});assert.equal(r.qr,undefined);assert.equal(r.bank,null);}
});
test('QR is independent from disabled bank transfer; neither bank nor QR destination is guessed',()=>{
  const f=fixture();f.instructions.bank_transfer.enabled=false;const v=api.paymentView(f);assert.equal(v.bank,null);assert.equal(v.qr.url,f.instructions.promptpay.qr_url);
  f.instructions.promptpay.enabled=false;assert.equal(api.paymentView(f).qr,null);
});
test('unsafe QR URLs or nonpositive amounts are never loaded',()=>{
  for(const raw of ['javascript:alert(1)','http://qr.example.invalid/qr','https://user:password@qr.example.invalid/qr']){const f=fixture();f.instructions.promptpay.qr_url=raw;assert.equal(api.paymentView(f).qr,null);}
  for(const amount of [null,0,-1,'not a number'])assert.equal(api.paymentView({...fixture(),amount_due_thb:amount}).qr,null);
  assert.throws(()=>api.paymentView({...fixture(),authority:'browser'}));
});
test('broken QR image has readable fallback while verified bank details remain usable',async()=>{
  const h=setup();await h.button.click();h.qr.children[0].onerror();assert.equal(h.qr.children[0].hidden,true);assert.match(h.qr.children[1].textContent,/โหลดรูป QR ไม่สำเร็จ/);assert.equal(h.bank.hidden,false);
});
