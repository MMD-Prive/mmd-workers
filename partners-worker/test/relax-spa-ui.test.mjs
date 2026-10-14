import { build } from 'esbuild';
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { Window } from 'happy-dom';
import { renderRelaxSpaPage } from '../../admin-worker/src/relax-spa-page.js';
import { renderMmsAdminPage } from '../../admin-worker/src/mms-admin-page.js';
import { wireMmsApproveUi } from '../../admin-worker/src/mms-admin-approve-ui.js';
import { wireMmsAdminMobileBundle } from '../../admin-worker/src/mms-admin-mobile-bundle.js';
import { wireMmsJobsUi } from '../../admin-worker/src/mms-admin-jobs-ui.js';
import { wireMmsWorkspaceUi } from '../../admin-worker/src/mms-admin-workspace-ui.js';
import { applySpaCommand } from '../../mms-worker/src/relax-spa-ledger.mjs';
import { agreementV2, agreementV3 } from '../../mms-worker/src/relax-spa-agreement.mjs';

const therapist = { id: 'mmst_' + 'a'.repeat(24), name: 'Therapist QA', status: 'Active' };
const owner = { id: 'per', role: 'owner' };
const job = { id: 'mmsjob_' + 'b'.repeat(24), therapist_id: therapist.id, venue_id: 'relax-spa-by-9', status: 'Completed', duration_minutes: 60, therapist_amount: 20000, travel_amount: 0, travel_included_confirmed: true, customer_amount: 100000, is_test: false };

