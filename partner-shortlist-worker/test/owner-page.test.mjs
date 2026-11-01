import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { renderOwnerPage, OWNER_COPY } from '../src/owner-page.js';

const require = createRequire(import.meta.url);
const { JSDOM, VirtualConsole } = require(process.env.JSDOM_PATH || 'jsdom');
const ID = 'a'.repeat(32), MODEL = 'b'.repeat(32), PHOTO = 'c'.repeat(32);
const canonicalModelId = 'rec12345678901234';
const base = '/v1/admin/model-selections';
const fixture = () => ({
  id: ID, title: 'งานตรวจหน้าคัด', revision: 1, state: 'active', expiresAt: new Date(Date.now() + 86400000).toISOString(),
  brief: { date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), time: '', location: 'Example Studio', duration: '', budget: 1200, spec: 'Synthetic test requirement', format: 'Test shoot', extra: '' },
  ownerOnly: { payoutCap: 700 }, models: [], selection: null,
});
const candidate = { model_id: canonicalModelId, name: '<Sample Model>', code: 'internal:source-only', height_cm: 181, weight_kg: 74, drive_linked: false, media: [
  { kind: 'photo', asset_record_id: 'recPHOTO00000001', preview_available: true, status: 'pending_review' },
  { kind: 'photo', asset_record_id: 'recPHOTO00000002', preview_available: true, status: 'approved' },
] };
const flush = () => new Promise(resolve => setTimeout(resolve, 10));

async function harness({ item = fixture(), onRequest = () => null } = {}) {
  const errors = [], calls = [], clipboard = [];
  const console = new VirtualConsole();
  console.on('jsdomError', e => errors.push(e));
  const dom = new JSDOM(renderOwnerPage('test-nonce'), {
    url: 'https://www.mmdbkk.com/internal/admin/model-selections', runScripts: 'dangerously', virtualConsole: console,
    beforeParse(window) {
      window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
      window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new window.Event('close')); };
      window.navigator.clipboard = { writeText: async text => clipboard.push(text) };
      window.fetch = async (path, options = {}) => {
        calls.push({ path, ...options });
        const custom = await onRequest(path, options);
        let data;
        if (custom instanceof Response) return custom;
        if (custom) data = custom;
        else if (path === base) data = { ok: true, items: item ? [item] : [], nextCursor: null };
        else if (path === base + '/' + ID) data = { ok: true, item };
        else if (path.startsWith('/v1/admin/booking-models?q=')) data = { ok: true, items: [candidate] };
        else throw new Error('Unexpected request: ' + path);
        return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
      };
    },
  });
  await flush();
  const $ = id => dom.window.document.getElementById(id);
  const choose = async () => {
    $('addModel').click(); $('search').value = 'Sample Model';
    $('searchForm').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await flush(); dom.window.document.querySelector('.search-result').click();
  };
  const toggle = (input, value) => { input.checked = value; input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); };
  return { dom, $, calls, errors, clipboard, choose, toggle };
}

test('owner render uses nonce-based script and style without inline execution attributes', () => {
  const html = renderOwnerPage('unique-nonce');
  assert.match(html, /<script nonce="unique-nonce">/);
  assert.match(html, /<style nonce="unique-nonce">/);
  assert.doesNotMatch(html, /\son(?:click|error|submit|load)\s*=/i);
  assert.doesNotMatch(html, /\sstyle\s*=/i);
  assert.doesNotMatch(html, /#s=[a-f0-9]{32}&t=/);
  assert.match(OWNER_COPY.sharePhoto, /ไม่มีเบอร์ LINE หรือเรทถึงตัว/);
});

test('new job form has generic blank defaults and does not reuse the loaded private brief', async () => {
  const h = await harness();
  try {
    h.$('newJob').click();
    for (const field of ['title', 'time', 'location', 'duration', 'budget', 'spec', 'format', 'extra', 'payoutCap']) assert.equal(h.$(field).value, '', field);
    assert.equal(h.$('date').value, new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10));
    const expiry = Date.parse(h.$('expiresAt').value + ':00+07:00');
    assert.ok(expiry > Date.now() + 6 * 86400000 && expiry <= Date.now() + 7 * 86400000);
    assert.equal(h.$('budget').required, true);
  } finally { h.dom.window.close(); }
});

