import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,apiModule,MODEL,PARTNER,SESSION,OTHER} from './helpers/partner-fixture.mjs';
const {SESSION_FIELDS:S,PAYMENT_FIELDS:P,PARTNER_COMMISSIONS:C,MODEL_REFERRALS:R,PARTNER_MODEL_CHANGES:Q,PARTNER_ASSETS:A,MODELS:M}=apiModule;
async function setup(t){const f=await fixture();t.after(async()=>{await Promise.allSettled(f.tasks);f.restore();});return f;}
function freshAgreement(f){f.db.Sessions[0].createdTime=new Date(Date.now()-1000).toISOString();Object.assign(f.db.Referrals[0].fields,{[R.approvedAt]:'2026-01-01T00:00:00Z',[R.approvedBy]:'owner-fixture',[R.commissionRate]:0.07});}
const owner=(f,path,body)=>f.call('/v1/partner/admin/'+path,{owner:true,body});
function receipt(id,ref,stage,amount){return {id,fields:{[P.sessionId]:'session_fixture',[P.paymentRef]:ref,[P.canonicalStage]:stage,[P.stage]:'wrong_legacy_type',[P.verification]:'verified',[P.amount]:amount,[P.status]:'paid'}};}
async function capture(f){freshAgreement(f);const r=await owner(f,'agreement/capture',{session_record_id:SESSION,commission_percent:99,partner_record_id:OTHER});assert.equal(r.status,200,await r.clone().text());return r.json();}
async function settle(f,mode='full',total=10000){Object.assign(f.db.Sessions[0].fields,{[S.paymentStatus]:'paid',[S.completionReview]:'clear'});const r=await owner(f,'settlement/approve',{session_record_id:SESSION,receipt_mode:mode,reviewed_total_thb:total,approve_settlement:true});assert.equal(r.status,200,await r.clone().text());return r.json();}

