import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { digest } from './admin-held-viewer-code-only.mjs';
import {
  OLD_ENDED_COPY, NEUTRAL_COPY, neutralizeEndedCopy, reviewedSources,
  carrierWrapper, patchCareBackPoster, validateExpectedInputs,
  verifyPosterAssets,
} from './kenji-care-back-poster-release.mjs';

// Missing real runtime evidence is an error, never a skipped test or a synthetic replacement.
const REVIEWED = reviewedSources();
const { source, manifest, helper } = REVIEWED;
const actualReply = text => new Function(`${text}\nreturn careBackOctoberReply;`)();
const beforeReply = actualReply(source.careBackOctoberReply);
const afterReply = actualReply(neutralizeEndedCopy(source.careBackOctoberReply));
const NOW = Date.parse('2026-10-31T22:00:00+07:00');

function wrappedSender(now) {
  class FixtureDate extends Date { static now() { return now; } }
  // Only network delivery is replaced by a capture. The actual campaign function
  // and the exact injected helper/wrapper execute unchanged.
  return new Function('Date', `${neutralizeEndedCopy(source.careBackOctoberReply)}\n${helper}\n` +
    `async function sendReplyBeforeCareBackPoster(...args) { return args; }\n` +
    `${carrierWrapper(manifest.poster)}\nreturn sendReply;`)(FixtureDate);
}

test('actual campaign function changes only the post-wave text; personal and unsupported requests stay excluded', () => {
  const intents = ['promotion_overview', 'care_back_overview', 'care_back_dates', 'care_back_new_member',
    'care_back_new_standard', 'care_back_new_premium', 'care_back_current_member', 'care_back_expired_member',
    'care_back_membership_price', 'model_lookup', 'checkpts', 'care_back_personal_status', ''];
  const messages = ['', 'โปรอะไร', 'สลิป', 'โอนแล้ว', 'ของผม', 'ผมได้สิทธิ์ไหม', 'Black Card', 'VIP'];
  for (const now of [Date.parse('2026-10-30T12:00:00+07:00'), NOW,
    Date.parse('2026-11-01T00:00:00+07:00'), Date.parse('2026-12-31T12:00:00+07:00')]) {
    for (const intent of intents) for (const text of messages) {
      const before = beforeReply(intent, text, now), after = afterReply(intent, text, now);
      if (before?.text === OLD_ENDED_COPY) {
        assert.deepEqual(after, { ...before, text: NEUTRAL_COPY });
        assert.doesNotMatch(after.text, /31.*ธ|ธันวาคม|December|หมดสิทธิ์|หมดเขต|สิ้นสุด/);
      } else assert.deepEqual(after, before);
    }
  }
});

test('actual campaign reply reaches the existing fifth-argument carrier as text, image, CTA', async () => {
  const approved = beforeReply('care_back_overview', '', NOW);
  const cta = `${approved.label} → ${approved.route}`;
  const env = { marker: 'unchanged-env' }, quickReply = { items: [] };
  for (const separator of ['\n', '\n\n']) {
    const result = await wrappedSender(NOW)(env, 'fixture-reply-token', `${approved.text}${separator}${cta}`, quickReply);
    assert.equal(result[0], env);
    assert.equal(result[1], 'fixture-reply-token');
    assert.equal(result[2], approved.text);
    assert.equal(result[3], quickReply);
    assert.deepEqual(result[4], [
      { type: 'image', originalContentUrl: manifest.poster.url, previewImageUrl: manifest.poster.preview_url },
      { type: 'text', text: cta, quickReply: { items: [{ type: 'action', action: { type: 'uri', label: approved.label, uri: approved.route } }] } },
    ]);
  }
});

