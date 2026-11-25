import { randomUUID } from 'node:crypto';
import { closeSync, openSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createPartnerReplacementFlow } from '../../shared/partner-replacement-flow.mjs';
import { projectJobUpdate } from '../../shared/job-update-view.mjs';

// This adapter accepts process-local fixture actors only. There is no HTTP
// listener, production provider, outbound transport, or environment fallback.
const applicationId = 0x4d4d4452;
const sessionId = 'sess_STAGE_PARTNER_001';
const modelA = 'model_STAGE_A';
const modelB = 'model_STAGE_B';
const partner = 'partner_STAGE_001';
const customer = 'customer_STAGE_001';
const actors = Object.freeze({
  owner: { id: 'owner_STAGE_001', role: 'owner', partner },
  otherOwner: { id: 'owner_STAGE_OTHER', role: 'owner', partner: 'partner_STAGE_OTHER' },
  customer: { id: customer, role: 'customer' },
  otherCustomer: { id: 'customer_STAGE_OTHER', role: 'customer' },
  partner: { id: partner, role: 'partner', partner },
  modelA: { id: modelA, role: 'model' },
  modelB: { id: modelB, role: 'model' },
});
const parse = row => row ? JSON.parse(row.payload) : null;
const json = JSON.stringify;
const same = (a, b) => json(a) === json(b);
const fail = code => ({ ok: false, code });

export function createFixtureDatabase(path, { schedule, participantConfigDigest } = {}) {
  closeSync(openSync(path, 'wx', 0o600));
  const db = new DatabaseSync(path);
  try {
    db.exec(`
      BEGIN IMMEDIATE;
      PRAGMA application_id = ${applicationId};
      CREATE TABLE sessions (id TEXT PRIMARY KEY, payload TEXT NOT NULL) STRICT;
      CREATE TABLE reviews (session_id TEXT NOT NULL, next_model TEXT NOT NULL, payload TEXT NOT NULL,
        PRIMARY KEY (session_id, next_model)) STRICT;
      CREATE TABLE receipts (session_id TEXT NOT NULL, operation_key TEXT NOT NULL, payload TEXT NOT NULL,
        PRIMARY KEY (session_id, operation_key)) STRICT;
      CREATE TABLE customer_links (id TEXT PRIMARY KEY, payload TEXT NOT NULL) STRICT;
    `);
    const initial = {
      session_id: sessionId, generation: 1, revision: 'revision_STAGE_1',
      model: modelA, partner, customer, state: 'confirmed', credential: 1,
      model_credentials: 1, model_ack: true, customer_ack: true,
      reconfirm_ack: true, ready: true, replacement_verified: false, pending: null,
      schedule: schedule ?? { starts_at: '2026-11-26T12:00:00.000Z', duration_minutes: 90 },
      financial: { amount: 5000, payout: 4500, paid: 0 },
      partner_snapshot: { partner, model: modelA }, fields: {},
    };
    db.prepare('INSERT INTO sessions VALUES (?, ?)').run(sessionId, json(initial));
    db.prepare('INSERT INTO customer_links VALUES (?, ?)').run('link_STAGE_OLD', json({
      session_id: sessionId, generation: 1, revision: initial.revision,
      credential: 1, role: 'customer', customer, expires_at: Date.now() + 3600000,
    }));
    if (participantConfigDigest) {
      db.exec('CREATE TABLE participant_config (digest TEXT NOT NULL) STRICT');
      db.prepare('INSERT INTO participant_config VALUES (?)').run(participantConfigDigest);
    }
    db.exec('COMMIT');
  } finally {
    db.close();
  }
  return { sessionId, modelA, modelB, oldLink: 'link_STAGE_OLD' };
}