test('producer freezes approved booking-time agreement and ignores browser rates / foreign partner',async t=>{
 const f=await setup(t),a=await capture(f);assert.equal(a.agreement.commission_percent,7);assert.equal(a.agreement.partner_record_id,PARTNER);
 f.db.Referrals[0].fields[R.commissionRate]=0.1;
 const replay=await owner(f,'agreement/capture',{session_record_id:SESSION});assert.equal((await replay.json()).agreement.commission_percent,7);
 f.db.Payments.push(receipt('rec11111111111111','full-fixture','full',10000));await settle(f);
 const c=await owner(f,'ledger/materialize',{session_record_id:SESSION});assert.equal(c.status,201);assert.equal((await c.json()).commission_amount_thb,700);
});
test('historical capture refuses current rates, and resolves independently dated prior approval',async t=>{
 const f=await setup(t);freshAgreement(f);f.db.Sessions[0].createdTime='2026-08-01T00:00:00Z';
 assert.equal((await owner(f,'agreement/capture',{session_record_id:SESSION})).status,409);
 f.db.Changes.push({id:'recHHHHHHHHHHHHHH',fields:{[Q.partnerId]:'partner_fixture',[Q.partner]:[PARTNER],[Q.model]:[MODEL],[Q.action]:'update_working_system',[Q.status]:'superseded',[Q.payloadJson]:JSON.stringify({system:'bridge',commission_percent:6,version:2,decided_at:'2026-07-01T00:00:00Z',decided_by:'owner-fixture',effective_from:'2026-07-02T00:00:00Z'})}});
 const r=await owner(f,'agreement/capture',{session_record_id:SESSION});assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).agreement.commission_percent,6);
});
test('deposit + final settlement excludes tips and rechecks refunds before payout',async t=>{
 const f=await setup(t);await capture(f);f.db.Payments.push(receipt('rec11111111111111','deposit-fixture','deposit',3000),receipt('rec22222222222222','final-fixture','final',7000),receipt('rec33333333333333','tip-fixture','tips',500));await settle(f,'deposit_and_final');
 const created=await(await owner(f,'ledger/materialize',{session_record_id:SESSION})).json();assert.equal(created.commission_amount_thb,700);
 assert.equal((await owner(f,'ledger/action',{commission_record_id:created.commission_record_id,action:'approve'})).status,200);
 f.db.Payments[0].fields[P.status]='refunded';
 assert.equal((await owner(f,'ledger/action',{commission_record_id:created.commission_record_id,action:'mark_paid',payout_reference:'bank-fixture'})).status,409);
 assert.equal(f.db.Commissions[0].fields[C.payoutReference],undefined);
});
test('simultaneous materialization creates one ledger row and uncertain writes remain fenced',async t=>{
 const f=await setup(t);await capture(f);f.db.Payments.push(receipt('rec11111111111111','full-fixture','full',10000));await settle(f);
 const r=await Promise.all([owner(f,'ledger/materialize',{session_record_id:SESSION}),owner(f,'ledger/materialize',{session_record_id:SESSION})]);assert.ok(r.some(r=>r.status===201));assert.ok(r.every(r=>[200,201,409].includes(r.status)));assert.equal(f.db.Commissions.length,1);
 const existingFetch=globalThis.fetch;globalThis.fetch=async(...args)=>{const result=await existingFetch(...args);const input=args[0],options=args[1];if(String(input).includes('/Commissions/')&&options?.method==='PATCH')throw Error('simulated ambiguous write');return result;};
 assert.equal((await owner(f,'ledger/action',{commission_record_id:f.db.Commissions[0].id,action:'approve'})).status,500);
 globalThis.fetch=existingFetch;
 assert.equal((await owner(f,'ledger/action',{commission_record_id:f.db.Commissions[0].id,action:'mark_paid',payout_reference:'fixture'})).status,409);
 assert.equal(f.db.Commissions[0].fields[C.payoutReference],undefined);
});
test('full history follows every page, excludes void earnings and does not promote pending profile',async t=>{
 const f=await setup(t);for(let i=0;i<305;i++)f.db.Commissions.push({id:'rec'+String(i).padStart(14,'0'),fields:{[C.partner]:[PARTNER],[C.model]:[MODEL],[C.status]:i===304?'void':'earned',[C.payoutStatus]:'pending',[C.commissionAmount]:10}});
 f.db.Commissions.push({id:OTHER,fields:{[C.partner]:[OTHER],[C.status]:'paid',[C.commissionAmount]:99999}});
 f.db.Changes.push({id:'recHHHHHHHHHHHHHH',fields:{[Q.partnerId]:'partner_fixture',[Q.model]:[MODEL],[Q.action]:'update_profile',[Q.status]:'review',[Q.payloadJson]:JSON.stringify({display_name:'UNAPPROVED NAME'})}});
 const d=await(await f.call('/v1/partner/dashboard')).json();assert.equal(d.commissions.length,305);assert.equal(d.summary.pendingAmount,3040);assert.equal(d.summary.paidAmount,0);assert.equal(d.history.complete,true);assert.equal(d.models[0].display_name,'Model QA');assert.equal(d.models[0].pending_profile.display_name,'UNAPPROVED NAME');
});
test('approved shared profile reaches canonical customer-safe copy with three links and no new public entitlement',async t=>{
 const f=await setup(t);const urls=['https://example.com/1','https://example.com/2','https://example.com/3'];
 const r=await f.call('/v1/partner/models/change',{body:{action:'update_profile',model_record_id:MODEL,display_name:'Approved name',profile_summary:'Approved profile',sales_copy:'Approved copy',portfolio_urls:urls,age:25,share_with_mmd:true}});assert.equal(r.status,201);
 const id=(await r.json()).request_id;const approved=await owner(f,'model-changes/decision',{request_record_id:id,decision:'approve'});assert.equal(approved.status,200,await approved.clone().text());
 const profile=f.db.tblk0NqOj3NM5tEjs[0].fields;assert.match(profile.fldX5kLQI97cBCc2x,/Approved profile/);for(const url of urls)assert.ok(profile.fldC4cueqKzg2EHJx.includes(url));assert.equal(profile.fldyFDzD9WAyCCqfh,'No');assert.equal(f.db.Models[0].fields.fld9YrnlELxggG6yA,undefined);
});
test('public cover requires preview digest plus explicit owner consent and revokes on archive',async t=>{
 const f=await setup(t);const assetId='recAAAAAAAAAAAAAA';const key='partner-shared/'+(await apiModule.sha256Hex(PARTNER)).slice(0,20)+'/'+MODEL+'/photo.png';
 const bytes=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZgAAAABJRU5ErkJggg==','base64')).buffer;
 f.objects.set(key,{etag:'image-fixture',textValue:'',bytes});f.db.Assets.push({id:assetId,fields:{[A.partner]:[PARTNER],[A.model]:[MODEL],[A.r2Key]:key,[A.fileType]:'image/png',[A.fileSize]:bytes.byteLength,[A.reviewStatus]:'pending_review'}});
 const change=await(await f.call('/v1/partner/models/change',{body:{action:'set_cover',asset_id:assetId,model_record_id:MODEL,share_with_mmd:true}})).json();
 assert.equal((await owner(f,'model-changes/decision',{request_record_id:change.request_id,decision:'approve'})).status,409);
 const preview=await f.call('/v1/partner/admin/model-changes/asset?request_id='+change.request_id,{owner:true});assert.equal(preview.status,200);const digest=preview.headers.get('x-media-sha256');
 assert.equal((await owner(f,'model-changes/decision',{request_record_id:change.request_id,decision:'approve',approve_public_image:true,reviewed_sha256:digest})).status,200);
 const publicUrl=f.db.Models[0].fields[M.publicImageUrl];assert.equal((await f.call(new URL(publicUrl).pathname+new URL(publicUrl).search)).status,200);
 const archive=await(await f.call('/v1/partner/models/change',{body:{action:'archive_asset',asset_id:assetId,model_record_id:MODEL,share_with_mmd:true}})).json();assert.equal((await owner(f,'model-changes/decision',{request_record_id:archive.request_id,decision:'approve'})).status,200);
 assert.equal((await f.call(new URL(publicUrl).pathname+new URL(publicUrl).search)).status,404);assert.equal(f.db.Models[0].fields[M.publicImageUrl],'');assert.equal(f.db["tblrpQXhHnbTU9RhW"][0].fields.fldTS03RmDt3VkNrX,false);
});

