import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { makeHarness, makeToken, request } from './blackcard-preference.test-fixtures.mjs';
import { handleBlackCardCompanionPreference } from './blackcard-companion-preference.js';
import { runBlackCardPreferenceMaintenance as run, handleBlackCardRetentionAdmin as admin, BLACKCARD_RETENTION_ADMIN_PATH } from './blackcard-preference-lifecycle.js';
const T = 'mmd_blackcard_companion_preferences', E = 'mmd_blackcard_companion_lifecycle_events';
const F = { status:'fldmUukFu7vlCNVRS', actor:'fldeAN9g8J3muhpv5', note:'fld6l4KrJwTUutsPK', at:'fldllPl768hXme4O4', sync:'fld7qYcsjjsnI4E1r', meta:'fldg3oBALJFB6Lmxd', requestNote:'fldEZrXcf97ON2mqI', reason:'fldn9wU28zjv37lye', expiry:'fldgwMccAhzfeDK6c' };
const later = (row, seconds) => new Date(Date.parse(row.created_at) + seconds * 1000).toISOString();
const rowOf = h => [...h.db.preferences.values()].at(-1);
const events = h => h.db.sqlite.prepare(`SELECT * FROM ${E}`).all();
async function seed(options) {
  const h = makeHarness(options); h.token = await makeToken(h.env);
  await handleBlackCardCompanionPreference(request(h.token, { companion_id:'hito', note:'private customer note', change_reason:'private request reason', experience_preferences:['privacy'] }), h.env);
  h.row = rowOf(h); return h;
}
function review(h, status = 'recorded', seconds = 1) {
  Object.assign(h.mirror.records.at(-1).fields, { [F.status]:status, [F.actor]:'operator:owner', [F.note]:'restricted internal review note', [F.at]:later(h.row, seconds) });
}
function expire(h) {
  const date = '2000-01-01T00:00:00.000Z';
  h.db.sqlite.prepare(`UPDATE ${T} SET retention_expires_at = ?`).run(date);
  for (const record of h.mirror.records) record.fields[F.expiry] = date;
}
function holdRequest(h, body, token = h.env.AUTH_SERVICE_ADMIN_TO_PAYMENTS) {
  return new Request('https://payments.internal' + BLACKCARD_RETENTION_ADMIN_PATH, { method:'POST', headers:{ 'content-type':'application/json', 'x-internal-token':token }, body:JSON.stringify(body) });
}
function holdBody(h) { return { action:'place_hold', request_id:h.row.request_id, actor:'operator:owner', reason:'approved investigation hold', hold_until:new Date(Date.now() + 3600000).toISOString(), operation_id:crypto.randomUUID() }; }

test('review states reconcile into canonical D1 and customer readback without exposing review notes or granting entitlement', async () => {
  const h = await seed();
  try {
    review(h,'in_review',1); assert.equal((await run(h.env,{now:later(h.row,2)})).reconciled,1);
    review(h,'recorded',3); assert.equal((await run(h.env,{now:later(h.row,4)})).reconciled,1);
    assert.equal(rowOf(h).status,'recorded'); assert.equal(rowOf(h).reviewed_by,'operator:owner');
    assert.equal(events(h).length,2);
    assert.ok(events(h).every(e => !JSON.stringify(e).includes('restricted internal review note')));
    const read = await (await handleBlackCardCompanionPreference(request(h.token,{read:true}),h.env)).json();
    assert.equal(read.preference_status,'recorded'); assert.equal(read.companion.id,'hito'); assert.equal(read.entitlement_activated,false);
    assert.ok(!JSON.stringify(read).includes('restricted internal review note'));
    assert.equal(h.mirror.records[0].fields[F.sync],'synced');
    assert.equal(JSON.parse(h.mirror.records[0].fields[F.meta]).review_revision_hash,rowOf(h).review_revision_hash);
    await run(h.env,{now:later(h.row,5)}); assert.equal(events(h).length,2);
  } finally { h.restore(); }
});

