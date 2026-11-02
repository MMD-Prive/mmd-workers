// One SQLite-backed object per verified LINE identity and MINI App stage.
// Only server-generated session digests reach storage. No LINE token or subject.
import {
  BY_YOUR_REQUEST_MONTHLY_LIMIT,
  buildByYourRequestFields,
  customerScopedPersonKey,
  enforceMonthlyQuota,
  monthKeyInBangkok,
  stableRequestId,
} from '../../admin-worker/src/by-your-request.js';

export class MemberAccountStore {
  constructor(storage) {
    this.storage = storage;
    this.sql = storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS account (
      singleton INTEGER PRIMARY KEY CHECK(singleton=1),
      member_id TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
      phone TEXT NOT NULL, email TEXT NOT NULL, language TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      notice_version TEXT NOT NULL, marketing_consent INTEGER NOT NULL DEFAULT 0
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS sessions (
      digest TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
      line_name TEXT NOT NULL
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS by_your_request (
      request_id TEXT PRIMARY KEY, source TEXT NOT NULL, source_id TEXT NOT NULL,
      customer_identity TEXT NOT NULL, requested_person_key TEXT NOT NULL,
      requested_person_label TEXT NOT NULL, inquiry_text TEXT NOT NULL,
      sent_at TEXT NOT NULL, month_key TEXT NOT NULL, social_links TEXT NOT NULL,
      social_handles_verified INTEGER NOT NULL DEFAULT 0, media_status TEXT NOT NULL,
      media_references TEXT NOT NULL, review_status TEXT NOT NULL,
      archival_import INTEGER NOT NULL DEFAULT 0, privacy_level TEXT NOT NULL,
      identity_unknown INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
      UNIQUE(source, source_id)
    )`);
    for (const column of [
      'identity_evidence_note TEXT NOT NULL DEFAULT ""',
      'identity_evidence_at TEXT NOT NULL DEFAULT ""',
      'identity_evidence_source TEXT NOT NULL DEFAULT ""',
      'identity_confidence TEXT NOT NULL DEFAULT "unknown"',
    ]) { try { this.sql.exec(`ALTER TABLE by_your_request ADD COLUMN ${column}`); } catch (_) { /* already present */ } }
  }

  openSession(digest, lineName, now, ttl) {
    return this.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM sessions WHERE expires_at <= ?', now);
      this.sql.exec('INSERT INTO sessions VALUES (?, ?, ?, ?)', digest, now + ttl, now, lineName);
      this.sql.exec('DELETE FROM sessions WHERE digest IN (SELECT digest FROM sessions ORDER BY created_at DESC, rowid DESC LIMIT -1 OFFSET 8)');
      return this.view(digest, now);
    });
  }

  view(digest, now) {
    const session = this.sql.exec('SELECT line_name FROM sessions WHERE digest=? AND expires_at>?', digest, now).toArray()[0];
    if (!session) return null;
    const row = this.sql.exec('SELECT * FROM account WHERE singleton=1').toArray()[0];
    if (!row) return { registered: false, line_display_name: session.line_name };
    const { singleton, marketing_consent, ...profile } = row;
    return { registered: true, line_display_name: session.line_name, profile: {
      ...profile, marketing_consent: Boolean(marketing_consent),
      phone_verified: false, email_verified: false,
      service: 'male_massage', status: 'registered',
    } };
  }

  saveProfile(digest, profile, registering, now, noticeVersion) {
    return this.storage.transactionSync(() => {
      const current = this.view(digest, now);
      if (!current) return { error: 'MMS_SESSION_REQUIRED' };
      if (registering && current.registered) return current; // duplicate/retried enrollment
      if (!registering && !current.registered) return { error: 'MMS_REGISTRATION_REQUIRED' };
      const timestamp = new Date(now).toISOString();
      if (registering) {
        const memberId = 'mmsmem_' + crypto.randomUUID().replaceAll('-', '');
        this.sql.exec('INSERT INTO account VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          memberId, profile.display_name, profile.phone, profile.email, profile.language,
          timestamp, timestamp, noticeVersion, Number(profile.marketing_consent));
      } else {
        this.sql.exec('UPDATE account SET display_name=?,phone=?,email=?,language=?,marketing_consent=?,updated_at=? WHERE singleton=1',
          profile.display_name, profile.phone, profile.email, profile.language,
          Number(profile.marketing_consent), timestamp);
      }
      return this.view(digest, now);
    });
  }

  logout(digest) { this.sql.exec('DELETE FROM sessions WHERE digest=?', digest); }

  async createByYourRequest(digest, input, now = Date.now()) {
    const current = this.view(digest, now);
    if (!current?.registered) return { error: 'MMS_REGISTRATION_REQUIRED' };
    const customerIdentity = current.profile.member_id;
    const source = input.archivalImport === true ? 'historical_line' : 'my_mmd';
    const sourceId = input.sourceId || `mymmd:${crypto.randomUUID()}`;
    const requestedPersonKey = await customerScopedPersonKey(customerIdentity, input.requestedPersonKey);
    const requestId = await stableRequestId({ source, sourceId, customerIdentity, requestedPersonKey });
    const fields = buildByYourRequestFields({ ...input, source, sourceId, customerIdentity, requestedPersonKey, requestId, submittedAt: new Date(now).toISOString(), archivalImport: false });
    const result = this.storage.transactionSync(() => {
      const existing = this.sql.exec('SELECT * FROM by_your_request WHERE request_id=?', requestId).toArray()[0];
      if (existing) return { duplicate: true, record: this.#requestRow(existing), quota: this.#quota(customerIdentity, requestedPersonKey, now) };
      const records = this.sql.exec('SELECT customer_identity, requested_person_key, month_key, archival_import FROM by_your_request WHERE customer_identity=?', customerIdentity).toArray();
      const quota = enforceMonthlyQuota({ existingRecords: records, customerIdentity, requestedPersonKey, at: new Date(now) });
      if (!quota.allowed) return { error: 'BY_YOUR_REQUEST_MONTHLY_LIMIT', quota: { ...quota, limit: BY_YOUR_REQUEST_MONTHLY_LIMIT } };
      this.sql.exec(`INSERT INTO by_your_request (request_id,source,source_id,customer_identity,requested_person_key,requested_person_label,inquiry_text,sent_at,month_key,social_links,social_handles_verified,media_status,media_references,review_status,archival_import,privacy_level,identity_unknown,created_at,identity_evidence_note,identity_evidence_at,identity_evidence_source,identity_confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        requestId, fields.Source, fields['Source ID'], customerIdentity, fields['Requested Person Key'], fields['Requested Person Label'], fields['Original Inquiry'], fields['Sent At'], fields['Month Key'], fields['Submitted Social Links'], fields['Social Handles Verified'] === 'yes' ? 1 : 0, fields['Media Status'], fields['Media References'], fields['Review Status'], 0, fields['Privacy Level'], fields['Unknown Identity Explicit'] === 'yes' ? 1 : 0, new Date(now).toISOString(), fields['Identity Evidence Note'], fields['Identity Evidence At'], fields['Identity Evidence Source'], fields['Identity Confidence']);
      return { record: this.#requestRow(this.sql.exec('SELECT * FROM by_your_request WHERE request_id=?', requestId).toArray()[0]), quota: this.#quota(customerIdentity, requestedPersonKey, now) };
    });
    return result;
  }

  listByYourRequests(digest, now = Date.now()) {
    const current = this.view(digest, now);
    if (!current?.registered) return { error: 'MMS_REGISTRATION_REQUIRED' };
    const customerIdentity = current.profile.member_id;
    const records = this.sql.exec('SELECT * FROM by_your_request WHERE customer_identity=? ORDER BY created_at DESC', customerIdentity).toArray().map((row) => this.#requestRow(row));
    const quota = this.#quota(customerIdentity, null, now);
    return { records, quota };
  }

  #quota(customerIdentity, requestedPersonKey, now) {
    const monthKey = monthKeyInBangkok(new Date(now));
    const records = this.sql.exec('SELECT customer_identity, requested_person_key, month_key, archival_import FROM by_your_request WHERE customer_identity=?', customerIdentity).toArray();
    const unique = new Set(records.filter((row) => !row.archival_import && row.month_key === monthKey).map((row) => row.requested_person_key));
    return { month_key: monthKey, limit: BY_YOUR_REQUEST_MONTHLY_LIMIT, used: unique.size, remaining: Math.max(0, BY_YOUR_REQUEST_MONTHLY_LIMIT - unique.size), requested_person_key: requestedPersonKey || null };
  }

  #requestRow(row) {
    if (!row) return null;
    return { request_id: row.request_id, source: row.source, source_id: row.source_id, requested_person_key: row.requested_person_key, requested_person_label: row.requested_person_label, inquiry_text: row.inquiry_text, sent_at: row.sent_at, month_key: row.month_key, social_links: row.social_links ? row.social_links.split('\\n').filter(Boolean) : [], social_handles_verified: Boolean(row.social_handles_verified), media_status: row.media_status, media_references: JSON.parse(row.media_references || '[]'), review_status: row.review_status, archival_import: Boolean(row.archival_import), identity_unknown: Boolean(row.identity_unknown), identity_evidence_note: row.identity_evidence_note || '', identity_evidence_at: row.identity_evidence_at || '', identity_evidence_source: row.identity_evidence_source || '', identity_confidence: row.identity_confidence || 'unknown', privacy_level: row.privacy_level };
  }
}
