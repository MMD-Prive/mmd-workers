import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeProductionPaymentProof } from '../src/payment-proof-intelligence.mjs';
import { LINE_GROUP_INGRESS_INTERNALS } from '../src/line-group-ingress-front-gate.js';
import { heldObjectKey, heldStateKey, heldReviewStateKey, heldTerminalKey, holdUncertainEvidence, reprocessHeldEvidence } from '../src/line-held-evidence-lane.mjs';

function bucket() {
  const store=new Map(); let sequence=0;
  return {store,async put(key,value,options={}){const old=store.get(key); if(options.onlyIf?.etagDoesNotMatch==='*'&&old)return null;if(options.onlyIf?.etagMatches&&old?.etag!==options.onlyIf.etagMatches)return null;const etag='e'+ ++sequence;store.set(key,{value,etag});return {etag};},async get(key){const v=store.get(key);if(!v)return null;return {etag:v.etag,text:async()=>typeof v.value==='string'?v.value:new TextDecoder().decode(v.value),arrayBuffer:async()=>v.value instanceof ArrayBuffer?v.value:new Uint8Array(v.value).buffer};},async delete(key){store.delete(key);},async list({prefix='',limit=1000}={}){return {objects:[...store.keys()].filter(k=>k.startsWith(prefix)).slice(0,limit).map(key=>({key}))};}};
}
const context='ต่ออายุสมาชิกครับ โอนแล้ว';
test('payment context never upgrades a screenshot, failed OCR, unknown image or disabled extractor',async()=>{
  for(const mode of ['screenshot','ocr_failed','unknown','disabled']){
    const result=await analyzeProductionPaymentProof({env:{SLIP_EXTRACTOR:{async fetch(){if(mode==='ocr_failed')throw Error('offline');return Response.json({});}}},image:{body:new Uint8Array([1]),mimeType:'image/png',byteSize:1},contextText:context,paymentContextConfirmed:true,automatedExtraction:mode!=='disabled'});
    assert.equal(result.accepted,false);assert.equal(result.classification.gate,'hold');assert.equal(result.classification.image_class,'unclassified_document');assert.equal(result.classification.is_payment_evidence,false);assert.deepEqual(result.links,{});assert.equal(result.payment_intelligence,null);
  }
});
test('incident-shaped screenshot then 2500-THB transfer produces one pending proof; replays never count another payment',async()=>{
  const original=globalThis.fetch, r2=bucket(), proofs=new Map();let paymentCalls=0,proofWrites=0;
  globalThis.fetch=async(input,init={})=>{
    const request=input instanceof Request?input:new Request(input,init),url=new URL(request.url);
    if(url.hostname==='api-data.line.me')return new Response(new Uint8Array([url.pathname.includes('slip')?2:1,9]),{headers:{'content-type':'image/png'}});
    assert.equal(url.hostname,'api.airtable.com');
    const table=url.pathname.split('/')[3];
    if(request.method==='GET'){const filter=url.searchParams.get('filterByFormula')||'';return Response.json({records:table==='proofs'?[...proofs.values()].filter(r=>filter.includes(r.fields.proof_id)):[]});}
    assert.equal(request.method,'POST');assert.equal(table,'proofs');const body=await request.json();const record={id:'recProofFixture',fields:body.fields};proofs.set(body.fields.proof_id,record);proofWrites++;return Response.json(record);
  };
  const env={LINE_CHANNEL_ACCESS_TOKEN:'fixture',LINE_SLIP_EVIDENCE:r2,AIRTABLE_BASE_ID:'fixture',AIRTABLE_API_KEY:'fixture',AIRTABLE_TABLE_PAYMENT_PROOFS_ID:'proofs',SLIP_EXTRACTOR:{async fetch(request){const bytes=new Uint8Array(await request.arrayBuffer());return Response.json(bytes[0]===2?{payment_ref:'fixture-bank-transfer',amount_thb:2500,paid_at:'2026-10-30T13:13:00Z',provider:'bank_transfer'}:{});}},PAYMENTS_WORKER:{async fetch(){paymentCalls++;throw Error('must not settle');}}};
  const event=id=>({type:'message',timestamp:Date.now(),source:{type:'user',userId:'U'+'1'.repeat(32)},message:{type:'image',id}});
  try{
    const capture=id=>LINE_GROUP_INGRESS_INTERNALS.captureDirectUserImageEvidence(env,event(id),{recentPaymentContext:true,paymentContextText:context});
    const screenshot=await capture('renewal-error-screen');assert.equal(screenshot.held,true);assert.equal(screenshot.captured,false);assert.equal(proofWrites,0);
    assert.ok(r2.store.has(heldObjectKey(screenshot.proofId,'png',true)));
    assert.ok(r2.store.has(heldReviewStateKey(screenshot.proofId)));
    const slip=await capture('genuine-slip');assert.equal(slip.captured,true);assert.equal(proofWrites,1);assert.equal([...proofs.values()][0].fields.amount_thb,2500);assert.equal([...proofs.values()][0].fields.status,'pending');
    assert.equal((await capture('genuine-slip')).deduped,true);assert.equal((await capture('renewal-error-screen')).heldDeduped,true);
    assert.equal(proofWrites,1);assert.equal(paymentCalls,0);
  }finally{globalThis.fetch=original;}
});
for(const finish of ['max_attempts','retention_expiry'])test(`neutral original and private review manifest survive ${finish}, even after replay-marker cleanup`,async()=>{
  const r2=bucket(),id='neutral-'+finish,bytes=new Uint8Array([7,8,9]).buffer;
  const input={proofId:id,image:{body:bytes,extension:'png',mimeType:'image/png',byteSize:3,sha256:'a'.repeat(64)},imageClass:'unclassified_document',lineUserId:'fixture-private',messageId:'fixture-message',paymentContextText:context};
  await holdUncertainEvidence({LINE_SLIP_EVIDENCE:r2},input,{now:1000});let promoted=0,notices=0;
  const now=finish==='retention_expiry'?4*86400000:2000000;
  await reprocessHeldEvidence({LINE_SLIP_EVIDENCE:r2,LINE_HELD_EVIDENCE_MAX_ATTEMPTS:1},{now,analyze:async()=>({accepted:false,classification:{gate:'hold'}}),promote:async()=>{promoted++;},notifyReviewRequired:async()=>{notices++;}});
  assert.equal(promoted,0);assert.equal(notices,1);assert.ok(r2.store.has(heldObjectKey(id,'png',true)));assert.ok(r2.store.has(heldReviewStateKey(id)));assert.equal(r2.store.has(heldStateKey(id)),false);
  const archive=JSON.parse(await (await r2.get(heldReviewStateKey(id))).text());assert.equal(archive.private.line_user_id,'fixture-private');assert.equal(archive.requires_manual_retention_decision,true);
  await r2.delete(heldTerminalKey(id));const replay=await holdUncertainEvidence({LINE_SLIP_EVIDENCE:r2},input,{now:now+100});assert.equal(replay.terminal,true);assert.equal(replay.deduped,true);
  assert.deepEqual(new Uint8Array(await (await r2.get(heldObjectKey(id,'png',true))).arrayBuffer()),new Uint8Array(bytes));
});
test('neutral evidence can promote through positive canonical reanalysis once, with original still retained',async()=>{
  const r2=bucket(),id='neutral-promote';await holdUncertainEvidence({LINE_SLIP_EVIDENCE:r2},{proofId:id,image:{body:new Uint8Array([2]).buffer,extension:'png'},imageClass:'unclassified_document'},{now:1000});let calls=0;
  const options={now:2000000,analyze:async()=>({accepted:true,classification:{gate:'accept',image_class:'bank_transfer_slip'}}),promote:async()=>{calls++;return {captured:true};}};
  await reprocessHeldEvidence({LINE_SLIP_EVIDENCE:r2},options);await reprocessHeldEvidence({LINE_SLIP_EVIDENCE:r2},options);
  assert.equal(calls,1);assert.ok(r2.store.has(heldObjectKey(id,'png',true)));assert.ok(r2.store.has(heldReviewStateKey(id)));
});
