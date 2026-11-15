import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {Window} from 'happy-dom';
import {fixture,apiModule,MODEL,PARTNER} from './helpers/partner-fixture.mjs';
import {handlePartnerOwnerConsole} from '../../admin-worker/src/partner-owner-console.js';
import {createCredentialBoundAdminSession} from '../../admin-worker/src/credential-bound-admin-session.js';
const origin='https://www.mmdbkk.com';
async function settle(check){for(let n=0;n<100;n++){if(check())return;await new Promise(r=>setTimeout(r,10));}assert.ok(check(),'Owner UI did not settle');}
test('Owner creates an announcement and reviews a real fixture proposal through the authenticated bridge',async t=>{
 const f=await fixture();f.env.ADMIN_LOGIN_CREDENTIAL='test-only';f.env.ADMIN_SESSION_SECRET='test-only-secret';
 f.env.PARTNERS_WORKER={fetch:r=>apiModule.default.fetch(r,f.env,{waitUntil(){}})};
 const cookie='mmd_admin_gate_v1='+await createCredentialBoundAdminSession(new Request(origin),{id:'owner-fixture',role:'owner'},f.env);
 const w=new Window({url:origin+'/internal/admin/partners',settings:{enableJavaScriptEvaluation:true,suppressInsecureJavaScriptEnvironmentWarning:true,disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
 const pending=new Set();let closed=false;t.after(async()=>{closed=true;await w.happyDOM.close();await Promise.allSettled([...pending]);f.restore();});
 Object.defineProperty(w,'crypto',{value:webcrypto});const errors=[];w.addEventListener('error',e=>errors.push(e.message));
 w.fetch=(path,options={})=>{if(closed)return Promise.resolve(Response.json({ok:false},{status:499}));const p=handlePartnerOwnerConsole(new Request(new URL(path,origin),{...options,headers:{...options.headers,cookie,origin}}),f.env,{});pending.add(p);p.finally(()=>pending.delete(p));return p;};
 const page=await handlePartnerOwnerConsole(new Request(w.location.href,{headers:{cookie}}),f.env,{});w.document.write(await page.text());
 const q=s=>w.document.querySelector(s);q('[data-tab=announcements]').click();await settle(()=>q('[data-ann-new]'));q('[data-ann-new]').click();
 const form=q('#announcement-form');const values={title:'งาน QA จาก Owner',brief:'ข้อมูลจำลอง',category:'ถ่ายภาพ',area:'กรุงเทพฯ',requirements:'นายแบบ',start_at:'2099-05-02T13:00',end_at:'2099-05-02T15:00',deadline:'2099-05-01T19:00',required_count:'1',budget_min:'5000',budget_max:'8000',travel_terms:'แยกตกลง',partner_fee_terms:'แยกจากค่าตัว',private_details:'PRIVATE CLIENT',status:'open'};
 for(const [k,v] of Object.entries(values))form.elements[k].value=v;
 form.dispatchEvent(new w.Event('submit',{cancelable:true}));await settle(()=>q('#status').textContent.includes('ระบบบันทึกประกาศแล้ว'));
 let row=(await (await f.call('/v1/partner/announcements')).json()).announcements[0];assert.equal(row.start_at,'2099-05-02T06:00:00.000Z');assert.equal(row.private_details,undefined);
 const A=apiModule.PARTNER_ASSETS,asset='recIIIIIIIIIIIIII';f.db.Assets.push({id:asset,fields:{[A.partner]:[PARTNER],[A.model]:[MODEL],[A.fileType]:'image/jpeg',[A.fileCategory]:'photo',[A.fileName]:'QA.jpg',[A.r2Key]:'partner-shared/fixture.jpg'}});
 const proposed=await f.call('/v1/partner/announcements/propose',{body:{id:row.id,revision:row.revision,model_id:MODEL,asset_id:asset,rate:6000,availability:'confirmed',photo_current:true,share_with_mmd:true,note:''}});assert.equal(proposed.status,200);
 q('[data-ann-list]').click();await settle(()=>q('[data-ann-id]'));q('[data-ann-id]').click();await settle(()=>q('[data-ann-decision=selected]'));q('[data-ann-decision=selected]').click();await settle(()=>q('#status').textContent.includes('ระบบบันทึกผลแล้ว'));
 row=(await (await f.call('/v1/partner/announcements/detail?id='+row.id)).json()).announcement;assert.equal(row.proposals[0].status,'selected');assert.equal(row.private_details,'PRIVATE CLIENT');assert.deepEqual(errors,[]);assert.equal(f.messages.length,0);assert.equal(f.writes.length,0);
});
