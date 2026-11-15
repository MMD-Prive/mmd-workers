import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import TOML from '@iarna/toml';
import {Miniflare,Log,LogLevel} from 'miniflare';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const config=TOML.parse(fs.readFileSync(path.join(root,'member-pages-worker/wrangler.toml'),'utf8'));
const bundle=await build({entryPoints:[path.join(root,'member-pages-worker',config.main)],bundle:true,write:false,metafile:true,format:'esm',target:'es2022',external:['cloudflare:*','node:*'],logLevel:'silent'});

test('latest owner request service binding is retained without changing the payment owner',()=>{
 const admin=TOML.parse(fs.readFileSync(path.join(root,'admin-worker/wrangler.toml'),'utf8'));
 assert.equal(admin.services.find(b=>b.binding==='MEMBER_PAGES_REQUESTS')?.service,'member-pages-worker');
 assert.equal(admin.services.find(b=>b.binding==='PAYMENTS_WORKER')?.service,'payments-worker');
 assert.equal(admin.keep_vars,true);
});

async function fixture(t) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mmd-live-merge-'));
 const classBundle=await build({stdin:{contents:`export {CustomerRequestMutationCoordinator} from './${config.main}';`,resolveDir:path.join(root,'member-pages-worker'),sourcefile:'synthetic-class-export.js'},bundle:true,write:false,format:'esm',target:'es2022',external:['cloudflare:*','node:*'],logLevel:'silent'});
 const script=classBundle.outputFiles[0].text+`\nexport default {async fetch(r,e){const id=e.MUTATION.idFromName('synthetic-customer');return e.MUTATION.get(id).fetch(r)}};`;
 const options={script,modules:true,compatibilityDate:'2026-06-20',durableObjects:{MUTATION:{className:'CustomerRequestMutationCoordinator',useSQLite:true}},durableObjectsPersist:dir,log:new Log(LogLevel.ERROR),outboundService:()=>new Response('No external network',{status:503})};
 let runtime=new Miniflare(options);t.after(()=>runtime.dispose());
 return {async call(action,extra={}){const r=await runtime.dispatchFetch('https://synthetic.local',{method:'POST',body:JSON.stringify({action,operation_id:'synthetic-operation',mutation_fingerprint:'synthetic-fingerprint',...extra})});return {status:r.status,body:await r.json()};},async restart(){await runtime.dispose();runtime=new Miniflare(options);}};
}
async function uncertain(f){assert.equal((await f.call('begin')).status,200);assert.equal((await f.call('prepare')).status,200);assert.equal((await f.call('write_started')).status,200);assert.equal((await f.call('item_started',{item_key:'synthetic-record'})).status,200);assert.equal((await f.call('finish',{status:'uncertain'})).status,200);}

