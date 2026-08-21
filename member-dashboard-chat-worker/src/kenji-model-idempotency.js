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
    const quotaKey = String(input?.quota_key || "");
    const quotaLimit = Number(input?.quota_limit);
    const quotaWindow = Number(input?.quota_window);
    const quotaWindowSeconds = Number(input?.quota_window_seconds);
    if (!/^[a-f0-9]{64}$/.test(quotaKey) || !Number.isInteger(quotaLimit) || quotaLimit < 1 || quotaLimit > 20 || !Number.isInteger(quotaWindow) || quotaWindow < 1 || !Number.isInteger(quotaWindowSeconds) || quotaWindowSeconds < 60 || quotaWindowSeconds > 86400) {
      return json({ ok: false, error: "invalid_quota" }, 400);
    }

    const now = Date.now();
    const expiresAt = now + CLAIM_TTL_MS;
    const quotaExpiresAt = (quotaWindow + 1) * quotaWindowSeconds * 1000;
    const claim = await this.state.storage.transaction(async (txn) => {
      const existing = await txn.get(`claim:${key}`);
      if (Number(existing?.expires_at) > now) return { claimed: false, quota_allowed: false, quota_count: 0 };
      const quotaStorageKey = `quota:${quotaWindow}:${quotaKey}`;
      const quotaEntry = await txn.get(quotaStorageKey);
      const quota = Number(quotaEntry?.count) || 0;
      if (quota >= quotaLimit) return { claimed: true, quota_allowed: false, quota_count: quota };
      await txn.put(`claim:${key}`, { expires_at: expiresAt });
      await txn.put(quotaStorageKey, { count: quota + 1, expires_at: quotaExpiresAt });
      return { claimed: true, quota_allowed: true, quota_count: quota + 1 };
    });

    if (claim.claimed && claim.quota_allowed && this.state.storage.getAlarm && this.state.storage.setAlarm) {
      const currentAlarm = await this.state.storage.getAlarm();
      const nextExpiry = Math.min(expiresAt, quotaExpiresAt);
      if (!currentAlarm || currentAlarm > nextExpiry) await this.state.storage.setAlarm(nextExpiry);
    }

    return json({ ok: true, ...claim, expires_at: claim.claimed ? expiresAt : null });
  }

  async alarm() {
    const now = Date.now();
    const claims = await this.state.storage.list({ prefix: "claim:" });
    const quotas = await this.state.storage.list({ prefix: "quota:" });
    const expired = [];
    let nextAlarm = 0;
    for (const [key, value] of claims) {
      const expiresAt = Number(value?.expires_at) || 0;
      if (expiresAt <= now) expired.push(key);
      else if (!nextAlarm || expiresAt < nextAlarm) nextAlarm = expiresAt;
    }
    for (const [key, value] of quotas) {
      const expiresAt = Number(value?.expires_at) || 0;
      if (expiresAt <= now) expired.push(key);
      else if (!nextAlarm || expiresAt < nextAlarm) nextAlarm = expiresAt;
    }
    if (expired.length) await this.state.storage.delete(expired);
    if (nextAlarm) await this.state.storage.setAlarm(nextAlarm);
  }
}
