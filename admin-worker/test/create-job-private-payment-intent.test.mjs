import test from 'node:test';
import assert from 'node:assert/strict';
import core from '../src/admin-login-hero-worker.js';
import { readModelSources } from '../src/create-job-drive-discovery.js';
import { setup } from './fixtures/create-job-form-runtime.mjs';
import { createCredentialBoundAdminSession } from '../src/credential-bound-admin-session.js';

function body(percent, travel) {
  return {
    job_date: '2026-11-20', start_time: '19:00', end_time: '21:00',
    location_name: 'Fixture location', amount_thb: 8500 + travel,
    original_amount_thb: 10500 + travel, service_amount_thb: 8500,
    travel_fee_thb: travel, pricing_adjustment: 'discount', discount_kind: 'discount',
    payment_type: 'deposit', deposit_percent: percent,
    client_id: 'recCLIENT00000001', client_record_id: 'recCLIENT00000001',
    client_name: 'Fixture Client', model_name: 'Mira',
    model: { model_id: 'recMODEL000000001', model_name: 'Mira',
      model_lookup_key: 'private/standard/Mira', visibility: 'private', folder: 'standard' },
    client_lineage: { client_id: 'recCLIENT00000001', client_name: 'Fixture Client' },
    line_identity: { line_user_id: 'U11111111111111111111111111111111' },
    job_visibility: 'private', job_type: 'pn',
    work: { job_visibility: 'private', job_lane: 'private', work_type: 'pn',
      job_type: 'pn', model_folder: 'standard', selected_model_folder: 'standard', service_options: [] },
    job_details: { job_date: '2026-11-20', start_time: '19:00', end_time: '21:00',
      duration_minutes: 120, location_name: 'Fixture location', brief: 'Fixture brief' },
    notes: { operation_note: 'Fixture note' },
    payment: { amount_thb: 8500 + travel, service_amount_thb: 8500,
      payment_type: 'deposit', travel_fee_thb: travel },
    private_access: { selected_private_folder: 'standard', selected_orientation: 'gay',
      service_options: [], service_rates: {}, settlement_mode: 'platform' },
    service_pricing: { version: 1, currency: 'THB', settlement_mode: 'platform',
      client_base_amount_thb: 10500, model_base_payout_thb: null, addons: [],
      client_total_amount_thb: 8500, model_total_payout_thb: null,
      client_gross_amount_thb: 10500,
      discount: { mode: 'customer_request', type: 'amount', value: 2000,
        amount_thb: 2000, mmd_share_thb: 2000, model_share_thb: 0,
        kind: 'discount', reason: 'Fixture discount' } },
  };
}

async function submit(input, mode="valid") {
  const h = setup({ privateJob: true });
  const priorFetch = globalThis.fetch;
  let reads=0;
  globalThis.fetch = async (input,init) => {
    const url=new URL(input instanceof Request?input.url:input);
    if(url.pathname.includes('tblrmSsCZxJSCQR9n')) {
      reads++;
      if(mode==='unavailable' && reads>1)return Response.json({}, {status:503});
      return Response.json({records:[{id:'recREFERRAL000001',fields:{Model:['recMODEL000000001'],Partner:['recPARTNER0000001'],'Ownership Status':mode==='changed'&&reads>1?'revoked':'verified'}}]});
    }
    if(url.pathname.includes('tbl1ksDlsTiiGEHWe'))return Response.json({id:'recPARTNER0000001',fields:{fldXb55aiAjNPOUWc:'fixture-partner',fldpJWfASq7PfkMgC:'Fixture Partner',fldajmg66pf2ifGPu:'active',fldwRzdtIoPbHKr7n:'recognized'}});
    return h.fetch(input,init);
  };
  try {
    const sources=await readModelSources(h.env,'recMODEL000000001');
    input.model_source_choice='partner';input.partner_attribution={partner_record_id:'recPARTNER0000001',source_revision:sources.items[0].source_revision};
    const token = await createCredentialBoundAdminSession(
      new Request('https://mmdbkk.com'), { id: 'fixture-owner', role: 'owner' }, h.env);
    const response = await core.fetch(new Request('https://mmdbkk.com/v1/admin/job/create', {
      method: 'POST',
      headers: { Cookie: `mmd_admin_gate_v1=${token}`, Origin: 'https://mmdbkk.com',
        'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }), h.env, {});
    return { ...h, status: response.status, data: await response.json() };
  } finally { globalThis.fetch = priorFetch; }
}

for (const travel of [0, 1000]) {
  for (const [percent, due] of [[20, 2500], [25, 3000], [30, 3500], [35, 4000], [40, 4500]]) {
    test(`Create Job to Payment intent: ${percent}%, travel ${travel}`, async () => {
      const h = await submit(body(percent, travel));
      assert.equal(h.status, 200, JSON.stringify(h.data));
      assert.equal(h.data.amount_due_thb, due);
      assert.equal(h.issuances[0].deposit_policy, 'private_model_v1');
      assert.equal(h.issuances[0].deposit_percent, percent);
      assert.equal(h.issuances[0].deposit_amount_thb, due);
      assert.equal(h.issuances[0].discount_reason, 'Fixture discount');
      const payment = h.records.get('tblWGGJJOx5eBvBZJ');
      assert.equal(payment.length, 1);
      assert.equal(payment[0].fields.fldvCSwrUW8OMAooS, due);
    });
  }
}

for (const percent of [15, 21, 45]) {
  test(`Create Job rejects invalid Private Model ${percent}% before writes`, async () => {
    const h = await submit(body(percent, 1000));
    assert.equal(h.status, 400);
    assert.equal(h.issuances.length, 0);
    assert.equal(h.records.size, 0);
  });
}

for(const mode of ['changed','unavailable'])test('Model Partner '+mode+' stops before Payment intent',async()=>{const h=await submit(body(30,1000),mode);assert.equal(h.status,mode==='changed'?409:503);assert.equal(h.data.creation_outcome,'not_created');assert.equal(h.issuances.length,0);assert.equal(h.records.size,0);});
