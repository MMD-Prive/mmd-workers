import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const repoUrl = new URL('../../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, repoUrl), 'utf8');
}

test('admin-worker remains admin-only and does not own member dashboard API', async () => {
  const source = await read('admin-worker/src/dashboard-worker.js');

  assert.match(source, /\/v1\/admin\/dashboard/);
  assert.doesNotMatch(source, /\/api\/member\/dashboard/);
  assert.doesNotMatch(source, /\/v1\/member\/dashboard/);
  assert.doesNotMatch(source, /\bADMIN_WORKER\b/);
  assert.doesNotMatch(source, /mmd-redirect-worker/);
});

test('mmd-redirect-worker stays hard-disabled with no routes or service bindings', async () => {
  const source = await read('mmd-redirect-worker/src/index.js');
  const wrangler = await read('mmd-redirect-worker/wrangler.toml');

  assert.match(source, /REDIRECT_WORKER_DISABLED\s*=\s*true/);
  assert.match(source, /return\s+fetch\(request\)/);
  assert.doesNotMatch(source, /\/api\/member\/dashboard/);
  assert.doesNotMatch(source, /\/v1\/member\/dashboard/);
  assert.doesNotMatch(source, /\bADMIN_WORKER\b/);

  assert.doesNotMatch(wrangler, /^routes\s*=/m);
  assert.doesNotMatch(wrangler, /^\[\[services\]\]/m);
  assert.doesNotMatch(wrangler, /binding\s*=\s*["']ADMIN_WORKER["']/);
});

test('member dashboard ownership lock rejects the retired redirect-worker chain', async () => {
  const doc = await read('docs/architecture/MEMBER_DASHBOARD_ROUTE_OWNER_LOCK_20260824.md');

  assert.match(doc, /MUST NOT be owned by `admin-worker`/);
  assert.match(doc, /mmd-redirect-worker` is retired\/hard-disabled/);
  assert.match(doc, /\/api\/member\/dashboard -> member-dashboard-chat-worker -> MEMBER_PAGES_WORKER -> member-pages-worker -> MEMBER_STATUS_RESOLVER -> mmd-auth-worker/);
});
