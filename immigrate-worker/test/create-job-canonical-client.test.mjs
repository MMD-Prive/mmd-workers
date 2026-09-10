import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/a/create-session.js', import.meta.url), 'utf8');
function element() {
  return { value: '', textContent: '', innerHTML: '', hidden: false, disabled: false, dataset: {}, children: [],
    classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, scrollIntoView() {},
    querySelector() { return null; }, appendChild(node) { this.children.push(node); } };
}
function harness(path = '/internal/admin/jobs/create-job') {
  const nodes = new Map();
  const work = [element(), element()];
  const root = { dataset: { adminBase: 'https://mmdbkk.com' },
    querySelector(s) { if (!nodes.has(s)) nodes.set(s, element()); return nodes.get(s); },
    querySelectorAll(s) { return s === '[data-op-work-type]' ? work : []; } };
  const calls = [];
  let responder = () => Response.json({ ok: true, records: [] });
  const context = vm.createContext({
    document: { querySelector: () => root, createElement: element },
    window: { location: { pathname: path, search: '' } },
    URLSearchParams, URL, Headers, Response,
    fetch: async (url, options) => { calls.push({ url, options }); return responder(url, options); },
  });
  vm.runInContext(source.replace('\n  boot();', '\n  globalThis.controller = { state, el, selectClient, selectWorkType, selectFolder, renderClients, searchClients, loadRecentClients, createSession, saveDraft, clientReady, updateAll };'), context);
  return { ...context.controller, root, work, nodes, calls, respond(fn) { responder = fn; } };
}
const canonical = { client_id: 'recClient1', client_name: 'Canonical client' };
const fallback = { client_id: '', client_name: 'วี', manual_public_only: true, identity_status: 'pending_reconcile' };

test('Create Job rejects manual, staging ID and pending records before Work/Model/create', async () => {
  const h = harness();
  h.updateAll();
  assert.ok(h.work.every(b => b.disabled));
  for (const record of [fallback, { id: 'recStaging', client_name: 'วี' },
    { ...canonical, manual_public_only: true }, { ...canonical, identity_status: 'pending_client_link' }]) {
    h.selectClient(record);
    h.selectWorkType('public');
    await h.selectFolder('travel');
    await h.createSession();
    await h.saveDraft();
    assert.equal(h.state.selectedClient, null);
    assert.equal(h.state.workType, '');
    assert.equal(h.state.modelFolder, '');
    assert.equal(h.root.dataset.canonicalClientSelected, 'false');
  }
  assert.equal(h.calls.length, 0);
  h.selectClient(canonical);
  assert.equal(h.clientReady(), true);
  assert.equal(h.root.dataset.canonicalClientSelected, 'true');
  assert.ok(h.work.every(b => !b.disabled));
  h.selectWorkType('public');
  assert.equal(h.state.workType, 'public');
});

test('Create Job sends strict flags, clears previous client and shows LINE evidence separately', async () => {
  const h = harness('/internal/admin/jobs/create-job/');
  h.selectClient(canonical);
  h.el.query.value = 'วี';
  h.respond(() => Response.json({ ok: true, records: [fallback], line_candidates: [
    { line_record_id: 'recVee', remembered_name: '<img src=x>', line_user_id: 'Uvee', selectable: false },
  ] }));
  await h.searchClients();
  assert.deepEqual(JSON.parse(h.calls[0].options.body), { query: 'วี', canonical_only: true, allow_manual_fallback: false });
  assert.equal(h.state.selectedClient, null);
  assert.equal(h.state.clients.length, 0);
  assert.match(h.el.clientResults.innerHTML, /ยังไม่พบ Client — ไป Link \/ Reconcile ก่อน/);
  const suggestion = h.el.clientResults.children[0];
  assert.match(suggestion.innerHTML, /&lt;img src=x&gt;/);
  assert.match(suggestion.innerHTML, /\/internal\/ceo\/relink-review/);
  assert.doesNotMatch(suggestion.innerHTML, /data-op-client-index|<button/);
  assert.equal(h.root.dataset.canonicalClientSelected, 'false');
});

test('late recent lookup cannot overwrite a newer search', async () => {
  const h = harness();
  let releaseRecent;
  h.respond(url => url.endsWith('/recent')
    ? new Promise(resolve => { releaseRecent = resolve; })
    : Response.json({ ok: true, records: [] }));
  const recent = h.loadRecentClients();
  h.el.query.value = 'unmatched';
  await h.searchClients();
  releaseRecent(Response.json({ ok: true, records: [canonical] }));
  await recent;
  assert.equal(h.state.clients.length, 0);
  assert.equal(h.clientReady(), false);
});

test('SIGIL shared-core consumer retains default pending flow and request contract', async () => {
  const h = harness('/sigil/jobs');
  h.el.query.value = 'วี';
  h.respond(() => Response.json({ ok: true, records: [fallback] }));
  await h.searchClients();
  assert.deepEqual(JSON.parse(h.calls[0].options.body), { query: 'วี' });
  assert.equal(h.state.clients.length, 1);
  h.selectClient(h.state.clients[0]);
  h.selectWorkType('public');
  assert.equal(h.state.workType, 'public');
});

test('Focus Flow requires canonical selection even if a client-like label is displayed', async () => {
  const controller = await readFile(new URL('../public/a/create-session-focus-flow-v2.js', import.meta.url), 'utf8');
  const start = controller.indexOf('  function readiness() {');
  const end = controller.indexOf('\n  }', start) + 4;
  const root = { dataset: { canonicalClientSelected: 'false' } };
  const readiness = vm.runInNewContext('(' + controller.slice(start, end) + ')', {
    location: { pathname: '/internal/admin/jobs/create-job' }, root,
    stat: () => 'Manual client label', meaningful: () => true,
    createButton: { disabled: true }, output: { hidden: true },
  });
  assert.equal(readiness().client, false);
  root.dataset.canonicalClientSelected = 'true';
  assert.equal(readiness().client, true);
});
