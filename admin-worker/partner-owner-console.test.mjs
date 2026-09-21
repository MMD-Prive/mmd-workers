import test from 'node:test';
import assert from 'node:assert/strict';
import {createCredentialBoundAdminSession} from './src/credential-bound-admin-session.js';
import {handlePartnerOwnerConsole} from './src/partner-owner-console.js';

const origin='https://www.mmdbkk.com';
async function fixture(role='owner'){
  const calls=[];const env={ADMIN_LOGIN_CREDENTIAL:'fixture-credential',ADMIN_SESSION_SECRET:'fixture-secret',PARTNERS_WORKER:{async fetch(r){calls.push(r);return Response.json({ok:true});}}};
  const token=await createCredentialBoundAdminSession(new Request(origin),{id:'owner-fixture',role},env);
  const request=(path,options={})=>new Request(origin+path,{...options,headers:{cookie:'mmd_admin_gate_v1='+token,...options.headers}});
  return {env,calls,request};
}
test('owner console uses existing credential-bound session; anonymous and staff cannot proxy',async()=>{
  const f=await fixture();
  assert.equal((await handlePartnerOwnerConsole(new Request(origin+'/v1/admin/partners/ledger'),f.env,{})).status,401);
  assert.equal((await handlePartnerOwnerConsole(new Request(origin+'/internal/admin/partners'),f.env,{})).status,302);
  const staff=await fixture('staff');assert.equal((await handlePartnerOwnerConsole(staff.request('/v1/admin/partners/ledger'),staff.env,{})).status,403);
  assert.equal(f.calls.length+staff.calls.length,0);
});
test('owner writes require exact origin and fixed route; browser spoofed actor is ignored',async()=>{
  const f=await fixture();const opts={method:'POST',headers:{'content-type':'application/json',origin:'https://evil.invalid'},body:'{}'};
  assert.equal((await handlePartnerOwnerConsole(f.request('/v1/admin/partners/decision',opts),f.env,{})).status,403);
  opts.headers.origin=origin;
  assert.equal((await handlePartnerOwnerConsole(f.request('/v1/admin/partners/../../anything',opts),f.env,{})).status,404);
  opts.headers['x-mmd-owner-id']='forged';
  assert.equal((await handlePartnerOwnerConsole(f.request('/v1/admin/partners/decision',opts),f.env,{})).status,200);
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].url,'https://partners-worker.internal/v1/partner/admin/model-changes/decision');
  assert.equal(f.calls[0].headers.get('x-mmd-owner-id'),'owner-fixture');
  assert.equal(f.calls[0].headers.get('cookie'),null);
});

