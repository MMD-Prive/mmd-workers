// One SQLite-backed object per verified LINE identity and MINI App stage.
// Only server-generated session digests reach storage. No LINE token or subject.
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
}
