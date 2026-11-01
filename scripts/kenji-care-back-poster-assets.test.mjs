import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ASSETS, ACCOUNT, BUCKET, ORIGIN, PREFIX, MANIFEST, loadAssets, publishPosterAssets, key, publicUrl } from './kenji-care-back-poster-assets.mjs';

function fixture({ existing = [], conflict, failure, race = false, publicCorrupt = false, denyApproval = false } = {}) {
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
      return new Response(body, { status: 200, headers: { 'content-type': object.type, 'content-length': String(body.length) } });
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

test('publisher workflow retains protected manual production boundary and dedicated token', () => {
  const workflow = readFileSync('.github/workflows/publish-kenji-care-back-poster.yml', 'utf8');
  assert.match(workflow, /environment: mmd-production-mutation/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/admin-production-approval\.yml/);
  assert.match(workflow, /needs: \[contracts, production-approval\]/);
  assert.match(workflow, /inputs\.approved_sha == github\.sha/);
  assert.match(workflow, /secrets\.CLOUDFLARE_R2_API_TOKEN/);
  assert.doesNotMatch(workflow, /^\s*(push|schedule):/m);
  assert.doesNotMatch(workflow, /wrangler deploy|purge_cache|secrets\.CLOUDFLARE_API_TOKEN/);
});
