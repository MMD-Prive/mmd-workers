import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { Window } from 'happy-dom';
import { renderRelaxSpaPage } from '../../admin-worker/src/relax-spa-page.js';
import { applySpaCommand } from '../../mms-worker/src/relax-spa-ledger.mjs';
import { agreementV2 } from '../../mms-worker/src/relax-spa-agreement.mjs';

const therapist = { id: 'mmst_' + 'a'.repeat(24), name: 'Therapist QA', status: 'Active' };
const owner = { id: 'per', role: 'owner' };
const job = { id: 'mmsjob_' + 'b'.repeat(24), therapist_id: therapist.id, status: 'Completed', duration_minutes: 60, therapist_amount: 20000, travel_amount: 0, customer_amount: 100000, is_test: false };
async function waitFor(fn) { for (let n = 0; n < 100; n++) { if (fn()) return; await new Promise(r => setTimeout(r, 10)); } assert.ok(fn(), 'UI did not complete'); }
async function ui(t, partner = false, seed = {}) {
  const actor = partner ? { id: 'partner:recPPPPPPPPPPPPPP', role: 'spa_partner' } : { id: 'per', role: 'owner' };
  const state = { referrals: [], agreements: [], services: [], events: [], requests: {}, ...seed }, calls = [], errors = [];
  const w = new Window({ url: partner ? 'https://www.mmdbkk.com/partner/dashboard/relax-spa?t=fixture-token' : 'https://www.mmdbkk.com/internal/admin/mms/relax-spa', settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true, disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
  t.after(() => w.happyDOM.close()); Object.defineProperty(w, 'crypto', { value: webcrypto });
  w.addEventListener('error', e => errors.push(e.error || e.message));
  w.fetch = async (path, opts = {}) => {
    const u = new URL(path, w.location.href); calls.push(u);
    if (u.pathname.endsWith('/workspace') || u.pathname.endsWith('/catalog')) return Response.json({ ok: true, ...(u.pathname.endsWith('/catalog') ? { data: { therapists: [{ therapist_id: therapist.id, display_name: therapist.name, status: 'Active' }] } } : { therapists: [{ therapist_id: therapist.id, display_name: therapist.name, status: 'Active' }], jobs: [{ job_id: job.id, therapist_id: therapist.id, service: 'Spa QA', status: 'Completed', duration_minutes: 60, therapist_amount: 20000, travel_amount: 0, customer_amount: 100000, is_test: false }], offers: [], complete: true }) });
    const command = u.pathname.split('/').at(-1); if (command === 'snapshot') return Response.json({ ok: true, data: { actor, ...state } });
    if (command === 'agreement-preview') { try { const agreement=agreementV2(JSON.parse(opts.body),actor,'2026-10-14T03:00:00.000Z'); return Response.json({ok:true,data:{agreement,preview:agreement.preview}}); } catch(e) { return Response.json({ok:false,error:{code:e.code}},{status:e.status||409}); } }
    try { return Response.json({ ok: true, data: applySpaCommand(state, actor, command, JSON.parse(opts.body), { therapist, job }) }); }
    catch (e) { return Response.json({ ok: false, error: { code: e.code } }, { status: e.status || 503 }); }
  };
  w.document.write(renderRelaxSpaPage({ partner })); await waitFor(() => w.document.querySelector('form[data-command="referrals"]'));
  const q = s => w.document.querySelector(s);
  const submit = async (command, values, done, submitterValue) => {
    const form = q('form[data-command="' + command + '"]'); assert.ok(form, command);
    for (const [name, value] of Object.entries(values)) { const input = form.querySelector('[name="' + name + '"]'); assert.ok(input, name); if (input.type === 'number') input.step = 'any'; if (input.type === 'checkbox') input.checked = value; else input.value = value; }
    assert.ok(form.checkValidity(), command + ': invalid fields: ' + [...form.querySelectorAll('input,select')].filter(n => !n.checkValidity()).map(n => n.name + '=' + n.value).join(', '));
    const event = new w.Event('submit', { bubbles: true, cancelable: true }); Object.defineProperty(event, 'submitter', { value: submitterValue ? [...form.querySelectorAll('button[type="submit"]')].find(b => b.value === submitterValue) : form.querySelector('button[type="submit"]') });
    form.dispatchEvent(event);
    try { await waitFor(done); } catch (e) { throw Error(command + ': ' + q('#notice').textContent + ' · ' + errors.map(String).join('; ')); }
    await waitFor(() => q('#notice').textContent.startsWith('บันทึกแล้ว'));
  };
  const previewAgreement = async () => { const button=q('[data-agreement-preview]'); assert.ok(button); for(const input of button.form.querySelectorAll('input[type=number]'))input.step='any'; button.click(); try { await waitFor(()=>q('[data-preview-area]').hidden===false); } catch(e) { throw Error('preview: '+q('#notice').textContent+' '+e.message); } };
  return { w, q, state, calls, errors, submit, previewAgreement };
}

test('Owner UI exercises v2 draft, quote, job link, partial receipts, settlement, payouts and close', async t => {
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
  const values={ title: 'Confirmed v2', therapist_id: therapist.id, duration_minutes: '60', therapist_amount: '200', customer_amount: '1000', travel_estimate: '50', travel_method: 'รถไฟฟ้าไปกลับ', travel_assessed_at: '2026-10-01T10:00', travel_evidence_ref: 'home-roundtrip-qa', basis: 'remaining_revenue', spa: '50', partner: '25', mms: '25', referrer_id: 'mms-partner:henna', terms_ref: 'signed-v2' };
  const agreementForm=f.q('form[data-command="agreements"]'); assert.equal(agreementForm.querySelector('[name="therapist"]'),null); for(const [name,value] of Object.entries(values)){const input=agreementForm.querySelector('[name="'+name+'"]');input.value=value;}
  agreementForm.querySelector('[data-add-adjustment]').click(); agreementForm.querySelector('[data-adjustment-row] [data-remove-adjustment]').click(); const adj=agreementForm.querySelector('[data-adjustment-row]'); adj.querySelector('[name="adjustment_kind"]').value='fee'; adj.querySelector('[name="adjustment_bearer"]').value='spa'; adj.querySelector('[name="adjustment_amount"]').value='5'; adj.querySelector('[name="adjustment_evidence"]').value='spa-fee-qa';
  await f.previewAgreement(); assert.equal(f.state.agreements.length,1); assert.match(f.q('[data-preview-area]').textContent,/ยอดจัดสรรรวม/);
  const customerAmount=agreementForm.querySelector('[name="customer_amount"]');customerAmount.value='1001';customerAmount.dispatchEvent(new f.w.Event('input',{bubbles:true}));assert.equal(f.q('[data-preview-area]').hidden,true);assert.equal(agreementForm.querySelector('[name="agreement_status"][value="confirmed"]').disabled,true);customerAmount.value='1000';await f.previewAgreement();
  await f.submit('agreements', { ...values, approval_confirmed: true }, () => f.state.agreements.length === 2, 'confirmed');
  const agreement = f.state.agreements.find(a => a.status === 'confirmed'); assert.equal(agreement.travel.origin_scope, 'therapist_home_roundtrip'); assert.equal(Object.hasOwn(agreement.shares_bps,'therapist'),false); assert.equal(agreement.adjustments[0].amount,500); assert.equal(agreement.adjustments[0].basis,'fixed_satang');
  f.q('[data-view="services"]').click();
  assert.match(f.q('#content').textContent, /ตรวจตัวอย่างก่อนผูกข้อตกลง/);
  assert.match(f.q('#content').textContent, /1,000\.00 บาท/);
  await f.submit('quotes', { agreement_id: agreement.id, approval_confirmed: true }, () => f.state.services[0].status === 'quoted');
  assert.equal(f.state.services[0].quote_preview.expected_amount, 100000);
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
