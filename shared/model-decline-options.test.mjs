import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeModelDecline as normalize } from './model-decline-options.mjs';
const now = Date.parse('2026-10-20T05:00:00Z');
test('proposals use Bangkok time and remain proposals in existing reason', () => {
  const result = normalize({reason:'ติดธุระ', availability_options:['2026-10-22T12:00','2026-10-20T12:01']}, now);
  assert.equal(result.ok, true);
  assert.deepEqual(result.options, ['2026-10-20T12:01','2026-10-22T12:00']);
  assert.match(result.reason, /Proposed only \(Asia\/Bangkok\)/);
  assert.ok(result.reason.length < 500);
});
test('invalid, duplicate, past, excessive and impossible alternatives fail', () => {
  for (const options of [[],null,'tomorrow',['2026-10-20T12:00'],['2026-02-30T12:00'],['2027-02-30T12:00'],['2026-10-22T24:00'],['2026-10-22T12:00Z'],['2026-10-22T12:00','2026-10-22T12:00'],Array(4).fill('2026-10-22T12:00'),[{}]]) {
    assert.equal(normalize({availability_options:options}, now).ok, false, JSON.stringify(options));
  }
});
test('legacy reason-only requests retain 500-character support', () => {
  assert.equal(normalize({reason:'a'.repeat(600)},now).reason.length,500);
  assert.equal(normalize({},now).ok,true);
  assert.equal(normalize({reason:'a'.repeat(201),availability_options:['2026-10-22T12:00']},now).ok,false);
});