test('tampered identity/payload, invalid status and incomplete, stale or future reviewer metadata fail closed', async () => {
  for (const mutate of [
    f=>f.fldMiUCgSuP229TcZ='other-member', f=>f[F.requestNote]='changed request', f=>f[F.status]='approved_blackcard',
    f=>delete f[F.actor], f=>f[F.at]='invalid', f=>f[F.at]='2099-01-01T00:00:00Z', f=>f[F.expiry]='2099-01-01T00:00:00Z',
  ]) {
    const h = await seed();
    try {
      review(h); mutate(h.mirror.records[0].fields);
      const result = await run(h.env,{now:later(h.row,2)});
      assert.equal(result.failed,1); assert.equal(rowOf(h).status,'pending_review'); assert.equal(events(h).length,0);
      assert.match(rowOf(h).maintenance_error,/^[a-z_]+$/); assert.ok(!JSON.stringify(result).includes('private customer note'));
    } finally { h.restore(); }
  }
});

test('terminal decisions cannot reopen and a changed review needs a strictly newer timestamp', async () => {
  const h = await seed();
  try {
    review(h,'declined',1); await run(h.env,{now:later(h.row,2)});
    h.mirror.records[0].fields[F.note]='edited at the same timestamp';
    assert.equal((await run(h.env,{now:later(h.row,3)})).failed,1);
    review(h,'recorded',4); assert.equal((await run(h.env,{now:later(h.row,5)})).failed,1);
    assert.equal(rowOf(h).status,'declined'); assert.equal(events(h).length,1);
  } finally { h.restore(); }
});

test('lost acknowledgement retries the same canonical review event, without changing reviewer-owned fields', async () => {
  const h = await seed();
  try {
    review(h);
    const fetch = h.env.AIRTABLE_HTTP.fetch.bind(h.mirror); let failAck = true;
    h.env.AIRTABLE_HTTP = { async fetch(req) { if (req.method==='PATCH' && /\/rec\d+$/.test(new URL(req.url).pathname) && failAck) { failAck=false; return Response.json({}, {status:503}); } return fetch(req); } };
    assert.equal((await run(h.env,{now:later(h.row,2)})).failed,1);
    assert.equal(rowOf(h).status,'recorded'); assert.equal(events(h).length,1); assert.equal(rowOf(h).review_mirrored_revision_hash,null);
    assert.equal((await run(h.env,{now:later(h.row,3)})).reconciled,1);
    assert.equal(events(h).length,1); assert.equal(rowOf(h).review_mirrored_revision_hash,rowOf(h).review_revision_hash);
    assert.equal(h.mirror.records[0].fields[F.note],'restricted internal review note');
  } finally { h.restore(); }
});

test('parallel maintenance is leased and a failed compare-and-set cannot leave an orphan review audit event', async () => {
  const h = await seed();
  try {
    review(h);
    const results = await Promise.all([run(h.env,{now:later(h.row,2)}),run(h.env,{now:later(h.row,2)})]);
    assert.ok(results.some(r=>r.busy===1)); assert.equal(events(h).length,1);
  } finally { h.restore(); }
  const other = await seed();
  try {
    review(other); const batch=other.db.batch.bind(other.db); let intercept=true;
    other.db.batch=async statements=>{ if(intercept) { intercept=false; other.db.sqlite.prepare(`UPDATE ${T} SET review_revision_hash='external-revision'`).run(); } return batch(statements); };
    const result=await run(other.env,{now:later(other.row,2)});
    assert.equal(result.failed,1); assert.equal(events(other).length,0); assert.equal(rowOf(other).status,'pending_review');
  } finally { other.restore(); }
});

