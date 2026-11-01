// Overlay the reviewed live carrier. Never bundle or deploy the repository's main Worker.
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

const FIXTURES = new URL('../member-dashboard-chat-worker/test/fixtures/', import.meta.url);
const MANIFEST = new URL('kenji-care-back-poster-live-20261031.json', FIXTURES);
const HELPER = new URL('../member-dashboard-chat-worker/src/kenji-care-back-poster.mjs', import.meta.url);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
export const OLD_ENDED_COPY = 'CARE BACK รอบนี้สิ้นสุดวันที่ 31 ต.ค. 2569 แล้วครับ กดตรวจข้อเสนอล่าสุดได้เลย';
export const NEUTRAL_COPY = 'กดตรวจข้อเสนอและสิทธิ์ล่าสุดจากบัญชีเดิมได้เลยครับ';
const sort = value => Array.isArray(value) ? value.map(sort) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sort(value[key])])) : value;
const canonical = value => JSON.stringify(sort(value));

function uniqueOffset(code, marker, reason) {
  const at = code.indexOf(marker);
  assert.ok(at >= 0 && code.indexOf(marker, at + marker.length) === -1, reason);
  return at;
}

export function neutralizeEndedCopy(source) {
  // Decode only syntactic quoted literals from the recovered trusted function.
  const matches = [...source.matchAll(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g)]
    .filter(match => {
      try { return new Function(`return (${match[0]});`)() === OLD_ENDED_COPY; }
      catch { return false; }
    });
  assert.equal(matches.length, 1, 'exact reviewed post-wave copy required once');
  const match = matches[0];
  return source.slice(0, match.index) + JSON.stringify(NEUTRAL_COPY) + source.slice(match.index + match[0].length);
}

