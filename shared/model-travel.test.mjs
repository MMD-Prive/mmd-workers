import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { prepareTravelSubmission, commitTravelSubmission, cancelTravelSubmission, projectTravel, uploadTravelPhoto, travelPhotoResponse, travelBinding, validateTravelJpeg, readBoundedTravelBody } from './model-travel-store.mjs';
import { travelClock, travelEtaFromEvents } from './model-travel-eta.mjs';
import { handleMemberAppSessionApi } from '../member-pages-worker/src/member-app-session.js';
import modelWorker from '../admin-worker/src/model-liff-worker.js';
import { notifyTravelEvent } from '../admin-worker/src/model-travel-notification.js';

import { TravelTestBucket, MODEL, travelFixture, jpeg } from './model-travel-fixtures.mjs';
import { resolveTravelEta, travelState } from './model-travel-store.mjs';
const digest = async bytes => Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
const input = (key = 'fixture-key-00000001', text = 'รถติดเล็กน้อยครับ', photos = []) => ({ key, text, photos });
const photoSpec = async () => ({ type: 'image/jpeg', size: jpeg.length, sha256: await digest(jpeg) });
const putRequest = () => new Request('https://mmdbkk.com/upload', { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: jpeg });

test('legacy lifecycle remains readable but cannot authorize travel writes', async () => {
  for (const legacy of ['en_route', 'on_the_way', 'nearby']) {
    const {env, record} = travelFixture();
    delete record.fields.model_session_state;
    delete record.fields.session_state;
    record.fields['Session Status'] = legacy;
    const read = await projectTravel(env, record, 'model');
    assert.equal(read.state, legacy === 'on_the_way' ? 'en_route' : legacy);
    assert.equal(read.can_send, false, legacy);
    await assert.rejects(prepareTravelSubmission(env, record, MODEL, input()), /travel_not_allowed/);
    assert.equal(env.PRIVATE_MODEL_MEDIA.objects.size, 0);
  }
});

test('loss of canonical lifecycle blocks upload and commit of a reserved submission', async () => {
  const {env, record} = travelFixture(), spec = await photoSpec();
  const prepared = await prepareTravelSubmission(env, record, MODEL, input('fixture-review-reserved', 'draft', [spec]));
  delete record.fields.model_session_state;
  delete record.fields.session_state;
  record.fields['Session Status'] = 'en_route';
  const serial = env.PRIVATE_MODEL_MEDIA.serial;
  await assert.rejects(uploadTravelPhoto(env, record, MODEL, prepared.id, 0, putRequest()), /travel_not_allowed/);
  await assert.rejects(commitTravelSubmission(env, record, MODEL, prepared.id), /travel_not_allowed/);
  assert.equal(env.PRIVATE_MODEL_MEDIA.serial, serial);
});

test('commit rechecks fresh canonical lifecycle instead of trusting an older snapshot', async () => {
  const {env, record} = travelFixture();
  const prepared = await prepareTravelSubmission(env, record, MODEL, input());
  const snapshot = structuredClone(record);
  delete record.fields.model_session_state;
  record.fields['Session Status'] = 'en_route';
  const serial = env.PRIVATE_MODEL_MEDIA.serial;
  await assert.rejects(commitTravelSubmission(env, snapshot, MODEL, prepared.id), /travel_not_allowed/);
  assert.equal(env.PRIVATE_MODEL_MEDIA.serial, serial);
});

test('canonical aliases still authorize writes but conflicting states never do', async () => {
  for (const fields of [
    {model_session_state:'en_route'}, {session_state:'on_the_way'},
    {model_session_state:'en_route', session_state:'on_the_way'},
    {model_session_state:'nearby', session_state:'nearby'},
  ]) {
    const {env, record} = travelFixture();
    delete record.fields.model_session_state;
    Object.assign(record.fields, fields, {'Session Status':'cancelled'});
    assert.equal((await projectTravel(env, record, 'model')).can_send, true);
    assert.equal((await prepareTravelSubmission(env, record, MODEL, input())).state, 'reserved');
  }
  const {env, record} = travelFixture();
  record.fields.session_state = 'arrived';
  record.fields['Session Status'] = 'en_route';
  assert.equal((await projectTravel(env, record, 'model')).can_send, false);
  await assert.rejects(prepareTravelSubmission(env, record, MODEL, input()), /travel_not_allowed/);
});