test('retention redacts private text in D1 and Airtable, preserves minimal replay/audit state, and re-redacts later edits', async () => {
  const h = await seed();
  try {
    review(h); await run(h.env,{now:later(h.row,2)}); expire(h);
    assert.equal((await run(h.env,{now:later(h.row,3)})).redacted,1);
    const row=rowOf(h); assert.equal(row.note,''); assert.equal(row.change_reason,''); assert.equal(row.review_note,null); assert.equal(row.reviewed_by,null);
    assert.ok(row.retention_redacted_at); assert.ok(row.retention_mirrored_at); assert.equal(row.payload_hash,h.row.payload_hash);
    const f=h.mirror.records[0].fields;
    for(const key of [F.requestNote,F.reason,F.note,F.actor]) assert.equal(f[key],'');
    const count=events(h).length; assert.equal(count,3);
    f[F.requestNote]='accidental later text'; f[F.note]='another private note';
    await run(h.env,{now:later(h.row,4)}); assert.equal(h.mirror.records[0].fields[F.requestNote],'');
    // Fixture PATCH replaces its fields object; inspect current server state.
    assert.equal(h.mirror.records[0].fields[F.note],''); assert.equal(events(h).length,count);
    const read=await (await handleBlackCardCompanionPreference(request(h.token,{read:true}),h.env)).json();
    assert.equal(read.preference_status,'recorded'); assert.equal(read.companion.id,'hito');
  } finally { h.restore(); }
});

test('mirror outage cannot retain canonical free text; remote cleanup resumes idempotently', async () => {
  const h = await seed();
  try {
    expire(h); const fetch=h.env.AIRTABLE_HTTP.fetch.bind(h.mirror); let offline=true;
    h.env.AIRTABLE_HTTP={async fetch(req) { if(offline) throw new Error('private_customer_note'); return fetch(req); }};
    assert.equal((await run(h.env,{now:later(h.row,1)})).failed,1);
    assert.equal(rowOf(h).note,''); assert.equal(rowOf(h).retention_mirrored_at,null); assert.equal(events(h).length,1);
    assert.equal(rowOf(h).maintenance_error,'maintenance_operation_failed');
    offline=false; assert.equal((await run(h.env,{now:later(h.row,2)})).redacted,1); assert.equal(events(h).length,2);
    assert.equal(h.mirror.writes,1); assert.equal(h.mirror.records[0].fields[F.requestNote],'');
  } finally { h.restore(); }
});

test('an expired request that never reached the mirror is scrubbed and never recreated', async () => {
  const h = await seed({mirrorFails:true});
  try {
    assert.equal(h.mirror.records.length,0); expire(h);
    const result=await run(h.env,{now:later(h.row,1)});
    assert.equal(result.redacted,1); assert.equal(rowOf(h).note,''); assert.equal(h.mirror.records.length,0); assert.equal(h.mirror.writes,0);
  } finally { h.restore(); }
});

test('only the existing admin service can place an approved hold; hold/release retries are idempotent and reasons are hashed', async () => {
  const h = await seed();
  try {
    const body=holdBody(h);
    assert.equal((await admin(holdRequest(h,body,h.token),h.env)).status,401);
    assert.equal(events(h).length,0);
    const placed=await (await admin(holdRequest(h,body),h.env)).json(); assert.equal(placed.active,true);
    const repeat=await (await admin(holdRequest(h,body),h.env)).json(); assert.equal(repeat.hold_id,placed.hold_id); assert.equal(repeat.idempotent,true); assert.equal(events(h).length,1);
    const holds=h.db.sqlite.prepare('SELECT * FROM mmd_blackcard_companion_retention_holds').all();
    assert.ok(!JSON.stringify(holds).includes(body.reason)); assert.ok(!JSON.stringify(holds).includes(body.actor));
    expire(h); assert.equal((await run(h.env,{now:later(h.row,1)})).held,1); assert.equal(rowOf(h).note,'private customer note');
    const expiredRead=await (await handleBlackCardCompanionPreference(request(h.token,{read:true}),h.env)).json();
    assert.equal(expiredRead.preference_status,'pending_review'); assert.equal(expiredRead.companion.id,'hito');
    const replay=await handleBlackCardCompanionPreference(request(h.token,{companion_id:'hito',note:'private customer note',change_reason:'private request reason',experience_preferences:['privacy']}),h.env);
    assert.equal(replay.status,410); assert.equal(h.db.preferences.size,1);
    const release={...body,action:'release_hold',hold_id:placed.hold_id,operation_id:crypto.randomUUID()}; delete release.hold_until;
    assert.equal((await admin(holdRequest(h,{...release,hold_id:'another'}),h.env)).status,409);
    assert.equal((await admin(holdRequest(h,release),h.env)).status,200);
    assert.equal((await admin(holdRequest(h,release),h.env)).status,200); assert.equal(events(h).length,2);
    assert.equal((await run(h.env,{now:later(h.row,2)})).redacted,1); assert.equal(rowOf(h).note,'');
    assert.equal((await admin(holdRequest(h,{...body,operation_id:crypto.randomUUID()}),h.env)).status,409);
  } finally { h.restore(); }
});