test('actual recovered sender serializes three messages and the existing URI CTA button', async () => {
  class FixtureDate extends Date { static now() { return NOW; } }
  let captured;
  const captureFetch = async (url, init) => {
    assert.equal(url, 'https://api.line.me/v2/bot/message/reply');
    assert.equal(init.method, 'POST');
    captured = JSON.parse(init.body);
    return { ok: true, status: 200 };
  };
  // All normalizer inputs here are already bounded plain strings. The primitive
  // identity normalizer is a test dependency; the recovered sender body itself
  // and its serialization are executed verbatim, with only fetch intercepted.
  const sender = new Function('Date', 'fetch', 'text28', 'LINE_REPLY_URL3', 'EMS_ALBUMS_URL', 'GWS_ALBUMS_URL',
    `${neutralizeEndedCopy(source.careBackOctoberReply)}\n${helper}\n` +
    `${source.sendReply.replace('async function sendReply(', 'async function sendReplyBeforeCareBackPoster(')}\n` +
    `${carrierWrapper(manifest.poster)}\nreturn sendReply;`)(FixtureDate, captureFetch,
      value => { assert.equal(typeof value, 'string'); return value; },
      'https://api.line.me/v2/bot/message/reply', 'https://example.test/ems', 'https://example.test/gws');
  const approved = beforeReply('care_back_overview', '', NOW);
  const cta = `${approved.label} → ${approved.route}`;
  assert.deepEqual(await sender({ LINE_CHANNEL_ACCESS_TOKEN: 'fixture-token' }, 'fixture-reply', `${approved.text}\n${cta}`), { ok: true, status: 200 });
  assert.equal(captured.replyToken, 'fixture-reply');
  assert.deepEqual(captured.messages, [
    { type: 'text', text: approved.text },
    { type: 'image', originalContentUrl: manifest.poster.url, previewImageUrl: manifest.poster.preview_url },
    { type: 'text', text: cta, quickReply: { items: [{ type: 'action', action: { type: 'uri', label: approved.label, uri: approved.route } }] } },
  ]);
  assert.ok(approved.label.length <= 20);
});

test('public asset readback requires successful HTTPS response, exact type, size and digest without sending a LINE message', async () => {
  const original = new Uint8Array([1, 2, 3]), preview = new Uint8Array([4, 5]);
  const poster = { url: 'https://example.test/original.png', content_size: original.length, content_type: 'image/png', content_sha256: digest(original),
    preview_url: 'https://example.test/preview.jpg', preview_size: preview.length, preview_content_type: 'image/jpeg', preview_sha256: digest(preview) };
  const request = async (url, init) => {
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error');
    return new Response(url === poster.url ? original : preview, { headers: { 'content-type': url === poster.url ? 'image/png' : 'image/jpeg' } });
  };
  assert.equal((await verifyPosterAssets(poster, request)).every(item => item.verified), true);
  await assert.rejects(verifyPosterAssets({ ...poster, preview_sha256: '0'.repeat(64) }, request), /digest mismatch/);
  await assert.rejects(verifyPosterAssets({ ...poster, preview_size: 999 }, request), /byte count mismatch/);
  await assert.rejects(verifyPosterAssets({ ...poster, preview_content_type: 'image/png' }, request), /content type mismatch/);
  await assert.rejects(verifyPosterAssets(poster, async () => new Response('missing', { status: 404 })), /publicly readable/);
});

test('carrier preserves all original arguments for nonmatching text, Checkpts, Models and existing extras', async () => {
  const sender = wrappedSender(NOW);
  for (const text of ['checkpts', 'ชื่อ Model และราคา', 'สถานะสมาชิกพร้อม Points', 'ข้อความหลังรับสลิป']) {
    const env = {}, quick = { items: ['existing'] }, extra = [{ type: 'image', originalContentUrl: 'https://example.test/existing.png' }];
    const input = [env, 'reply-token', text, quick, extra, 'retained-extra-argument'];
    const output = await sender(...input);
    assert.deepEqual(output, input);
    for (let i = 0; i < input.length; i++) assert.equal(output[i], input[i]);
  }
  const approved = beforeReply('care_back_overview', '', NOW);
  const args = [{}, 'reply-token', `${approved.text}\n${approved.label} → ${approved.route}`, null, [{ type: 'text', text: 'existing' }]];
  assert.deepEqual(await sender(...args), args);
});

test('after Bangkok midnight actual sender emits neutral text and one current-route CTA button without an image', async () => {
  const now = Date.parse('2026-11-01T00:00:00+07:00');
  const reply = afterReply('care_back_overview', '', now);
  const cta = `${reply.label} → ${reply.route}`;
  const text = `${reply.text}\n${cta}`;
  class FixtureDate extends Date { static now() { return now; } }
  let captured;
  const sender = new Function('Date', 'fetch', 'text28', 'LINE_REPLY_URL3', 'EMS_ALBUMS_URL', 'GWS_ALBUMS_URL',
    `${neutralizeEndedCopy(source.careBackOctoberReply)}\n${helper}\n` +
    `${source.sendReply.replace('async function sendReply(', 'async function sendReplyBeforeCareBackPoster(')}\n` +
    `${carrierWrapper(manifest.poster)}\nreturn sendReply;`)(FixtureDate,
      async (_url, init) => { captured = JSON.parse(init.body); return { ok: true, status: 200 }; },
      value => { assert.equal(typeof value, 'string'); return value; },
      'https://api.line.me/v2/bot/message/reply', 'https://example.test/ems', 'https://example.test/gws');
  assert.deepEqual(await sender({ LINE_CHANNEL_ACCESS_TOKEN: 'fixture-token' }, 'fixture-reply', text), { ok: true, status: 200 });
  assert.deepEqual(captured.messages, [
    { type: 'text', text: NEUTRAL_COPY },
    { type: 'text', text: cta, quickReply: { items: [{ type: 'action', action: { type: 'uri', label: reply.label, uri: reply.route } }] } },
  ]);
  assert.equal(captured.messages.some(message => message.type === 'image'), false);
  assert.equal(reply.text, NEUTRAL_COPY);
  assert.equal(reply.route, beforeReply('care_back_overview', '', now).route);
  const stale = beforeReply('care_back_overview', '', NOW);
  const staleArgs = [{}, 'reply-token', `${stale.text}\n${stale.label} → ${stale.route}`];
  assert.deepEqual(await wrappedSender(now)(...staleArgs), staleArgs);
});

