import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ASSETS, ACCOUNT, BUCKET, ORIGIN, PREFIX, MANIFEST, loadAssets, publishPosterAssets, verifyPublishedPosterAssets, key, publicUrl } from './kenji-care-back-poster-assets.mjs';

function fixture({ existing = [], conflict, failure, race = false, publicCorrupt = false, denyApproval = false,
  publicStatus = 200, publicRange = 'full', storageStatus = 200, publicLength = 'exact', publicMime } = {}) {
  const assets = loadAssets();
  const stored = new Map(existing.map(i => [key(assets[i]), { body: assets[i].body, type: assets[i].content_type }]));
  if (conflict !== undefined) stored.set(key(assets[conflict]), { body: Buffer.from('wrong bytes'), type: assets[conflict].content_type });
  const calls = [], receipts = [];
  let approvals = 0;
  const io = {
    token: 'fixture-credential-never-real',
    approve: async () => { approvals++; if (denyApproval) throw new Error('approval blocked'); },
    save: receipt => receipts.push(receipt),
    request: async (url, options) => {
      calls.push({ url, method: options.method });
      assert.equal(options.redirect, 'error');
      const isPublic = url.startsWith(ORIGIN + '/');
      const prefix = isPublic ? ORIGIN + '/' : `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects/`;
      assert.ok(url.startsWith(prefix), 'only fixed API or public origin');
      const objectKey = url.slice(prefix.length);
      assert.ok(assets.some(a => key(a) === objectKey), 'only exact two approved objects');
      if (isPublic) assert.equal(options.headers.Authorization, undefined, 'never send token to public CDN');
      else assert.equal(options.headers.Authorization, 'Bearer fixture-credential-never-real');
      assert.equal(options.headers.Range, undefined, 'ordinary complete GET must not request a range');
      if (options.method === 'PUT') {
        assert.ok(approvals >= 2, 'approval rechecked before write');
        assert.equal(options.headers['If-None-Match'], '*');
        assert.equal(options.headers['Cache-Control'], 'public, max-age=31536000, immutable');
        assert.equal(Number(options.headers['Content-Length']), options.body.length);
        if (failure === 'throw') throw new Error('ambiguous transport');
        if (failure === 'http') return new Response('', { status: 503 });
        stored.set(objectKey, { body: Buffer.from(options.body), type: options.headers['Content-Type'] });
        return race ? new Response('', { status: 412 }) : Response.json({ success: true });
      }
      assert.equal(options.method, 'GET');
      const object = stored.get(objectKey);
      if (!object) return new Response('', { status: 404 });
      const body = isPublic && publicCorrupt ? Buffer.alloc(object.body.length) : object.body;
      const status = isPublic ? publicStatus : storageStatus;
      const headers = { 'content-type': isPublic && publicMime ? publicMime : object.type };
      if (!isPublic || publicLength !== 'missing') headers['content-length'] =
        isPublic && publicLength !== 'exact' ? publicLength : String(body.length);
      if (status === 206 && (!isPublic || publicRange !== 'missing')) headers['content-range'] =
        !isPublic || publicRange === 'full' ? `bytes 0-${body.length - 1}/${body.length}` : publicRange;
      return new Response(body, { status, headers });
    },
  };
  return { io, calls, receipts, approvals: () => approvals };
}

test('approved original stays exact and preview satisfies separate LINE size limit', () => {
  const assets = loadAssets();
  assert.equal(assets.length, 2);
  assert.equal(assets[0].body.length, 2770549);
  assert.equal(assets[1].body.length, 173648);
  assert.ok(assets[1].body.length <= 1_000_000);
  assert.ok(ASSETS.every(a => publicUrl(a).startsWith(ORIGIN + '/' + PREFIX)));
});

