// Exact five-function update of the reviewed active Kenji artifact. Never rebuild main.
// Prerequisite membership/payment changes are released and verified separately before this operation.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import {
  activeVersion, releaseCurrentSession, uploadMetadata, validateSourceState, versionConfiguration,
} from './admin-current-session-code-only.mjs';
import { digest, parseWranglerVersion } from './admin-held-viewer-code-only.mjs';
import { verifyProductionApproval } from './admin-production-approval.mjs';
import { inspectEnvironment } from './admin-production-validation.mjs';
import {
  ROOT, MODULE_NAME, transport, readActiveModule, overlayBuildEvidence,
} from './kenji-owner-price-chat-count-release.mjs';

const REPLY_FIXTURE = new URL('../member-dashboard-chat-worker/test/fixtures/kenji-care-back-reply-live-20261031.txt', import.meta.url);
const REPLY_SOURCE = new URL('../member-dashboard-chat-worker/src/kenji-care-back-october.mjs', import.meta.url);
const POSTER_SOURCE = new URL('../member-dashboard-chat-worker/src/kenji-care-back-poster.mjs', import.meta.url);
const PROJECTIONS_FIXTURE = new URL('./fixtures/care-back-november-kenji-projections-20261101.json', import.meta.url);
const REVIEWED_FUNCTIONS = ['careBackOctoberReply', 'careBackPosterMessages', 'boundedTruth', 'buildKenjiLiveTruthDecision', 'renderLineRightsCheck'];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const OLD_ENDED_COPY = 'CARE BACK รอบนี้สิ้นสุดวันที่ 31 ต.ค. 2569 แล้วครับ กดตรวจข้อเสนอล่าสุดได้เลย';
const NEUTRAL_COPY = 'กดตรวจข้อเสนอและสิทธิ์ล่าสุดจากบัญชีเดิมได้เลยครับ';
export const HISTORICAL_REPLY_SHA256 = '91e416707f459eae84fefd334ff4644268134a269bd675aed43021fc65ef635a';
export const BASELINE_REPLY_SHA256 = 'e5bfe71d93a5e7abb9a7c4014826881c6470d6aa4fcfeca642346521f51d82e3';
export const BASELINE_POSTER_SHA256 = '722423c59ab3e5a3eec7faff5e300123d46293fd0986bbf577e35cdc98abb75d';
// Exact function bytes injected by #2931; retained separately from the new source.
// A fresh active-module comparison is mandatory before either inspection succeeds or upload begins.
const BASELINE_POSTER = "function careBackPosterMessages(text, extraMessages, approvedReply, poster, now = Date.now()) {\n  const start = Date.parse('2026-10-31T00:00:00+07:00');\n  const end = Date.parse('2026-11-01T00:00:00+07:00');\n  if (!Number.isFinite(now) || now < start || typeof text !== 'string') return null;\n  if (extraMessages !== undefined && (!Array.isArray(extraMessages) || extraMessages.length !== 0)) return null;\n  if (!approvedReply || typeof approvedReply.text !== 'string' || !approvedReply.text ||\n      typeof approvedReply.label !== 'string' || !approvedReply.label ||\n      typeof approvedReply.route !== 'string' || !approvedReply.route ||\n      approvedReply.label.length > 20 || approvedReply.route.length > 1000) return null;\n  const cta = `${approvedReply.label} → ${approvedReply.route}`;\n  // These are the two existing common/Sales V2 renderings. No keyword matching.\n  if (text !== `${approvedReply.text}\\n${cta}` && text !== `${approvedReply.text}\\n\\n${cta}`) return null;\n  const ctaMessage = { type: 'text', text: cta, quickReply: { items: [{\n    type: 'action', action: { type: 'uri', label: approvedReply.label, uri: approvedReply.route },\n  }] } };\n  if (now >= end) {\n    // The public announcement has ended. Only this exact neutral navigation\n    // remains eligible for a button; stale advertising is never decorated.\n    if (approvedReply.text !== 'กดตรวจข้อเสนอและสิทธิ์ล่าสุดจากบัญชีเดิมได้เลยครับ' ||\n        approvedReply.route !== 'https://miniapp.line.me/2010862595-yT4DCEMc/?intent=status&view=overview' ||\n        approvedReply.label !== 'ตรวจข้อเสนอล่าสุด') return null;\n    return { text: approvedReply.text, extra_messages: [ctaMessage] };\n  }\n  let imageUrl, previewUrl;\n  try {\n    const images = [new URL(poster.url), new URL(poster.preview_url)];\n    if (images.some(image => image.protocol !== 'https:' || image.username || image.password || image.hash || image.search)) return null;\n    [imageUrl, previewUrl] = images.map(image => image.href);\n  } catch { return null; }\n  return {\n    text: approvedReply.text,\n    extra_messages: [\n      { type: 'image', originalContentUrl: imageUrl, previewImageUrl: previewUrl },\n      ctaMessage,\n    ],\n  };\n}";
const sort = value => Array.isArray(value) ? value.map(sort) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])])) : value;
const canonical = value => JSON.stringify(sort(value));