test('serialized null is unavailable while genuinely absent or empty events remain missing', async () => {
  for (const value of [null, undefined, '', '  ', [], '[]']) {
    assert.equal(travelEtaFromEvents(value).status, 'missing');
  }
  for (const value of ['null', ' null ', '{}', 'false', '""']) {
    assert.equal(travelEtaFromEvents(value).status, 'unavailable', value);
  }
  const {env, record} = travelFixture(), original = env.AIRTABLE_HTTP.fetch;
  env.AIRTABLE_HTTP.fetch = async request => new URL(request.url).pathname.endsWith('/Jobs')
    ? Response.json({records:[{id:'recJob',fields:{session_id:record.fields.session_id,events_json:'null'}}]})
    : original(request);
  assert.equal((await projectTravel(env, record)).eta.status, 'unavailable');
  const response = await handleMemberAppSessionApi(new Request('https://mmdbkk.com/api/member/app/session/current?session_id=sess_FIXTURE'), env, async () => ({lineUserId:record.fields.line_user_id,memberId:record.fields.member_id}));
  const body = await response.json();
  assert.equal(body.eta.status, 'unavailable');
  assert.equal(body.etaLabel, null);
});

test('legacy and shared endpoints agree on aliases, conflicts and terminal ETA', async () => {
  for(const state of ['on_the_way','enroute','en_route','arrived','completed','cancelled','unrecognized']) {
    const {env,record}=travelFixture();record.fields.session_state=state;record.fields.model_session_state=state;
    const shared=await projectTravel(env,record);
    const response=await handleMemberAppSessionApi(new Request('https://mmdbkk.com/api/member/app/session/current?session_id=sess_FIXTURE'),env,async()=>({lineUserId:record.fields.line_user_id,memberId:record.fields.member_id}));
    const legacy=await response.json();assert.equal(legacy.lifecycle,shared.state,state);assert.equal(legacy.eta.status,shared.eta.status,state);
    assert.equal(legacy.eta.arrival_at?.slice(0,16),shared.eta.arrival_at?.slice(0,16));
  }
  const {record}=travelFixture();record.fields.session_state='on_the_way';assert.equal(travelState(record),'en_route');
  record.fields.session_state='arrived';assert.equal(travelState(record),'checking');
});

test('owned ETA distinguishes no event from invalid/missing/ambiguous/unavailable Jobs', async () => {
  const now=Date.now();
  for(const kind of ['no-event','no-job','duplicate','wrong-job','malformed','timeout']) {
    const {env,record}=travelFixture();
    env.AIRTABLE_HTTP.fetch=async()=>{
      if(kind==='timeout')throw new Error('timeout');
      const job={fields:{session_id:kind==='wrong-job'?'sess_OTHER':record.fields.session_id,events_json:kind==='malformed'?'{broken':'[]'}};
      return Response.json({records:kind==='no-job'?[]:kind==='duplicate'?[job,job]:[job]});
    };
    const eta=await resolveTravelEta(env,record,now);
    assert.equal(eta.status,kind==='no-event'?'missing':'unavailable',kind);
    assert.equal(eta.arrival_at,null);
  }
  for(const malformed of ['{}','{broken','x'.repeat(64001),42])assert.equal(travelEtaFromEvents(malformed,now).status,'unavailable');
  for(const value of [true,[],{},null,0,241,1.5])assert.equal(travelEtaFromEvents([{event:'eta_update',eta_minutes:value,ts:new Date(now).toISOString()}],now).status,'unavailable');
});

