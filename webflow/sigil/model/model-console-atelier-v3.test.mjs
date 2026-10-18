import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { buildConsoleEmbed, assetManifest } from '../../../scripts/build-model-console-atelier-embed.mjs';
const base = new URL('./console-atelier/', import.meta.url);
const skin = fs.readFileSync(new URL('./model-console-atelier-v3.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('./model-console-atelier-v3.css', import.meta.url), 'utf8');
test('decorative SVG is vector-only, accessible and inside individual/aggregate budgets', () => {
  const limits = [8192, 6144, 6144, 4096, 12288];
  const viewBoxes = ['240 144', '240 96', '240 112', '160 96'];
  const manifest = assetManifest();
  manifest.files.forEach((entry, index) => {
    const text = fs.readFileSync(new URL(entry.file, base), 'utf8');
    assert.equal(Buffer.byteLength(text), entry.bytes);
    assert.ok(entry.bytes <= limits[index]);
    assert.doesNotMatch(text, /<script|\bon\w+=|foreignObject|<image|base64|href=|<text|<font/i);
    if (index < 4) {
      assert.ok(text.includes('viewBox="0 0 ' + viewBoxes[index] + '"'));
      assert.match(text, /aria-hidden="true" focusable="false"/);
      assert.match(text, /pointer-events:none/);
    } else {
      for (const match of text.matchAll(/<symbol[^>]*>.*?<\/symbol>/gs)) assert.ok(Buffer.byteLength(match[0]) <= 2048);
    }
  });
  assert.ok(manifest.files.slice(0, 4).reduce((n, file) => n + file.bytes, 0) <= 24576);
});
test('bundle contains presentation and existing runtime without new endpoints or external SVG requests', () => {
  const bundle = buildConsoleEmbed();
  const js = bundle.match(/<script>([\s\S]*)<\/script>/)[1];
  new vm.Script(js);
  assert.match(bundle, /consoleAtelierAssets=/);
  assert.match(bundle, /function renderConsoleAtelier/);
  assert.doesNotMatch(skin, /fetch\(|XMLHttpRequest|localStorage|location\.|allowed_actions\s*=/);
});
test('skin never changes the Console background image, brightness or opacity', () => {
  assert.doesNotMatch(css, /url\(|filter:|brightness|::before|::after/);
  assert.match(css, /opacity:\.10/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /focus-visible/);
});
test('only a backend lane selects Public/Private; status and icons cannot grant actions', () => {
  assert.match(skin, /const lane = consoleAtelierLane\(session\)/);
  assert.doesNotMatch(skin, /URLSearchParams|start_work\s*\(|\.click\(|\.submit\(/);
  assert.match(skin, /session === null/);
  assert.match(skin, /content.append\(node\)/);
  assert.match(skin, /querySelector\('\[data-session-id\]'\)\?\.closest/);
  assert.match(skin, /\[data-model-extension-request\],\[data-model-payment-alert\]/);
});

test('canonical model lanes map correctly and conflicting money lanes stay neutral', () => {
  const code = skin.slice(skin.indexOf('function consoleAtelierLane'), skin.indexOf('function renderConsoleAtelier'));
  const lane = vm.runInNewContext(code + ';consoleAtelierLane');
  assert.equal(lane({ session_id: 'fixture', model_work_lane: 'public_model' }), 'public');
  assert.equal(lane({ session_id: 'fixture', model_work_lane: 'private_model' }), 'private');
  assert.equal(lane({ session_id: 'fixture', model_work_lane: 'private_model', payout_terms: { money_lane: 'public_model' } }), 'neutral');
  for (const session of [null, {}, { model_work_lane: 'private_model' }, { session_id: 'fixture', model_work_lane: 'private' }, { session_id: 'fixture', welcome_context: { model_lane: 'private' } }]) assert.equal(lane(session), 'neutral');
});

test('error and malformed responses cannot produce an empty-session illustration', async () => {
  const runtime = fs.readFileSync(new URL('./model-console-v3-i18n.js', import.meta.url), 'utf8');
  const code = runtime.slice(runtime.indexOf('async function load()'), runtime.indexOf('async function act(a)'));
  for (const body of [{ ok: false, session: null }, {}, { ok: true }, { ok: true, session: {} }, { ok: true, session: [] }, { ok: true, session: null }]) {
    let renders = 0;
    const context = {
      busy: false, R: { dataset: { currentEndpoint: '/v1/model/session/current' } },
      lock() {}, view() {}, chip() {}, modeCopy() {}, d: () => ({}), render: () => { renders++; },
      AbortController, setTimeout, clearTimeout,
      fetch: async () => ({ status: 200, ok: true }), j: async () => body,
    };
    await vm.runInNewContext(code + ';load()', context);
    assert.equal(renders, body.ok === true && body.session === null ? 1 : 0);
  }
});

test('two simultaneous taps produce only one synthetic action request', async () => {
  const runtime = fs.readFileSync(new URL('./model-console-v3-i18n.js', import.meta.url), 'utf8');
  const code = runtime.slice(runtime.indexOf('async function act(a)'), runtime.indexOf('function support(k)'));
  let count = 0, release;
  const pending = new Promise(resolve => { release = resolve; });
  const context = {
    busy: false, ses: { state: 'confirmed', allowed_actions: ['start_travel'] },
    next: { confirmed: ['start_travel'] }, state: session => session.state,
    R: { dataset: { actionEndpoint: '/v1/model/session/action' } },
    lock: busy => { context.busy = Boolean(busy); }, note() {}, load: async () => {},
    v: () => 'sess_SYNTHETIC_ONLY', d: () => ({}), j: async () => ({ ok: true }),
    fetch: async () => { count++; await pending; return { ok: true }; },
  };
  const act = vm.runInNewContext(code + ';act', context);
  const first = act('start_travel');
  await act('start_travel');
  assert.equal(count, 1);
  assert.equal(context.busy, true);
  release(); await first;
  assert.equal(context.busy, false);
});