test('unpriced legacy Session needs explicit late-agreement reconciliation and preserves original evidence',async t=>{
 const f=await setup(t);freshAgreement(f);f.db.Sessions[0].createdTime='2026-06-01T00:00:00Z';
 const legacy={schema:'mmd_model_partner_referral_snapshot_v1',commission_terms:'not_set',commercial_terms:'case_by_case',referral_record_id:f.db.Referrals[0].id};f.db.Sessions[0].fields[S.referralSnapshotJson]=JSON.stringify(legacy);
 const requestId='recHHHHHHHHHHHHHH';f.db.Changes.push({id:requestId,fields:{[Q.partnerId]:'partner_fixture',[Q.partner]:[PARTNER],[Q.model]:[MODEL],[Q.action]:'update_working_system',[Q.status]:'approved',[Q.payloadJson]:JSON.stringify({system:'bridge',commission_percent:6,version:2,decided_at:'2026-07-01T00:00:00Z',decided_by:'owner-fixture',effective_from:'2026-07-02T00:00:00Z'})}});
 assert.equal((await owner(f,'agreement/capture',{session_record_id:SESSION,agreement_request_id:requestId})).status,409);
 const r=await owner(f,'agreement/capture',{session_record_id:SESSION,agreement_request_id:requestId,reconcile_legacy:true,reconciliation_reason:'Owner reviewed original case-by-case agreement evidence'});assert.equal(r.status,200,await r.clone().text());const a=(await r.json()).agreement;assert.deepEqual(a.original_snapshot,legacy);assert.equal(a.approved_at,'2026-07-01T00:00:00Z');assert.equal(a.booked_at,'2026-06-01T00:00:00.000Z');assert.equal(a.reconciliation_source,'owner_explicit_late_agreement');
});
test('final-payment-only agreement is not silently expanded to deposit revenue and tampered ledger cannot pay',async t=>{
 const f=await setup(t);freshAgreement(f);f.db.Referrals[0].fields[R.basisRule]='final_payment_only';assert.equal((await owner(f,'agreement/capture',{session_record_id:SESSION})).status,200);
 f.db.Payments.push(receipt('rec11111111111111','deposit-fixture','deposit',3000),receipt('rec22222222222222','final-fixture','final',7000));await settle(f,'deposit_and_final');
 const created=await(await owner(f,'ledger/materialize',{session_record_id:SESSION})).json();assert.equal(created.commission_amount_thb,490);
 f.db.Commissions[0].fields[C.commissionAmount]=700;
 assert.equal((await owner(f,'ledger/action',{commission_record_id:created.commission_record_id,action:'approve'})).status,409);
});