function uniqueOffset(code, marker, reason) {
  const at = code.indexOf(marker);
  assert.ok(at >= 0 && code.indexOf(marker, at + marker.length) === -1, reason);
  return at;
}

function reconstructReleasedReply() {
  const original = readFileSync(REPLY_FIXTURE, 'utf8').replace(/\n$/, '');
  assert.equal(digest(original), HISTORICAL_REPLY_SHA256, 'historical reply fixture drift');
  const matches = [...original.matchAll(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g)]
    .filter(match => {
      try { return new Function('return (' + match[0] + ');')() === OLD_ENDED_COPY; }
      catch { return false; }
    });
  assert.equal(matches.length, 1, 'exact historic ended-copy literal required once');
  const match = matches[0];
  const result = original.slice(0, match.index) + JSON.stringify(NEUTRAL_COPY) +
    original.slice(match.index + match[0].length);
  assert.equal(digest(result), BASELINE_REPLY_SHA256, 'reviewed released reply drift');
  return result;
}

function standaloneSource(file, name) {
  const raw = readFileSync(file, 'utf8');
  const marker = 'export function ' + name + '(';
  const start = uniqueOffset(raw, marker, 'reviewed source function required once: ' + name);
  // Both reviewed functions are the final declaration in their respective small source files.
  const source = raw.slice(start).replace(/^export /, '').trimEnd();
  assert.equal(source.includes('export '), false, 'standalone function required: ' + name);
  assert.ok(source.endsWith('\n}'), 'complete standalone function required: ' + name);
  const callable = new Function(source + '\nreturn ' + name + ';')();
  assert.equal(typeof callable, 'function', 'reviewed replacement must be callable');
  return source;
}

export function reviewedSources() {
  const baseline = {
    careBackOctoberReply: reconstructReleasedReply(),
    careBackPosterMessages: BASELINE_POSTER,
  };
  assert.equal(digest(baseline.careBackPosterMessages), BASELINE_POSTER_SHA256, 'reviewed released poster helper drift');
  const replacement = {
    careBackOctoberReply: standaloneSource(REPLY_SOURCE, 'careBackOctoberReply'),
    careBackPosterMessages: standaloneSource(POSTER_SOURCE, 'careBackPosterMessages'),
  };
  const projections = JSON.parse(readFileSync(PROJECTIONS_FIXTURE, 'utf8'));
  assert.equal(projections.schema, 'care_back_november_kenji_projections_v1');
  assert.deepEqual(projections.patches.map(p => p.id), REVIEWED_FUNCTIONS.slice(2));
  for (const pair of projections.patches) {
    assert.equal(digest(pair.before), pair.before_sha256, 'recovered projection baseline drift');
    assert.equal(digest(pair.after), pair.after_sha256, 'reviewed projection replacement drift');
    assert.equal(typeof new Function('return (' + pair.after + ');')(), 'function');
    baseline[pair.id] = pair.before;
    replacement[pair.id] = pair.after;
  }
  const functions = Object.fromEntries(Object.keys(baseline).map(name => [name, {
    before_sha256: digest(baseline[name]), after_sha256: digest(replacement[name]),
  }]));
  for (const name of Object.keys(baseline)) assert.notEqual(replacement[name], baseline[name], 'reviewed November change required: ' + name);
  // Validate the public time range and no-image delivery using the actual replacements.
  const reply = new Function(replacement.careBackOctoberReply + '\nreturn careBackOctoberReply;')();
  const decorate = new Function(replacement.careBackPosterMessages + '\nreturn careBackPosterMessages;')();
  const november = Date.parse('2026-11-01T00:00:00+07:00');
  const december = Date.parse('2026-12-01T00:00:00+07:00');
  const answer = reply('care_back_overview', '', november);
  assert.match(answer?.text || '', /30 พ.ย. 2569/);
  assert.match(answer.text, /สมาชิกปัจจุบันต่ออายุล่วงหน้า รับเพิ่ม 6 เดือน/);
  assert.match(answer.text, /หมดอายุไม่เกิน 6 เดือน สมัครแล้วรับเพิ่ม 6 เดือน/);
  assert.match(answer.text, /หมดอายุเกิน 6 เดือน รับเพิ่ม 6 เดือน/);
  assert.doesNotMatch(answer.text, /31 ธ.ค.|สิ้นปี|180 วัน|เพิ่ม 1 ปี/);
  assert.equal(reply('care_back_overview', '', december).text, NEUTRAL_COPY);
  const decorated = decorate(answer.text + '\n' + answer.label + ' → ' + answer.route, [], answer, null, november);
  assert.equal(decorated?.extra_messages?.length, 1, 'reviewed November CTA required');
  assert.equal(decorated.extra_messages[0].type, 'text', 'no dated image in November');
  return { baseline, replacement, functions, functionsDigest: digest(canonical(functions)) };
}

