import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = new URL('../../', import.meta.url);
const docs = new URL('docs/my-therapist-profile-coordination/', root);

test('unapplied lifecycle proposal adds exactly one binding and SQLite creation without changing existing configuration', async t => {
  const source = await readFile(new URL('mms-worker/wrangler.jsonc', root), 'utf8');
  const plan = JSON.parse(await readFile(new URL('binding-migration-plan.json', docs), 'utf8'));
  assert.equal(createHash('sha256').update(source).digest('hex'), plan.configSha256, 'proposal baseline drift requires review');
  assert.equal(plan.status, 'PROPOSAL_ONLY_NOT_APPLIED');
  assert.equal(plan.actualConfigurationChanged, false);
  assert.equal(plan.tagProvisional, true);
  const config = JSON.parse(source);
  assert.equal(config.name, 'mms-worker');
  assert.equal(config.main, 'src/runtime-index-with-dispatch.js');
  assert.equal(config.durable_objects.bindings.some(b => b.name === plan.binding.name), false);
  assert.equal(config.migrations.some(m => m.tag === plan.migration.tag), false);
  assert.deepEqual(plan.binding, { name: 'MMS_THERAPIST_PROFILES', class_name: 'MmsTherapistProfileCoordinator' });
  assert.deepEqual(plan.migration, { tag: 'v6-mms-therapist-profile', new_sqlite_classes: [plan.binding.class_name] });

  // Apply only to a disposable configuration fixture, never the active config.
  const dir = await mkdtemp(join(tmpdir(), 'mms-profile-migration-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'mms-worker'));
  await writeFile(join(dir, 'mms-worker/wrangler.jsonc'), source);
  execFileSync('git', ['apply', '--check', '--'], { cwd: dir, input: await readFile(new URL('binding-migration.proposed.patch', docs)), stdio: ['pipe', 'pipe', 'pipe'] });
  execFileSync('git', ['apply', '--'], { cwd: dir, input: await readFile(new URL('binding-migration.proposed.patch', docs)), stdio: ['pipe', 'pipe', 'pipe'] });
  const proposed = JSON.parse(await readFile(join(dir, 'mms-worker/wrangler.jsonc'), 'utf8'));
  const expected = structuredClone(config);
  expected.durable_objects.bindings.push(plan.binding);
  expected.migrations.push(plan.migration);
  assert.ok(JSON.stringify(proposed) === JSON.stringify(expected), 'only the appended binding and migration may differ');
  assert.equal(await readFile(new URL('mms-worker/wrangler.jsonc', root), 'utf8'), source);
});