export function reviewedSources() {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  assert.equal(manifest.worker, 'member-dashboard-chat-worker');
  assert.match(manifest.baseline_version || '', UUID, 'actual live provenance required');
  assert.equal(manifest.poster.content_sha256, 'd68fb1a288cf9f0bbd3f8cb300017c49a3939bbb8bb529be71ff5303755ca87e');
  assert.equal(manifest.poster.content_size, 2770549);
  assert.equal(manifest.poster.content_type, 'image/png');
  for (const value of [manifest.poster.url, manifest.poster.preview_url]) {
    const image = new URL(value);
    assert.ok(image.protocol === 'https:' && !image.username && !image.password && !image.search && !image.hash,
      'immutable approved public original/preview URLs required');
  }
  assert.notEqual(manifest.poster.url, manifest.poster.preview_url, '2.77 MB original cannot be the LINE preview');
  assert.match(manifest.poster.preview_sha256 || '', SHA256, 'actual preview digest required');
  assert.ok(Number.isInteger(manifest.poster.preview_size) && manifest.poster.preview_size > 0 && manifest.poster.preview_size <= 1000000,
    'LINE preview must be at most 1 MB');
  assert.ok(['image/png', 'image/jpeg'].includes(manifest.poster.preview_content_type), 'LINE preview must be PNG or JPEG');
  const source = {};
  for (const name of ['sendReply', 'careBackOctoberReply']) {
    const item = manifest.functions[name];
    assert.match(item.sha256 || '', SHA256, 'actual live function SHA-256 required');
    assert.ok(/^kenji-care-back-[a-z0-9-]+\.txt$/.test(item.file), 'bounded fixture name required');
    source[name] = readFileSync(new URL(item.file, FIXTURES), 'utf8').replace(/\n$/, '');
    assert.equal(digest(source[name]), item.sha256, 'reviewed function drift: ' + name);
    assert.ok(source[name].startsWith(`${name === 'sendReply' ? 'async ' : ''}function ${name}(`), 'reviewed function declaration required');
  }
  assert.equal((source.sendReply.match(/\bsendReply\s*\(/g) || []).length, 1, 'recursive carrier requires separate review');
  assert.ok(source.sendReply.includes('extraMessages'), 'observed extra-message carrier required');
  neutralizeEndedCopy(source.careBackOctoberReply);
  const helper = readFileSync(HELPER, 'utf8').replace('export function careBackPosterMessages(', 'function careBackPosterMessages(');
  assert.equal(helper.includes('export '), false, 'overlay helper must be standalone');
  return { manifest, source, helper, functionsDigest: digest(canonical(manifest.functions)) };
}

export async function verifyPosterAssets(poster, request = fetch) {
  const assets = [
    { role: 'original', url: poster.url, size: poster.content_size, type: poster.content_type, sha256: poster.content_sha256 },
    { role: 'preview', url: poster.preview_url, size: poster.preview_size, type: poster.preview_content_type, sha256: poster.preview_sha256 },
  ];
  return Promise.all(assets.map(async asset => {
    let response;
    try { response = await request(asset.url, { method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000) }); }
    catch { throw new Error('Approved poster asset read failed; stop without retry: ' + asset.role); }
    assert.equal(response.status, 200, 'approved poster must be publicly readable: ' + asset.role);
    assert.equal((response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase(), asset.type,
      'approved poster content type mismatch: ' + asset.role);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(bytes.byteLength, asset.size, 'approved poster byte count mismatch: ' + asset.role);
    assert.equal(digest(bytes), asset.sha256, 'approved poster content digest mismatch: ' + asset.role);
    return { role: asset.role, url: asset.url, size: bytes.byteLength, content_type: asset.type, sha256: asset.sha256, verified: true };
  }));
}

export function carrierWrapper(poster) {
  return `async function sendReply(...args) {\n` +
    `  const now = Date.now();\n` +
    `  const approved = careBackOctoberReply("care_back_overview", "", now);\n` +
    `  const promotion = careBackPosterMessages(args[2], args[4], approved, ${JSON.stringify({ url: poster.url, preview_url: poster.preview_url })}, now);\n` +
    `  if (promotion) { args[2] = promotion.text; args[4] = promotion.extra_messages; }\n` +
    `  return sendReplyBeforeCareBackPoster(...args);\n` +
    `}`;
}

export function patchCareBackPoster(code, expectedModuleDigest, reviewed = reviewedSources()) {
  assert.match(expectedModuleDigest || '', SHA256, 'reviewed whole-module SHA-256 required');
  assert.equal(digest(code), expectedModuleDigest, 'reviewed whole-module drift');
  assert.equal(code.includes('sendReplyBeforeCareBackPoster'), false, 'poster overlay already exists');
  assert.equal(code.includes('function careBackPosterMessages('), false, 'poster helper already exists');
  const { source, manifest, helper } = reviewed;
  const renamed = source.sendReply.replace('async function sendReply(', 'async function sendReplyBeforeCareBackPoster(');
  const replacements = {
    sendReply: renamed + '\n' + helper + '\n' + carrierWrapper(manifest.poster),
    careBackOctoberReply: neutralizeEndedCopy(source.careBackOctoberReply),
  };
  let candidate = code;
  for (const name of ['sendReply', 'careBackOctoberReply']) {
    uniqueOffset(candidate, source[name], 'exact reviewed function must occur once: ' + name);
    candidate = candidate.replace(source[name], () => replacements[name]);
  }
  let restored = candidate;
  for (const name of ['sendReply', 'careBackOctoberReply']) {
    uniqueOffset(restored, replacements[name], 'replacement must occur once: ' + name);
    restored = restored.replace(replacements[name], () => source[name]);
  }
  assert.equal(restored, code, 'unrelated runtime bytes changed');
  return { code: candidate, preservation: {
    baseline_sha256: digest(code), candidate_sha256: digest(candidate),
    functions: ['sendReply', 'careBackOctoberReply'], functions_sha256: reviewed.functionsDigest,
    unrelated_runtime_bytes_unchanged: true, existing_carrier_body_unchanged: true,
    model_pricing_and_checkpts_unchanged: true, eligibility_unchanged: true,
    public_poster_stops_at: '2026-11-01T00:00:00+07:00',
    poster_content_sha256: manifest.poster.content_sha256, poster_url: manifest.poster.url,
    preview_sha256: manifest.poster.preview_sha256, preview_url: manifest.poster.preview_url,
  } };
}

export function validateExpectedInputs(env, reviewed = reviewedSources()) {
  assert.match(env.EXPECTED_VERSION || '', UUID, 'fresh active version required');
  assert.match(env.EXPECTED_DEPLOYMENT || '', UUID, 'fresh active deployment required');
  assert.equal(env.EXPECTED_MODULE, MODULE_NAME, 'single worker.js module required');
  assert.match(env.EXPECTED_MODULE_SHA256 || '', SHA256, 'reviewed complete module digest required');
  assert.equal(env.EXPECTED_FUNCTIONS_SHA256, reviewed.functionsDigest, 'reviewed function pair required');
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
  assert.equal(module.name, MODULE_NAME);
  patchCareBackPoster(module.code, digest(module.code), reviewed);
  assert.equal(canonical((await get('/deployments'))?.deployments?.[0]), canonical(deployment), 'deployment changed during inspection');
  assert.equal((await get('/versions'))?.items?.[0]?.id, versionId, 'latest upload changed during inspection');
  assert.equal(digest(canonical(versionConfiguration(await get('/versions/' + versionId)))), configDigest, 'configuration changed');
  await io.approve();
  return { schema: 'kenji-care-back-poster-inspection.v1', production_mutation: false,
    worker: 'member-dashboard-chat-worker', source_sha: io.sha, inspected_at: io.now(),
    expected_version: versionId, expected_deployment: deployment.id, expected_module: module.name,
    expected_module_sha256: digest(module.code), expected_functions_sha256: reviewed.functionsDigest,
    configuration_sha256: configDigest, poster: reviewed.manifest.poster,
    public_poster_stops_at: '2026-11-01T00:00:00+07:00', eligibility_unchanged: true };
}

async function main() {
  const reviewed = reviewedSources();
  if (process.argv[2] === '--check-source') {
    console.log('Exact live carrier/campaign fixtures and approved public poster match the reviewed manifest.');
    return;
  }
  const mode = process.argv[2];
  assert.ok(['--inspect-approved', '--execute-approved'].includes(mode));
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
    report.poster_readback = await verifyPosterAssets(reviewed.manifest.poster);
    save('care-back-poster-inspection.json', report);
    console.log(JSON.stringify(report));
    return;
  }
  const expected = validateExpectedInputs(process.env, reviewed);
  const releaseId = `${process.env.GITHUB_RUN_ID}.${process.env.GITHUB_RUN_ATTEMPT}`;
  const dir = mkdtempSync(join(tmpdir(), 'care-back-poster-'));
  let preservation;
  const state = await releaseCurrentSession({
    root: ROOT, metadataFactory: uploadMetadata, sha, approve,
    expectedVersion: expected.version, expectedDeployment: expected.deployment,
    call: transport(token, { allowWrites: true }), now,
    sourceCheck: async version => {
      assert.equal(version.id, expected.version, 'reviewed active version changed');
      return { commit_sha: sha, dirty_tree: false, dirty_path_count: 0,
        method: 'reviewed-live-care-back-poster-overlay', baseline_version: expected.version,
        baseline_module: expected.moduleName, baseline_module_sha256: expected.moduleDigest,
        functions_sha256: expected.functionsDigest };
    },
    bundle: async () => {
      const module = await readActiveModule(token);
      assert.equal(module.name, expected.moduleName);
      const patched = patchCareBackPoster(module.code, expected.moduleDigest, reviewed);
      const posterReadback = await verifyPosterAssets(reviewed.manifest.poster);
      preservation = patched.preservation;
      preservation.poster_readback = posterReadback;
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
        functions_sha256: expected.functionsDigest, poster: reviewed.manifest.poster,
      })) }), preservation }),
    save: receipt => save('care-back-poster-receipt.json', receipt),
  });
  console.log(JSON.stringify({ phase: state.phase, source_sha: sha, baseline_version: state.baseline_version,
    uploaded_version: state.uploaded_version, deployment: state.deployment,
    unrelated_runtime_bytes_unchanged: preservation?.unrelated_runtime_bytes_unchanged === true }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(`CARE BACK poster operation stopped: ${error.message}; no automatic retry.`); process.exitCode = 1; });
}
