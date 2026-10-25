import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
const source = readFileSync(new URL('./blackcard-flow-embed.html', import.meta.url), 'utf8');
const script = source.match(/<script>\s*([\s\S]*?)<\/script>/)[1];

function payload(overrides = {}) {
  return { ok: true, authority: 'payments-worker', schema: 'blackcard_companion_preference_v1', session_id: 'sess_fixture', payment_status: 'evidence_submitted', preference_status: 'not_selected', entitlement_activated: false, request_id: null, companion: null, idempotent: false, ...overrides };
}
function saved(overrides = {}) {
  return payload({ preference_status: 'pending_review', companion: { id: 'hiro' }, request_id: 'bcp_' + 'a'.repeat(32), submitted_at: new Date().toISOString(), ...overrides });
}
class Element {
  value = ''; textContent = ''; hidden = false; disabled = false; required = false; listeners = {}; attributes = {};
  classList = { toggle() {} };
  addEventListener(name, cb) { (this.listeners[name] ||= []).push(cb); }
  setAttribute(key, value) { this.attributes[key] = value; }
  removeAttribute(key) { delete this.attributes[key]; }
  scrollIntoView() {}
  async emit(name) { for (const cb of this.listeners[name] || []) await cb({ preventDefault() {} }); }
}
const flush = () => new Promise(resolve => setImmediate(resolve));
async function harness(responses, query = '?t=signed') {
  const ids = [...source.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  const nodes = Object.fromEntries(ids.map(id => [id, new Element()]));
  nodes.companionform.elements = { guide: new Element() };
  nodes.companionform.reportValidity = () => !!nodes.companionform.elements.guide.value && (!nodes.reason.required || !!nodes.reason.value.trim());
  const events = {}, calls = [], window = {};
  const document = { getElementById: id => nodes[id], addEventListener(name, cb) { events[name] = cb; } };
  const fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    const response = responses.shift();
    if (response instanceof Error) throw response;
    if (typeof response === 'function') return response();
    return Response.json(response?.body ?? response, { status: response?.httpStatus || 200 });
  };
  vm.runInNewContext(script, { document, window, fetch, URLSearchParams, location: { search: query, hash: '' }, AbortSignal, crypto: webcrypto, setTimeout });
  await flush();
  return { nodes, calls, window, events, async choose(id) { nodes.companionform.elements.guide.value = id; await nodes.companionform.emit('change'); }, async submit() { await nodes.companionform.emit('submit'); } };
}

test('closed-sales embed has no checkout, LINE handoff or browser authority and retains all canonical assets', () => {
  assert.ok(source.includes('ยังไม่เปิดรับสมัครใหม่'));
  assert.ok(!/\/sigil\/pay\/blackcard|lin\.ee|oaMessage|localStorage/.test(source));
  for (const id of ['hito', 'hiei', 'hima', 'hiro']) assert.ok(source.includes(`value="${id}"`));
  assert.ok(source.includes('HIRO%20-%20SIGIL%20-%20GUIDE'));
});

test('no token or failed load disables saving; retry reads from backend without writing', async () => {
  const missing = await harness([], '');
  assert.equal(missing.calls.length, 0); assert.equal(missing.nodes.save.disabled, true);
  const h = await harness([new Error('offline'), saved()]);
  assert.equal(h.nodes.save.disabled, true);
  await h.nodes.retry.emit('click');
  assert.equal(h.calls.length, 2); assert.ok(h.calls.every(c => c.read === true));
  assert.equal(h.nodes.companionform.elements.guide.value, 'hiro');
  assert.match(h.nodes.selection.textContent, /HIRO/); assert.equal(h.nodes.save.disabled, true);
});