test('hold expiry resumes retention automatically and a racing hold cannot claim to preserve already-redacted text', async () => {
  const h=await seed();
  try {
    const body=holdBody(h); await admin(holdRequest(h,body),h.env); expire(h);
    assert.equal((await run(h.env,{now:new Date(Date.parse(body.hold_until)+1000).toISOString()})).redacted,1);
    assert.equal(rowOf(h).note,'');
  } finally { h.restore(); }
  const other=await seed();
  try {
    expire(other); const body=holdBody(other);
    const [response]=await Promise.all([admin(holdRequest(other,body),other.env),run(other.env)]);
    if(response.status===200) assert.equal(rowOf(other).note,'private customer note');
    else assert.equal(response.status,409);
  } finally { other.restore(); }
});

test('bounded polling advances past an invalid review instead of starving later requests', async () => {
  const h=await seed();
  try {
    for(const id of ['hima','hiro']) await handleBlackCardCompanionPreference(request(h.token,{companion_id:id,change_reason:'a changed preference',request_key:crypto.randomUUID()}),h.env);
    assert.equal(h.db.preferences.size,3);
    h.mirror.records[0].fields[F.status]='unknown'; review(h,'recorded',1);
    await run(h.env,{now:later(h.row,2),limit:1}); await run(h.env,{now:later(h.row,3),limit:1}); await run(h.env,{now:later(h.row,4),limit:1});
    assert.equal(rowOf(h).status,'recorded'); assert.equal(events(h).length,1);
  } finally { h.restore(); }
});

test('configured release cron runs lifecycle and service-only holds route through the real wrapper', async () => {
  const hooks=registerHooks({resolve(specifier,context,next) { if(specifier==='cloudflare:workers') return {url:'data:text/javascript,export class DurableObject {}',shortCircuit:true}; return next(specifier,context); }});
  const h=await seed();
  try {
    const worker=(await import('./index.session-paid-projection-wrapper.js')).default;
    const body=holdBody(h);
    assert.equal((await worker.fetch(holdRequest(h,body,'wrong'),h.env,{})).status,401);
    review(h,'in_review',0); // reviewed_at is the real creation instant, never future.
    await worker.scheduled({},h.env,{});
    assert.equal(rowOf(h).status,'in_review'); assert.equal(events(h).length,1);
  } finally { hooks.deregister(); h.restore(); }
});

test('background outbox retry finishes initial mirror delivery without another customer request', async () => {
  const h=await seed({mirrorFails:true});
  try {
    assert.equal(h.mirror.records.length,0); h.mirror.fail=false;
    assert.equal((await run(h.env)).ok,true);
    assert.equal(h.mirror.records.length,1); assert.equal([...h.db.outbox.values()][0].delivery_status,'delivered');
    await run(h.env); assert.equal(h.mirror.writes,1);
  } finally { h.restore(); }
});