test('changed bytes, changed destinations and added files are rejected before network', () => {
  assert.throws(() => loadAssets((path, encoding) => {
    const value = readFileSync(path, encoding);
    if (path !== MANIFEST) { const changed = Buffer.from(value); changed[50] ^= 1; return changed; }
    return value;
  }), /approved file bytes changed/);
  for (const mutate of [m => m.assets[0].url = 'https://elsewhere.test/x', m => m.bucket = 'private-data', m => m.assets.push(m.assets[0])]) {
    assert.throws(() => loadAssets((path, encoding) => {
      if (path !== MANIFEST) return readFileSync(path, encoding);
      const manifest = JSON.parse(readFileSync(path, 'utf8')); mutate(manifest); return JSON.stringify(manifest);
    }));
  }
});

test('new upload creates exactly two conditional objects and verifies storage and public bytes', async () => {
  const f = fixture(); const result = await publishPosterAssets(f.io);
  assert.equal(result.complete, true);
  assert.ok(result.objects.every(o => o.storage_verified && o.public_verified && o.upload_attempted));
  assert.equal(f.calls.filter(c => c.method === 'PUT').length, 2);
  assert.equal(f.approvals(), 3);
  assert.deepEqual(f.calls.slice(0, 2).map(c => c.method), ['GET', 'GET']);
  assert.doesNotMatch(JSON.stringify(f.receipts), /fixture-credential-never-real/);
});

test('already identical objects receive no write and are publicly verified', async () => {
  const f = fixture({ existing: [0, 1] }); const result = await publishPosterAssets(f.io);
  assert.equal(result.complete, true);
  assert.equal(f.calls.filter(c => c.method === 'PUT').length, 0);
  assert.ok(result.objects.every(o => o.existed && !o.upload_attempted));
});

test('conflicting second object prevents every upload', async () => {
  const f = fixture({ conflict: 1 });
  await assert.rejects(publishPosterAssets(f.io), /length mismatch|byte size mismatch|SHA-256 mismatch/);
  assert.equal(f.calls.filter(c => c.method === 'PUT').length, 0);
  assert.equal(f.receipts.at(-1).complete, false);
});

test('conditional create race is accepted only after exact readback', async () => {
  const f = fixture({ race: true }); const result = await publishPosterAssets(f.io);
  assert.equal(result.complete, true);
  assert.ok(result.objects.every(o => o.upload_http === 412 && o.storage_verified));
});

test('HTTP failure and ambiguous transport are never retried', async () => {
  for (const failure of ['http', 'throw']) {
    const f = fixture({ failure });
    await assert.rejects(publishPosterAssets(f.io), /upload failed|ambiguous transport/);
    assert.equal(f.calls.filter(c => c.method === 'PUT').length, 1);
    assert.equal(f.receipts.at(-1).phase, 'stopped');
    assert.equal(f.receipts.at(-1).complete, false);
  }
});

test('public byte mismatch cannot produce a complete publication receipt', async () => {
  const f = fixture({ publicCorrupt: true });
  await assert.rejects(publishPosterAssets(f.io), /public CDN readback SHA-256 mismatch/);
  assert.equal(f.receipts.at(-1).complete, false);
  assert.ok(f.receipts.at(-1).objects.every(o => o.storage_verified));
});

test('denied approval performs no remote read or write', async () => {
  const f = fixture({ denyApproval: true });
  await assert.rejects(publishPosterAssets(f.io), /approval blocked/);
  assert.equal(f.calls.length, 0);
});

test('full-object public 206 is verified against the same exact hashes and remains unauthenticated', async () => {
  const f = fixture({ existing: [0, 1], publicStatus: 206 });
  const result = await publishPosterAssets(f.io);
  assert.equal(result.complete, true);
  assert.equal(f.calls.filter(c => c.method === 'PUT').length, 0);
  assert.ok(result.objects.every(o => o.public_http === 206 && o.public_verified));
  assert.equal(result.objects[0].public_content_range, 'bytes 0-2770548/2770549');
  assert.equal(result.objects[1].public_content_range, 'bytes 0-173647/173648');
});

test('partial, missing, nonzero-start and wrong-total public 206 ranges cannot pass', async () => {
  for (const publicRange of ['bytes 0-99/2770549', 'missing', 'bytes 1-2770548/2770549', 'bytes 0-2770548/2770550']) {
    const f = fixture({ existing: [0, 1], publicStatus: 206, publicRange });
    await assert.rejects(verifyPublishedPosterAssets(f.io), /incomplete Content-Range/);
    assert.equal(f.receipts.at(-1).complete, false);
    assert.ok(f.calls.every(c => c.method === 'GET'));
  }
});