test('both apps share hour/minute, exact boundary, expired and lifecycle semantics', () => {
  const now = Date.parse('2026-10-18T16:55:00Z');
  for (const [minutes, expected] of [[85, '1 ชม. 25 นาที'], [60, '1 ชม.'], [59, '59 นาที'], [1, '1 นาที']]) {
    const eta = travelEtaFromEvents([{ event: 'eta_update', ts: new Date(now).toISOString(), eta_minutes: minutes }], now);
    assert.equal(travelClock(eta, 'en_route', 'th', now), 'คาดว่าจะถึงในอีก ' + expected);
    assert.equal(Date.parse(eta.arrival_at), now + minutes * 60000);
  }
  const eta = { status: 'active', arrival_at: new Date(now + 60001).toISOString() };
  assert.match(travelClock(eta, 'nearby', 'th', now), /2 นาที$/);
  assert.match(travelClock(eta, 'nearby', 'th', now + 1), /1 นาที$/);
  assert.equal(travelClock(eta, 'nearby', 'th', now + 60001), 'เลยเวลาคาดการณ์ กำลังรออัปเดต');
  assert.equal(travelClock(eta, 'arrived', 'th', now), 'โมเดลถึงแล้ว');
  for (const state of ['cancelled', 'completed', 'work_started', 'checking']) assert.equal(travelClock(eta, state, 'th', now), '');
  assert.match(travelClock(eta, 'en_route', 'en', now), /2 min$/);
  assert.match(travelClock(eta, 'en_route', 'zh', now), /2 分钟$/);
});

test('server quotas allow exactly three messages and idempotent replay consumes no second slot', async () => {
  const { env, record } = travelFixture();
  for (let n = 0; n < 3; n++) {
    const body = input('fixture-message-000' + n);
    const prepared = await prepareTravelSubmission(env, record, MODEL, body);
    await commitTravelSubmission(env, record, MODEL, prepared.id);
    const replay = await prepareTravelSubmission(env, record, MODEL, body);
    assert.equal(replay.id, prepared.id); assert.equal(replay.state, 'saved');
    assert.equal((await commitTravelSubmission(env, record, MODEL, prepared.id)).duplicate, true);
  }
  await assert.rejects(prepareTravelSubmission(env, record, MODEL, input('fixture-message-four')), /travel_quota_reached/);
  const state = await projectTravel(env, record, 'model');
  assert.equal(state.messages_used, 3); assert.equal(state.photos_remaining, 3);
  await assert.rejects(prepareTravelSubmission(env, record, MODEL, input('fixture-message-0000', 'changed')), /travel_key_conflict/);
});

test('two concurrent devices competing for the final message slot cannot exceed quota', async () => {
  const { env, record } = travelFixture();
  for (let n = 0; n < 2; n++) { const p = await prepareTravelSubmission(env, record, MODEL, input('fixture-first-two-' + n)); await commitTravelSubmission(env, record, MODEL, p.id); }
  const outcomes = await Promise.allSettled(['one', 'two'].map(n => prepareTravelSubmission(env, record, MODEL, input('fixture-device-' + n))));
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  assert.match(outcomes.find(r => r.status === 'rejected').reason.message, /quota/);
  const state = await projectTravel(env, record, 'model');
  assert.equal(state.messages_used, 2); assert.equal(state.messages_remaining, 0);
});