test('owner preview forwards only the validated request ID and all new financial routes stay fixed',async()=>{
 const f=await fixture();await handlePartnerOwnerConsole(f.request('/v1/admin/partners/asset-preview?request_id=recAAAAAAAAAAAAAA&url=https://evil.invalid'),f.env,{});
 assert.equal(f.calls[0].url,'https://partners-worker.internal/v1/partner/admin/model-changes/asset?request_id=recAAAAAAAAAAAAAA');
 const page=await handlePartnerOwnerConsole(f.request('/internal/admin/partners'),f.env,{}),html=await page.text();
 const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];assert.doesNotThrow(()=>new Function(script));
 assert.match(html,/approve_public_image/);assert.match(html,/reviewed_total_thb/);
 for(const route of ['capture','settlement-approve','materialize']){const r=await handlePartnerOwnerConsole(f.request('/v1/admin/partners/'+route,{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'}),f.env,{});assert.equal(r.status,200);}
});

test('P2A finance audit joins settlement and ledger through fixed read-only service routes',async()=>{
  const calls=[];
  const env={
    ADMIN_LOGIN_CREDENTIAL:'fixture-credential',
    ADMIN_SESSION_SECRET:'fixture-secret',
    PARTNERS_WORKER:{async fetch(r){
      calls.push(r);
      if(r.url.endsWith('/settlements'))return Response.json({ok:true,sessions:[{session_id:'sess-1',model:'Model A',payment_status:'verified',snapshot_locked:true,payout_hold:'',agreement:{system:'bridge',version:2},receipts:[{stage:'full',amount_thb:10000,status:'verified',verified:true}]}]});
      if(r.url.endsWith('/ledger'))return Response.json({ok:true,commissions:[{commission_record_id:'recAAAAAAAAAAAAAA',session_id:'sess-1',basis_amount_thb:10000,commission_amount_thb:700,system:'bridge',status:'paid',payout_status:'paid',payout_reference:'bank-001'},{commission_record_id:'recBBBBBBBBBBBBBB',session_id:'sess-orphan',basis_amount_thb:5000,commission_amount_thb:350,system:'bridge',status:'earned',payout_status:'pending'}]});
      return Response.json({ok:false,error:'unexpected'}, {status:404});
    }}
  };
  const token=await createCredentialBoundAdminSession(new Request(origin),{id:'owner-fixture',role:'owner'},env);
  const req=new Request(origin+'/v1/admin/partners/finance-audit',{headers:{cookie:'mmd_admin_gate_v1='+token}});
  const response=await handlePartnerOwnerConsole(req,env,{});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.read_only,true);
  assert.equal(body.policy.partner_source_rate_is_model_payout,false);
  assert.equal(body.policy.model_payout_mutated,false);
  assert.equal(body.summary.sessions,1);
  assert.equal(body.summary.paid_commission_amount_thb,700);
  assert.equal(body.summary.open_commission_amount_thb,350);
  assert.equal(body.summary.orphan_commissions,1);
  assert.equal(body.rows[0].commissions[0].payout_reference,'bank-001');
  assert.deepEqual(calls.map((r)=>r.url),[
    'https://partners-worker.internal/v1/partner/admin/settlements',
    'https://partners-worker.internal/v1/partner/admin/ledger'
  ]);
  assert.ok(calls.every((r)=>r.method==='GET'));
});
test('P2A finance audit is owner/admin authenticated and adds no finance mutation route',async()=>{
  const f=await fixture('staff');
  assert.equal((await handlePartnerOwnerConsole(f.request('/v1/admin/partners/finance-audit'),f.env,{})).status,403);
  assert.equal(f.calls.length,0);
  const owner=await fixture('owner');
  const page=await handlePartnerOwnerConsole(owner.request('/internal/admin/partners'),owner.env,{});
  const html=await page.text();
  assert.match(html,/Finance & Audit/);
  assert.match(html,/Partner Source Rate/);
  assert.match(html,/อ่านจาก canonical ledgers เท่านั้น/);
  assert.doesNotMatch(html,/data-action="finance-audit"/);
});


test('P2A finance timeline links payment, model payout adjustments and Partner commission and flags cross-ledger mismatch', async () => {
  const previousFetch = globalThis.fetch;
  const MODEL = 'recBKaHfxUKs8fkMV';
  const env = {
    ADMIN_LOGIN_CREDENTIAL: 'fixture-credential',
    ADMIN_SESSION_SECRET: 'fixture-secret',
    AIRTABLE_API_KEY: 'fixture-airtable',
    AIRTABLE_BASE_ID: 'appFixture',
    AIRTABLE_TABLE_SESSIONS: 'Sessions',
    AIRTABLE_TABLE_MODEL_PAYOUT_ADJUSTMENTS: 'Adjustments',
    PARTNERS_WORKER: { async fetch(r) {
      if (r.url.endsWith('/settlements')) return Response.json({ ok: true, sessions: [{
        session_id: 'sess-1',
        session_created_at: '2026-09-22T00:30:00.000Z',
        model: 'Model A',
        model_record_id: MODEL,
        payment_status: 'verified',
        snapshot_locked: true,
        payout_hold: '',
        agreement: { system: 'bridge', version: 2 },
        commission_snapshot: {
          contract: 'partner_commission_v1',
          system: 'bridge',
          agreement_version: 2,
          commission_percent: 10,
          basis_rule: 'full_payment_only',
          payment_ref: 'pay-1',
          payment_amount_thb: 10000,
          receipts: [{ payment_ref: 'pay-1', amount_thb: 10000, stage: 'full' }],
          settlement_approved_at: '2026-09-22T01:00:00.000Z',
          settlement_approved_by: 'owner-fixture'
        },
        receipts: [{ receipt_record_id: 'recPayment123456', payment_ref: 'pay-1', stage: 'full', amount_thb: 10000, verified: true, verification_status: 'verified', status: 'paid', payment_date: '2026-09-22T00:55:00.000Z' }]
      }] });
      if (r.url.endsWith('/ledger')) return Response.json({ ok: true, commissions: [{
        commission_record_id: 'recAAAAAAAAAAAAAA',
        session_id: 'sess-1',
        model_record_id: MODEL,
        payment_ref: 'pay-1',
        basis_amount_thb: 10000,
        commission_amount_thb: 700,
        system: 'bridge',
        status: 'paid',
        payout_status: 'paid',
        payout_reference: 'bank-001',
        earned_at: '2026-09-22T01:05:00.000Z',
        approved_at: '2026-09-22T01:06:00.000Z',
        paid_at: '2026-09-22T01:07:00.000Z'
      }] });
      return Response.json({ ok: false, error: 'unexpected' }, { status: 404 });
    }}
  };
  globalThis.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const url = new URL(request.url);
    const table = decodeURIComponent(url.pathname.split('/')[3] || '');
    if (table === 'Sessions') return Response.json({ records: [{ id: 'recSession12345678', createdTime: '2026-09-22T00:30:00.000Z', fields: { session_id: 'sess-1', model_name: 'Model A', 'Canonical Model': [MODEL], pay_model_thb: 10000 } }] });
    if (table === 'Adjustments') return Response.json({ records: [{ id: 'recAdjust12345678', fields: { adjustment_id: 'mpa-1', session_id: 'sess-1', model_name: 'Model A', direction: 'add', adjustment_type: 'travel', amount_thb: 1000, signed_amount_thb: 1000, payout_before_thb: 9000, payout_after_thb: 10000, created_by: 'per', created_at: '2026-09-22T00:50:00.000Z' } }] });
    return Response.json({ error: 'not_found' }, { status: 404 });
  };
  try {
    const token = await createCredentialBoundAdminSession(new Request(origin), { id: 'owner-fixture', role: 'owner' }, env);
    const response = await handlePartnerOwnerConsole(new Request(origin + '/v1/admin/partners/finance-audit', { headers: { cookie: 'mmd_admin_gate_v1=' + token } }), env, {});
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.rows[0].model_payout.integrity.ok, true);
    assert.equal(body.rows[0].model_payout.session.current_payout_thb, 10000);
    assert.equal(body.rows[0].reconciliation.needs_reconciliation, true);
    assert.ok(body.rows[0].reconciliation.issues.some((issue) => issue.code === 'partner_commission_total_mismatch'));
    assert.deepEqual(body.rows[0].timeline.map((event) => event.type), [
      'session_created',
      'model_payout_baseline',
      'model_payout_adjustment',
      'payment_receipt',
      'settlement_locked',
      'partner_commission_earned',
      'partner_commission_approved',
      'partner_commission_paid'
    ]);
    assert.equal(body.summary.model_payout_adjustments, 1);
    assert.equal(body.summary.sessions_reconciliation_required, 1);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