export function openFixtureStaging(path, { enabled = false } = {}) {
  function requireStagingDatabase(db) {
    if (db.prepare('PRAGMA application_id').get().application_id !== applicationId) {
      throw Error('Not a Partner replacement staging fixture database');
    }
  }
  const probe = new DatabaseSync(path, { readOnly: true });
  try { requireStagingDatabase(probe); } finally { probe.close(); }
  const db = new DatabaseSync(path);
  try { requireStagingDatabase(db); } catch (error) { db.close(); throw error; }

  const read = sid => parse(db.prepare('SELECT payload FROM sessions WHERE id = ?').get(sid));
  const write = row => {
    if (db.prepare('UPDATE sessions SET payload = ? WHERE id = ?').run(json(row), row.session_id).changes !== 1) {
      throw Error('Missing staging session');
    }
  };
  const readLink = id => parse(db.prepare('SELECT payload FROM customer_links WHERE id = ?').get(id));
  const actorFor = name => Object.hasOwn(actors, name) ? actors[name] : null;
  let inOrder = Promise.resolve();
  function fence(operation) {
    const result = inOrder.then(async () => {
      // The SQLite lock fences independent handles/processes. All writes,
      // readback, and receipts for this staging adapter use this transaction.
      db.exec('BEGIN IMMEDIATE');
      try {
        const value = await operation();
        db.exec('COMMIT');
        return value;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    });
    inOrder = result.catch(() => {});
    return result;
  }
  const providers = {
    now: Date.now,
    resolveActor: actorFor,
    readCustomerLink: readLink,
    reviewReplacement: (row, input) => parse(db.prepare(
      'SELECT payload FROM reviews WHERE session_id = ? AND next_model = ?',
    ).get(row.session_id, input.next_model)),
    withSessionFence: (sid, operation) => fence(() => {
      const owns = pending => same(read(sid)?.pending ?? null, pending);
      return operation({
        read: () => read(sid),
        receipt: key => parse(db.prepare(
          'SELECT payload FROM receipts WHERE session_id = ? AND operation_key = ?',
        ).get(sid, key)),
        claim: pending => {
          const row = read(sid);
          if (!row || row.pending) throw Error('Staging session is already pending');
          write({ ...row, pending });
        },
        owns,
        releaseOwn: pending => { if (owns(pending)) write({ ...read(sid), pending: null }); },
        complete: (pending, key, record) => {
          if (!owns(pending)) throw Error('Staging claim changed');
          db.prepare('INSERT INTO receipts VALUES (?, ?, ?)').run(sid, key, json(record));
          write({ ...read(sid), pending: null });
        },
      });
    }),
    prepare: ({ row: before, input }) => {
      const expected = structuredClone(before);
      const at = new Date().toISOString();
      let link;
      if (input.action === 'replace') {
        expected.generation++;
        expected.revision = randomUUID();
        expected.model = input.next_model;
        expected.partner_snapshot = { partner: before.partner, model: expected.model };
        expected.state = 'offered';
        expected.model_ack = expected.customer_ack = expected.reconfirm_ack = expected.ready = false;
        expected.replacement_verified = true;
        expected.fields = {
          ...before.fields, model_name: expected.model, customer_ack_at: null, model_ack_at: null,
          note: '[MMD JOB EDIT v1] ' + json({ request_id: randomUUID(), at, model_name: expected.model }),
        };
      } else if (input.action === 'issue_customer_link') {
        expected.credential++;
        link = {
          id: randomUUID(), session_id: expected.session_id, generation: expected.generation,
          revision: expected.revision, credential: expected.credential, role: 'customer',
          customer: expected.customer, expires_at: Date.now() + 3600000,
        };
      } else {
        expected.customer_ack = true;
        expected.fields.customer_ack_at = at;
      }
      return () => {
        // Retain the claimed fence while the contract compares the readback.
        write({ ...expected, pending: read(before.session_id).pending });
        if (link) db.prepare('INSERT INTO customer_links VALUES (?, ?)').run(link.id, json(link));
        return { expected, link, link_id: link?.id };
      };
    },
    verifyReadback: ({ after, written }) => {
      if (!after || !same({ ...after, pending: null }, written.expected)) return false;
      if (written.link && !same(readLink(written.link.id), written.link)) return false;
      const expected = !after.customer_ack ? 'awaiting_customer' : !after.model_ack ? 'awaiting_model' : 'acknowledged';
      return projectJobUpdate({ fields: after.fields })?.state === expected;
    },
  };
  const act = createPartnerReplacementFlow({ enabled, createProviders: () => providers });

  return {
    act,
    // Shared state for the loopback operator's cross-app rehearsal only.
    fixturePreview: () => fence(() => {
      const row = read(sessionId);
      if (!row || row.pending) return fail('pending_reconciliation');
      const stamp = { session_id: sessionId, generation: row.generation, revision: row.revision };
      const input = action => ({ ...stamp, action, operation_id: randomUUID() });
      const job_update = projectJobUpdate({ fields: row.fields });
      const scope = { job_update };
      return {
        ...stamp, state: row.state, model_name: row.model, schedule: row.schedule,
        views: { model: scope, customer: scope, partner: scope },
        inputs: {
          replace: { ...input('replace'), next_model: row.model === modelA ? modelB : modelA },
          issue: input('issue_customer_link'), ack: input('acknowledge'),
        },
        links: db.prepare('SELECT id, payload FROM customer_links').all().map(record => {
          const link = parse(record);
          return { id: record.id, generation: link.generation, current: link.generation === row.generation &&
            link.revision === row.revision && link.credential === row.credential && link.expires_at > Date.now() };
        }),
      };
    }),
    approveFixtureReview: (actorName, sid, nextModel, stamp) => fence(() => {
      if (!enabled) return fail('runtime_gate_closed');
      const row = read(sid);
      const actor = actorFor(actorName);
      if (!row || actor?.role !== 'owner' || actor.partner !== row.partner) return fail('ownership_required');
      if (stamp && (stamp.revision !== row.revision || stamp.generation !== row.generation)) return fail('offer_changed');
      if (![modelA, modelB].includes(nextModel) || row.model === nextModel || row.pending) return fail('fixture_review_rejected');
      const approval = { ok: true, before: row, partner: row.partner, next_model: nextModel };
      db.prepare('INSERT OR REPLACE INTO reviews VALUES (?, ?, ?)').run(sid, nextModel, json(approval));
      return { ok: true };
    }),
    view: (actorName, sid) => fence(() => {
      const row = read(sid);
      const actor = actorFor(actorName);
      const allowed = row && actor && (
        (actor.role === 'model' && actor.id === row.model) ||
        (actor.role === 'customer' && actor.id === row.customer) ||
        (['owner', 'partner'].includes(actor.role) && actor.partner === row.partner));
      if (!allowed) return fail('ownership_required');
      if (row.pending) return fail('pending_reconciliation');
      return {
        ok: true, session_id: row.session_id, generation: row.generation, revision: row.revision,
        state: row.state, model: row.model, schedule: row.schedule, customer_ack: row.customer_ack,
        allowed_actions: [], job_update: projectJobUpdate({ fields: row.fields }),
      };
    }),
    close: async () => { await inOrder; db.close(); },
  };
}