test('mixed and photo-only submissions count independently; private photos require the current binding', async () => {
  const { env, record } = travelFixture(), spec = await photoSpec();
  const first = await prepareTravelSubmission(env, record, MODEL, input('fixture-mixed-0001', 'ทางเข้างาน', [spec, spec]));
  await assert.rejects(commitTravelSubmission(env, record, MODEL, first.id), /upload_incomplete/);
  for (let i = 0; i < 2; i++) await uploadTravelPhoto(env, record, MODEL, first.id, i, putRequest());
  await commitTravelSubmission(env, record, MODEL, first.id);
  const second = await prepareTravelSubmission(env, record, MODEL, input('fixture-photo-0002', '', [spec]));
  await uploadTravelPhoto(env, record, MODEL, second.id, 0, putRequest()); await commitTravelSubmission(env, record, MODEL, second.id);
  let state = await projectTravel(env, record, 'model');
  assert.equal(state.messages_used, 1); assert.equal(state.photos_used, 3);
  await assert.rejects(prepareTravelSubmission(env, record, MODEL, input('fixture-photo-four', '', [spec])), /quota/);
  const mediaId = first.id + '_0', response = await travelPhotoResponse(env, record, mediaId);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), jpeg);
  record.fields.line_user_id = 'Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  await assert.rejects(travelPhotoResponse(env, record, mediaId), /unavailable/);
  state = await projectTravel(env, record, 'model');
  assert.equal(state.submissions.length, 0); assert.equal(state.photos_used, 3);
});

test('cancel/expiry recover quota and deterministic upload objects after process interruption', async () => {
  const { env, record } = travelFixture(), spec = await photoSpec(), now = Date.now();
  const prepared = await prepareTravelSubmission(env, record, MODEL, input('fixture-cancel-0001', 'draft', [spec]), now);
  await uploadTravelPhoto(env, record, MODEL, prepared.id, 0, putRequest());
  await cancelTravelSubmission(env, record, MODEL, prepared.id);
  assert.equal([...env.PRIVATE_MODEL_MEDIA.objects.keys()].filter(k => k.includes('/uploads/')).length, 0);
  assert.equal((await projectTravel(env, record, 'model')).messages_remaining, 3);
  const expiring = await prepareTravelSubmission(env, record, MODEL, input('fixture-expire-0001', 'draft'), now);
  const state = await projectTravel(env, record, 'model', now + 11 * 60000);
  assert.equal(state.messages_remaining, 3);
  await assert.rejects(commitTravelSubmission(env, record, MODEL, expiring.id, now + 11 * 60000), /expired/);
});

test('upload rejects metadata, spoofed MIME, wrong bytes and oversize streams', async () => {
  assert.equal(validateTravelJpeg(jpeg), true);
  const exif = Buffer.concat([jpeg.subarray(0,2), Buffer.from([255,225,0,8,69,120,105,102,0,0]), jpeg.subarray(2)]);
  assert.throws(() => validateTravelJpeg(exif), /metadata/);
  assert.throws(() => validateTravelJpeg(Buffer.from('not a photo')), /invalid/);
  assert.throws(() => validateTravelJpeg(Buffer.concat([jpeg, Buffer.from('trailer')])), /invalid/);
  await assert.rejects(readBoundedTravelBody(new Request('https://fixture', { method: 'POST', body: '123456' }), 5), /too_large/);
  const { env, record } = travelFixture(), spec = await photoSpec();
  const prepared = await prepareTravelSubmission(env, record, MODEL, input('fixture-bad-photo-1', '', [{ ...spec, sha256: 'a'.repeat(64) }]));
  await assert.rejects(uploadTravelPhoto(env, record, MODEL, prepared.id, 0, putRequest()), /digest_mismatch/);
  assert.equal((await projectTravel(env, record, 'model')).photos_used, 0);
});

test('ownership, canonical conflicts, finished lifecycle and customer-safe projection fail closed', async () => {
  const { env, record } = travelFixture();
  await assert.rejects(prepareTravelSubmission(env, record, 'recAnother', input()), /forbidden/);
  for (const state of ['confirmed', 'arrived', 'completed', 'cancelled', 'work_started']) {
    record.fields.model_session_state = state;
    await assert.rejects(prepareTravelSubmission(env, record, MODEL, input()), /not_allowed/);
  }
  record.fields.model_session_state = 'en_route'; record.fields.session_state = 'confirmed';
  await assert.rejects(prepareTravelSubmission(env, record, MODEL, input()), /not_allowed/);
  delete record.fields.session_state;
  const p = await prepareTravelSubmission(env, record, MODEL, input()); await commitTravelSubmission(env, record, MODEL, p.id);
  const state = await projectTravel(env, record);
  const serialized = JSON.stringify(state);
  assert.equal(state.submissions.length, 1);
  assert.doesNotMatch(serialized, /recModel|line_user_id|U123456|recMember|request_key|uploads\/|events_json|payout|digest/);
});

