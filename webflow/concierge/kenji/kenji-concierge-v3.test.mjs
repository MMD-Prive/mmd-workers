import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const html = read('./kenji-concierge-v3.html'), css = read('./kenji-concierge-v3.css');
const script = read('./kenji-concierge-v3.js').replace(/^<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');
const context = {module:{exports:{}}};
vm.runInNewContext(script, context);
const {normalize, safeAction, displayReply} = context.module.exports;
const now = Date.parse('2026-10-03T00:00:00Z');
const profile = (membership={},balance=1234) => ({ok:true,data:{tier:'Premium',membership_status:'active',membership_expires_at:'2027-01-01',...membership,points:balance,points_policy:'lot_365d_from_entry',customer_360:{points:{status:'verified',active_points:balance,expiry_policy:'lot_365d_from_entry'}}}});
test('canonical paths and historical hash targets remain available',()=>{
  for(const route of ['/member/api/liff/profile','/member/kenji','/member/my-mmd','/booking','/recovery'])assert.ok(html.includes(route));
  for(const id of ['overview','actions','intelligence','standard','faq','care'])assert.ok(html.includes(`id="kj3-${id}"`));
  const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
});
test('flat guarded LIFF fields display membership, expiry and Points',()=>{
  const value=normalize(profile(),now);
  assert.equal(value.mode,'active');assert.equal(value.tier,'Premium');assert.equal(value.expiry,'2027-01-01');assert.equal(value.points,1234);
  assert.equal(normalize(profile({},0),now).points,0);
  for(const value of [undefined,null,'',false,'10',NaN,Infinity,-1,1.5]){const payload=profile();payload.data.points=value;payload.data.customer_360.points.active_points=value;assert.equal(normalize(payload,now).points,null)}
});
test('unguarded, pending, conflicting and old raw totals never become confirmed Points',()=>{
  for(const payload of [
    {ok:true,data:{tier:'Premium',membership_status:'active',points:61320,points_records_count:1}},
    {ok:true,data:{points:{confirmedBalance:61320}}},
    {...profile(),data:{...profile().data,points_policy:undefined}},
    {...profile(),data:{...profile().data,points_recovery_pending:true}},
    {...profile(),data:{...profile().data,customer_360:{points:{status:'checking',active_points:1234,expiry_policy:'lot_365d_from_entry'}}}},
    {...profile(),data:{...profile().data,customer_360:{points:{status:'verified',active_points:999,expiry_policy:'lot_365d_from_entry'}}}}
  ])assert.equal(normalize(payload,now).points,null);
});
test('failed, incomplete and unresolved profiles remain unknown',()=>{
  for(const payload of [null,{}, {ok:false}, {ok:false,data:profile().data}])assert.equal(normalize(payload,now).mode,'error');
  assert.equal(normalize({ok:true},now).mode,'unknown');
  assert.equal(normalize(profile({membership_expires_at:'invalid'}),now).expiry,'');
  for(const fields of [{pending_identity:true},{resolution_guard:{state:'checking'}}]){
    const value=normalize(profile(fields),now);assert.equal(value.mode,'pending');assert.equal(value.tier,'');assert.equal(value.expiry,'');assert.equal(value.points,null);
  }
});
test('access blocks and review override flat membership status',()=>{
  for(const actual_access of ['blocked','denied','revoked','suspended','none','inactive'])assert.equal(normalize(profile({actual_access}),now).mode,'blocked');
  for(const membership_status of ['pending_review','under_review','checking'])assert.equal(normalize(profile({membership_status}),now).mode,'pending');
  assert.equal(normalize(profile({membership_expires_at:'2026-10-02'}),now).mode,'expired');
  assert.equal(normalize(profile({membership_status:'expired'}),now).mode,'expired');
});
test('verified Points preserve the exact existing Kenji reply and Per Rename',()=>{
  const response={intent:'points_status',reply:'QA Member · Points ที่ระบบยืนยันตอนนี้ 1,234 แต้มครับ'};
  assert.equal(displayReply(response,normalize(profile(),now).points),response.reply);
  assert.match(displayReply({...response,reply:'Points 0 แต้ม'},null),/ยังยืนยันยอด Points ไม่ได้/);
  assert.equal(displayReply({intent:'general',reply:'คำตอบเดิมครับ'},null),'คำตอบเดิมครับ');
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
