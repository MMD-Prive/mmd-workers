import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { buildConsoleEmbed, assetManifest } from '../../../scripts/build-model-console-atelier-embed.mjs';
const base = new URL('./console-atelier/', import.meta.url);
const skin = fs.readFileSync(new URL('./model-console-atelier-v3.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('./model-console-atelier-v3.css', import.meta.url), 'utf8');
test('LINE recovery CTA overrides inherited muted text fill without changing auth or other buttons', () => {
  const selector = '#sigil-model-console-v3[data-console-atelier] [data-model-console-line-return]';
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)].filter(([, s]) => s.trim().endsWith(selector));
  assert.equal(rules.length, 1);
  assert.equal(rules[0][2], 'color:#17120b!important;-webkit-text-fill-color:#17120b!important');
  const runtime = fs.readFileSync(new URL('./model-console-v3-i18n.js', import.meta.url), 'utf8');
  assert.match(runtime, /background:#e3bd7c;color:#17120b/);
  const luminance = hex => hex.match(/../g).map(n => parseInt(n, 16) / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
  assert.ok((luminance('e3bd7c') + .05) / (luminance('17120b') + .05) >= 4.5);
  assert.ok(buildConsoleEmbed().includes('data-model-console-line-return'));
});
test('legacy payout text overrides are confined to Public financial disclosures', () => {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]+)\}/g)].filter(([, selector]) => selector.includes('details :is(.smcv3-payout-only,[data-model-payout-row])'));
  assert.equal(rules.length, 2);
  for (const [, selector, declarations] of rules) {
    assert.equal((selector.match(/\[data-console-lane="public"\] details/g) || []).length, selector.includes(' *') ? 2 : 1);
    assert.doesNotMatch(selector, /payment-alert|extension-request/);
    assert.match(declarations, /color:var\(--ca-(ink|muted)\)!important/);
    assert.match(declarations, /-webkit-text-fill-color:var\(--ca-(ink|muted)\)!important/);
    assert.equal(declarations.split(';').filter(Boolean).length, 2);
  }
  for (const role of ['__label', '__status', '__note', '__title', '__row span', '__foot', '__lock', '.smcv3-label']) assert.ok(rules[1][1].includes(role));
});

test('Public financial ink and secondary text meet 4.5:1 against the actual panel token', () => {
  const palette = css.match(/\[data-console-lane="public"\]\{([^}]+)\}/)[1];
  const token = name => palette.match(new RegExp('--ca-' + name + ':(#[A-Fa-f0-9]{6})'))[1];
  const luminance = hex => hex.slice(1).match(/../g).map(n => parseInt(n, 16) / 255).map(n => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
  const background = luminance(token('panel'));
  for (const role of ['ink', 'muted']) {
    const foreground = luminance(token(role));
    const ratio = (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05);
    assert.ok(ratio >= 4.5, `${role} contrast ${ratio.toFixed(2)}:1`);
  }
});
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
  const code = runtime.slice(runtime.indexOf('async function load()'), runtime.indexOf('async function act(a,proposal)'));
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
  const code = runtime.slice(runtime.indexOf('async function act(a,proposal)'), runtime.indexOf('function support(k)'));
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
