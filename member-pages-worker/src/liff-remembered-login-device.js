const DEVICE_RECORD_KEY = "credential";
const MAX_REMEMBERED_LOGIN_MS = 30 * 24 * 60 * 60 * 1000;

export class RememberedLoginDevice {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/credential") return json({ ok: false }, 404);

    if (request.method === "PUT") {
      const record = await request.json().catch(() => null);
      if (!isValidRecord(record)) return json({ ok: false, error: "invalid_record" }, 400);
      await this.state.storage.put(DEVICE_RECORD_KEY, record);
      await this.state.storage.setAlarm(record.expires_at);
      return json({ ok: true }, 200);
    }

    if (request.method === "GET") {
      const record = await this.state.storage.get(DEVICE_RECORD_KEY);
      if (!isValidRecord(record) || record.expires_at <= Date.now()) {
        await this.state.storage.delete(DEVICE_RECORD_KEY);
        return json({ ok: false, error: "credential_expired" }, 404);
      }
      return json({ ok: true, data: record }, 200);
    }

    if (request.method === "DELETE") {
      await this.state.storage.delete(DEVICE_RECORD_KEY);
      return json({ ok: true }, 200);
    }

    return json({ ok: false }, 405, { allow: "GET,PUT,DELETE" });
  }

  async alarm() {
    const record = await this.state.storage.get(DEVICE_RECORD_KEY);
    if (!isValidRecord(record) || record.expires_at <= Date.now()) {
      await this.state.storage.delete(DEVICE_RECORD_KEY);
      return;
    }
    await this.state.storage.setAlarm(record.expires_at);
  }
}

function isValidRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 1) return false;
  if (typeof value.line_user_id !== "string" || !/^U[A-Za-z0-9_-]{20,80}$/.test(value.line_user_id)) return false;
  if (typeof value.identity_key !== "string" || !/^[a-f0-9]{64}$/.test(value.identity_key)) return false;
  if (!Number.isFinite(value.issued_at) || !Number.isFinite(value.expires_at)) return false;
  return value.issued_at > 0
    && value.issued_at <= Date.now() + 1000
    && value.expires_at > value.issued_at
    && value.expires_at - value.issued_at <= MAX_REMEMBERED_LOGIN_MS + 1000;
}

function json(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}