test('a reviewer edit during acknowledgement is picked up next time; ACK names the exact accepted revision', async () => {
  const h=await seed();
  try {
    review(h,'in_review',1);
    const fetch=h.env.AIRTABLE_HTTP.fetch.bind(h.mirror); let edit=true;
    h.env.AIRTABLE_HTTP={async fetch(req) {
      if(req.method==='PATCH' && /\/rec\d+$/.test(new URL(req.url).pathname) && edit) { edit=false; review(h,'recorded',3); }
      return fetch(req);
    }};
    await run(h.env,{now:later(h.row,2)});
    assert.equal(rowOf(h).status,'in_review'); const firstRevision=rowOf(h).review_revision_hash;
    assert.equal(h.mirror.records[0].fields[F.status],'recorded');
    assert.equal(JSON.parse(h.mirror.records[0].fields[F.meta]).review_revision_hash,firstRevision);
    await run(h.env,{now:later(h.row,4)});
    assert.equal(rowOf(h).status,'recorded'); assert.notEqual(rowOf(h).review_revision_hash,firstRevision); assert.equal(events(h).length,2);
  } finally { h.restore(); }
});

test('Airtable free text cannot create a hold, and missing lifecycle schema never applies an unaudited review', async () => {
  const h=await seed();
  try {
    expire(h); h.mirror.records[0].fields[F.note]='approved hold forever';
    await run(h.env); assert.equal(rowOf(h).note,''); assert.equal(h.mirror.records[0].fields[F.note],'');
  } finally { h.restore(); }
  const other=await seed();
  try {
    review(other); other.db.sqlite.exec(`DROP TABLE ${E}`);
    assert.equal((await run(other.env,{now:later(other.row,2)})).failed,1);
    assert.equal(rowOf(other).status,'pending_review'); assert.equal(rowOf(other).reviewed_by,null);
  } finally { other.restore(); }
});

test('notification outbox failure cannot prevent canonical retention cleanup in the same cron tick', async () => {
  const hooks=registerHooks({resolve(specifier,context,next) { if(specifier==='cloudflare:workers') return {url:'data:text/javascript,export class DurableObject {}',shortCircuit:true}; return next(specifier,context); }});
  const h=await seed();
  try {
    expire(h);
    h.env.PAYMENT_SLIP_EVIDENCE={async get() { return null; },async put() {},async list() { throw new Error('fixture notification outage'); }};
    const worker=(await import('./index.session-paid-projection-wrapper.js')).default;
    await assert.rejects(worker.scheduled({},h.env,{}),/fixture notification outage/);
    assert.equal(rowOf(h).note,''); assert.ok(rowOf(h).retention_mirrored_at);
  } finally { hooks.deregister(); h.restore(); }
});

test('a missing linked Member cannot prevent matching-request redaction but cannot authorize review', async () => {
  const h=await seed();
  try {
    review(h); h.mirror.records[0].fields.fld6I0jkPbACVSVWV=[];
    assert.equal((await run(h.env,{now:later(h.row,2)})).failed,1);
    assert.equal(rowOf(h).status,'pending_review');
    expire(h);
    assert.equal((await run(h.env,{now:later(h.row,3)})).redacted,1);
    assert.equal(rowOf(h).note,''); assert.equal(h.mirror.records[0].fields[F.requestNote],'');
  } finally { h.restore(); }
});

test('review after text cutoff keeps operational state and hashed audit without reviving private fields',async()=>{
  const h=await seed();
  try {
    expire(h); await run(h.env,{now:later(h.row,1)});
    review(h,'in_review',2);
    const result=await run(h.env,{now:later(h.row,3)});
    assert.equal(result.failed,0); assert.equal(rowOf(h).status,'in_review');
    for(const key of ['note','change_reason']) assert.equal(rowOf(h)[key],'');
    for(const key of ['reviewed_by','review_note']) assert.equal(rowOf(h)[key],null);
    for(const key of [F.requestNote,F.reason,F.actor,F.note]) assert.equal(h.mirror.records[0].fields[key],'');
    const event=events(h).find(e=>e.event_type==='review_reconciled');
    assert.match(event.actor_hash,/^[a-f0-9]{64}$/); assert.ok(!JSON.stringify(event).includes('operator:owner'));
    const count=events(h).length; await run(h.env,{now:later(h.row,4)}); assert.equal(events(h).length,count);
    review(h,'recorded',5); await run(h.env,{now:later(h.row,6)});
    assert.equal(rowOf(h).status,'recorded'); assert.equal(rowOf(h).reviewed_by,null);
    const read=await (await handleBlackCardCompanionPreference(request(h.token,{read:true}),h.env)).json();
    assert.equal(read.companion.id,'hito'); assert.equal(read.preference_status,'recorded');
  }finally{h.restore();}
});

