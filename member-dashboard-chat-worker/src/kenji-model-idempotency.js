const CLAIM_TTL_MS = 24 * 60 * 60 * 1000;

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export class KenjiModelIdempotency {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
    let input;
    try {
      input = await request.json();
    } catch (_) {
      return json({ ok: false, error: "invalid_json" }, 400);
    }

    const key = String(input?.key || "");
    if (!/^[a-f0-9]{64}$/.test(key)) return json({ ok: false, error: "invalid_key" }, 400);

    const now = Date.now();
    const expiresAt = now + CLAIM_TTL_MS;
    const claimed = await this.state.storage.transaction(async (txn) => {
      const existing = await txn.get(`claim:${key}`);
      if (Number(existing?.expires_at) > now) return false;
      await txn.put(`claim:${key}`, { expires_at: expiresAt });
      return true;
    });

    if (claimed && this.state.storage.getAlarm && this.state.storage.setAlarm) {
      const currentAlarm = await this.state.storage.getAlarm();
      if (!currentAlarm || currentAlarm > expiresAt) await this.state.storage.setAlarm(expiresAt);
    }

    return json({ ok: true, claimed, expires_at: claimed ? expiresAt : null });
  }

  async alarm() {
    const now = Date.now();
    const claims = await this.state.storage.list({ prefix: "claim:" });
    const expired = [];
    let nextAlarm = 0;
    for (const [key, value] of claims) {
      const expiresAt = Number(value?.expires_at) || 0;
      if (expiresAt <= now) expired.push(key);
      else if (!nextAlarm || expiresAt < nextAlarm) nextAlarm = expiresAt;
    }
    if (expired.length) await this.state.storage.delete(expired);
    if (nextAlarm) await this.state.storage.setAlarm(nextAlarm);
  }
}