test('only explicitly approved photo is imported after actual job history review; source code is not copied into display', async () => {
  const item = fixture(); let payload;
  const h = await harness({ item, onRequest(path, options) {
    if (path === base + '/' + ID + '/models' && options.method === 'POST') {
      payload = JSON.parse(options.body);
      const model = { id: MODEL, canonicalModelId, ...payload.display, photos: [{ id: PHOTO, previewPath: base + '/' + ID + '/media/' + PHOTO, source: 'media', assetId: payload.photos[0].assetId, shareAllowed: true, downloadAllowed: false }] };
      return { ok: true, item: { ...item, revision: 2, models: [model] } };
    }
  } });
  try {
    await h.choose();
    assert.equal(h.$('displayCode').value, '');
    assert.equal(h.$('displayStatus').value, 'pending');
    const checks = h.dom.window.document.querySelectorAll('#photos input');
    assert.equal(checks.length, 4);
    assert.ok([...checks].every(c => !c.checked));
    assert.equal(checks[1].disabled, true);
    assert.equal(h.$('importModel').disabled, true);
    h.toggle(checks[0], true);
    assert.equal(h.$('importModel').disabled, true);
    h.toggle(h.$('historyReviewed'), true);
    assert.equal(h.$('importModel').disabled, false);
    h.$('importModel').click(); await flush();
    assert.equal(payload.historyReviewed, true);
    assert.deepEqual(payload.photos, [{ source: 'media', assetId: 'recPHOTO00000001', shareAllowed: true, downloadAllowed: false }]);
    assert.equal(payload.display.status, 'pending');
    assert.equal(payload.display.code, '');
    assert.equal(h.$('modelDialog').open, false);
    assert.match(h.$('modelList').textContent, /<Sample Model>/);
    assert.equal(h.dom.window.document.querySelectorAll('#modelList script').length, 0);
    assert.equal(h.errors.length, 0);
  } finally { h.dom.window.close(); }
});

test('failed source preview removes both permissions and cannot be imported', async () => {
  const h = await harness();
  try {
    await h.choose();
    const checks = h.dom.window.document.querySelectorAll('#photos input');
    h.toggle(checks[0], true); h.toggle(checks[1], true); h.toggle(h.$('historyReviewed'), true);
    assert.equal(h.$('importModel').disabled, false);
    h.dom.window.document.querySelector('#photos img').dispatchEvent(new h.dom.window.Event('error'));
    assert.equal(checks[0].checked, false); assert.equal(checks[1].checked, false);
    assert.equal(checks[0].disabled, true); assert.equal(checks[1].disabled, true);
    assert.equal(h.$('importModel').disabled, true);
    assert.equal(h.calls.filter(c => c.method === 'POST').length, 0);
  } finally { h.dom.window.close(); }
});

test('revision conflict keeps the model editor and unsent choices visible without a success message', async () => {
  const h = await harness({ onRequest(path, options) {
    if (path.endsWith('/models') && options.method === 'POST') return new Response(JSON.stringify({ ok: false, error: 'revision_conflict' }), { status: 409 });
  } });
  try {
    await h.choose();
    h.toggle(h.dom.window.document.querySelector('#photos input'), true); h.toggle(h.$('historyReviewed'), true);
    h.$('importModel').click(); await flush();
    assert.equal(h.$('modelDialog').open, true);
    assert.equal(h.$('modelError').hidden, false);
    assert.equal(h.$('modelError').textContent, OWNER_COPY.conflict);
    assert.equal(h.$('globalStatus').textContent, '');
    assert.equal(h.dom.window.document.querySelector('#photos input').checked, true);
    assert.equal(h.$('importModel').disabled, false);
  } finally { h.dom.window.close(); }
});

test('preview transform failure leaves the photo choices editable and reports no success', async () => {
  const h = await harness({ onRequest(path, options) {
    if (path.endsWith('/models') && options.method === 'POST') return new Response(JSON.stringify({ ok: false, error: 'preview_unavailable' }), { status: 503 });
  } });
  try {
    await h.choose();
    h.toggle(h.dom.window.document.querySelector('#photos input'), true); h.toggle(h.$('historyReviewed'), true);
    h.$('importModel').click(); await flush();
    assert.equal(h.$('modelDialog').open, true);
    assert.equal(h.$('modelError').textContent, OWNER_COPY.previewError);
    assert.equal(h.$('globalStatus').textContent, '');
    assert.equal(h.$('importModel').disabled, false);
  } finally { h.dom.window.close(); }
});

