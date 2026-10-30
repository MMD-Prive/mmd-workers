// Execute the exact candidate artifact without credentials, network or storage.
// This guard never uploads, promotes, seeds media or calls a production service.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createHash, webcrypto } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = 'https://www.mmdbkk.com';
const api = base + '/member/api/liff/tmib/episodes/';
const expected = [
  ['act-001-ep01', 123, 'fc519c5823d6c9e5a5515e71f59c4204dccff4e2bf28b15fdceeb5bf5a544c70'],
  ['act-001-ep02', 98, 'de76907653a5ade9bfdfaf071eac7689e2f2c268deeec7a9c00c5f4f44dffc5e'],
];
const hash = value => createHash('sha256').update(value).digest('hex');

export async function verifyTmibPublicReaderModule(source) {
  assert.equal(typeof vm.SourceTextModule, 'function', 'Run with --experimental-vm-modules');
  const calls = { network: 0, bindings: 0, background: 0 };
  const denied = name => { calls[name]++; throw Error('Public TMIB must not use ' + name); };
  const context = vm.createContext({ Request, Response, Headers, URL, URLSearchParams,
    TextEncoder, TextDecoder, ReadableStream, TransformStream, Blob, FormData,
    Uint8Array, ArrayBuffer, Date, crypto: webcrypto, atob, btoa,
    setTimeout, clearTimeout, AbortController, console,
    fetch: () => denied('network'),
  });
  const platform = new vm.SyntheticModule(['WorkerEntrypoint', 'DurableObject'], function () {
    this.setExport('WorkerEntrypoint', class {}); this.setExport('DurableObject', class {});
  }, { context });
  const worker = new vm.SourceTextModule(source, { context });
  await worker.link(name => {
    assert.equal(name, 'cloudflare:workers', 'Unexpected artifact dependency: ' + name);
    return platform;
  });
  await worker.evaluate({ timeout: 4000 });
  assert.equal(typeof worker.namespace.default?.fetch, 'function', 'Candidate must export the deployed fetch handler');
  const env = new Proxy({ LIFF_SESSION_SECRET: 'tmib-release-test-only-key-at-least-32-characters' }, {
    get(target, key) {
      if (key === 'TMIB_MEDIA_SIGNING_SECRET') return undefined;
      if (Object.hasOwn(target, key)) return target[key];
      return denied('bindings');
    },
  });
  const ctx = { waitUntil: () => denied('background') };
  const get = (path, headers) => worker.namespace.default.fetch(new Request(new URL(path, api), { headers }), env, ctx);
  const noCookie = response => assert.equal(response.headers.has('set-cookie'), false, 'Public reading must not create a session');
  const locations = [];
  for (const [id, count, digest] of expected) {
    const response = await get(id + '/content'); noCookie(response);
    assert.equal(response.status, 200, id + ' must be public from the candidate entrypoint');
    const data = await response.json();
    for (const key of ['ok', 'granted', 'public_free', 'full_text_ready', 'publication_ready']) assert.equal(data[key], true, id + ': ' + key);
    assert.equal(data.authority, 'member-pages-worker'); assert.equal(data.episode_id, id);
    assert.equal(data.story?.episode_id, id); assert.equal(data.story?.schema, 'tmib_public_story_v1');
    assert.equal(data.price_thb, 0); assert.equal(data.purchasable, false);
    assert.equal(data.checkout_path, ''); assert.equal(data.purchase_path, '');
    const paragraphs = data.story.narration.flatMap(x => x.paragraphs);
    assert.equal(paragraphs.length, count, id + ': full paragraph count');
    assert.equal(hash(paragraphs.join('\n\n')), digest, id + ': approved full manuscript');
    const frames = Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(2, '0'));
    assert.deepEqual(Array.from(data.story.frames, x => x.frame), frames);
    assert.deepEqual(Object.keys(data.media).sort(), frames);
    const access = await get(id + '/access'); noCookie(access);
    assert.equal(access.status, 200); assert.equal((await access.json()).granted, true);
    for (const frame of frames) {
      const signed = new URL(data.media[frame], base);
      assert.equal(signed.origin, base); assert.equal(signed.pathname, new URL(id + '/media/' + frame, api).pathname);
      const image = await get(signed); noCookie(image); assert.equal(image.status, 307, id + '/' + frame);
      const target = new URL(image.headers.get('location'));
      assert.equal(target.origin, 'https://cdn.prod.website-files.com');
      assert.ok(target.pathname.startsWith('/68f879d546d2f4e2ab186e90/'));
      assert.equal(target.search + target.hash + target.username + target.password, '');
      locations.push([id + '/' + frame, target.href]);
    }
    const tampered = new URL(data.media['01'], base); tampered.searchParams.set('sig', '0'.repeat(64));
    assert.equal((await get(tampered)).status, 403, 'Invalid image signature must fail');
    const expired = new URL(data.media['01'], base); expired.searchParams.set('exp', '1');
    assert.equal((await get(expired)).status, 403, 'Expired image must fail');
    const post = await worker.namespace.default.fetch(new Request(api + id + '/content', { method: 'POST' }), env, ctx);
    assert.equal(post.status, 405);
  }
  assert.equal(hash(JSON.stringify(locations)), 'd76276df1f87281f9147ceef31834559b80fbf59c548f51ca53ae311eb2082f6', 'All 40 approved image targets must be retained');
  for (const id of ['act-001-ep03', 'act-001']) for (const action of ['content', 'access', 'media/01']) {
    const response = await get(id + '/' + action); noCookie(response);
    assert.equal(response.status, 503, id + '/' + action + ' must stay unreleased');
    const data = await response.json(); assert.equal(data.error?.code, 'TMIB_CONTENT_NOT_RELEASED');
    assert.equal(data.granted, false); assert.equal(data.story, undefined); assert.equal(data.media, undefined);
  }
  assert.equal((await get('act-001-ep04/content')).status, 404);
  const preview = await get('act-001-ep01/content', { Origin: 'https://mmdprive.canvas.webflow.com' });
  assert.equal(preview.headers.get('access-control-allow-origin'), 'https://mmdprive.canvas.webflow.com');
  const foreign = await get('act-001-ep01/content', { Origin: 'https://untrusted.example' });
  assert.equal(foreign.headers.has('access-control-allow-origin'), false);
  assert.deepEqual(calls, { network: 0, bindings: 0, background: 0 });
  return { episodes: 2, paragraphs: 221, images: locations.length, ep03: 'pending', calls };
}

