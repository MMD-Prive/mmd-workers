import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyProductionApproval } from './admin-production-approval.mjs';
import { inspectEnvironment } from './admin-production-validation.mjs';

export const ACCOUNT = 'b176eda1172b741fd2e58904cc9d77c5';
export const BUCKET = 'mmd-models';
export const ORIGIN = 'https://models.mmdbkk.com';
export const PREFIX = 'promotions/care-back/2026-10/';
export const MANIFEST = 'assets/' + PREFIX + 'manifest.json';
const API = 'https://api.cloudflare.com/client/v4';
const ROOT = `/accounts/${ACCOUNT}/r2/buckets/${BUCKET}`;
export const ASSETS = Object.freeze([
  Object.freeze({ role: 'original', name: 'care-back-d68fb1a288cf9f0bbd3f8cb300017c49a3939bbb8bb529be71ff5303755ca87e.png', sha256: 'd68fb1a288cf9f0bbd3f8cb300017c49a3939bbb8bb529be71ff5303755ca87e', size_bytes: 2770549, content_type: 'image/png', width: 1448, height: 1086 }),
  Object.freeze({ role: 'preview', name: 'care-back-preview-19d2e063bdbf95adb6447cf6278b4813307aeda160dc4f21e5f5f33fbb46f4d6.jpg', sha256: '19d2e063bdbf95adb6447cf6278b4813307aeda160dc4f21e5f5f33fbb46f4d6', size_bytes: 173648, content_type: 'image/jpeg', width: 960, height: 720 }),
]);
export const digest = value => createHash('sha256').update(value).digest('hex');
export const key = asset => PREFIX + asset.name;
export const publicUrl = asset => ORIGIN + '/' + key(asset);
const objectUrl = asset => API + ROOT + '/objects/' + key(asset);
const mime = response => String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();

export function loadAssets(read = readFileSync) {
  const manifest = JSON.parse(read(MANIFEST, 'utf8'));
  assert.equal(manifest.schema, 'mmd.care_back_poster_assets.v1');
  assert.equal(manifest.account_id, ACCOUNT);
  assert.equal(manifest.bucket, BUCKET);
  assert.equal(manifest.public_origin, ORIGIN);
  assert.equal(manifest.original_bytes_preserved, true);
  assert.equal(manifest.assets?.length, 2, 'exactly two approved files required');
  return ASSETS.map((asset, index) => {
    const record = manifest.assets[index];
    for (const field of ['role', 'sha256', 'size_bytes', 'content_type', 'width', 'height']) {
      assert.equal(record[field], asset[field], 'approved asset manifest drift: ' + field);
    }
    assert.equal(record.object_key, key(asset));
    assert.equal(record.url, publicUrl(asset));
    assert.equal(record.file, 'assets/' + key(asset));
    const body = read(record.file);
    assert.equal(body.length, asset.size_bytes, 'approved file size changed');
    assert.equal(digest(body), asset.sha256, 'approved file bytes changed');
    if (asset.role === 'original') {
      assert.ok(body.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')), 'PNG required');
      assert.equal(body.readUInt32BE(16), asset.width);
      assert.equal(body.readUInt32BE(20), asset.height);
      assert.ok(body.length <= 10_000_000, 'LINE original limit exceeded');
    } else {
      assert.equal(body[0], 0xff); assert.equal(body[1], 0xd8);
      assert.ok(body.length <= 1_000_000, 'LINE preview limit exceeded');
    }
    return { ...asset, body };
  });
}

export async function verifiedBytes(response, asset, label, { publicReadback = false } = {}) {
  if (response.status === 206 && publicReadback) {
    // The existing asset-host Worker can report a full R2 object range even
    // without a Range request. Accept only the exact complete representation.
    assert.equal(response.headers.get('content-range'),
      `bytes 0-${asset.size_bytes - 1}/${asset.size_bytes}`, label + ' incomplete Content-Range');
  } else assert.equal(response.status, 200, label + ' failed: ' + response.status);
  assert.equal(mime(response), asset.content_type, label + ' MIME mismatch');
  const length = response.headers.get('content-length');
  if (length !== null) assert.equal(length, String(asset.size_bytes), label + ' length mismatch');
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.length, asset.size_bytes, label + ' byte size mismatch');
  assert.equal(digest(bytes), asset.sha256, label + ' SHA-256 mismatch');
}

