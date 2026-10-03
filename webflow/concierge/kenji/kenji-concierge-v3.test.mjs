import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const html = read('./kenji-concierge-v3.html'), css = read('./kenji-concierge-v3.css');
const script = read('./kenji-concierge-v3.js').replace(/^<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');
const context = {module:{exports:{}}};
vm.runInNewContext(script, context);
const {normalize, safeAction} = context.module.exports;
const now = Date.parse('2026-10-03T00:00:00Z');
const profile = (membership={},points={}) => ({ok:true,membership:{status:'active',level:'Premium',activeThrough:'2027-01-01',...membership},points});
test('canonical paths and historical hash targets remain available',()=>{
  for(const route of ['/member/api/liff/profile','/member/kenji','/member/my-mmd','/booking','/recovery'])assert.ok(html.includes(route));
  for(const id of ['overview','actions','intelligence','standard','faq','care'])assert.ok(html.includes(`id="kj3-${id}"`));
  const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
});
test('current verified facts are displayed, missing points are never coerced',()=>{
  assert.equal(normalize(profile({}, {confirmedBalance:0}),now).points,0);
  assert.equal(normalize(profile({}, {confirmedBalance:1234}),now).points,1234);
  for(const value of [undefined,null,'',false,'10',NaN,Infinity,-1])assert.equal(normalize(profile({}, {confirmedBalance:value}),now).points,null);
  assert.equal(normalize(profile({}, {confirmedBalance:100,status:'pending'}),now).points,null);
  assert.equal(normalize(profile({}, {balance:999,tags:['eligible'],estimated_points:888}),now).points,null);
});
test('failed or incomplete profile never produces access',()=>{
  for(const payload of [null,{}, {ok:false}, {ok:false,membership:{status:'active'}}])assert.equal(normalize(payload,now).mode,'error');
  assert.equal(normalize({ok:true},now).mode,'unknown');
  assert.equal(normalize(profile({activeThrough:'invalid'}),now).expiry,'');
});
test('access blocks and review override membership tier or active status',()=>{
  for(const access of ['blocked','denied','revoked','suspended','none','inactive'])assert.equal(normalize(profile({access}),now).mode,'blocked');
  for(const access of ['pending','review','checking','unknown'])assert.equal(normalize(profile({access:{value:access}}),now).mode,'pending');
  assert.equal(normalize(profile({activeThrough:'2026-10-02'}),now).mode,'expired');
  assert.equal(normalize(profile({status:'expired'}),now).mode,'expired');
});
test('canonical nested payload and legitimate active membership work',()=>{
  assert.equal(normalize({ok:true,profile:profile()},now).mode,'active');
  assert.equal(normalize({ok:true,data:profile()},now).tier,'Premium');
});
test('quick prompts and promotion copy do not grant eligibility',()=>{
  assert.match(script,/เช็กโปรโมชั่นทั่วไปที่ระบบยืนยันแล้ว/);
  assert.match(html,/แท็ก.*ไม่ใช่การยืนยัน/);
});
test('inline chat uses the existing authenticated BFF and no token credential substitution',()=>{
  assert.match(html,/data-chat-endpoint="\/api\/member\/kenji\/chat"/);
  assert.match(script,/method:"POST",credentials:"same-origin"/);
  assert.match(script,/JSON.stringify\(\{message:message\}\)/);
  assert.match(script,/if\(busy\|\|paused\|\|!canChat\)return/);
  assert.doesNotMatch(script,/localStorage|sessionStorage|\.innerHTML|sendBeacon/);
  assert.match(script,/ยังไม่ยืนยันการรับ/);
});
test('backend actions cannot inject an external or script destination',()=>{
  assert.equal(safeAction({url:'/my-mmd/points',label:'Points'}).url,'/my-mmd/points');
  for(const url of ['javascript:alert(1)','https://example.com','//example.com','/\\example.com','/path with space'])assert.equal(safeAction({url,label:'go'}),null);
});
test('responsive accessibility and status refresh safety',()=>{
  for(const marker of ['aria-live="polite"','aria-busy="true"','maxlength="800"','<label for="kj3-input"','<noscript>'])assert.ok(html.includes(marker));
  for(const marker of ['position:sticky','font-size:16px','safe-area-inset-bottom','focus-visible','prefers-reduced-motion','FINAL MMD CONTRAST SAFETY LAYER'])assert.ok(css.includes(marker));
  for(const marker of ['pagehide','pageshow','visibilitychange','credentials:"include"','cache:"no-store"','id===requestId','activeController.abort()'])assert.ok(script.includes(marker));
});