test('same operation cannot erase an uncertain write after restart and eight retries',async t=>{
 const f=await fixture(t);await uncertain(f);const before=(await f.call('inspect')).body.lease;await f.restart();
 const replies=await Promise.all(Array.from({length:8},()=>f.call('begin')));
 assert.ok(replies.every(r=>r.status===409),'all retries must require reconciliation');
 assert.deepEqual((await f.call('inspect')).body.lease,before);
 assert.equal((await f.call('begin',{operation_id:'different-operation'})).status,409);
});
test('same pending operation is stable across eight requests and rejects a different payload',async t=>{
 const f=await fixture(t);const first=await f.call('begin');assert.equal(first.status,200);const before=(await f.call('inspect')).body.lease;
 const replies=await Promise.all(Array.from({length:8},()=>f.call('begin')));assert.ok(replies.every(r=>r.status===200&&r.body.lease===first.body.lease));assert.deepEqual((await f.call('inspect')).body.lease,before);
 assert.equal((await f.call('begin',{mutation_fingerprint:'changed-payload'})).status,409);
});
test('process restart during an in-flight item never permits eight begin requests to reset it',async t=>{
 const f=await fixture(t);for(const action of ['begin','prepare','write_started'])assert.equal((await f.call(action)).status,200);
 assert.equal((await f.call('item_started',{item_key:'synthetic-record'})).status,200);const before=(await f.call('inspect')).body.lease;
 await f.restart();const replies=await Promise.all(Array.from({length:8},()=>f.call('begin')));assert.ok(replies.every(r=>r.status===409));assert.deepEqual((await f.call('inspect')).body.lease,before);
});
test('reconciliation still requires exact item, fingerprint and verified readback',async t=>{
 const f=await fixture(t);await uncertain(f);await f.restart();
 for(const extra of [{item_key:'wrong',readback_verified:true},{item_key:'synthetic-record',readback_verified:false},{item_key:'synthetic-record',readback_verified:true,mutation_fingerprint:'changed'}])assert.equal((await f.call('reconcile_item',extra)).status,409);
 assert.equal((await f.call('reconcile_item',{item_key:'synthetic-record',readback_verified:true})).status,200);
 assert.deepEqual((await f.call('inspect')).body.lease.completed_keys,['synthetic-record']);
 assert.equal((await f.call('reconcile',{readback_verified:true})).status,200);
 assert.equal((await f.call('inspect')).body.lease,null);
});
test('configured Member entrypoint retains live artifact and migration/class exports',async t=>{
 const bytes=fs.readFileSync(path.join(root,'member-pages-worker/live-baseline/member-pages-worker.js'));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'f40fa9018e9067e6e69ecc76d517ba6b59a2c1ff923dd8f4e3482e9573343b74');
 assert.deepEqual(config.migrations.map(m=>m.tag),['v1-care-back-birthday-wish','v2-private-preview-gate','v3-remembered-login-device','v5-customer-request-mutation','v6-customer-request-quota']);
 assert.equal(new Set(config.durable_objects.bindings.map(b=>b.name)).size,config.durable_objects.bindings.length);
 const exports=Object.values(bundle.metafile.outputs).flatMap(x=>x.exports);for(const b of config.durable_objects.bindings)assert.ok(exports.includes(b.class_name),b.class_name);
 const runtime=new Miniflare({script:bundle.outputFiles[0].text,modules:true,compatibilityDate:config.compatibility_date,bindings:{LIFF_PROMOTION_PURCHASE_ENABLED:'false'},log:new Log(LogLevel.ERROR),outboundService:()=>new Response('blocked',{status:503})});t.after(()=>runtime.dispose());
 assert.equal((await runtime.dispatchFetch('https://mmdbkk.com/member/api/liff/promotions/double-moment/context?session_id=synthetic')).status,401);
 assert.equal((await runtime.dispatchFetch('https://mmdbkk.com/api/member/app/session/travel?session_id=synthetic')).status,401);
 assert.equal((await runtime.dispatchFetch('https://mmdbkk.com/member/api/liff/promotions/double-moment/purchase',{method:'POST',body:'{}'})).status,404);
});

test('live customer Skin remains, updated wallet and three-month terms render, job return is after profile verification',async t=>{
 const runtime=new Miniflare({script:bundle.outputFiles[0].text,modules:true,compatibilityDate:config.compatibility_date,bindings:config.vars,log:new Log(LogLevel.ERROR),outboundService:()=>new Response('blocked',{status:503})});t.after(()=>runtime.dispose());
 const r=await runtime.dispatchFetch('https://mmdbkk.com/member/liff?intent=status&return_to=double_moment_job&job_session=sess_synthetic');
 assert.equal(r.status,200);const html=await r.text();
 assert.ok(html.includes('nightline-scene'),'live scene retained');assert.ok(html.includes('MmdV6Thai'),'live font retained');assert.ok(html.includes('เลือกชุดสิทธิ์สำหรับงานนี้'),'wallet link');assert.ok(html.includes('validity_months !== 3'),'v3 calendar-month guard');
 const redirect='window.location.replace("/member/double-moment?session_id=sess_synthetic")';assert.ok(html.indexOf(redirect)>html.indexOf('profileReady = true;'));
 for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){if(m[1].trim())assert.doesNotThrow(()=>new Function(m[1]));}
 const bad=await runtime.dispatchFetch('https://mmdbkk.com/member/liff?intent=status&return_to=double_moment_job&job_session=sess_synthetic&job_session=other');assert.ok(!(await bad.text()).includes('window.location.replace("/member/double-moment'),'ambiguous job return rejected');
});
