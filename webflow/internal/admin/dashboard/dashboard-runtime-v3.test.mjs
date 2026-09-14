import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./dashboard-runtime-v3.js', import.meta.url), 'utf8');

test('dashboard runtime v3 compiles', () => {
  assert.doesNotThrow(() => new Function(source));
});

test('dashboard runtime v3 is route-scoped and reads only same-origin admin surfaces', () => {
  assert.match(source, /\/internal\/admin\/dashboard/);
  assert.match(source, /\/v1\/admin\/dashboard/);
  assert.match(source, /\/v1\/admin\/calendar/);
  assert.doesNotMatch(source, /Authorization\s*:/i);
  assert.doesNotMatch(source, /Bearer\s+/i);
});

test('dashboard runtime v3 keeps Create Job primary and demotes Create Session', () => {
  assert.match(source, /\/internal\/admin\/jobs\/create-job/);
  assert.match(source, /legacyCard\.remove\(\)/);
});

test('dashboard runtime v3 keeps Cal writes explicitly shadow-gated in owner copy', () => {
  assert.match(source, /LIVE READ · SHADOW WRITE/);
  assert.match(source, /production E2E live-write/);
});
