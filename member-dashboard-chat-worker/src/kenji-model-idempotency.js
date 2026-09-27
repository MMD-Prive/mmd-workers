const CLAIM_TTL_MS = 24 * 60 * 60 * 1000;
const CAMPAIGN_LEAD_PROCESSING_TTL_MS = 60 * 1000;
const CAMPAIGN_LEAD_TTL_MS = 24 * 60 * 60 * 1000;
const CAMPAIGN_CONTEXT_TTL_MS = 30 * 60 * 1000;
const CAMPAIGN_CONTEXT_KEY = "campaign-lead:context";
const MODEL_ACCESS_PENDING_TTL_MS = 10 * 60 * 1000;
const MODEL_ACCESS_PENDING_KEY = "model-access:pending";

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

    const path = new URL(request.url).pathname;
    if (path === "/campaign-lead/claim") {
      const action = String(input?.action || "claim");
      const key = String(input?.key || "");
      if (!/^[a-f0-9]{64}$/.test(key)) return json({ ok: false, error: "invalid_key" }, 400);
      const storageKey = `campaign-lead:${key}`;
      const now = Date.now();
      const claimToken = String(input?.claim_token || "");
      if (action === "release") {
        const released = await this.state.storage.transaction(async (txn) => {
          const existing = await txn.get(storageKey);
          if (!claimToken || existing?.status !== "processing" || existing.claim_token !== claimToken) return false;
          await txn.delete(storageKey);
          return true;
        });
        return json({ ok: true, released });
      }
      if (action === "commit") {
        const expiresAt = now + CAMPAIGN_LEAD_TTL_MS;
        const committed = await this.state.storage.transaction(async (txn) => {
          const existing = await txn.get(storageKey);
          if (!claimToken || existing?.status !== "processing" || existing.claim_token !== claimToken || Number(existing.expires_at) <= now) return false;
          await txn.put(storageKey, { status: "committed", claim_token: claimToken, expires_at: expiresAt });
          return true;
        });
        if (!committed) return json({ ok: true, committed: false });
        if (this.state.storage.getAlarm && this.state.storage.setAlarm) {
          const currentAlarm = await this.state.storage.getAlarm();
          if (!currentAlarm || currentAlarm > expiresAt) await this.state.storage.setAlarm(expiresAt);
        }
        return json({ ok: true, committed: true, expires_at: expiresAt });
      }
      if (action === "status") {
        const existing = await this.state.storage.get(storageKey);
        return json({
          ok: true,
          committed: Boolean(
            claimToken &&
            existing?.status === "committed" &&
            existing.claim_token === claimToken &&
            Number(existing.expires_at) > now
          ),
        });
      }
      if (action !== "claim") return json({ ok: false, error: "invalid_action" }, 400);
      const claim = await this.state.storage.transaction(async (txn) => {
        const existing = await txn.get(storageKey);
        if (Number(existing?.expires_at) > now) return { claimed: false, status: existing.status || "processing" };
        const expiresAt = now + CAMPAIGN_LEAD_PROCESSING_TTL_MS;
        const newClaimToken = crypto.randomUUID();
        await txn.put(storageKey, { status: "processing", claim_token: newClaimToken, expires_at: expiresAt });
        return { claimed: true, status: "processing", claim_token: newClaimToken, expires_at: expiresAt };
      });
      return json({ ok: true, ...claim });
    }

    if (path === "/campaign-lead/context") {
      const action = String(input?.action || "");
      const now = Date.now();
      if (action === "put") {
        const context = input?.context && typeof input.context === "object" ? input.context : null;
        const cardId = String(context?.card_id || "");
        const cardTrigger = String(context?.card_trigger || "").trim().slice(0, 40);
        const campaignKey = String(context?.campaign_key || "").trim().slice(0, 80);
        const leadInboxId = String(context?.lead_inbox_id || "").trim();
        const leadClaimKey = String(context?.lead_claim_key || "").trim();
        const leadClaimToken = String(context?.lead_claim_token || "").trim();
        if (
          cardId !== "21829530" ||
          !cardTrigger ||
          !campaignKey ||
          !/^line_[A-Za-z0-9_-]{1,120}$/.test(leadInboxId) ||
          !/^[a-f0-9]{64}$/.test(leadClaimKey) ||
          !/^[A-Za-z0-9-]{16,80}$/.test(leadClaimToken)
        ) {
          return json({ ok: false, error: "invalid_context" }, 400);
        }
        const expiresAt = now + CAMPAIGN_CONTEXT_TTL_MS;
        const contextToken = crypto.randomUUID();
        await this.state.storage.put(CAMPAIGN_CONTEXT_KEY, {
          card_id: cardId,
          card_trigger: cardTrigger,
          campaign_key: campaignKey,
          display_intent: String(context?.display_intent || "").trim().slice(0, 80),
          lead_inbox_id: leadInboxId,
          lead_claim_key: leadClaimKey,
          lead_claim_token: leadClaimToken,
          context_token: contextToken,
          action_type: String(context?.action_type || "text").trim().slice(0, 20),
          expires_at: expiresAt,
        });
        if (this.state.storage.getAlarm && this.state.storage.setAlarm) {
          const currentAlarm = await this.state.storage.getAlarm();
          if (!currentAlarm || currentAlarm > expiresAt) await this.state.storage.setAlarm(expiresAt);
        }
        return json({ ok: true, stored: true, context_token: contextToken, expires_at: expiresAt });
      }
      if (action === "get") {
        const context = await this.state.storage.get(CAMPAIGN_CONTEXT_KEY);
        if (!context || Number(context.expires_at) <= now) {
          if (context) await this.state.storage.delete(CAMPAIGN_CONTEXT_KEY);
          return json({ ok: true, found: false });
        }
        return json({ ok: true, found: true, context });
      }
      if (action === "delete") {
        const expectedLeadInboxId = String(input?.context?.lead_inbox_id || "").trim();
        const expectedContextToken = String(input?.context?.context_token || "").trim();
        const deleted = await this.state.storage.transaction(async (txn) => {
          const existing = await txn.get(CAMPAIGN_CONTEXT_KEY);
          if (
            !existing ||
            !expectedLeadInboxId ||
            !expectedContextToken ||
            existing.lead_inbox_id !== expectedLeadInboxId ||
            existing.context_token !== expectedContextToken
          ) return false;
          await txn.delete(CAMPAIGN_CONTEXT_KEY);
          return true;
        });
        return json({ ok: true, deleted, reason: deleted ? "" : "campaign_context_mismatch" });
      }
      return json({ ok: false, error: "invalid_action" }, 400);
    }

    if (path === "/model-access/pending") {
      const action = String(input?.action || "");
      const now = Date.now();
      if (action === "put") {
        const query = String(input?.query || "").trim().slice(0, 80);
        if (!query) return json({ ok: false, error: "invalid_query" }, 400);
        const expiresAt = now + MODEL_ACCESS_PENDING_TTL_MS;
        await this.state.storage.put(MODEL_ACCESS_PENDING_KEY, { query, expires_at: expiresAt });
        if (this.state.storage.getAlarm && this.state.storage.setAlarm) {
          const currentAlarm = await this.state.storage.getAlarm();
          if (!currentAlarm || currentAlarm > expiresAt) await this.state.storage.setAlarm(expiresAt);
        }
        return json({ ok: true, stored: true, expires_at: expiresAt });
      }
      if (action === "get") {
        const pending = await this.state.storage.get(MODEL_ACCESS_PENDING_KEY);
        if (!pending || Number(pending.expires_at) <= now || !String(pending.query || "").trim()) {
          if (pending) await this.state.storage.delete(MODEL_ACCESS_PENDING_KEY);
          return json({ ok: true, found: false });
        }
        return json({ ok: true, found: true, query: String(pending.query).slice(0, 80) });
      }
      if (action === "delete") {
        await this.state.storage.delete(MODEL_ACCESS_PENDING_KEY);
        return json({ ok: true, deleted: true });
      }
      return json({ ok: false, error: "invalid_action" }, 400);
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
    const campaignLeads = await this.state.storage.list({ prefix: "campaign-lead:" });
    const pending = await this.state.storage.get(MODEL_ACCESS_PENDING_KEY);
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
    for (const [key, value] of campaignLeads) {
      const expiresAt = Number(value?.expires_at) || 0;
      if (expiresAt <= now) expired.push(key);
      else if (!nextAlarm || expiresAt < nextAlarm) nextAlarm = expiresAt;
    }
    const pendingExpiresAt = Number(pending?.expires_at) || 0;
    if (pending && pendingExpiresAt <= now) expired.push(MODEL_ACCESS_PENDING_KEY);
    else if (pendingExpiresAt && (!nextAlarm || pendingExpiresAt < nextAlarm)) nextAlarm = pendingExpiresAt;
    if (expired.length) await this.state.storage.delete(expired);
    if (nextAlarm) await this.state.storage.setAlarm(nextAlarm);
  }
}