test('HTTP 200 and ok=true alone, wrong schema, entitlement or mismatched Companion never show success; retry keeps request key', async () => {
  for (const invalid of [{ ok: true }, saved({ schema: 'wrong' }), saved({ entitlement_activated: true }), saved({ companion: { id: 'hima' } }), saved({ session_id: 'another_session' })]) {
    const h = await harness([payload(), invalid, saved()]);
    await h.choose('hiro'); await h.submit();
    assert.ok(!h.nodes.selection.textContent.includes('บันทึก Preference แล้ว'));
    assert.equal(h.nodes.save.disabled, false);
    await h.submit();
    assert.match(h.nodes.selection.textContent, /บันทึก Preference แล้ว.*HIRO/);
    assert.equal(h.calls[1].request_key, h.calls[2].request_key);
    assert.equal(h.calls[1].expected_role, 'customer');
    assert.equal(h.nodes.save.disabled, true);
  }
});

test('change requires a reason and carries the backend request version; conflict disables saving until reload', async () => {
  const h = await harness([saved(), { httpStatus: 409, body: { ok: false, error: 'preference_concurrent_conflict' } }, saved({ companion: { id: 'hima' } })]);
  await h.choose('hima');
  assert.equal(h.nodes.reason.required, true); assert.equal(h.nodes.reasonwrap.hidden, false);
  await h.submit(); assert.equal(h.calls.length, 1);
  h.nodes.reason.value = 'Prefer quieter care'; await h.nodes.reason.emit('input'); await h.submit();
  assert.equal(h.calls[1].previous_request_id, 'bcp_' + 'a'.repeat(32));
  assert.equal(h.calls[1].change_reason, 'Prefer quieter care'); assert.equal(h.nodes.save.disabled, true);
  await h.nodes.retry.emit('click');
  assert.equal(h.nodes.companionform.elements.guide.value, 'hima'); assert.equal(h.calls[2].read, true);
});

test('already-selected review states and retention expiry render as backend status, and runtime copy changes language', async () => {
  for (const [state, pattern] of [['recorded', /MMD บันทึก/], ['declined', /ไม่ได้รับการอนุมัติ/], ['cancelled', /ยกเลิก/], ['needs_follow_up', /ข้อมูลเพิ่มเติม/]]) {
    const h = await harness([saved({ preference_status: state })]);
    assert.match(h.nodes.status.textContent, pattern);
    h.window.MMD_I18N = { t(key) { return key.endsWith('saved') ? 'Saved · {name}' : 'Translated status'; } };
    h.events['mmd:i18n:change']();
    assert.equal(h.nodes.selection.textContent, 'Saved · HIRO');
  }
  const expired = await harness([payload({ preference_status: 'expired' })]);
  assert.equal(expired.nodes.save.disabled, true); assert.match(expired.nodes.status.textContent, /หมดอายุ/);
});

test('retired operations reload structured readback and start a fresh key against the current version',async()=>{
  for(const error of ['preference_request_retired','preference_new_request_required']) {
    const latest='bcp_'+'b'.repeat(32);
    const h=await harness([saved(),{httpStatus:error==='preference_request_retired'?410:409,body:{ok:false,error}},saved({request_id:latest}),saved({companion:{id:'hima'}})]);
    await h.choose('hima'); h.nodes.reason.value='Fresh request'; await h.nodes.reason.emit('input'); await h.submit();
    assert.equal(h.nodes.save.disabled,true); assert.match(h.nodes.status.textContent,/ตรวจรายการ/);
    assert.ok(!h.nodes.selection.textContent.includes('บันทึก Preference แล้ว'));
    await h.nodes.retry.emit('click'); assert.equal(h.nodes.companionform.elements.guide.value,'hiro');
    await h.choose('hima'); h.nodes.reason.value='Fresh request'; await h.nodes.reason.emit('input'); await h.submit();
    assert.notEqual(h.calls[1].request_key,h.calls[3].request_key); assert.equal(h.calls[3].previous_request_id,latest);
    assert.match(h.nodes.selection.textContent,/บันทึก Preference แล้ว.*HIMA/);
  }
});