test('post-cutoff review ACK retries from the receipt after reviewer text is erased',async()=>{
  const h=await seed();
  try {
    expire(h); review(h,'recorded',1);
    const fetch=h.env.AIRTABLE_HTTP.fetch.bind(h.mirror); let failAck=true;
    h.env.AIRTABLE_HTTP={async fetch(req){
      const fields=req.method==='PATCH' ? (await req.clone().json()).fields : null;
      if(fields && fields[F.meta] && !Object.hasOwn(fields,F.actor) && failAck){failAck=false; return Response.json({}, {status:503});}
      return fetch(req);
    }};
    assert.equal((await run(h.env,{now:later(h.row,2)})).failed,1);
    assert.equal(rowOf(h).status,'recorded'); assert.equal(rowOf(h).reviewed_by,null);
    const count=events(h).length; assert.equal(h.mirror.records[0].fields[F.actor],'');
    assert.equal((await run(h.env,{now:later(h.row,3)})).failed,0);
    assert.equal(rowOf(h).review_mirrored_revision_hash,rowOf(h).review_revision_hash); assert.equal(events(h).length,count);
  }finally{h.restore();}
});

test('post-cutoff review cannot alter structured preferences, member link or terminal decisions',async()=>{
  for(const mutate of [f=>f.fldxw53oA5eTu8MKy=['warm-energy'], f=>f.fld6I0jkPbACVSVWV=['recOther000000001'], f=>f.fldlR0h05dSjyDIcw='hiro']) {
    const h=await seed();
    try {
      expire(h); await run(h.env,{now:later(h.row,1)}); review(h,'recorded',2); mutate(h.mirror.records[0].fields);
      assert.equal((await run(h.env,{now:later(h.row,3)})).failed,1); assert.equal(rowOf(h).status,'pending_review');
      assert.equal(events(h).filter(e=>e.event_type==='review_reconciled').length,0);
    }finally{h.restore();}
  }
  const h=await seed();
  try {
    expire(h); review(h,'declined',1); await run(h.env,{now:later(h.row,2)});
    review(h,'recorded',3); assert.equal((await run(h.env,{now:later(h.row,4)})).failed,1);
    assert.equal(rowOf(h).status,'declined');
  }finally{h.restore();}
});

test('a D1 review write failure cannot erase an uncommitted post-cutoff proposal',async()=>{
  const h=await seed();
  try {
    expire(h); review(h,'recorded',1);
    const batch=h.db.batch.bind(h.db); let calls=0;
    h.db.batch=async statements=>{ if(++calls===2) throw new Error('fixture D1 unavailable'); return batch(statements); };
    assert.equal((await run(h.env,{now:later(h.row,2)})).failed,1);
    assert.equal(rowOf(h).note,''); assert.equal(rowOf(h).status,'pending_review');
    assert.equal(h.mirror.records[0].fields[F.actor],'operator:owner');
    assert.equal(events(h).filter(e=>e.event_type==='review_reconciled').length,0);
    h.db.batch=batch;
    assert.equal((await run(h.env,{now:later(h.row,3)})).failed,0);
    assert.equal(rowOf(h).status,'recorded'); assert.equal(rowOf(h).reviewed_by,null);
    assert.equal(h.mirror.records[0].fields[F.actor],'');
    assert.equal(events(h).filter(e=>e.event_type==='review_reconciled').length,1);
  }finally{h.restore();}
});
