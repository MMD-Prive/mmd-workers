import test from 'node:test';
import assert from 'node:assert/strict';
import {readCoModelEvidence} from './co-model-evidence.mjs';
import {travelBinding} from './model-travel-store.mjs';
import {notificationDigest} from './payment-notification-outbox.mjs';
import {coModelView,renderCoModel} from './co-model-readonly.mjs';
async function fixture(){
 const record={id:'recSession',fields:{session_id:'sess_fixture','Canonical Model':['recModel'],member_id:['recMember'],job_id:'job_fixture'}};
 const binding=await travelBinding(record),id='a'.repeat(64),hash='b'.repeat(64);
 const entry={id,binding,state:'saved',sender_role:'model',sender_id:'recModel',text:'PRIVATE TEXT',saved_at:'2026-11-15T01:00:00Z',photos:[{sha256:hash,type:'image/jpeg'},{sha256:hash,type:'image/jpeg'}]};
 const ledger={version:1,revision:1,entries:{[id]:entry}};
 const key=await notificationDigest('model-travel:sess_fixture:'+binding+':'+id);
 const receipt={schema:'payment_notification_v1',id:key,payload:{session_id:'sess_fixture',binding,kind:'submission'},status:'delivered'};
 let authorized=0,reads=0,attempts=0;const deny=()=>{attempts++;throw Error('WRITE FORBIDDEN');};
 const env={AIRTABLE_API_KEY:'fixture',AIRTABLE_BASE_ID:'fixture',AIRTABLE_HTTP:{fetch:async req=>{assert.equal(req.method,'GET');reads++;return Response.json({records:[record]});}},PRIVATE_MODEL_MEDIA:{get:async path=>{const data=path.endsWith('ledger.json')?ledger:path.includes('/receipts/')?receipt:null;return data?{size:JSON.stringify(data).length,text:async()=>JSON.stringify(data)}:null;},put:deny,delete:deny,list:deny},MEMBER_DASHBOARD_CHAT_WORKER:{fetch:deny}};
 const options={role:'owner',sessionId:'sess_fixture',recordId:record.id,authorize:async()=>{authorized++;}};
 return {env,options,record,ledger,entry,receipt,binding,stats:()=>({authorized,reads,attempts})};
}
test('saved evidence and LINE receipt read without any write/send/cleanup',async()=>{const f=await fixture();f.ledger.entries.expired={state:'reserved',expires_at:0};const r=await readCoModelEvidence(f.env,f.options);assert.equal(r.status,'available');assert.equal(r.submissions,1);assert.equal(r.images,2);assert.equal(r.unique_images,1);assert.equal(r.timeline[0].line_notice,'provider_accepted');assert.doesNotMatch(JSON.stringify(r),/PRIVATE TEXT|recMember|recModel/);assert.deepEqual(f.stats(),{authorized:2,reads:2,attempts:0});});
test('Partner sees model metadata only; Owner also sees customer metadata',async()=>{const f=await fixture(),id='c'.repeat(64);f.ledger.entries[id]={...f.entry,id,sender_role:'customer',sender_id:'customer:'+f.binding};assert.equal((await readCoModelEvidence(f.env,{...f.options,role:'partner'})).submissions,1);assert.equal((await readCoModelEvidence(f.env,f.options)).submissions,2);});
test('wrong role and failed authorization stop before storage',async()=>{const f=await fixture();await assert.rejects(readCoModelEvidence(f.env,{...f.options,role:'admin'}));await assert.rejects(readCoModelEvidence(f.env,{...f.options,authorize:async()=>{throw Error('denied');}}));assert.equal(f.stats().reads,0);});
test('revoked Partner during read does not return evidence',async()=>{const f=await fixture();let n=0;await assert.rejects(readCoModelEvidence(f.env,{...f.options,role:'partner',authorize:async()=>{if(++n===2)throw Error('revoked');}}),/revoked/);});
test('binding change on second canonical read discards results',async()=>{const f=await fixture();let n=0;f.env.AIRTABLE_HTTP.fetch=async()=>{if(++n===2)f.record.fields.confirmation_revision=2;return Response.json({records:[f.record]});};assert.equal((await readCoModelEvidence(f.env,f.options)).status,'unavailable');});
test('missing and broken storage never become zero',async()=>{const f=await fixture();f.env.PRIVATE_MODEL_MEDIA.get=async()=>null;let r=await readCoModelEvidence(f.env,f.options);assert.equal(r.status,'not_recorded');assert.equal(r.images,null);f.env.PRIVATE_MODEL_MEDIA.get=async()=>{throw Error('offline');};r=await readCoModelEvidence(f.env,f.options);assert.equal(r.status,'unavailable');assert.equal(r.images,null);});
test('receipt mismatch or read failure cannot imply delivered or trigger retry',async()=>{const f=await fixture();f.receipt.payload.session_id='sess_other';assert.equal((await readCoModelEvidence(f.env,f.options)).timeline[0].line_notice,'unavailable');assert.equal(f.stats().attempts,0);});
test('old binding ignored and malformed current saved entry fails closed',async()=>{const f=await fixture();f.entry.binding='old';assert.equal((await readCoModelEvidence(f.env,f.options)).submissions,0);f.entry.binding=f.binding;f.entry.sender_id='recOther';assert.equal((await readCoModelEvidence(f.env,f.options)).status,'unavailable');});
test('render labels source and notice without exposing messages, calls remain unknown',async()=>{const f=await fixture(),evidence=await readCoModelEvidence(f.env,f.options);const view=coModelView({role:'owner',sessionId:'sess_fixture',evidence});const html=renderCoModel(view);assert.match(html,/MY MMD/);assert.match(html,/ไม่ยืนยันการอ่าน/);assert.match(html,/ผู้รับช่วง: ยังไม่มีหลักฐานยืนยัน/);assert.doesNotMatch(html,/PRIVATE TEXT|<img|<button/);assert.ok(view.channels.every(c=>c.calls===null));});
