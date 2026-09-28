import assert from 'node:assert/strict';
import test from 'node:test';
import {webcrypto} from 'node:crypto';
import {build} from 'esbuild';
import {Window} from 'happy-dom';
import {fixture,MODEL,apiModule} from './helpers/partner-fixture.mjs';

const bundle=await build({entryPoints:[new URL('../src/public-index.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm'});
const {default:pageWorker}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
async function settle(check){for(let n=0;n<100;n++){if(check())return;await new Promise(r=>setTimeout(r,20));}assert.ok(check(),'UI operation did not settle');}
async function ui(t,{expired=false}={}){
  const f=await fixture();
  if(expired)f.db.Partners[0].fields[apiModule.MODEL_PARTNERS.accessTokenHash]='invalidated-fixture';
  const w=new Window({url:'https://www.mmdbkk.com/partner/dashboard?t='+encodeURIComponent(f.token),settings:{enableJavaScriptEvaluation:true,disableCSSFileLoading:true,disableJavaScriptFileLoading:true,disableIframePageLoading:true}});
  const pending=new Set();let closed=false;
  t.after(async()=>{closed=true;await w.happyDOM.close();while(pending.size)await Promise.allSettled([...pending]);f.restore();});
  const errors=[];w.addEventListener('error',e=>errors.push(e.error||e.message));
  Object.defineProperty(w,'crypto',{value:webcrypto});w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
  w.confirm=()=>true;w.prompt=()=>'';
  w.fetch=(path,opts={})=>{if(closed)return Promise.resolve(Response.json({ok:false},{status:499}));const u=new URL(path,w.location.href);const p=f.call(u.pathname+u.search,{method:opts.method,body:opts.body?JSON.parse(opts.body):undefined,headers:opts.headers});pending.add(p);p.finally(()=>pending.delete(p));return p;};
  const html=await(await pageWorker.fetch(new Request(w.location.href),f.env,{})).text();
  w.document.write(html);
  try { await settle(()=>expired?w.location.pathname==='/sigil/model/dashboard/partner-login':!!w.document.querySelector('[data-model]')); }
  catch(e){throw new Error(e.message+'; '+errors.map(x=>x.stack||x).join('; ')+'; '+w.document.querySelector('[data-flash]')?.textContent);}
  const q=s=>w.document.querySelector(s);
  return {f,w,q,errors};
}
test('dashboard without token redirects directly to canonical LINE login and renders no fallback page',async t=>{
  const f=await fixture();t.after(f.restore);
  const response=await pageWorker.fetch(new Request('https://www.mmdbkk.com/partner/dashboard'),f.env,{});
  assert.equal(response.status,302);
  assert.equal(response.headers.get('location'),'https://www.mmdbkk.com/sigil/model/dashboard/partner-login');
  assert.equal(await response.text(),'');
});
test('expired access leaves no dashboard fallback UI and redirects to canonical LINE login',async t=>{
  const {q,w,errors}=await ui(t,{expired:true});
  assert.equal(w.location.pathname,'/sigil/model/dashboard/partner-login');
  assert.equal(q('[data-reconnect-line]'),null);
  assert.equal(q('[data-model]'),null);
  assert.deepEqual(errors,[]);
});
test('access revocation closes an open private editor and clears decrypted fields',async t=>{
  const {q,w,f,errors}=await ui(t);
  q('[data-vault-pin]').value='fixture-password';q('[data-unlock-vault]').click();
  await settle(()=>!q('[data-vault-open]').hidden);
  q('[data-edit-model]').click();
  q('[name=private_note]').value='LOCAL UNSAVED SECRET';q('[data-general-note]').value='PRIVATE GENERAL';
  f.db.Partners[0].fields[apiModule.MODEL_PARTNERS.accessTokenHash]='revoked-fixture';
  w.dispatchEvent(new w.Event('focus'));
  await settle(()=>w.location.pathname==='/sigil/model/dashboard/partner-login');
  assert.equal(q('[data-model-dialog]').open,false);assert.equal(q('.pcr-shell').hidden,true);
  assert.equal(q('[name=private_note]').value,'');assert.equal(q('[data-general-note]').value,'');
  assert.equal(q('[data-reconnect-line]'),null);assert.equal(q('[data-model]'),null);assert.deepEqual(errors,[]);
});
test('native control room executes and switches every operation tab with live fixture data',async t=>{
  const {q,errors}=await ui(t);
  for(const name of ['home','models','agreements','earnings','performance','console','activity','privacy']){
    const button=q('[data-view="'+name+'"]');assert.ok(button,name);button.click();
    assert.equal(q('[data-view-panel="'+name+'"]').hidden,false);
  }
  q('[data-edit-model]').click();
  assert.equal(q('[data-model-form]').elements.display_name.value,'Model QA');
  assert.ok(q('[data-model-dialog]').open);
  assert.deepEqual(errors,[]);
});
test('Telegram stays optional and never hides Dashboard job state in Phase 1',async t=>{
  const {q,w,f,errors}=await ui(t);
  assert.equal(q('[data-telegram]').dataset.state,'optional');
  assert.match(q('[data-telegram]').textContent,/Telegram เชื่อมภายหลังได้/);
  assert.ok(q('[data-connect-telegram]'));
  assert.equal(q('[data-telegram-job-gate]'),null);
  assert.match(q('[data-jobs]').textContent,/กำลังเตรียมงาน/);
  f.db.Partners[0].fields[apiModule.MODEL_PARTNERS.telegramId]='123456789';
  f.db.Partners[0].fields[apiModule.MODEL_PARTNERS.telegramVerificationStatus]='verified';
  w.dispatchEvent(new w.Event('focus'));
  await settle(()=>q('[data-telegram]').dataset.state==='connected');
  assert.match(q('[data-telegram]').textContent,/Telegram connected/);
  assert.match(q('[data-jobs]').textContent,/กำลังเตรียมงาน/);
  assert.deepEqual(errors,[]);
});
test('private schedule encrypts locally, refuses overlap, survives relock, and never enters shared changes',async t=>{
  const {q,w,f,errors}=await ui(t);
  q('[data-vault-pin]').value='fixture-password';q('[data-unlock-vault]').click();
  await settle(()=>!q('[data-vault-open]').hidden);
  q('[data-event-add]').click();const form=q('[data-event-form]');
  form.elements.model_record_id.value=MODEL;form.elements.start_at.value='2026-09-23T12:30';form.elements.end_at.value='2026-09-23T14:30';form.elements.note.value='PRIVATE QA NOTE';
  form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  assert.match(q('[data-event-error]').textContent,/คิวชน/);assert.equal(f.objects.size,0);
  form.elements.start_at.value='2026-09-23T14:00';form.elements.end_at.value='2026-09-23T15:00';
  form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await settle(()=>!q('[data-event-dialog]').open);
  assert.match(q('[data-private-events]').textContent,/PRIVATE QA NOTE/);
  assert.doesNotMatch(JSON.stringify([...f.objects.values()]),/PRIVATE QA NOTE/);
  assert.equal(f.db.Changes.length,0);
  q('[data-lock-vault]').click();assert.doesNotMatch(q('[data-private-events]').textContent,/PRIVATE QA NOTE/);
  q('[data-vault-pin]').value='fixture-password';q('[data-unlock-vault]').click();
  await settle(()=>!q('[data-vault-open]').hidden);
  assert.match(q('[data-private-events]').textContent,/PRIVATE QA NOTE/);
  assert.deepEqual(errors,[]);
});

async function encryptedBackup(partnerId,note,pin='backup-password'){
 const salt=webcrypto.getRandomValues(new Uint8Array(16)),iv=webcrypto.getRandomValues(new Uint8Array(12));
 const base=await webcrypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveKey']);
 const key=await webcrypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt']);
 const cipher=await webcrypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify({_partner_record_id:partnerId,travel_notes:{},model_notes:{},general_note:note,events:[]})));
 return JSON.stringify({version:1,salt:Buffer.from(salt).toString('base64url'),iv:Buffer.from(iv).toString('base64url'),ciphertext:Buffer.from(cipher).toString('base64url')});
}
test('backup import rejects another Partner, decrypts locally, and persists with current PIN',async t=>{
 const {q,w,f,errors}=await ui(t);q('[data-vault-pin]').value='current-password';q('[data-unlock-vault]').click();await settle(()=>!q('[data-vault-open]').hidden);
 async function importFile(id){const file=new w.File([await encryptedBackup(id,'RECOVERED PRIVATE NOTE')],'backup.json',{type:'application/json'});Object.defineProperty(q('[data-import-vault-file]'),'files',{value:[file],configurable:true});q('[data-import-vault-pin]').value='backup-password';q('[data-import-vault]').click();await settle(()=>!q('[data-import-vault]').disabled);}
 await importFile('recOTHERPARTNER00');assert.match(q('[data-flash]').textContent,/ไม่ตรงกับ Partner/);assert.equal(f.objects.size,0);
 await importFile(f.db.Partners[0].id);assert.equal(q('[data-general-note]').value,'RECOVERED PRIVATE NOTE');assert.doesNotMatch(JSON.stringify([...f.objects.values()]),/RECOVERED PRIVATE NOTE|backup-password|current-password/);
 q('[data-lock-vault]').click();q('[data-vault-pin]').value='current-password';q('[data-unlock-vault]').click();await settle(()=>!q('[data-vault-open]').hidden);assert.equal(q('[data-general-note]').value,'RECOVERED PRIVATE NOTE');assert.deepEqual(errors,[]);
});
test('failed encrypted save blocks queued overwrites and preserves the unsaved note for backup',async t=>{
 const {q,f,errors}=await ui(t);q('[data-vault-pin]').value='current-password';q('[data-unlock-vault]').click();await settle(()=>!q('[data-vault-open]').hidden);
 const original=f.env.PARTNER_ASSETS.put;let attempts=0;f.env.PARTNER_ASSETS.put=async()=>{attempts++;return null;};
 q('[data-general-note]').value='UNSAVED LOCAL NOTE';q('[data-save-vault]').click();q('[data-save-vault]').click();await settle(()=>attempts===1&&q('[data-flash]').textContent.includes('อีกอุปกรณ์'));
 assert.equal(attempts,1);assert.equal(q('[data-general-note]').value,'UNSAVED LOCAL NOTE');assert.equal(f.objects.size,0);f.env.PARTNER_ASSETS.put=original;assert.deepEqual(errors,[]);
});
