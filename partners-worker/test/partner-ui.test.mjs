import assert from 'node:assert/strict';
import test from 'node:test';
import {webcrypto} from 'node:crypto';
import {build} from 'esbuild';
import {Window} from 'happy-dom';
import {fixture,MODEL} from './helpers/partner-fixture.mjs';

const bundle=await build({entryPoints:[new URL('../src/public-index.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm'});
const {default:pageWorker}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
async function settle(check){for(let n=0;n<100;n++){if(check())return;await new Promise(r=>setTimeout(r,20));}assert.ok(check(),'UI operation did not settle');}
async function ui(t){
  const f=await fixture();
  const w=new Window({url:'https://www.mmdbkk.com/partner/dashboard?t='+encodeURIComponent(f.token),settings:{enableJavaScriptEvaluation:true,disableCSSFileLoading:true,disableJavaScriptFileLoading:true,disableIframePageLoading:true}});
  const pending=new Set();let closed=false;
  t.after(async()=>{closed=true;await w.happyDOM.close();while(pending.size)await Promise.allSettled([...pending]);f.restore();});
  const errors=[];w.addEventListener('error',e=>errors.push(e.error||e.message));
  Object.defineProperty(w,'crypto',{value:webcrypto});w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
  w.confirm=()=>true;w.prompt=()=>'';
  w.fetch=(path,opts={})=>{if(closed)return Promise.resolve(Response.json({ok:false},{status:499}));const u=new URL(path,w.location.href);const p=f.call(u.pathname+u.search,{method:opts.method,body:opts.body?JSON.parse(opts.body):undefined,headers:opts.headers});pending.add(p);p.finally(()=>pending.delete(p));return p;};
  const html=await(await pageWorker.fetch(new Request(w.location.href),f.env,{})).text();
  w.document.write(html);
  try { await settle(()=>!!w.document.querySelector('[data-model]')); }
  catch(e){throw new Error(e.message+'; '+errors.map(x=>x.stack||x).join('; ')+'; '+w.document.querySelector('[data-flash]')?.textContent);}
  const q=s=>w.document.querySelector(s);
  return {f,w,q,errors};
}
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