export function patchCareBackNovember(code, expectedModuleDigest, reviewed = reviewedSources()) {
  assert.match(expectedModuleDigest || '', SHA256, 'reviewed whole-module SHA-256 required');
  assert.equal(digest(code), expectedModuleDigest, 'reviewed whole-module drift');
  uniqueOffset(code, 'async function sendReplyBeforeCareBackPoster(', 'reviewed existing sender must occur once');
  uniqueOffset(code, 'async function sendReply(...args)', 'reviewed existing wrapper must occur once');
  let candidate = code;
  for (const name of REVIEWED_FUNCTIONS) {
    uniqueOffset(candidate, reviewed.baseline[name], 'exact reviewed baseline function must occur once: ' + name);
    candidate = candidate.replace(reviewed.baseline[name], () => reviewed.replacement[name]);
  }
  let restored = candidate;
  for (const name of REVIEWED_FUNCTIONS) {
    uniqueOffset(restored, reviewed.replacement[name], 'replacement must occur once: ' + name);
    restored = restored.replace(reviewed.replacement[name], () => reviewed.baseline[name]);
  }
  assert.equal(restored, code, 'unrelated runtime bytes changed');
  return { code: candidate, preservation: {
    baseline_sha256: digest(code), candidate_sha256: digest(candidate),
    functions: [...REVIEWED_FUNCTIONS],
    functions_sha256: reviewed.functionsDigest, function_digests: reviewed.functions,
    unrelated_runtime_bytes_unchanged: true, existing_carrier_body_unchanged: true,
    existing_wrapper_unchanged: true, model_pricing_and_checkpts_unchanged: true,
    membership_and_payment_eligibility_unchanged: true,
    announcement_starts_at: '2026-11-01T00:00:00+07:00',
    announcement_ends_before: '2026-12-01T00:00:00+07:00',
    october_poster_stops_at: '2026-11-01T00:00:00+07:00',
    november_media: 'text_and_existing_uri_cta_only',
  } };
}

export function validateExpectedInputs(env, reviewed = reviewedSources()) {
  assert.match(env.EXPECTED_VERSION || '', UUID, 'fresh active version required');
  assert.match(env.EXPECTED_DEPLOYMENT || '', UUID, 'fresh active deployment required');
  assert.equal(env.EXPECTED_MODULE, MODULE_NAME, 'single worker.js module required');
  assert.match(env.EXPECTED_MODULE_SHA256 || '', SHA256, 'reviewed complete module digest required');
  assert.equal(env.EXPECTED_FUNCTIONS_SHA256, reviewed.functionsDigest, 'reviewed baseline and replacement pair required');
  return { version: env.EXPECTED_VERSION, deployment: env.EXPECTED_DEPLOYMENT,
    moduleName: MODULE_NAME, moduleDigest: env.EXPECTED_MODULE_SHA256,
    functionsDigest: reviewed.functionsDigest };
}

export async function inspectBaseline(io, reviewed = reviewedSources()) {
  await io.approve();
  const get = suffix => io.call(ROOT + suffix);
  const deployment = (await get('/deployments'))?.deployments?.[0];
  const versionId = activeVersion(deployment);
  const version = await get('/versions/' + versionId);
  assert.equal(version.id, versionId, 'inspection version mismatch');
  const configDigest = digest(canonical(versionConfiguration(version)));
  assert.equal((await get('/versions'))?.items?.[0]?.id, versionId, 'latest upload differs from active');
  const module = await io.readModule();
  assert.equal(module.name, MODULE_NAME, 'unexpected active module name');
  const candidate = patchCareBackNovember(module.code, digest(module.code), reviewed);
  assert.equal(canonical((await get('/deployments'))?.deployments?.[0]), canonical(deployment), 'deployment changed during inspection');
  assert.equal((await get('/versions'))?.items?.[0]?.id, versionId, 'latest upload changed during inspection');
  assert.equal(digest(canonical(versionConfiguration(await get('/versions/' + versionId)))), configDigest, 'configuration changed');
  await io.approve();
  return { schema: 'kenji-care-back-november-inspection.v1', production_mutation: false,
    worker: 'member-dashboard-chat-worker', source_sha: io.sha, inspected_at: io.now(),
    expected_version: versionId, expected_deployment: deployment.id, expected_module: module.name,
    expected_module_sha256: digest(module.code), expected_functions_sha256: reviewed.functionsDigest,
    configuration_sha256: configDigest, preservation: candidate.preservation };
}

