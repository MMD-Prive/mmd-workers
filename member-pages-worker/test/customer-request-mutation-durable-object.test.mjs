import test from 'node:test';
import assert from 'node:assert/strict';
import { CustomerRequestMutationCoordinator } from '../src/customer-request-mutation-durable-object.js';
function harness() { let value = null; const state = { storage: { async get() { return value; }, async put(_, v) { value = v; }, async delete() { value = null; } }, async blockConcurrencyWhile(fn) { return fn(); } }; return new CustomerRequestMutationCoordinator(state); }
async function call(o, body) { const r = await o.fetch(new Request('https://mutation', { method: 'POST', body: JSON.stringify(body) })); return { status: r.status, body: await r.json() }; }
test('single record coordinator fences overlapping writers and requires matching finish', async () => { const o = harness(); assert.equal((await call(o, { action: 'begin', operation_id: 'a' })).status, 200); assert.equal((await call(o, { action: 'begin', operation_id: 'b' })).status, 409); assert.equal((await call(o, { action: 'finish', operation_id: 'b' })).status, 409); assert.equal((await call(o, { action: 'finish', operation_id: 'a', status: 'uncertain' })).body.completed, 'uncertain'); });
