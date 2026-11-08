import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('./model-confirm-flow-web-v3.js', import.meta.url), 'utf8');
function fixture(options = {}) {
  let state = options.state ?? null, markWrites = 0, warningWrites = 0;
  let warning = null, observe, disconnects = 0, observations = 0, id = 0;
  const timers = new Map(), events = new Map(), navigations = [];
  const success = { hidden: options.hidden ?? false };
  const check = { disabled: options.disabled ?? false }, confirm = { disabled: false };
  const value = { textContent: options.amount ?? '7,000 บาท' };
  const card = { hidden: true, append: element => { warning = element; } };
  const nodes = { '[data-m-success]': success, '[data-m-check]': check,
    '[data-m-confirm]': confirm, '[data-m-payout]': value,
    '[data-m-payout-card]': card, '.mm15__payout>span': {textContent: ''} };
  const root = { querySelector: key => key === '[data-m-payout-warning]' ? warning : nodes[key] || null };
  const location = { pathname: options.path || '/sigil/confirm/job-model',
    origin: options.origin || 'https://www.mmdbkk.com', search: options.search || '',
    assign: href => { if (options.assignThrows) throw Error('navigation blocked'); navigations.push(href); },
    replace: () => { throw Error('location.replace must not be used'); } };
  const history = { get state() { if (options.stateThrows) throw Error('History blocked'); return state; },
    replaceState: next => { if (options.historyThrows) throw Error('History blocked'); markWrites++; if (!options.historyNoop) state = next; } };
  const document = { documentElement: { lang: options.lang || 'th' },
    getElementById: () => options.noRoot ? null : root,
    createElement: () => ({ dataset: {}, style: {}, setAttribute() {},
      get textContent() { return this.text || ''; },
      set textContent(value) { this.text = value; warningWrites++; },
      remove() { warning = null; } }) };
  const window = { addEventListener: (name, fn) => events.set(name, fn) };
  const context = { window, document, location, history, URL, URLSearchParams,
    setTimeout: fn => { const key = ++id; timers.set(key, fn); return key; },
    clearTimeout: key => timers.delete(key),
    MutationObserver: class { constructor(fn) { observe = fn; } observe() { observations++; } disconnect() { disconnects++; } } };
  const run = () => vm.runInNewContext(source, context);
  run();
  return { run, tick: () => observe?.(), flush: () => { const pending=[...timers.values()]; timers.clear(); pending.forEach(fn => fn()); },
    event: (name, value={}) => events.get(name)?.(value), navigations, success, check, confirm, value, location,
    get state() { return state; }, get markWrites() { return markWrites; },
    get warningWrites() { return warningWrites; }, get warning() { return warning; },
    get observations() { return observations; }, get disconnects() { return disconnects; },
    get pending() { return timers.size; } };
}

test('one web navigation preserves signed source history and unrelated state', () => {
  const p = fixture({state:{other:42}, search:'?t=do-not-forward&lang=en&liff_env=published'});
  p.tick(); p.tick(); p.flush(); p.tick(); p.flush();
  assert.deepEqual(p.navigations, ['/sigil/model/dashboard?handoff=job-confirmed&lang=en&liff_env=published']);
  assert.equal(p.state.other,42); assert.equal(p.state.__mmdWebConfirmVisitedV3,true); assert.equal(p.markWrites,1);
  assert.ok(!JSON.stringify(p.state).includes('do-not-forward'));
});
test('Back with restored history state never redirects again', () => {
  const first=fixture(); first.flush(); const back=fixture({state:first.state}); back.tick(); back.flush();
  assert.equal(back.navigations.length,0); assert.equal(back.markWrites,0);
});
test('bfcache restoration cannot replay handoff', () => {
  const p=fixture(); p.flush(); p.event('pagehide'); p.event('pageshow',{persisted:true}); p.tick(); p.flush();
  assert.equal(p.navigations.length,1); assert.equal(p.disconnects,1); assert.equal(p.observations,2);
});
test('unconfirmed state remains in place until success is exposed', () => {
  const p=fixture({hidden:true}); p.flush(); assert.equal(p.markWrites,0);
  p.success.hidden=false; p.tick(); p.flush(); assert.equal(p.navigations.length,1);
});
for (const option of ['historyThrows','stateThrows','historyNoop']) test(`${option}: retain manual recovery without automatic redirect`, () => {
  const p=fixture({[option]:true}); p.tick(); p.flush(); assert.equal(p.navigations.length,0);
});
for (const state of ['opaque-state',42,[]]) test(`preserve non-object history state ${JSON.stringify(state)}`, () => {
  const p=fixture({state}); p.flush(); assert.equal(p.state,state); assert.equal(p.markWrites,0); assert.equal(p.navigations.length,0);
});
test('navigation exception does not throw or retry', () => {
  const p=fixture({assignThrows:true}); assert.doesNotThrow(()=>p.flush()); p.tick(); p.flush(); assert.equal(p.pending,0);
});
test('pagehide cancels pending navigation and Back does not restart it', () => {
  const p=fixture(); p.event('pagehide'); p.flush(); p.event('pageshow',{persisted:true}); p.flush(); assert.equal(p.navigations.length,0);
});
test('success hidden again before timeout does not navigate', () => {
  const p=fixture(); p.success.hidden=true; p.flush(); assert.equal(p.navigations.length,0);
});
test('path change before timeout does not navigate', () => {
  const p=fixture(); p.location.pathname='/member/kenji'; p.flush(); assert.equal(p.navigations.length,0);
});
test('duplicate script execution cannot schedule duplicate navigation', () => {
  const p=fixture(); p.run(); p.flush(); assert.equal(p.navigations.length,1); assert.equal(p.markWrites,1);
});
test('unrelated page or missing root has no effects', () => {
  for(const opts of [{path:'/sigil/confirm/job-confirmation'},{noRoot:true}]){
    const p=fixture(opts); p.flush(); assert.equal(p.navigations.length,0); assert.equal(p.observations,0);
  }
});
test('query context is bounded and never copies token, next, identity or amounts', () => {
  const p=fixture({search:'?lang=evil&liff_env=https://evil.test&t=secret&next=https://evil.test&amount=10&client_id=x'});
  p.flush(); assert.equal(p.navigations[0],'/sigil/model/dashboard?handoff=job-confirmed');
});
test('V2 missing-payout guard remains fail closed and warning updates are idempotent', () => {
  const p=fixture({amount:'',hidden:true}); p.tick(); p.tick();
  assert.equal(p.check.disabled,true); assert.equal(p.confirm.disabled,true); assert.equal(p.value.textContent,'—');
  assert.equal(p.warningWrites,1); assert.match(p.warning.textContent,/ยังไม่มียอดเงินถึงตัว/);
  p.value.textContent='7000'; p.tick(); assert.equal(p.warning,null);
  assert.equal(p.confirm.disabled,true,'only owning runtime may enable the confirm action');
});
test('still-loading payout does not prematurely disable an unready flow', () => {
  const p=fixture({amount:'',disabled:true,hidden:true}); p.tick(); assert.equal(p.warning,null);
});
test('no API calls, token storage or location.replace in replacement', () => {
  assert.doesNotMatch(source,/fetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|location\.replace\(/);
});