test('real model cookie route and customer session route enforce identity and same-origin writes', async () => {
  const { env, record } = travelFixture();
  const payload = Buffer.from(JSON.stringify({ kind: 'model_session', role: 'model', model_record_id: MODEL, exp: Math.floor(Date.now()/1000) + 3600 })).toString('base64url');
  const token = payload + '.' + createHmac('sha256', env.MODEL_SESSION_SIGNING_SECRET).update(payload).digest('hex');
  const url = 'https://mmdbkk.com/v1/model/session/travel?session_id=sess_FIXTURE';
  const headers = { cookie: 'mmd_model_session_v1=' + token };
  assert.equal((await modelWorker.fetch(new Request(url), env, {})).status, 401);
  assert.equal((await modelWorker.fetch(new Request(url, { headers }), env, {})).status, 200);
  const body = JSON.stringify({ ...input(), session_id: record.fields.session_id, action: 'prepare' });
  assert.equal((await modelWorker.fetch(new Request(url, { method: 'POST', headers, body }), env, {})).status, 403);
  assert.equal((await modelWorker.fetch(new Request(url, { method: 'POST', headers: { ...headers, origin: 'https://mmdbkk.com' }, body }), env, {})).status, 200);
  const customerUrl = 'https://mmdbkk.com/api/member/app/session/travel?session_id=sess_FIXTURE';
  const foreign = await handleMemberAppSessionApi(new Request(customerUrl), env, async () => ({ lineUserId: 'Uother', memberId: 'recOther' }));
  assert.equal(foreign.status, 404); assert.doesNotMatch(await foreign.text(), /รถติด|arrival_at|recModel/);
  const owned = await handleMemberAppSessionApi(new Request(customerUrl), env, async () => ({ lineUserId: record.fields.line_user_id, memberId: record.fields.member_id }));
  assert.equal(owned.status, 200); assert.equal((await owned.json()).submissions.length, 0);
});

test('LINE receipt deduplicates and never uses Model/MMS transport or a changed recipient', async () => {
  const { env, record } = travelFixture();
  const original = globalThis.fetch, sent = [];
  globalThis.fetch = async (url, options) => { assert.equal(url, 'https://api.line.me/v2/bot/message/push'); sent.push(options); return Response.json({}); };
  try {
    env.MODEL_LINE_CHANNEL_ACCESS_TOKEN = 'must-not-use';
    assert.equal((await notifyTravelEvent(env, record, 'fixture-event')).delivered, false); assert.equal(sent.length, 0);
    env.LINE_CHANNEL_ACCESS_TOKEN = 'customer-test-token';
    assert.equal((await notifyTravelEvent(env, record, 'fixture-event')).delivered, true);
    assert.equal((await notifyTravelEvent(env, record, 'fixture-event')).delivered, true); assert.equal(sent.length, 1);
    const body = JSON.parse(sent[0].body);
    assert.equal(body.to, record.fields.line_user_id); assert.match(body.messages[0].text, /session_id=sess_FIXTURE/);
    assert.doesNotMatch(body.messages[0].text, /uploads|signed|token/);
    assert.match(sent[0].headers['x-line-retry-key'], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    const snapshot = structuredClone(record); record.fields.line_user_id = 'Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    await notifyTravelEvent(env, snapshot, 'fixture-stale-recipient'); assert.equal(sent.length, 1);
  } finally { globalThis.fetch = original; }
});
