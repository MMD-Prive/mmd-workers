import assert from 'node:assert/strict';
import test from 'node:test';
import { MMS_CHAT_POLICY } from '../../shared/mms-chat-policy.mjs';
import { database, CUSTOMER, OTHER_CUSTOMER, THERAPIST, OTHER_THERAPIST, ROOM } from './helpers/mms-chat-fixture.mjs';

const key = n => `request_key_0000_${n}`;
test('persists accepted messages across store reconstruction; both participants read the same transcript', () => {
  const { store, storage, db } = database();
  try {
    store.initialize(ROOM);
    assert.equal(store.send(CUSTOMER, 'คอร์ส 60 นาทีราคาเท่าไรครับ', key(1), 1000).ok, true);
    assert.equal(store.send(THERAPIST, '1500 บาทครับ', key(2), 1001).ok, true);
    const restarted = new store.constructor(storage);
    assert.deepEqual(restarted.read(CUSTOMER).data.messages, restarted.read(THERAPIST).data.messages);
    assert.deepEqual(restarted.read(CUSTOMER).data.messages.map(m => m.role), ['customer', 'therapist']);
  } finally { db.close(); }
});
test('rejects other customers and Therapists for read, send, review and room takeover', () => {
  const { store, db } = database();
  try {
    store.initialize(ROOM);
    for (const actor of [OTHER_CUSTOMER, OTHER_THERAPIST, { role: 'admin', id: CUSTOMER.id }]) {
      assert.equal(store.read(actor).status, 404);
      assert.equal(store.send(actor, 'hello', key(1), 1000).status, 404);
      assert.equal(store.requestReview(actor, 'hold').status, 404);
    }
    assert.equal(store.initialize({ ...ROOM, customer_id: OTHER_CUSTOMER.id }).status, 409);
  } finally { db.close(); }
});
test('held content is absent from recipient transcript, retry deduplicates, and only its author can request review', () => {
  const { store, db } = database();
  try {
    store.initialize(ROOM);
    const held = store.send(CUSTOMER, 'ขอไลน์หน่อยครับ', key(1), 1000);
    assert.equal(held.status, 422);
    assert.deepEqual(store.send(CUSTOMER, 'ขอไลน์หน่อยครับ', key(1), 1001), held);
    assert.equal(store.read(THERAPIST).data.messages.length, 0);
    assert.equal(store.requestReview(THERAPIST, held.error.hold_id).status, 404);
    assert.equal(store.requestReview(CUSTOMER, held.error.hold_id).data.delivered, false);
    assert.equal(store.reviewDetail(held.error.hold_id).data.text, 'ขอไลน์หน่อยครับ');
    assert.equal(store.read(THERAPIST).data.messages.length, 0);
    assert.equal(store.send(CUSTOMER, 'ขอรายละเอียดคอร์สครับ', key(2), 2000).ok, true, 'a blocked attempt must not poison later service conversation');
  } finally { db.close(); }
});
test('request keys prevent duplicates and cannot be reused for edited content', () => {
  const { store, db } = database();
  try {
    store.initialize(ROOM);
    const result = store.send(CUSTOMER, 'สวัสดีครับ', key(1), 1000);
    assert.deepEqual(store.send(CUSTOMER, 'สวัสดีครับ', key(1), 1001), result);
    assert.equal(store.send(CUSTOMER, 'ข้อความใหม่', key(1), 1002).status, 409);
    assert.equal(store.read(THERAPIST).data.messages.length, 1);
  } finally { db.close(); }
});
test('numeric fragments are withheld before delivery and split text context is checked', () => {
  const { store, db } = database();
  try {
    store.initialize(ROOM);
    assert.equal(store.send(CUSTOMER, '089', key(1), 1000).status, 422);
    assert.equal(store.read(THERAPIST).data.messages.length, 0);
    assert.equal(store.send(CUSTOMER, 'ขอ', key(2), 2000).ok, true);
    assert.equal(store.send(CUSTOMER, 'ไลน์หน่อย', key(3), 3000).status, 422);
  } finally { db.close(); }
});
test('policy version and account-specific inbox consent persist separately from messages', () => {
  const { store, db } = database();
  try {
    assert.equal(store.consent(CUSTOMER, 'outdated', 1000).status, 409);
    assert.equal(store.consent(CUSTOMER, MMS_CHAT_POLICY.version, 1000).data.consent.accepted_at, 1000);
    assert.equal(store.consent(OTHER_CUSTOMER).status, 403);
    assert.equal(store.join(CUSTOMER, ROOM, 1000).ok, true);
    assert.equal(store.threads(CUSTOMER).data.threads.length, 1);
    assert.doesNotMatch(JSON.stringify(store.threads(CUSTOMER).data.threads), /mmsmem_|text|contact/);
  } finally { db.close(); }
});
test('message history pagination has stable sequence cursors and rate limit bounds writes', () => {
  const { store, db } = database();
  try {
    store.initialize(ROOM);
    for (let n = 0; n < 65; n++) assert.equal(store.send(CUSTOMER, 'สวัสดีครับ ' + n, key(n), n * 61_000).ok, true);
    const latest = store.read(CUSTOMER).data;
    assert.equal(latest.messages.length, 50); assert.equal(latest.more, true); assert.equal(latest.messages[0].seq, 16);
    assert.equal(store.read(CUSTOMER, null, 16).data.messages.length, 15);
    assert.equal(store.read(CUSTOMER, 64).data.messages[0].seq, 65);
    for (let n = 100; n < 120; n++) assert.equal(store.send(THERAPIST, 'สวัสดีครับ', key(n), 4_000_000).ok, true);
    assert.equal(store.send(THERAPIST, 'สวัสดีครับ', key(121), 4_000_001).status, 429);
  } finally { db.close(); }
});