const PREFIX = 'const retainedPriceGate = "ready:d.size>=2";\n';
const SUFFIX = '\nconst retainedCheckptsAndOwnerPolicy = "unchanged";\n';
const MODULE = PREFIX + source.sendReply + '\n' + source.careBackOctoberReply + SUFFIX;

test('only two reviewed function locations change, retaining the actual carrier body and every unrelated byte', () => {
  const result = patchCareBackPoster(MODULE, digest(MODULE));
  assert.ok(result.code.startsWith(PREFIX));
  assert.ok(result.code.endsWith(SUFFIX));
  assert.ok(result.code.includes(source.sendReply.replace('async function sendReply(', 'async function sendReplyBeforeCareBackPoster(')));
  assert.equal(result.preservation.unrelated_runtime_bytes_unchanged, true);
  assert.equal(result.preservation.existing_carrier_body_unchanged, true);
  assert.equal(result.preservation.model_pricing_and_checkpts_unchanged, true);
  assert.equal(result.preservation.eligibility_unchanged, true);
  assert.equal(result.preservation.poster_content_sha256, 'd68fb1a288cf9f0bbd3f8cb300017c49a3939bbb8bb529be71ff5303755ca87e');
  assert.doesNotThrow(() => new Function(result.code));
});

test('whole-module drift, missing or duplicate functions, changed copy and repeated overlay stop', () => {
  assert.throws(() => patchCareBackPoster(MODULE, ''), /whole-module SHA-256/);
  assert.throws(() => patchCareBackPoster(MODULE + ' ', digest(MODULE)), /whole-module drift/);
  for (const changed of [MODULE.replace(source.sendReply, ''), MODULE + source.careBackOctoberReply]) {
    assert.throws(() => patchCareBackPoster(changed, digest(changed)), /exact reviewed function/);
  }
  const patched = patchCareBackPoster(MODULE, digest(MODULE)).code;
  assert.throws(() => patchCareBackPoster(patched, digest(patched)), /already exists/);
  assert.throws(() => neutralizeEndedCopy('function careBackOctoberReply() { return null; }'), /copy required once/);
});

test('release requires reviewed active identifiers and both module and function-pair digests', () => {
  const env = { EXPECTED_VERSION: '11111111-1111-4111-8111-111111111111',
    EXPECTED_DEPLOYMENT: '22222222-2222-4222-8222-222222222222', EXPECTED_MODULE: 'worker.js',
    EXPECTED_MODULE_SHA256: digest(MODULE), EXPECTED_FUNCTIONS_SHA256: REVIEWED.functionsDigest };
  assert.equal(validateExpectedInputs(env).functionsDigest, REVIEWED.functionsDigest);
  for (const key of Object.keys(env)) assert.throws(() => validateExpectedInputs({ ...env, [key]: '' }));
  assert.throws(() => validateExpectedInputs({ ...env, EXPECTED_MODULE: 'other.js' }), /worker.js/);
});

test('workflow retains protected main-only approval, exact source SHA and the existing code-only release', () => {
  const workflow = readFileSync(new URL('../.github/workflows/deploy-kenji-care-back-poster.yml', import.meta.url), 'utf8');
  assert.match(workflow, /environment: mmd-production-mutation/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /inputs\.approved_sha == github\.sha/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/admin-production-approval\.yml/);
  assert.match(workflow, /needs: \[production-approval, contracts\]/);
  assert.match(workflow, /EXPECTED_FUNCTIONS_SHA256/);
  assert.doesNotMatch(workflow, /^\s*(push|schedule|workflow_run):/m);
  assert.doesNotMatch(workflow.split('  production-approval:')[0], /secrets\./);
  assert.doesNotMatch(workflow, /wrangler(?:@[^ ]+)? (?:deploy|versions upload)|mms-worker|route[_ -]sync/);
});
