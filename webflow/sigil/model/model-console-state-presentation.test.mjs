import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync(new URL('./model-console-v3-i18n.js', import.meta.url), 'utf8');
const copy = vm.runInNewContext('(' + source.match(/const C=(.*?),\$=s=>/)[1] + ')');
const selectors = source.slice(source.indexOf('v=(o,k,'), source.indexOf(',txt=(s,x)'));
const state = vm.runInNewContext('(()=>{const ' + selectors + ';return state})()');
const indexCode = source.slice(source.indexOf('function stageIndex(s)'), source.indexOf('function actions(s)'));
const stages = ['confirmed', 'en_route', 'arrived', 'met_customer', 'work_started', 'separated'];
const stageIndex = vm.runInNewContext(indexCode + ';stageIndex', { stages });

test('canonical normalized state takes priority over a stale legacy state', () => {
  assert.equal(state({ normalized_state: 'final_payment_pending', state: 'working' }), 'final_payment_pending');
  assert.equal(state({ normalized_state: 'nearby', status: 'confirmed' }), 'nearby');
  assert.equal(state({ normalized_state: 'unknown', state: 'confirmed' }), 'unknown');
});

test('missing or blank state never assumes a confirmed job', () => {
  for (const session of [undefined, null, {}, { state: '' }, { normalized_state: ' ' }]) {
    assert.equal(state(session), 'unknown');
  }
  assert.equal(state({ state: 'traveling' }), 'en_route');
});

for (const locale of ['th', 'en', 'zh']) {
  test(`${locale}: nearby and payment states have distinct non-fallback copy`, () => {
    for (const value of ['nearby', 'met_customer', 'final_payment_pending', 'final_payment_confirmed']) {
      assert.equal(copy[locale].st[value].length, 3);
      assert.notDeepEqual(copy[locale].st[value], copy[locale].st.fallback);
    }
    assert.notEqual(copy[locale].st.final_payment_pending[0], copy[locale].st.final_payment_confirmed[0]);
  });
}

test('optional travel and payment states do not reset the progress indicator', () => {
  assert.equal(stageIndex('nearby'), stageIndex('en_route'));
  assert.equal(stageIndex('final_payment_pending'), stageIndex('met_customer'));
  assert.equal(stageIndex('final_payment_confirmed'), stageIndex('met_customer'));
  assert.equal(stageIndex('work_finished'), stageIndex('work_started'));
  const lifecycle = ['confirmed', 'en_route', 'nearby', 'arrived', 'met_customer', 'final_payment_pending', 'final_payment_confirmed', 'work_started', 'work_finished', 'separated'];
  const positions = lifecycle.map(stageIndex);
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  assert.equal(stageIndex('unknown'), -1);
});

test('render hides an unknown progress indicator and does not activate a stage', () => {
  const renderCode = source.slice(source.indexOf('function render()'), source.indexOf('function staticCopy()'));
  const nodes = new Map();
  const steps = stages.map(() => ({ classList: { toggle: (_, value) => { steps.active.push(value); } } }));
  steps.active = [];
  const context = {
    ses: { normalized_state: 'unknown', session_id: 'sess_synthetic_fixture' }, state, stageIndex, stages,
    view() {}, chip() {}, txt() {}, actions() {}, d: () => copy.th,
    R: { classList: { add() {}, remove() {} } },
    $: selector => { if (!nodes.has(selector)) nodes.set(selector, { style: {} }); return nodes.get(selector); },
    $$: () => steps,
    v: (object, keys, fallback = '—') => keys.map(key => object[key]).find(Boolean) ?? fallback,
  };
  vm.runInNewContext(renderCode + ';render()', context);
  assert.equal(nodes.get('[data-progress-fill]').hidden, true);
  assert.deepEqual(steps.active, stages.map(() => false));
});

test('submission uses canonical state even when legacy fields claim work may start', async () => {
  const actCode = source.slice(source.indexOf('async function act(a)'), source.indexOf('function support(k)'));
  const next = vm.runInNewContext('(' + source.match(/next=(\{.*?\}),v=/)[1] + ')');
  for (const normalized of ['met_customer', 'final_payment_pending', 'unknown', 'final_payment_confirmed']) {
    const requests = [];
    const context = {
      ses: { normalized_state: normalized, state: 'final_payment_confirmed', allowed_actions: ['start_work'], session_id: 'sess_synthetic_fixture' },
      busy: false, next, state,
      lock() {}, note() {}, load: async () => {}, d: () => copy.th,
      R: { dataset: { actionEndpoint: '/v1/model/session/action' } },
      v: (object, keys) => keys.map(key => object[key]).find(Boolean) || '',
      j: async () => ({ ok: true }),
      fetch: async (url, options) => { requests.push({ url, options }); return { ok: true }; },
    };
    await vm.runInNewContext(actCode + ';act("start_work")', context);
    assert.equal(requests.length, normalized === 'final_payment_confirmed' ? 1 : 0);
    if (requests.length) assert.equal(JSON.parse(requests[0].options.body).session_id, 'sess_synthetic_fixture');
  }
});