test('revoke is deliberate and updates state only after server confirmation', async () => {
  const item = fixture(); let write;
  const h = await harness({ item, onRequest(path, options) {
    if (path === base + '/' + ID && options.method === 'PATCH') { write = JSON.parse(options.body); return { ok: true, item: { ...item, revision: 2, state: 'revoked' } }; }
  } });
  try {
    h.$('revokeLink').click();
    assert.equal(h.$('confirmDialog').open, true);
    assert.equal(h.calls.filter(c => c.method === 'PATCH').length, 0);
    h.$('confirmAction').click(); await flush();
    assert.deepEqual(write, { revision: 1, state: 'revoked' });
    assert.equal(h.$('jobState').textContent, OWNER_COPY.revoked);
    assert.equal(h.$('revokeLink').disabled, true);
    assert.equal(h.$('linkBox').hidden, true);
    assert.equal(h.$('confirmDialog').open, false);
  } finally { h.dom.window.close(); }
});

test('owner preview opens without a partner token and never exposes payout cap or canonical ID', async () => {
  const h = await harness();
  try {
    const initialWrites=h.calls.filter(c=>c.method&&c.method!=='GET').length;
    assert.equal(h.$('partnerPreviewDialog').open,false);
    h.$('previewPartner').click();
    assert.equal(h.$('partnerPreviewDialog').open,true);
    const preview=h.$('partnerPreviewScreen');
    assert.match(preview.textContent,/Example Studio/);
    assert.match(preview.textContent,/1200|1,200/);
    assert.match(preview.textContent,/ยังไม่มีโมเดลที่เปอร์เปิดให้เลือก/);
    assert.doesNotMatch(preview.textContent,/payoutCap|700|canonicalModelId|rec12345678901234/);
    assert.equal(h.calls.filter(c=>c.method&&c.method!=='GET').length,initialWrites);
    assert.ok(!h.dom.window.document.querySelector('#partnerPreviewScreen a'));
    assert.equal(h.errors.length,0);
  } finally { h.dom.window.close(); }
});

test('owner preview only renders approved shortlist media with full-card fit, no source fields', async () => {
  const item=fixture();
  item.models=[{id:MODEL,name:'Approved Model',code:'P01',height:179,weight:73,format:'VIP',status:'pending',canonicalModelId,
    photos:[{id:PHOTO,shareAllowed:true,previewPath:base+'/'+ID+'/media/'+PHOTO}]}];
  const h=await harness({item});
  try {
    h.$('previewPartner').click();
    const p=h.$('partnerPreviewScreen'),photo=p.querySelector('.pp-cover img');
    assert.ok(photo);
    assert.equal(photo.getAttribute('src'),base+'/'+ID+'/media/'+PHOTO);
    assert.match(p.textContent,/Approved Model/);
    assert.doesNotMatch(p.textContent,/rec12345678901234|payoutCap|ownerOnly/);
    assert.match(renderOwnerPage('nonce'),/\.pp-cover img\{[^}]*object-fit:contain/);
    assert.equal(h.errors.length,0);
  } finally { h.dom.window.close(); }
});

test("job owner can open every available preview at once, without enabling downloads",async()=>{
  const h=await harness();
  try{
    await h.choose();
    assert.equal(h.$('selectAllPhotos').disabled,false);
    assert.equal(h.dom.window.document.querySelectorAll('#photos .check input').length,4);
    h.$('selectAllPhotos').click();
    const choices=[...h.dom.window.document.querySelectorAll('#photos .check input')];
    assert.deepEqual(choices.map(x=>x.checked),[true,false,true,false]);
    assert.equal(h.$('historyReviewed').checked,false);
    assert.equal(h.$('importModel').disabled,true);
    h.toggle(h.$('historyReviewed'),true);
    assert.equal(h.$('importModel').disabled,false);
    assert.match(h.$('photoCount').textContent,/2 \/ 30/);
    assert.equal(h.errors.length,0);
  }finally{h.dom.window.close();}
});
test("job-specific excluded model is absent from owner search without modifying canonical registry",async()=>{
  const item=fixture();
  item.ownerOnly.excludedCanonicalModelIds=[canonicalModelId];
  const h=await harness({item});
  try{
    h.$('addModel').click();h.$('search').value='Sample Model';
    h.$('searchForm').dispatchEvent(new h.dom.window.Event('submit',{bubbles:true,cancelable:true}));
    await flush();
    assert.equal(h.dom.window.document.querySelectorAll('.search-result').length,0);
    assert.match(h.$('searchResults').textContent,/ไม่พบ/);
    assert.equal(h.errors.length,0);
  }finally{h.dom.window.close();}
});