// No generic bucket/key/URL argument: only these two exact content-addressed files.
export async function publishPosterAssets({ request = fetch, token, approve, save = () => {}, read = readFileSync }) {
  assert.ok(token, 'dedicated R2 publisher credential required');
  const assets = loadAssets(read);
  const receipt = { schema: 'mmd.care_back_poster_asset_receipt.v1', account_id: ACCOUNT,
    bucket: BUCKET, mode: 'publish', read_only: false, phase: 'preflight', complete: false, objects: [] };
  const checkpoint = () => save(structuredClone(receipt));
  const get = (url, authenticated = true) => request(url, { method: 'GET', redirect: 'error',
    signal: AbortSignal.timeout(30000), headers: authenticated ? { Authorization: `Bearer ${token}` } : {} });
  await approve();
  checkpoint();
  try {
    // Inspect both destinations before any write; a conflicting existing object stops.
    for (const asset of assets) {
      const response = await get(objectUrl(asset));
      if (response.status === 200) await verifiedBytes(response, asset, 'existing object');
      else assert.equal(response.status, 404, 'object preflight failed: ' + response.status);
      receipt.objects.push({ role: asset.role, object_key: key(asset), url: publicUrl(asset),
        sha256: asset.sha256, size_bytes: asset.size_bytes, content_type: asset.content_type,
        existed: response.status === 200, upload_attempted: false, storage_verified: response.status === 200,
        public_verified: false });
    }
    checkpoint();
    for (let index = 0; index < assets.length; index++) {
      const asset = assets[index], item = receipt.objects[index];
      if (!item.existed) {
        await approve();
        receipt.phase = 'uploading'; item.upload_attempted = true; checkpoint();
        // Conditional creation plus immutable digest-named keys; never overwrite intentionally.
        const response = await request(objectUrl(asset), { method: 'PUT', redirect: 'error',
          signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${token}`,
            'Content-Type': asset.content_type, 'Content-Length': String(asset.body.length),
            'Cache-Control': 'public, max-age=31536000, immutable', 'If-None-Match': '*' }, body: asset.body });
        assert.ok(response.status === 200 || response.status === 412, 'upload failed: ' + response.status + '; no retry');
        item.upload_http = response.status;
        if (response.status === 200) {
          const result = await response.json();
          assert.equal(result.success, true, 'upload not acknowledged; no retry');
        }
        // A concurrent create (412) is accepted only if it contains the same approved bytes.
        await verifiedBytes(await get(objectUrl(asset)), asset, 'storage readback');
        item.storage_verified = true; checkpoint();
      }
    }
    receipt.phase = 'public_readback'; checkpoint();
    for (let index = 0; index < assets.length; index++) {
      const asset = assets[index];
      const response = await get(publicUrl(asset), false);
      receipt.objects[index].public_http = response.status;
      receipt.objects[index].public_content_range = response.headers.get('content-range');
      await verifiedBytes(response, asset, 'public CDN readback', { publicReadback: true });
      receipt.objects[index].public_verified = true; checkpoint();
    }
    receipt.phase = 'complete'; receipt.complete = true; checkpoint();
    return receipt;
  } catch (error) {
    receipt.phase = 'stopped'; receipt.complete = false;
    receipt.error = String(error.message || 'asset publication failed').slice(0, 500);
    checkpoint(); throw error;
  }
}

// Separate read-only operation: missing or mismatched storage never enters the
// publisher and cannot trigger upload, repair, cache purge or a write retry.
export async function verifyPublishedPosterAssets({ request = fetch, token, approve, save = () => {}, read = readFileSync }) {
  assert.ok(token, 'dedicated R2 read credential required');
  const assets = loadAssets(read);
  const receipt = { schema: 'mmd.care_back_poster_asset_receipt.v1', account_id: ACCOUNT,
    bucket: BUCKET, mode: 'verify', read_only: true, phase: 'storage_readback', complete: false, objects: [] };
  const checkpoint = () => save(structuredClone(receipt));
  const get = (url, authenticated = true) => request(url, { method: 'GET', redirect: 'error',
    signal: AbortSignal.timeout(30000), headers: authenticated ? { Authorization: `Bearer ${token}` } : {} });
  await approve();
  checkpoint();
  try {
    for (const asset of assets) {
      const item = { role: asset.role, object_key: key(asset), url: publicUrl(asset),
        sha256: asset.sha256, size_bytes: asset.size_bytes, content_type: asset.content_type,
        upload_attempted: false, storage_verified: false, public_verified: false };
      receipt.objects.push(item);
      const response = await get(objectUrl(asset));
      item.storage_http = response.status;
      await verifiedBytes(response, asset, 'existing storage readback');
      item.storage_verified = true; checkpoint();
    }
    receipt.phase = 'public_readback'; checkpoint();
    for (let index = 0; index < assets.length; index++) {
      const asset = assets[index], item = receipt.objects[index];
      const response = await get(publicUrl(asset), false);
      item.public_http = response.status;
      item.public_content_range = response.headers.get('content-range');
      await verifiedBytes(response, asset, 'public CDN readback', { publicReadback: true });
      item.public_verified = true; checkpoint();
    }
    await approve();
    receipt.phase = 'complete'; receipt.complete = true; checkpoint();
    return receipt;
  } catch (error) {
    receipt.phase = 'stopped'; receipt.complete = false;
    receipt.error = String(error.message || 'asset verification failed').slice(0, 500);
    checkpoint(); throw error;
  }
}

async function main() {
  const assets = loadAssets();
  if (process.argv[2] === '--check-assets') {
    console.log(JSON.stringify({ valid: true, assets: assets.map(({ body, ...asset }) => ({ ...asset, url: publicUrl(asset) })) }));
    return;
  }
  const mode = process.argv[2];
  assert.ok(['--execute-approved', '--verify-published'].includes(mode), 'explicit asset operation mode required');
  assert.equal(process.env.PRODUCTION_APPROVED, 'true', 'owner-authorized dispatch required');
  const sha = process.env.GITHUB_SHA;
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const approve = async () => {
    await verifyProductionApproval(process.env);
    assert.equal((await inspectEnvironment(process.env)).ready, true, 'protected main-only environment required');
    assert.equal(git('rev-parse', 'HEAD'), sha, 'checkout does not match approved SHA');
    assert.equal(git('status', '--porcelain=v1', '--untracked-files=all'), '', 'clean checkout required');
    const response = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/git/ref/heads/main`, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000), headers: {
        Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28' } });
    assert.equal(response.status, 200, 'cannot verify current main');
    assert.equal((await response.json()).object?.sha, sha, 'current main moved; review new SHA');
  };
  const operation = mode === '--verify-published' ? verifyPublishedPosterAssets : publishPosterAssets;
  const result = await operation({ token: process.env.CLOUDFLARE_R2_API_TOKEN, approve,
    save: receipt => writeFileSync(join(process.env.RUNNER_TEMP || '/tmp', 'care-back-poster-assets-receipt.json'),
      JSON.stringify({ ...receipt, source_sha: sha, run_id: process.env.GITHUB_RUN_ID, checked_at: new Date().toISOString() }, null, 2), { mode: 0o600 }) });
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(`CARE BACK asset publication stopped: ${error.message}; no automatic retry.`); process.exitCode = 1; });
}