test('Owner MMS overview initializes with nested Therapist workspace header', async t => {
  const errors = [], calls = [];
  const w = new Window({ url: 'https://www.mmdbkk.com/internal/admin/mms', settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true, disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
  t.after(() => w.happyDOM.close());
  w.addEventListener('error', e => errors.push(e.error || e.message));
  w.fetch = async (path, init = {}) => {
    assert.equal(init.method || 'GET', 'GET', 'overview initialization must remain read-only');
    const u = new URL(path, w.location.href); calls.push(u.pathname);
    if (u.pathname.endsWith('/workspace')) return Response.json({ ok: true, therapists: [], jobs: [], offers: [], complete: true });
    if (u.pathname.endsWith('/jobs')) return Response.json({ ok: true, jobs: [] });
    if (u.pathname.endsWith('/catalog')) return Response.json({ ok: true, data: { skills: [], zones: [] } });
    return Response.json({ ok: true, applications: [], therapists: [], prebookings: [] });
  };
  // Preserve the production assembly order: workspace markup precedes the overview header.
  w.document.write(wireMmsWorkspaceUi(wireMmsJobsUi(wireMmsAdminMobileBundle(wireMmsApproveUi(renderMmsAdminPage())))));
  await waitFor(() => w.document.readyState === 'complete');
  const overview = w.document.querySelector('#overview');
  const root = overview.querySelector('.mms-ops-home');
  assert.ok(root, 'operations home must attach to the overview');
  assert.equal(root.parentElement, overview);
  assert.equal(root.previousElementSibling.querySelector('#overviewTitle')?.id, 'overviewTitle');
  assert.equal(overview.querySelectorAll('.mms-ops-home').length, 1);
  assert.ok(overview.querySelector('[data-mms-workspace-admin-v1] .section-head'));
  await waitFor(() => root.querySelector('#opsJobsCount').textContent === '0');
  assert.ok(calls.includes('/v1/admin/mms/jobs'));
  assert.match(root.querySelector('#opsJobs').textContent, /ยังไม่มีงาน MMS/);
  root.querySelector('[data-ops-refresh]').click();
  await waitFor(() => calls.filter(p => p === '/v1/admin/mms/jobs').length >= 2);
  await w.happyDOM.waitUntilComplete();
  assert.equal(overview.querySelectorAll('.mms-ops-home').length, 1);
  assert.deepEqual(errors, []);
});
async function waitFor(fn) { for (let n = 0; n < 100; n++) { if (fn()) return; await new Promise(r => setTimeout(r, 10)); } assert.ok(fn(), 'UI did not complete'); }
async function ui(t, partner = false, seed = {}, renderPage = renderRelaxSpaPage) {
  const actor = partner ? { id: 'partner:recPPPPPPPPPPPPPP', role: 'spa_partner' } : { id: 'per', role: 'owner' };
  const state = { referrals: [], agreements: [], services: [], events: [], requests: {}, ...seed }, calls = [], errors = [], createBodies=[], correctionBodies=[];
  const w = new Window({ url: partner ? 'https://www.mmdbkk.com/partner/dashboard/relax-spa?t=fixture-token' : 'https://www.mmdbkk.com/internal/admin/mms/relax-spa', settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true, disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
  t.after(() => w.happyDOM.close()); Object.defineProperty(w, 'crypto', { value: webcrypto });
  w.addEventListener('error', e => errors.push(e.error || e.message));
  w.fetch = async (path, opts = {}) => {
    const u = new URL(path, w.location.href); calls.push(u);
    if (u.pathname.endsWith('/workspace') || u.pathname.endsWith('/catalog')) return Response.json({ ok: true, ...(u.pathname.endsWith('/catalog') ? { data: { therapists: [{ therapist_id: therapist.id, display_name: therapist.name, status: 'Active' }] } } : { therapists: [{ therapist_id: therapist.id, display_name: therapist.name, status: 'Active' }], jobs: [{ job_id: job.id, therapist_id: therapist.id, venue_id: 'relax-spa-by-9', service: 'Spa QA', status: 'Completed', duration_minutes: 60, therapist_amount: 20000, travel_amount: 0, travel_included_confirmed: true, customer_amount: 100000, is_test: false }], offers: [], complete: true }) });
    const command = u.pathname.split('/').at(-1); if (command === 'snapshot') return Response.json({ ok: true, data: { actor, ...state } });
    if (command === 'agreement-preview') { try { const body=JSON.parse(opts.body),agreement=body.schema_version===3?agreementV3(body,actor,'2026-10-14T03:00:00.000Z'):agreementV2(body,actor,'2026-10-14T03:00:00.000Z'); return Response.json({ok:true,data:{agreement,preview:agreement.preview}}); } catch(e) { return Response.json({ok:false,error:{code:e.code}},{status:e.status||409}); } }
    if (command === 'create-job') { const body=JSON.parse(opts.body); createBodies.push(body); const service=state.services.find(s=>s.id===body.service_id); service.status='creating_job'; service.job_creation={service_start_at:body.service_start_at,service_evidence:body.service_evidence}; return Response.json({ok:true,data:{pending:true}}); }
    if (command === 'corrections') { const body=JSON.parse(opts.body); correctionBodies.push(body); const service=state.services.find(s=>s.id===body.service_id); service.corrections=[...(service.corrections||[]),{type:body.type,role:body.role,amount:body.amount,recipient:body.recipient,evidence_ref:body.evidence_ref}]; service.status='reconciling'; service.reconciliation_summary={shares:{therapist:20000,spa:25000,partner:10000,mms:40000},net_paid:{therapist:20000,spa:25000,partner:10000,mms:40000},return_due:{spa:body.type==='customer_refund'?body.amount:0},total_refunded:body.amount,net_received:95000,balanced:false}; return Response.json({ok:true,data:{service}}); }
    try { return Response.json({ ok: true, data: applySpaCommand(state, actor, command, JSON.parse(opts.body), { therapist, job }) }); }
    catch (e) { return Response.json({ ok: false, error: { code: e.code } }, { status: e.status || 503 }); }
  };
  w.document.write(renderPage({ partner })); await waitFor(() => w.document.querySelector('form[data-command="referrals"]'));
  const q = s => w.document.querySelector(s);
  const submit = async (command, values, done, submitterValue) => {
    const form = q('form[data-command="' + command + '"]'); assert.ok(form, command);
    for (const [name, value] of Object.entries(values)) { const input = form.querySelector('[name="' + name + '"]'); assert.ok(input, name); if (input.type === 'number') input.step = 'any'; if (input.type === 'checkbox') input.checked = value; else input.value = value; }
    assert.ok(form.checkValidity(), command + ': invalid fields: ' + [...form.querySelectorAll('input,select')].filter(n => !n.checkValidity()).map(n => n.name + '=' + n.value).join(', '));
    const event = new w.Event('submit', { bubbles: true, cancelable: true }); Object.defineProperty(event, 'submitter', { value: submitterValue ? [...form.querySelectorAll('button[type="submit"]')].find(b => b.value === submitterValue) : form.querySelector('button[type="submit"]') });
    form.dispatchEvent(event);
    try { await waitFor(done); } catch (e) { throw Error(command + ': ' + q('#notice').textContent + ' · ' + errors.map(String).join('; ')); }
    await waitFor(() => q('#notice').textContent.startsWith('บันทึกแล้ว') || q('#notice').textContent.startsWith('งานกำลังสร้าง'));
  };
  const previewAgreement = async () => { const button=q('[data-agreement-preview]'); assert.ok(button); for(const input of button.form.querySelectorAll('input[type=number]'))input.step='any'; button.click(); try { await waitFor(()=>q('[data-preview-area]').hidden===false); } catch(e) { throw Error('preview: '+q('#notice').textContent+' '+e.message); } };
  return { w, q, state, calls, errors, createBodies, correctionBodies, submit, previewAgreement };
}

test('Owner UI exercises v3 room agreement, quote, existing job link, receipts and settlement', async t => {
  const f = await ui(t);
  await f.submit('referrals', { partner_id: 'mms-partner:henna', therapist_id: therapist.id, note: 'Spa service' }, () => f.state.referrals.length === 1);
  await f.submit('referral-decision', { decision: 'accepted', evidence_ref: 'spa-accept' }, () => f.state.referrals[0].status === 'accepted');
  f.q('[data-view="agreements"]').click();
  await f.submit('agreements', { title: 'Incomplete draft' }, () => f.state.agreements.length === 1, 'draft');
  assert.equal(f.state.agreements[0].status, 'draft'); assert.equal(f.state.agreements[0].travel, null);
  assert.equal(f.q('[data-resume-draft]').textContent.includes('สร้างรุ่นใหม่'),true); f.q('[data-resume-draft]').click(); assert.equal(f.q('form[data-command="agreements"] [name="title"]').value,'Incomplete draft');
  f.q('[data-view="services"]').click();
  await f.submit('drafts', { referral_id: f.state.referrals[0].id, note: 'Accepted service' }, () => f.state.services.length === 1);
  const draft = f.state.services[0]; assert.equal(draft.status, 'draft'); assert.equal(draft.job_id, null);
  assert.throws(() => applySpaCommand(f.state, owner, 'quotes', { request_key: 'quote-draft-001', service_id: draft.id, agreement_id: f.state.agreements[0].id, approval_confirmed: true }), e => e.code === 'CONFIRMED_AGREEMENT_REQUIRED');
  f.q('[data-view="agreements"]').click();
  const values={ title: 'Confirmed room v3', therapist_id: therapist.id, duration_minutes: '60', therapist_amount: '200', customer_amount: '1000', room_type:'Synthetic Room', room_amount:'300', room_fixed_units:'1', room_covered_minutes:'60', room_unit_description:'ต่อการจองที่ตกลง', room_includes:'ห้องเท่านั้น ไม่รวม Therapist', room_rate_evidence_ref:'synthetic-room-rate', partner_amount:'100', mms_mode:'fixed_fee', mms_amount:'400', payee_therapist:'Therapist QA', payee_spa:'spa', payee_partner:'partner', payee_mms:'mms', travel_estimate: '50', travel_method: 'รถไฟฟ้าไปกลับ', travel_assessed_at: '2026-10-01T10:00', travel_evidence_ref: 'home-roundtrip-qa', referrer_id: 'mms-partner:henna', terms_ref: 'signed-v3' };
  const agreementForm=f.q('form[data-command="agreements"]'); assert.equal(agreementForm.querySelector('[name="therapist"]'),null); for(const [name,value] of Object.entries(values)){const input=agreementForm.querySelector('[name="'+name+'"]');input.value=value;}
  agreementForm.querySelector('[data-add-adjustment]').click(); agreementForm.querySelector('[data-adjustment-row] [data-remove-adjustment]').click(); const adj=agreementForm.querySelector('[data-adjustment-row]'); adj.querySelector('[name="adjustment_kind"]').value='fee'; adj.querySelector('[name="adjustment_bearer"]').value='spa'; adj.querySelector('[name="adjustment_amount"]').value='5'; adj.querySelector('[name="adjustment_evidence"]').value='spa-fee-qa';
  await f.previewAgreement(); assert.equal(f.state.agreements.length,1); assert.match(f.q('[data-preview-area]').textContent,/ยอดจัดสรรรวม/);
  const customerAmount=agreementForm.querySelector('[name="customer_amount"]');customerAmount.value='1001';customerAmount.dispatchEvent(new f.w.Event('input',{bubbles:true}));assert.equal(f.q('[data-preview-area]').hidden,true);assert.equal(agreementForm.querySelector('[name="agreement_status"][value="confirmed"]').disabled,true);customerAmount.value='1000';await f.previewAgreement();
  await f.submit('agreements', { ...values, approval_confirmed: true }, () => f.state.agreements.length === 2, 'confirmed');
  const agreement = f.state.agreements.find(a => a.status === 'confirmed'); assert.equal(agreement.schema_version,3); assert.equal(agreement.travel.origin_scope, 'therapist_home_roundtrip'); assert.equal(agreement.room.amount,30000); assert.equal(agreement.preview.therapist_amount,20000); assert.equal(agreement.preview.room_amount,30000); assert.equal(agreement.preview.partner_amount,10000); assert.equal(agreement.preview.mms_amount,40000); assert.equal(agreement.preview.customer_amount,100000); assert.equal(agreement.preview.shares.spa,29500); assert.equal(agreement.adjustments[0].amount,500); assert.equal(agreement.adjustments[0].basis,'fixed_satang');
  f.q('[data-view="services"]').click();
  assert.match(f.q('#content').textContent, /ตรวจตัวอย่างก่อนผูกข้อตกลง/);
  assert.match(f.q('#content').textContent, /1,000\.00 บาท/);
  await f.submit('quotes', { agreement_id: agreement.id, approval_confirmed: true }, () => f.state.services[0].status === 'quoted');
  assert.equal(f.state.services[0].quote_preview.expected_amount, 100000);
  assert.match(f.q('#content').textContent,/R · ค่าห้องรวม/);
  await f.submit('services', { job_id: job.id, duration_minutes: '60', service_evidence: 'spa-service' }, () => f.state.services[0].status === 'booked');
  await f.submit('receipts', { amount: '600', received_by: 'Relax Spa by 9', received_at: '2026-10-01T10:00', evidence_ref: 'bank-in-1', verification_confirmed: true }, () => f.state.services[0].receipts.length === 1);
  assert.match(f.q('#content').textContent, /ยังรอรับ/);
  await f.submit('receipts', { amount: '400', received_by: 'Relax Spa by 9', received_at: '2026-10-01T10:30', evidence_ref: 'bank-in-2', verification_confirmed: true }, () => f.state.services[0].receipts.length === 2);
  f.q('[data-view="shares"]').click();
  assert.equal(f.q('form[data-command="refunds"]'),null);
  await f.submit('settlements', { approval_confirmed: true }, () => !!f.state.services[0].settlement);
  for (const [role, amount] of Object.entries(f.state.services[0].settlement.shares)) {
    if (!amount) continue;
    await f.submit('payouts', { recipient: role === 'therapist' ? 'Therapist QA' : role, paid_at: '2026-10-01T11:00', evidence_ref: 'bank-out-' + role, verification_confirmed: true }, () => f.state.services[0].payouts.some(p => p.role === role));
  }
  assert.ok(f.q('form[data-command="expenses"]'));
  await f.submit('expenses',{adjustment_index:'0',amount:'5',recipient:'Spa fee recipient',paid_at:'2026-10-01T11:30',evidence_ref:'spa-fee-paid',verification_confirmed:true},()=>f.state.services[0].expenses?.length===1);
  await f.submit('close', { approval_confirmed: true }, () => f.state.services[0].status === 'closed');
  assert.equal(f.state.services[0].status, 'closed'); assert.deepEqual(f.errors, []);
});

test('MY Partner retains token, hides Owner forms and only submits referrals', async t => {
  const f = await ui(t, true); assert.equal(f.q('[data-owner]').hidden, true); assert.equal(f.q('[name="partner_id"]'), null);
  await f.submit('referrals', { therapist_id: therapist.id, note: 'My recommendation' }, () => f.state.referrals.length === 1);
  assert.equal(f.state.referrals[0].partner_id, 'partner:recPPPPPPPPPPPPPP');
  f.q('[data-view="services"]').click(); assert.equal(f.w.location.search.includes('t=fixture-token'), true);
  assert.equal(f.q('form[data-command="drafts"]'), null); assert.ok(f.calls.every(u => u.pathname.startsWith('/v1/partner/relax-spa/') && u.searchParams.get('t') === 'fixture-token'));
  assert.deepEqual(f.errors, []);
});

test('Owner v3 agreement form makes room total explicit and has no inferred price or percentage fields', async t => {
  const f=await ui(t); f.q('[data-view="agreements"]').click();
  const form=f.q('form[data-command="agreements"]');
  assert.match(f.q('#content').textContent,/ค่าห้องเท่านั้น/);
  assert.match(f.q('#content').textContent,/ไม่มีการตั้งอัตราหรือคูณตามชั่วโมง/);
  for(const name of ['room_type','room_amount','room_fixed_units','room_covered_minutes','room_unit_description','room_includes','room_rate_evidence_ref','partner_amount','mms_mode','mms_amount','payee_therapist','payee_spa','payee_partner','payee_mms']) assert.ok(form.querySelector('[name="'+name+'"]'),name);
  assert.equal(form.querySelector('[name="basis"]'),null);
  assert.equal(form.querySelector('[name="spa"]'),null);
  assert.equal(form.querySelector('[name="partner"][type="number"]'),null);
  assert.equal(form.querySelector('[name="mms"][type="number"]'),null);
  assert.equal(form.querySelector('[name="room_amount"]').value,'');
  assert.equal(f.errors.length,0);
});

test('quoted v3 service offers create-job and existing-job link; retry reuses frozen inputs and request key', async t => {
  const agreement={id:'a3',schema_version:3,status:'confirmed',title:'Synthetic room',therapist_id:therapist.id,duration_minutes:60,customer_amount:100000,therapist_amount:20000,room:{amount:30000},partner_amount:10000,mms_mode:'fixed_fee',mms_amount:40000,payees:{therapist:'Therapist QA',spa:'spa',partner:'partner',mms:'mms'}};
  const service={id:'s3',status:'quoted',therapist_id:therapist.id,therapist_name:'Therapist QA',agreement,agreement_title:agreement.title,expected_amount:100000,quote_preview:{customer_amount:100000,therapist_amount:20000,room_amount:30000,partner_amount:10000,mms_amount:40000,shares:{therapist:20000,spa:30000,partner:10000,mms:40000},expected_amount:100000},receipts:[],payouts:[]};
  const f=await ui(t,false,{agreements:[agreement],services:[service]});f.q('[data-view="services"]').click();
  const card=f.q('#content .list .card');assert.ok(f.q('#content form[data-command="create-job"]'));assert.ok(f.q('#content form[data-command="services"]'));assert.match(card.textContent,/สร้างงานใหม่ หรือเชื่อมงาน MMS ที่มีอยู่/);
  await f.submit('create-job',{service_start_at:'2026-10-15T10:00',service_evidence:'synthetic-service-evidence'},()=>f.state.services[0].status==='creating_job');
  assert.equal(f.createBodies[0].approval_confirmed,true);assert.equal(f.createBodies[0].service_start_at,'2026-10-15T03:00:00.000Z');
  assert.ok(f.q('form[data-command="create-job"] [name="service_start_at"]').readOnly);
  await f.submit('create-job',{service_start_at:'2026-10-15T10:00',service_evidence:'synthetic-service-evidence'},()=>f.createBodies.length===2);
  assert.equal(f.createBodies[1].request_key,f.createBodies[0].request_key);assert.equal(f.createBodies[1].service_evidence,f.createBodies[0].service_evidence);assert.equal(f.errors.length,0);
});

test('closed paid service records a customer-refund correction and keeps original settlement and payouts frozen', async t => {
  const agreement={id:'a3',schema_version:3,status:'confirmed',title:'Synthetic room',therapist_id:therapist.id,payees:{therapist:'Therapist QA',spa:'spa',partner:'partner',mms:'mms'}};
  const settlement={status:'approved',shares:{therapist:20000,spa:30000,partner:10000,mms:40000}};
  const payouts=['therapist','spa','partner','mms'].map((role,i)=>({role,amount:settlement.shares[role],recipient:role==='therapist'?'Therapist QA':role,evidence_ref:'paid-'+role}));
  const service={id:'paid-v3',status:'closed',therapist_id:therapist.id,therapist_name:'Therapist QA',agreement,settlement,payouts,receipts:[],corrections:[],reconciliation_summary:{shares:{...settlement.shares},net_paid:{...settlement.shares},return_due:{},total_refunded:0,net_received:100000,balanced:true}};
  const f=await ui(t,false,{services:[service]});f.q('[data-view="shares"]').click();
  const forms=[...f.w.document.querySelectorAll('form[data-command="corrections"]')];assert.equal(forms.length,1);
  const returnForm=[...f.w.document.querySelectorAll('form[data-command="corrections"]')].find(x=>x.querySelector('[name="type"]').value==='payee_return');assert.equal(returnForm,undefined);
  const originalSettlement=structuredClone(service.settlement),originalPayouts=structuredClone(service.payouts);
  await f.submit('corrections',{type:'customer_refund',role:'spa',amount:'5',recipient:'Customer',occurred_at:'2026-10-15T12:00',evidence_ref:'refund-proof-1',terms_ref:'refund-approval-1',reason:'Approved correction',approval_confirmed:true,verification_confirmed:true},()=>f.state.services[0].status==='reconciling');
  assert.equal(f.correctionBodies[0].type,'customer_refund');assert.equal(f.correctionBodies[0].role,'spa');assert.equal(f.correctionBodies[0].amount,500);assert.equal(f.correctionBodies[0].occurred_at,'2026-10-15T05:00:00.000Z');
  assert.deepEqual(f.state.services[0].settlement,originalSettlement);assert.deepEqual(f.state.services[0].payouts,originalPayouts);
  assert.ok(f.w.document.querySelector('form[data-command="corrections"] [name="type"][value="payee_return"]'));assert.ok(f.w.document.querySelector('form[data-command="corrections"] [name="role"][value="spa"]'));
  assert.match(f.q('#content').textContent,/รายการแก้ไขหลังอนุมัติ/);assert.deepEqual(f.errors,[]);
});


test('MY Partner maps all payment states and displays no sanitized payout evidence reference', async t => {
  const statuses=['awaiting_payment','partial','paid','refunded','partially_refunded'];
  const state={services:statuses.map((payment_status,i)=>({id:'s'+i,status:'booked',therapist_name:'T'+i,payment_status,settlement_status:'approved',partner_share:250,partner_payout:{amount:250,evidence_ref:'must-not-render'}}))};
  const f=await ui(t,true,state); f.q('[data-view="services"]').click();
  const text=f.q('#content').textContent;
  for(const label of ['รอรับเงิน','รับเงินบางส่วน','รับเงินครบแล้ว','คืนเงินครบแล้ว','คืนเงินบางส่วน'])assert.ok(text.includes(label),label);
  assert.equal(text.includes('must-not-render'),false);
});

test('Owner can still operate a historical v1 service without status and sees revenue shares', async t => {
  const legacyAgreement={id:'old-agreement',title:'Historical agreement',basis:'received_revenue',shares_bps:{therapist:7000,spa:2000,partner:500,mms:500},terms_ref:'old-terms'};
  const service={id:'old-service',referral_id:'old-ref',therapist_id:therapist.id,therapist_name:'Therapist QA',partner_id:'mms-partner:henna',job_id:job.id,service_evidence:'old-service-evidence',expected_amount:100000,agreement:legacyAgreement,costs:[],receipts:[{id:'old-receipt',amount:100000,evidence_ref:'old-receipt-evidence',received_by:'Spa',received_at:'2026-10-01T03:00:00.000Z',verified_by:'per'}],payouts:[],settlement:null};
  const f=await ui(t,false,{referrals:[{id:'old-ref',therapist_id:therapist.id,therapist_name:'Therapist QA',partner_id:'mms-partner:henna',status:'accepted'}],services:[service]}); f.q('[data-view="services"]').click();
  assert.ok(f.q('#content').textContent.includes('ประวัติ v1')); assert.ok(f.q('form[data-command="receipts"]')===null);
  f.q('[data-view="shares"]').click(); assert.ok(f.q('#content').textContent.includes('ส่วนแบ่งรายรับ')); assert.ok(f.q('#content').textContent.includes('70%')); assert.ok(f.q('form[data-command="settlements"]'));
  await f.submit('settlements',{approval_confirmed:true},()=>!!f.state.services[0].settlement);
  for(const [role,amount] of Object.entries(f.state.services[0].settlement.shares)){if(!amount)continue;await f.submit('payouts',{recipient:role,paid_at:'2026-10-01T11:00',evidence_ref:'legacy-out-'+role,verification_confirmed:true},()=>f.state.services[0].payouts.some(p=>p.role===role));}
  assert.ok(f.q('form[data-command="close"]')); await f.submit('close',{approval_confirmed:true},()=>f.state.services[0].status==='closed');
});

test('resuming a draft preserves Bangkok assessment time and supports removing copied adjustments', async t => {
  const draft={id:'draft-qa',schema_version:2,status:'draft',title:'Resume QA',travel:{estimate_amount:0,method:'เดิน',assessed_at:'2026-10-01T03:00:00.000Z',evidence_ref:'synthetic-home-roundtrip'},adjustments:[{kind:'fee',bearer:'spa',amount:100,evidence_ref:'synthetic-fee'}]};
  const f=await ui(t,false,{agreements:[draft]});f.q('[data-view="agreements"]').click();f.q('[data-resume-draft]').click();
  assert.equal(f.q('[name="travel_assessed_at"]').value,'2026-10-01T10:00');
  assert.equal(f.q('[name="travel_method"]').value,'เดิน');
  assert.equal(f.q('[name="travel_estimate"]').value,'0.00');
  f.q('[data-adjustment-row] [data-remove-adjustment]').click();
  assert.equal(f.q('[data-adjustment-row]'),null);
});

test('Wrangler keepNames bundle initializes Owner and Partner browser pages', async t => {
  const result=await build({entryPoints:[new URL('../../admin-worker/src/relax-spa-page.js',import.meta.url).pathname],bundle:true,write:false,platform:'browser',format:'esm',keepNames:true});
  const renderer=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
  for (const partner of [false,true]) {
    const html=renderer.renderRelaxSpaPage({partner});
    assert.match(html,/__name\(/,'exercise serialized compiler name helpers');
    const f=await ui(t,partner,{},renderer.renderRelaxSpaPage);
    assert.ok(f.calls.some(u=>u.pathname.endsWith('/snapshot')));
    assert.deepEqual(f.errors,[]);
  }
});
