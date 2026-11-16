import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import admin from './.build/admin.mjs';
import partner from './.build/partner.mjs';
import {ADMIN_HOST,PARTNER_HOST,SOURCE} from './constants.mjs';
import {IDS,createFixtures,fixtureToken} from './fixtures.mjs';
const secret='fixture-only-secret-not-for-deployment-00001';
function setup(){
 const a={ADMIN_LOGIN_CREDENTIAL:'fixture-owner-password',ADMIN_SESSION_SECRET:secret},p={...a,TOKEN_SECRET:secret};
 const ctx={waitUntil(){throw Error('background_write_forbidden');}};
 a.PARTNERS_WORKER={fetch:r=>partner.fetch(r,p,ctx)};p.ADMIN_CO_MODEL={fetch:r=>admin.fetch(r,a,ctx)};
 const call=(side,path,init={})=>(side==='admin'?admin:partner).fetch(new Request('https://'+(side==='admin'?ADMIN_HOST:PARTNER_HOST)+path,init),side==='admin'?a:p,ctx);
 return {a,p,ctx,call};
}
async function login(f,side='admin'){
 const host=side==='admin'?ADMIN_HOST:PARTNER_HOST;
 const r=await f.call(side,'/internal/admin/login/session',{method:'POST',headers:{origin:'https://'+host,'content-type':'application/json','x-mmd-login-fetch':'1'},body:JSON.stringify({action:'owner_login',credential:'fixture-owner-password',next:'/qa/owner'})});
 assert.equal(r.status,200,await r.clone().text());return r.headers.get('set-cookie').split(';')[0];
}
test('bundle hashes and source pin match manifest',async()=>{const m=JSON.parse(await readFile(new URL('./.build/manifest.json',import.meta.url)));assert.equal(m.source,SOURCE);for(const role of ['admin','partner']){const bytes=await readFile(new URL('./.build/'+role+'.mjs',import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),m.bundles[role].sha256);}});
test('Owner login and read use original credential/session flow',async()=>{const f=setup(),cookie=await login(f);const r=await f.call('admin','/v1/admin/jobs/edit?view=co-model&session_id=sess_fixture_A',{headers:{cookie}});assert.equal(r.status,200,await r.clone().text());const d=await r.json();assert.equal(d.co_model.evidence.submissions,3);assert.equal(d.co_model.evidence.images,3);assert.equal(d.co_model.evidence.unique_images,2);assert.equal(r.headers.get('x-mmd-staging-source'),SOURCE);});
test('Owner Console original shell and embedded review render',async()=>{const f=setup(),cookie=await login(f);const r=await f.call('admin','/internal/admin/console?view=edit-job&tool_view=co-model&session_id=sess_fixture_A',{headers:{cookie}});assert.equal(r.status,200);const page=await f.call('admin','/internal/admin/jobs/edit?view=co-model&session_id=sess_fixture_A',{headers:{cookie}});assert.equal(page.status,200);assert.match(await page.text(),/3 ครั้ง/);});
test('Partner A reads model metadata via actual Admin and scope service',async()=>{const f=setup(),t=await fixtureToken(secret,'A');const r=await f.call('partner','/v1/partner/jobs/detail?session_record_id='+IDS.A+'&t='+encodeURIComponent(t));assert.equal(r.status,200,await r.clone().text());const d=await r.json();assert.match(d.detail.co_model_html,/2 ครั้ง · 3 รูป · ไฟล์ไม่ซ้ำ 2 รูป/);assert.doesNotMatch(d.detail.co_model_html,/SYNTHETIC PRIVATE TEXT|customer/);assert.match(d.detail.co_model_html,/ไม่ยืนยันการอ่าน/);assert.equal(f.p.PRIVATE_MODEL_MEDIA,undefined);});
test('Partner A cannot read B and cannot bypass public internal endpoints',async()=>{const f=setup(),t=await fixtureToken(secret,'A');assert.equal((await f.call('partner','/v1/partner/jobs/detail?session_record_id='+IDS.B+'&t='+t)).status,403);assert.equal((await f.call('admin','/__internal/partner/co-model',{headers:{'x-mmd-partner-token':t}})).status,403);});
test('Partner B reads own work and dashboard never includes A',async()=>{const f=setup(),t=await fixtureToken(secret,'B');const r=await f.call('partner','/v1/partner/dashboard?t='+t);assert.equal(r.status,200,await r.clone().text());const d=await r.json();assert.ok(d.jobs.length>0);assert.ok(d.jobs.every(j=>j.session_record_id===IDS.B));const page=await f.call('partner','/partner/dashboard?t='+t);assert.equal(page.status,200);});
test('all business writes denied even with Owner session or valid Partner',async()=>{const f=setup(),cookie=await login(f),t=await fixtureToken(secret,'A');for(const side of ['admin','partner'])for(const method of ['POST','PUT','PATCH','DELETE'])for(const path of ['/v1/admin/jobs/edit','/v1/admin/job/create','/v1/partner/jobs/detail','/v1/partner/upload'])assert.equal((await f.call(side,path+'?t='+t,{method,headers:{cookie}})).status,405);});
test('Owner pages require login; invalid Partner and non-fixture session denied',async()=>{const f=setup();assert.equal((await f.call('admin','/qa/owner')).status,401);assert.equal((await f.call('partner','/v1/partner/jobs/detail?session_record_id='+IDS.A+'&t=bad')).status,401);const cookie=await login(f);assert.equal((await f.call('admin','/v1/admin/jobs/edit?view=co-model&session_id=sess_real',{headers:{cookie}})).status,503);});
test('login is same-origin and Owner-only; fixture launch links require Owner',async()=>{const f=setup();assert.equal((await f.call('partner','/qa/partners')).status,401);const cookie=await login(f,'partner');assert.equal((await f.call('partner','/qa/partners',{headers:{cookie}})).status,200);assert.equal((await f.call('admin','/internal/admin/login/session',{method:'POST'})).status,403);});
test('fixture transport rejects network/write and storage has no write methods',async()=>{const f=await createFixtures(secret);assert.equal((await f.http('https://api.airtable.com/v0/production/Sessions')).status,403);assert.equal((await f.http('https://api.line.me/v2/bot/message/push',{method:'POST'})).status,405);assert.equal(f.storage.put,undefined);assert.equal(f.storage.delete,undefined);const key='job-travel/v1/invalid/ledger.json';assert.equal(await f.storage.get(key),null);});
test('missing binding and wrong host fail closed',async()=>{const f=setup();delete f.p.ADMIN_CO_MODEL;const t=await fixtureToken(secret,'A');const r=await f.call('partner','/v1/partner/jobs/detail?session_record_id='+IDS.A+'&t='+t);assert.match((await r.json()).detail.co_model_html,/ยังยืนยันไม่ได้/);assert.equal((await admin.fetch(new Request('https://www.mmdbkk.com/qa/owner'),f.a,f.ctx)).status,403);});