test('full-object 206 still enforces MIME, actual bytes, digest and any Content-Length', async () => {
  for (const options of [{ publicCorrupt: true }, { publicLength: '0' }, { publicLength: 'bogus' },
    { publicLength: '2770548' }, { publicMime: 'application/octet-stream' }]) {
    const f = fixture({ existing: [0, 1], publicStatus: 206, ...options });
    await assert.rejects(verifyPublishedPosterAssets(f.io), /SHA-256 mismatch|length mismatch|MIME mismatch/);
    assert.equal(f.receipts.at(-1).complete, false);
    assert.ok(f.calls.every(c => c.method === 'GET'));
  }
  const f = fixture({ existing: [0, 1], publicStatus: 206, publicLength: 'missing' });
  assert.equal((await verifyPublishedPosterAssets(f.io)).complete, true);
});

test('authenticated storage readback still rejects 206 even for a complete range', async () => {
  const f = fixture({ existing: [0, 1], storageStatus: 206 });
  await assert.rejects(verifyPublishedPosterAssets(f.io), /existing storage readback failed: 206/);
  assert.equal(f.receipts.at(-1).complete, false);
  assert.ok(f.calls.every(c => c.method === 'GET'));
});

test('read-only verify checks both stored and public assets and never enters publication', async () => {
  for (const publicStatus of [200, 206]) {
    const f = fixture({ existing: [0, 1], publicStatus });
    const result = await verifyPublishedPosterAssets(f.io);
    assert.equal(result.mode, 'verify'); assert.equal(result.read_only, true);
    assert.equal(result.complete, true);
    assert.equal(f.calls.length, 4);
    assert.ok(f.calls.every(c => c.method === 'GET'));
    assert.ok(result.objects.every(o => !o.upload_attempted && o.storage_verified && o.public_verified));
    assert.equal(f.approvals(), 2);
  }
});

test('missing or mismatched storage in verify mode stops without any repair or retry', async () => {
  for (const options of [{ existing: [] }, { existing: [0] }, { existing: [0], conflict: 1 }]) {
    const f = fixture(options);
    await assert.rejects(verifyPublishedPosterAssets(f.io), /existing storage readback/);
    assert.equal(f.receipts.at(-1).complete, false);
    assert.ok(f.calls.every(c => c.method === 'GET'));
    assert.ok(f.receipts.at(-1).objects.every(o => !o.upload_attempted));
  }
  const denied = fixture({ existing: [0, 1], denyApproval: true });
  await assert.rejects(verifyPublishedPosterAssets(denied.io), /approval blocked/);
  assert.equal(denied.calls.length, 0);
});

test('publisher workflow retains protected manual production boundary and dedicated token', () => {
  const workflow = readFileSync('.github/workflows/publish-kenji-care-back-poster.yml', 'utf8');
  assert.match(workflow, /environment: mmd-production-mutation/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/admin-production-approval\.yml/);
  assert.match(workflow, /needs: \[contracts, production-approval\]/);
  assert.match(workflow, /inputs\.approved_sha == github\.sha/);
  assert.match(workflow, /secrets\.CLOUDFLARE_R2_API_TOKEN/);
  assert.match(workflow, /options: \[verify, publish\]/);
  assert.match(workflow, /default: verify/);
  assert.match(workflow, /verify\) node scripts\/kenji-care-back-poster-assets\.mjs --verify-published/);
  assert.match(workflow, /publish\) node scripts\/kenji-care-back-poster-assets\.mjs --execute-approved/);
  assert.match(workflow, /\*\) exit 1/);
  assert.doesNotMatch(workflow, /^\s*(push|schedule):/m);
  assert.doesNotMatch(workflow, /wrangler deploy|purge_cache|secrets\.CLOUDFLARE_API_TOKEN/);
});