test('audience preview uses canonical resolver, expires schedules and never grants customer identity',async t=>{
 const f=await setup(t),O=apiModule.MODEL_OFFER_RULES;
 f.db.Rules.push({id:'recRULE0000000001',fields:{[O.model]:[MODEL],[O.status]:'Active',[O.reviewedBy]:'owner-fixture',[O.audienceScope]:['Premium'],[O.salesVisibility]:'on',[O.priceVisibility]:'show',[O.customerSellRateThb]:12000,[O.effectiveFromAt]:'2020-01-01T00:00:00Z',[O.effectiveUntilAt]:'2099-01-01T00:00:00Z',[O.version]:1}});
 let p=(await(await f.call('/v1/partner/dashboard')).json()).models[0].sales_control.policy_preview;
 assert.equal(p.customer_access_granted,false);assert.equal(p.audiences.find(a=>a.audience==='Premium').rate_thb,12000);assert.equal(p.audiences.find(a=>a.audience==='Public Member').sellable,false);
 f.db.Rules[0].fields[O.effectiveUntilAt]='2020-01-02T00:00:00Z';p=(await(await f.call('/v1/partner/dashboard')).json()).models[0].sales_control.policy_preview;assert.equal(p.audiences.find(a=>a.audience==='Premium').sellable,false);
});
test('owner approval assigns distinct increasing versions even when two proposals have the same draft version',async t=>{
 const f=await setup(t);
 for(let i=0;i<2;i++){const r=await f.call('/v1/partner/working-system',{body:{model_record_id:MODEL,system:'bridge',commission_percent:6+i,share_with_mmd:true}});assert.equal(r.status,201);const row=f.db.Changes.at(-1),payload=JSON.parse(row.fields[Q.payloadJson]);row.fields[Q.payloadJson]=JSON.stringify({...payload,version:2});row.fields[Q.revision]=2;}
 const decision=id=>owner(f,'working-systems/decision',{request_record_id:id,decision:'approve'});
 assert.equal((await decision(f.db.Changes[0].id)).status,200);assert.equal((await decision(f.db.Changes[1].id)).status,200);
 assert.deepEqual(f.db.Changes.map(r=>JSON.parse(r.fields[Q.payloadJson]).version),[2,3]);assert.equal(f.db.Referrals[0].fields[R.commissionRate],0.07);
});

test('owner can void unpaid earnings with evidence; recorded transfers cannot be erased',async t=>{
 const f=await setup(t);await capture(f);f.db.Payments.push(receipt('rec11111111111111','full-fixture','full',10000));await settle(f);
 const row=await(await owner(f,'ledger/materialize',{session_record_id:SESSION})).json();
 assert.equal((await owner(f,'ledger/action',{commission_record_id:row.commission_record_id,action:'void'})).status,400);
 assert.equal((await owner(f,'ledger/action',{commission_record_id:row.commission_record_id,action:'void',note:'Owner reviewed refund evidence reference REF-123'})).status,200);
 assert.equal((await(await f.call('/v1/partner/dashboard')).json()).summary.pendingAmount,0);
 f.db.Commissions[0].fields[C.status]='paid';f.db.Commissions[0].fields[C.payoutStatus]='paid';assert.equal((await owner(f,'ledger/action',{commission_record_id:row.commission_record_id,action:'void',note:'Cannot erase real transfer'})).status,409);
});
