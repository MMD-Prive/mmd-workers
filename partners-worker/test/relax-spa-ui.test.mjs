import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { Window } from 'happy-dom';
import { renderRelaxSpaPage } from '../../admin-worker/src/relax-spa-page.js';
import { applySpaCommand } from '../../mms-worker/src/relax-spa-ledger.mjs';
const therapist = { id: 'mmst_' + 'a'.repeat(24), name: 'Therapist QA', status: 'Active' };
const job = { id: 'mmsjob_' + 'b'.repeat(24), therapist_id: therapist.id, status: 'Completed', is_test: false };
async function waitFor(fn) { for (let n = 0; n < 80; n++) { if (fn()) return; await new Promise(r => setTimeout(r, 10)); } assert.ok(fn(), 'UI did not complete'); }
async function ui(t, partner = false) {
  const actor = partner ? { id: 'partner:recPPPPPPPPPPPPPP', role: 'spa_partner' } : { id: 'per', role: 'owner' };
  const state = { referrals: [], agreements: [], services: [], events: [], requests: {} }, calls = [], errors = [];
  const w = new Window({ url: partner ? 'https://www.mmdbkk.com/partner/dashboard/relax-spa?t=fixture-token' : 'https://www.mmdbkk.com/internal/admin/mms/relax-spa', settings: { enableJavaScriptEvaluation: true, suppressInsecureJavaScriptEnvironmentWarning: true, disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
  t.after(() => w.happyDOM.close());
  Object.defineProperty(w, 'crypto', { value: webcrypto });
  w.addEventListener('error', e => errors.push(e.error || e.message));
  w.fetch = async (path, opts = {}) => {
    const u = new URL(path, w.location.href); calls.push(u);
    if (u.pathname.endsWith('/workspace') || u.pathname.endsWith('/catalog')) return Response.json({ ok: true, ...(u.pathname.endsWith('/catalog') ? { data: { therapists: [{ therapist_id: therapist.id, display_name: therapist.name, status: 'Active' }] } } : { therapists: [{ therapist_id: therapist.id, display_name: therapist.name, status: 'Active' }], jobs: [{ job_id: job.id, therapist_id: therapist.id, service: 'Spa QA', status: 'Completed', is_test: false }], offers: [], complete: true }) });
    const command = u.pathname.split('/').at(-1);
    if (command === 'snapshot') return Response.json({ ok: true, data: { actor, ...state } });
    try { return Response.json({ ok: true, data: applySpaCommand(state, actor, command, JSON.parse(opts.body), { therapist, job }) }); }
    catch (e) { return Response.json({ ok: false, error: { code: e.code } }, { status: e.status || 503 }); }
  };
  w.document.write(renderRelaxSpaPage({ partner }));
  await waitFor(() => w.document.querySelector('form[data-command="referrals"]'));
  const q = s => w.document.querySelector(s);
  const submit = async (command, values, done) => {
    const form = q('form[data-command="' + command + '"]'); assert.ok(form, command);
    for (const [name, value] of Object.entries(values)) {
      const input = form.querySelector('[name="' + name + '"]'); assert.ok(input, name);
      // Happy DOM uses floating modulo for fractional steps; real browsers do not.
      // Decimal precision remains exercised through the UI parser and the ledger.
      if (input.type === 'number') input.step = 'any';
      if (input.type === 'checkbox') input.checked = value; else input.value = value;
    }
    assert.ok(form.checkValidity(), command + ': invalid fields: ' + [...form.querySelectorAll('input,select')].filter(n => !n.checkValidity()).map(n => n.name + '=' + n.value).join(', '));
    form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    try { await waitFor(done); } catch (e) { throw Error(command + ': ' + q('#notice').textContent + ' · ' + errors.map(String).join('; ')); }
    await waitFor(() => q('#notice').textContent.startsWith('บันทึกแล้ว'));
  };
  return { w, q, state, calls, errors, submit };
}
test('Owner page submits the actual referral → agreement → payment → settlement → payout flow', async t => {
  const f = await ui(t);
  await f.submit('referrals', { partner_id: 'mms-partner:henna', therapist_id: therapist.id, note: 'Spa service' }, () => f.state.referrals.length === 1);
  await f.submit('referral-decision', { decision: 'accepted', evidence_ref: 'spa-accept' }, () => f.state.referrals[0].status === 'accepted');
  f.q('[data-view="agreements"]').click();
  await f.submit('agreements', { title: 'QA contract', basis: 'net_profit', therapist: '50', spa: '30', partner: '10', mms: '10', terms_ref: 'signed-contract', approval_confirmed: true }, () => f.state.agreements.length === 1);
  f.q('[data-view="services"]').click();
  await f.submit('services', { referral_id: f.state.referrals[0].id, job_id: job.id, agreement_id: f.state.agreements[0].id, expected_amount: '1000.01', service_evidence: 'spa-service' }, () => f.state.services.length === 1);
  await f.submit('receipts', { amount: '1000.01', received_by: 'Relax Spa by 9', received_at: '2026-10-01T10:00', evidence_ref: 'bank-in', verification_confirmed: true }, () => f.state.services[0].receipts.length === 1);
  f.q('[data-view="shares"]').click();
  await f.submit('settlements', { approval_confirmed: true }, () => !!f.state.services[0].settlement);
  // First payout form is Therapist; its approved amount is populated by the UI.
  await f.submit('payouts', { recipient: 'Therapist QA', paid_at: '2026-10-01T11:00', evidence_ref: 'bank-out-therapist', verification_confirmed: true }, () => f.state.services[0].payouts.length === 1);
  assert.equal(f.state.services[0].payouts[0].amount, 50001);
  assert.match(f.q('#content').textContent, /บันทึกจ่ายแล้ว/); assert.deepEqual(f.errors, []);
});
test('MY Partner navigation retains existing token, hides Owner forms and only submits referral', async t => {
  const f = await ui(t, true);
  assert.equal(f.q('[data-owner]').hidden, true);
  assert.equal(f.q('[name="partner_id"]'), null);
  await f.submit('referrals', { therapist_id: therapist.id, note: 'My recommendation' }, () => f.state.referrals.length === 1);
  assert.equal(f.state.referrals[0].partner_id, 'partner:recPPPPPPPPPPPPPP');
  f.q('[data-view="services"]').click();
  assert.equal(f.w.location.search.includes('t=fixture-token'), true);
  assert.equal(f.q('form[data-command="services"]'), null);
  assert.ok(f.calls.every(u => u.pathname.startsWith('/v1/partner/relax-spa/') && u.searchParams.get('t') === 'fixture-token'));
  assert.deepEqual(f.errors, []);
});
