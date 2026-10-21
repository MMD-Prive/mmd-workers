import { MMS_CHAT_POLICY, inspectChatMessage } from '../../shared/mms-chat-policy.mjs';

const ok = data => ({ ok: true, data });
const fail = (status, code, extra = {}) => ({ ok: false, status, error: { code, ...extra } });
const keyOf = actor => `${actor.role}:${actor.id}`;
const validActor = actor => actor && (actor.role === 'customer' ? /^mmsmem_[a-f0-9]{32}$/.test(actor.id) : actor.role === 'therapist' && /^[A-Za-z0-9_-]{4,80}$/.test(actor.id));

// One instance per room or account inbox. All room writes, moderation, replay
// checks and sequence assignment run synchronously in one SQLite transaction.
export class MmsChatStore {
  constructor(storage) {
    this.storage = storage;
    this.sql = storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS inbox (thread_id TEXT PRIMARY KEY, label TEXT NOT NULL, therapist_id TEXT NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (seq INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS attempts (actor TEXT NOT NULL, request_key TEXT NOT NULL, text TEXT NOT NULL, result TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(actor, request_key));
      CREATE TABLE IF NOT EXISTS holds (id TEXT PRIMARY KEY, actor TEXT NOT NULL, text TEXT NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL, review_requested INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, created_at INTEGER NOT NULL);
    `);
  }

  row(query, ...args) { return this.sql.exec(query, ...args).toArray()[0] || null; }
  state(key) { const row = this.row('SELECT value FROM state WHERE key=?', key); return row ? JSON.parse(row.value) : null; }
  put(key, value) { this.sql.exec('INSERT INTO state (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, JSON.stringify(value)); }

  consent(actor, version, now) {
    if (!validActor(actor)) return fail(401, 'MMS_CHAT_IDENTITY_REQUIRED');
    const stored = this.state('account');
    if (stored && stored !== keyOf(actor)) return fail(403, 'MMS_CHAT_NOT_FOUND');
    this.put('account', keyOf(actor));
    if (version !== undefined) {
      if (version !== MMS_CHAT_POLICY.version) return fail(409, 'MMS_CHAT_POLICY_REQUIRED');
      this.put('consent', { version, accepted_at: now });
    }
    return ok({ consent: this.state('consent'), policy: MMS_CHAT_POLICY, account_ref: keyOf(actor) });
  }

  initialize(room) {
    return this.storage.transactionSync(() => {
      const existing = this.state('room');
      if (existing && (existing.customer_id !== room.customer_id || existing.therapist_id !== room.therapist_id || existing.thread_id !== room.thread_id)) return fail(409, 'MMS_CHAT_ROOM_CONFLICT');
      if (!existing) this.put('room', room);
      return ok({ thread_id: room.thread_id });
    });
  }

  member(actor) {
    const room = this.state('room');
    return validActor(actor) && room && (actor.role === 'customer' ? room.customer_id === actor.id : room.therapist_id === actor.id) ? room : null;
  }

  join(actor, room, now) {
    if (!validActor(actor) || this.state('account') !== keyOf(actor)) return fail(403, 'MMS_CHAT_NOT_FOUND');
    if ((actor.role === 'customer' ? room.customer_id : room.therapist_id) !== actor.id) return fail(403, 'MMS_CHAT_NOT_FOUND');
    const existing = this.row('SELECT thread_id FROM inbox WHERE thread_id=?', room.thread_id);
    if (!existing && this.row('SELECT COUNT(*) AS count FROM inbox').count >= 200) return fail(429, 'MMS_CHAT_THREAD_LIMIT');
    const label = actor.role === 'customer' ? room.therapist_label : `ลูกค้า MY MMS · ${room.thread_id.slice(-6)}`;
    this.sql.exec('INSERT INTO inbox (thread_id,label,therapist_id,updated_at) VALUES (?,?,?,?) ON CONFLICT(thread_id) DO UPDATE SET updated_at=MAX(inbox.updated_at,excluded.updated_at)', room.thread_id, label, room.therapist_id, now);
    return ok({ thread_id: room.thread_id });
  }

  threads(actor, after = '') {
    if (!validActor(actor) || this.state('account') !== keyOf(actor)) return fail(403, 'MMS_CHAT_NOT_FOUND');
    const rows = this.sql.exec('SELECT * FROM inbox WHERE thread_id>? ORDER BY thread_id LIMIT 51', after).toArray();
    return ok({ threads: rows.slice(0, 50), next: rows.length > 50 ? rows[49].thread_id : null, account_ref: keyOf(actor) });
  }

  read(actor, after = null, before = null) {
    const room = this.member(actor);
    if (!room) return fail(404, 'MMS_CHAT_NOT_FOUND');
    let rows;
    if (after !== null) rows = this.sql.exec('SELECT seq,role,text,created_at FROM messages WHERE seq>? ORDER BY seq LIMIT 51', after).toArray();
    else rows = this.sql.exec('SELECT seq,role,text,created_at FROM messages WHERE seq<? ORDER BY seq DESC LIMIT 51', before ?? Number.MAX_SAFE_INTEGER).toArray();
    const more = rows.length > 50;
    rows = rows.slice(0, 50);
    if (after === null) rows.reverse();
    return ok({ thread_id: room.thread_id, therapist_id: room.therapist_id, label: actor.role === 'customer' ? room.therapist_label : `ลูกค้า MY MMS · ${room.thread_id.slice(-6)}`, messages: rows, more, direction: after === null ? 'older' : 'newer' });
  }

  send(actor, text, requestKey, now) {
    return this.storage.transactionSync(() => {
      if (!this.member(actor)) return fail(404, 'MMS_CHAT_NOT_FOUND');
      if (typeof text !== 'string' || text.trim().length === 0 || text.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return fail(400, 'MMS_CHAT_MESSAGE_INVALID');
      if (!/^[a-zA-Z0-9_-]{16,80}$/.test(requestKey)) return fail(400, 'MMS_CHAT_REQUEST_KEY_INVALID');
      const actorKey = keyOf(actor);
      const replay = this.row('SELECT text,result FROM attempts WHERE actor=? AND request_key=?', actorKey, requestKey);
      if (replay) return replay.text === text ? JSON.parse(replay.result) : fail(409, 'MMS_CHAT_REQUEST_CONFLICT');
      if (this.row('SELECT COUNT(*) AS count FROM attempts WHERE actor=? AND created_at>?', actorKey, now - 60_000).count >= 20) return fail(429, 'MMS_CHAT_RATE_LIMITED');
      const previous = this.sql.exec('SELECT text FROM messages WHERE actor=? AND created_at>? ORDER BY seq DESC LIMIT 6', actorKey, now - 10 * 60_000).toArray().reverse().map(row => row.text);
      const decision = inspectChatMessage(text, previous);
      let result;
      if (decision.code) {
        const holdId = `mmshold_${crypto.randomUUID().replaceAll('-', '')}`;
        this.sql.exec('INSERT INTO holds (id,actor,text,reason,created_at) VALUES (?,?,?,?,?)', holdId, actorKey, text, decision.code, now);
        result = fail(422, decision.code, { hold_id: holdId });
      } else {
        const row = this.row('INSERT INTO messages (actor,role,text,created_at) VALUES (?,?,?,?) RETURNING seq,role,text,created_at', actorKey, actor.role, text.trim(), now);
        result = ok({ message: row });
      }
      this.sql.exec('INSERT INTO attempts (actor,request_key,text,result,created_at) VALUES (?,?,?,?,?)', actorKey, requestKey, text, JSON.stringify(result), now);
      return result;
    });
  }

  requestReview(actor, holdId) {
    if (!this.member(actor)) return fail(404, 'MMS_CHAT_NOT_FOUND');
    const hold = this.row('SELECT id FROM holds WHERE id=? AND actor=?', holdId, keyOf(actor));
    if (!hold) return fail(404, 'MMS_CHAT_REVIEW_NOT_FOUND');
    this.sql.exec('UPDATE holds SET review_requested=1 WHERE id=?', holdId);
    return ok({ review_id: holdId, status: 'requested', delivered: false });
  }

  queueReview(id, threadId, now) {
    this.sql.exec('INSERT OR IGNORE INTO reviews (id,thread_id,created_at) VALUES (?,?,?)', id, threadId, now);
    return ok({ review_id: id, status: 'requested', delivered: false });
  }

  reviewQueue(after = '') {
    const rows = this.sql.exec('SELECT * FROM reviews WHERE id>? ORDER BY id LIMIT 51', after).toArray();
    return ok({ reviews: rows.slice(0, 50), next: rows.length > 50 ? rows[49].id : null });
  }

  reviewDetail(id) {
    const hold = this.row('SELECT * FROM holds WHERE id=? AND review_requested=1', id);
    return hold ? ok({ ...hold, thread_id: this.state('room')?.thread_id }) : fail(404, 'MMS_CHAT_REVIEW_NOT_FOUND');
  }
}