async function main() {
  const reviewed = reviewedSources();
  if (process.argv[2] === '--check-source') {
    console.log('Pinned released functions and reviewed November replacements are valid; fresh active evidence remains mandatory.');
    return;
  }
  const mode = process.argv[2];
  assert.ok(['--inspect-approved', '--execute-approved'].includes(mode), 'explicit protected operation mode required');
  assert.equal(process.env.PRODUCTION_APPROVED, 'true', 'owner-authorized protected dispatch required');
  const sha = process.env.GITHUB_SHA;
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const approve = async () => {
    await verifyProductionApproval(process.env);
    assert.equal((await inspectEnvironment(process.env)).ready, true, 'protected main-only environment required');
    validateSourceState({ expectedSha: sha, headSha: git('rev-parse', 'HEAD'), dirtyStatus: git('status', '--porcelain=v1', '--untracked-files=all') });
  };
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const now = () => new Date().toISOString();
  const save = (name, state) => writeFileSync(join(process.env.RUNNER_TEMP || tmpdir(), name), JSON.stringify(state, null, 2), { mode: 0o600 });
  if (mode === '--inspect-approved') {
    const report = await inspectBaseline({ sha, approve, now, call: transport(token), readModule: () => readActiveModule(token) }, reviewed);
    save('care-back-november-inspection.json', report);
    console.log(JSON.stringify(report));
    return;
  }
  const expected = validateExpectedInputs(process.env, reviewed);
  const releaseId = process.env.GITHUB_RUN_ID + '.' + process.env.GITHUB_RUN_ATTEMPT;
  const dir = mkdtempSync(join(tmpdir(), 'care-back-november-'));
  let preservation;
  const state = await releaseCurrentSession({
    root: ROOT, metadataFactory: uploadMetadata, sha, approve,
    expectedVersion: expected.version, expectedDeployment: expected.deployment,
    call: transport(token, { allowWrites: true }), now,
    sourceCheck: async version => {
      assert.equal(version.id, expected.version, 'reviewed active version changed');
      return { commit_sha: sha, dirty_tree: false, dirty_path_count: 0,
        method: 'reviewed-live-care-back-november-overlay', baseline_version: expected.version,
        baseline_module: expected.moduleName, baseline_module_sha256: expected.moduleDigest,
        functions_sha256: expected.functionsDigest };
    },
    bundle: async () => {
      const module = await readActiveModule(token);
      assert.equal(module.name, expected.moduleName);
      const patched = patchCareBackNovember(module.code, expected.moduleDigest, reviewed);
      preservation = patched.preservation;
      const syntaxFile = join(dir, 'candidate.mjs');
      writeFileSync(syntaxFile, patched.code, { mode: 0o600 });
      try { execFileSync(process.execPath, ['--check', syntaxFile], { stdio: 'ignore' }); }
      catch { throw new Error('complete candidate module syntax check failed'); }
      return new TextEncoder().encode(patched.code);
    },
    buildEvidence: code => ({ ...overlayBuildEvidence({ code, releaseId, nodeVersion: process.version,
      wranglerVersion: parseWranglerVersion(execFileSync('wrangler', ['--version'], { encoding: 'utf8' })),
      lockfile: readFileSync('package-lock.json'), wranglerConfig: new TextEncoder().encode(JSON.stringify({
        worker: 'member-dashboard-chat-worker', baseline: expected.version, module_sha256: expected.moduleDigest,
        functions_sha256: expected.functionsDigest, function_digests: reviewed.functions,
      })) }), preservation }),
    save: receipt => save('care-back-november-receipt.json', receipt),
  });
  console.log(JSON.stringify({ phase: state.phase, source_sha: sha, baseline_version: state.baseline_version,
    uploaded_version: state.uploaded_version, deployment: state.deployment,
    unrelated_runtime_bytes_unchanged: preservation?.unrelated_runtime_bytes_unchanged === true }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error('CARE BACK November operation stopped: ' + error.message + '; no automatic retry.'); process.exitCode = 1; });
}