// A separate bounded process supplies VM support even to existing release CLIs.
export function assertTmibPublicReaderArtifact(bytes) {
  assert.ok(bytes instanceof Uint8Array && bytes.byteLength > 0, 'Candidate artifact bytes required');
  const dir = mkdtempSync(join(tmpdir(), 'tmib-artifact-gate-'));
  try {
    const file = join(dir, 'candidate.mjs'); writeFileSync(file, bytes, { mode: 0o600 });
    const output = execFileSync(process.execPath, ['--experimental-vm-modules', '--max-old-space-size=256', fileURLToPath(import.meta.url), '--bundle', file], {
      encoding: 'utf8', timeout: 15000, maxBuffer: 128 * 1024,
      env: { PATH: process.env.PATH, NODE_NO_WARNINGS: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(output);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

export async function buildConfiguredTmibCandidate(repositoryRoot = root) {
  const config = readFileSync(join(repositoryRoot, 'member-pages-worker/wrangler.toml'), 'utf8');
  const main = /^main\s*=\s*"([^"]+)"\s*$/m.exec(config)?.[1];
  assert.ok(main, 'Worker configuration must identify its real entrypoint');
  const require = createRequire(join(root, 'member-pages-worker/test-runtime/package.json'));
  const { build } = require('esbuild');
  const result = await build({ entryPoints: [resolve(repositoryRoot, 'member-pages-worker', main)], bundle: true,
    format: 'esm', platform: 'neutral', target: 'es2022', external: ['cloudflare:*'], write: false, logLevel: 'silent' });
  assert.equal(result.outputFiles.length, 1, 'Expected a single compiled Worker module');
  return result.outputFiles[0].contents;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv[2] === '--bundle') {
      assert.equal(process.argv.length, 4); console.log(JSON.stringify(await verifyTmibPublicReaderModule(readFileSync(process.argv[3], 'utf8'))));
    } else {
      assert.equal(process.argv.length, 2); console.log(JSON.stringify(assertTmibPublicReaderArtifact(await buildConfiguredTmibCandidate())));
    }
  } catch { console.error('TMIB_RELEASE_BLOCKED: candidate must retain complete free EP01/02 and unreleased EP03.'); process.exitCode = 1; }
}
