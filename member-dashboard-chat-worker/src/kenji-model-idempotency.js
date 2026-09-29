const CLAIM_TTL_MS = 24 * 60 * 60 * 1000;
const CAMPAIGN_LEAD_PROCESSING_TTL_MS = 60 * 1000;
const CAMPAIGN_LEAD_TTL_MS = 24 * 60 * 60 * 1000;
const CAMPAIGN_CONTEXT_TTL_MS = 30 * 60 * 1000;
const CAMPAIGN_CONTEXT_KEY = "campaign-lead:context";
const CAMPAIGN_INGRESS_KEY = "campaign-ingress:event";
const CAMPAIGN_INGRESS_ALIAS_KEY = "campaign-ingress:message-alias";
const CAMPAIGN_INGRESS_DONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CAMPAIGN_INGRESS_DEAD_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CAMPAIGN_INGRESS_MAX_ATTEMPTS = 6;
const CAMPAIGN_INGRESS_ALERT_RETRY_MS = 15 * 60 * 1000;
const MODEL_ACCESS_PENDING_TTL_MS = 10 * 60 * 1000;
const MODEL_ACCESS_PENDING_KEY = "model-access:pending";
const LINE_TURN_BUFFER_KEY = "line-turn-buffer:v1";

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export class KenjiModelIdempotency {
  constructor(state, env = {}) {
    this.state = state;
    this.env = env;
  }

  async notifyCampaignIngressOwner(entry = {}) {
    if (!entry.receipt_id || !this.env.TELEGRAM_WORKER?.fetch) return { sent: false, reason: "owner_alert_binding_missing" };
    const token = String(this.env.AUTH_SERVICE_LINE_TO_TELEGRAM || this.env.INTERNAL_TOKEN || "").trim();
    const chatId = String(this.env.TELEGRAM_OPS_CHAT_ID || this.env.TELEGRAM_CHAT_ID || "").trim();
    if (!token || !chatId) return { sent: false, reason: "owner_alert_config_missing" };
    const threadId = Number(this.env.TELEGRAM_ALERTS_THREAD_ID || this.env.TG_THREAD_ALERTS || 9) || 9;
    try {
      const response = await this.env.TELEGRAM_WORKER.fetch(new Request("https://telegram-worker/telegram/internal/send", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          flow: "alert",
          chat_id: chatId,
          message_thread_id: threadId,
          text: [
            "⚠️ LINE Card 21829530 · durable ingress needs owner review",
            `Receipt: ${entry.receipt_id}`,
            `State: ${String(entry.status || "dead").slice(0, 40)}`,
            `Reason: ${String(entry.reason || "processor_failed").slice(0, 80)}`,
            `Attempts: ${Number(entry.attempts) || 0}`,
            "Action: inspect the authenticated ingress status; reprocess only after the cause is fixed.",
            "Authority: notification_only · no customer data or reply authority is included.",
          ].join("\n"),
        }),
      }));
      return { sent: response.ok, reason: response.ok ? "" : "owner_alert_failed", status: response.status };
    } catch (_) {
      return { sent: false, reason: "owner_alert_failed" };
    }
  }

  async sendPendingCampaignIngressAlert() {
    const entry = await this.state.storage.get(CAMPAIGN_INGRESS_KEY);
    if (!entry || entry.status !== "dead" || entry.alert_sent === true || Number(entry.next_alert_at) > Date.now()) return false;
    const result = await this.notifyCampaignIngressOwner(entry);
    const now = Date.now();
    await this.state.storage.transaction(async (txn) => {
      const current = await txn.get(CAMPAIGN_INGRESS_KEY);
      if (!current || current.status !== "dead" || current.alert_sent === true) return;
      const next = result.sent
        ? { ...current, alert_sent: true, alert_status: result.status || 200, alerted_at: now }
        : { ...current, alert_sent: false, alert_reason: result.reason, next_alert_at: now + CAMPAIGN_INGRESS_ALERT_RETRY_MS };
      await txn.put(CAMPAIGN_INGRESS_KEY, next);
      await this.state.storage.setAlarm(result.sent ? current.expires_at : next.next_alert_at);
    });
    return result.sent;
  }

  async cleanupCampaignIngressUnsend() {
    const entry = await this.state.storage.get(CAMPAIGN_INGRESS_KEY);
    if (!entry || entry.status !== "cancelled" || entry.cleanup_pending !== true) return true;
    let result = { ok: false };
    try {
      const { processDurableLineCardUnsend } = await import("./index.js");
      result = await processDurableLineCardUnsend(entry.event_id, this.env, entry.subject_hash);
    } catch (_) {}
    const now = Date.now();
    await this.state.storage.transaction(async (txn) => {
      const current = await txn.get(CAMPAIGN_INGRESS_KEY);
      if (!current || current.status !== "cancelled" || current.event_id !== entry.event_id) return;
      const next = result.ok === true
        ? { ...current, cleanup_pending: false, cleanup_completed_at: now }
        : { ...current, cleanup_pending: true, cleanup_reason: String(result.reason || "unsend_cleanup_failed").slice(0, 80), next_cleanup_at: now + CAMPAIGN_INGRESS_ALERT_RETRY_MS };
      await txn.put(CAMPAIGN_INGRESS_KEY, next);
      await this.state.storage.setAlarm(result.ok === true ? current.expires_at : next.next_cleanup_at);
    });
    if (result.ok !== true && entry.cleanup_alert_sent !== true) {
      const alert = await this.notifyCampaignIngressOwner({ ...entry, status: "cancelled", reason: String(result.reason || "unsend_cleanup_failed").slice(0, 80) });
      await this.state.storage.transaction(async (txn) => {
        const current = await txn.get(CAMPAIGN_INGRESS_KEY);
        if (!current || current.status !== "cancelled" || current.event_id !== entry.event_id) return;
        await txn.put(CAMPAIGN_INGRESS_KEY, { ...current, cleanup_alert_sent: alert.sent === true });
      });
    }
    return result.ok === true;
  }

  async processCampaignIngress() {
    const now = Date.now();
    const entry = await this.state.storage.transaction(async (txn) => {
      const current = await txn.get(CAMPAIGN_INGRESS_KEY);
      if (!current || current.status !== "pending" || Number(current.next_attempt_at) > now) return null;
      const next = { ...current, status: "processing", lease_token: crypto.randomUUID(), lease_expires_at: now + 60_000 };
      await txn.put(CAMPAIGN_INGRESS_KEY, next);
      await this.state.storage.setAlarm(next.lease_expires_at);
      return next;
    });
    if (!entry) return { ok: true, processed: false };
    let outcome;
    try {
      const { processDurableLineCardEvent } = await import("./index.js");
      outcome = await processDurableLineCardEvent(entry.event, this.env, entry.received_at);
    } catch (_) {
      outcome = { ok: false, reason: "campaign_processor_failed" };
    }
    const completedAt = Date.now();
    const attempts = Number(entry.attempts || 0) + 1;
    const dead = outcome.ok !== true && (attempts >= CAMPAIGN_INGRESS_MAX_ATTEMPTS || outcome.queue_status === 422);
    const delay = outcome.reason === "campaign_lead_already_claimed" ? 61_000 : Math.min(60_000, 1000 * 2 ** (attempts - 1));
    const finalStatus = await this.state.storage.transaction(async (txn) => {
      const current = await txn.get(CAMPAIGN_INGRESS_KEY);
      if (current?.status === "cancelled" && current.event_id === entry.event_id) {
        const next = { ...current, cleanup_pending: true, next_cleanup_at: completedAt };
        await txn.put(CAMPAIGN_INGRESS_KEY, next);
        await this.state.storage.setAlarm(completedAt);
        return "cancelled";
      }
      if (current?.status !== "processing" || current.lease_token !== entry.lease_token) return current?.status || "missing";
      const next = outcome.ok === true
        ? { event_id: entry.event_id, webhook_event_id: entry.webhook_event_id, receipt_id: entry.receipt_id, status: "done", attempts, expires_at: completedAt + CAMPAIGN_INGRESS_DONE_TTL_MS, replied: outcome.replied === true, reply_suppressed: outcome.reply_suppressed === true }
        : dead
          ? { event_id: entry.event_id, webhook_event_id: entry.webhook_event_id, receipt_id: entry.receipt_id, event: entry.event, status: "dead", attempts, reason: String(outcome.reason || "processor_failed").slice(0, 80), alert_sent: false, next_alert_at: completedAt, expires_at: completedAt + CAMPAIGN_INGRESS_DEAD_TTL_MS }
          : { ...entry, status: "pending", attempts, reason: String(outcome.reason || "processor_failed").slice(0, 80), next_attempt_at: completedAt + delay };
      await txn.put(CAMPAIGN_INGRESS_KEY, next);
      await this.state.storage.setAlarm(next.expires_at || next.next_attempt_at);
      return next.status;
    });
    if (finalStatus === "cancelled") await this.cleanupCampaignIngressUnsend();
    if (finalStatus === "dead") await this.sendPendingCampaignIngressAlert();
    if (finalStatus === "dead") console.log(JSON.stringify({ line_card_ingress: "dead_letter", reason: String(outcome.reason || "processor_failed").slice(0, 80), attempts }));
    return { ok: outcome.ok === true, processed: true, status: finalStatus, reason: outcome.reason || "" };
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
    if (path === "/line-turn-buffer") {
      const action = String(input?.action || "");
      const eventId = String(input?.event_id || "");
      const windowMs = Math.min(5_000, Math.max(500, Number(input?.window_ms) || 2_200));
      const maxMessages = Math.min(8, Math.max(2, Number(input?.max_messages) || 4));
      if (!["put", "claim"].includes(action) || !/^[A-Za-z0-9._:-]{3,120}$/.test(eventId)) {
        return json({ ok: false, error: "invalid_turn_buffer_request" }, 400);
      }
      const now = Date.now();
      if (action === "put") {
        const messageText = String(input?.text || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 2400);
        const count = Math.min(8, Math.max(1, Number(input?.count) || 1));
        if (!messageText) return json({ ok: false, error: "turn_text_required" }, 400);
        const result = await this.state.storage.transaction(async (txn) => {
          const existing = await txn.get(LINE_TURN_BUFFER_KEY);
          const entries = Array.isArray(existing?.entries) ? existing.entries : [];
          const fresh = entries.filter((entry) => now - Number(entry.received_at || 0) <= windowMs * 2);
          const duplicate = fresh.some((entry) => entry.event_id === eventId);
          const nextEntries = duplicate
            ? fresh
            : [...fresh, { event_id: eventId, text: messageText, count, received_at: Number(input?.received_at) || now }]
                .sort((a, b) => Number(a.received_at || 0) - Number(b.received_at || 0))
                .slice(-maxMessages);
          await txn.put(LINE_TURN_BUFFER_KEY, { entries: nextEntries, expires_at: now + windowMs * 3 });
          await this.state.storage.setAlarm(now + windowMs * 3);
          return { duplicate, size: nextEntries.length };
        });
        return json({ ok: true, stored: true, duplicate: result.duplicate, size: result.size });
      }

      const result = await this.state.storage.transaction(async (txn) => {
        const existing = await txn.get(LINE_TURN_BUFFER_KEY);
        const entries = (Array.isArray(existing?.entries) ? existing.entries : [])
          .filter((entry) => now - Number(entry.received_at || 0) <= windowMs)
          .sort((a, b) => Number(a.received_at || 0) - Number(b.received_at || 0))
          .slice(-maxMessages);
        if (!entries.length) {
          await txn.delete(LINE_TURN_BUFFER_KEY);
          return { should_reply: true, aggregate_text: "", count: 1, superseded: false };
        }
        const latest = entries[entries.length - 1];
        if (latest.event_id !== eventId) {
          return { should_reply: false, aggregate_text: "", count: 0, superseded: true };
        }
        await txn.delete(LINE_TURN_BUFFER_KEY);
        return {
          should_reply: true,
          aggregate_text: entries.map((entry) => entry.text).filter(Boolean).join("\n").slice(0, 2400),
          count: entries.reduce((sum, entry) => sum + Math.max(1, Number(entry.count) || 1), 0),
          superseded: false,
        };
      });
      return json({ ok: true, ...result });
    }
    if (path === "/campaign-lead/message-alias") {
      const action = String(input?.action || "bind");
      const messageId = String(input?.message_id || "");
      const receiptId = String(input?.receipt_id || "");
      const webhookEventId = String(input?.webhook_event_id || "");
      const subjectHash = String(input?.subject_hash || "");
      if (
        !["bind", "cancel", "lookup"].includes(action) ||
        !/^[A-Za-z0-9_-]{1,120}$/.test(messageId) ||
        (action !== "lookup" && !/^[a-f0-9]{64}$/.test(receiptId)) ||
        !/^[a-f0-9]{64}$/.test(subjectHash) ||
        (action === "bind" && !/^[A-Za-z0-9_-]{1,120}$/.test(webhookEventId))
      ) {
        return json({ ok: false, error: "invalid_message_alias" }, 400);
      }
      if (action === "lookup") {
        const existing = await this.state.storage.get(CAMPAIGN_INGRESS_ALIAS_KEY);
        if (existing && (existing.message_id !== messageId || existing.subject_hash !== subjectHash)) {
          return json({ ok: false, error: "event_key_collision" }, 409);
        }
        return json({ ok: true, found: Boolean(existing), receipt_id: existing?.receipt_id || "" });
      }
      const now = Date.now();
      const result = await this.state.storage.transaction(async (txn) => {
        const existing = await txn.get(CAMPAIGN_INGRESS_ALIAS_KEY);
        if (existing && (
          existing.message_id !== messageId ||
          existing.subject_hash !== subjectHash ||
          (action === "bind" && existing.receipt_id !== receiptId && !(existing.cancelled === true && !existing.webhook_event_id)) ||
          (action === "bind" && existing.webhook_event_id && existing.webhook_event_id !== webhookEventId)
        )) {
          return { ok: false, error: "event_key_collision" };
        }
        // An unsend can arrive before the message. Its receipt is keyed by
        // message.id because the webhookEventId is not known yet.
        if (action === "bind" && existing?.cancelled === true && !existing.webhook_event_id) {
          return { ok: true, duplicate: true, cancelled: true, receipt_id: existing.receipt_id };
        }
        const next = action === "cancel"
          ? {
              ...(existing || {}),
              message_id: messageId,
              receipt_id: existing?.receipt_id || receiptId,
              subject_hash: subjectHash,
              cancelled: true,
              expires_at: now + CAMPAIGN_INGRESS_DONE_TTL_MS,
            }
          : {
              message_id: messageId,
              receipt_id: receiptId,
              webhook_event_id: webhookEventId,
              subject_hash: subjectHash,
              cancelled: existing?.cancelled === true,
              expires_at: now + CAMPAIGN_INGRESS_DONE_TTL_MS,
            };
        await txn.put(CAMPAIGN_INGRESS_ALIAS_KEY, next);
        await this.state.storage.setAlarm(next.expires_at);
        return { ok: true, duplicate: Boolean(existing), cancelled: next.cancelled === true, receipt_id: next.receipt_id };
      });
      return json(result, result.ok ? 200 : 409);
    }
    if (path === "/campaign-lead/ingress") {
      const action = String(input?.action || "enqueue");
      if (action === "process") return json(await this.processCampaignIngress());
      if (action === "status") {
        const entry = await this.state.storage.get(CAMPAIGN_INGRESS_KEY);
        return json({
          ok: true,
          found: Boolean(entry),
          receipt_id: String(entry?.receipt_id || ""),
          status: entry?.status || "missing",
          attempts: Number(entry?.attempts) || 0,
          reason: String(entry?.reason || "").slice(0, 80),
          alert_sent: entry?.alert_sent === true,
          alert_reason: String(entry?.alert_reason || "").slice(0, 80),
          cleanup_pending: entry?.cleanup_pending === true,
          cleanup_alert_sent: entry?.cleanup_alert_sent === true,
          reply_suppressed: entry?.reply_suppressed === true,
        });
      }
      if (action === "reprocess") {
        const changed = await this.state.storage.transaction(async (txn) => {
          const entry = await txn.get(CAMPAIGN_INGRESS_KEY);
          if (entry?.status !== "dead" || !entry.event) return false;
          await txn.put(CAMPAIGN_INGRESS_KEY, { ...entry, status: "pending", attempts: 0, reason: "", next_attempt_at: Date.now() });
          await this.state.storage.setAlarm(Date.now() + 1000);
          return true;
        });
        return json({ ok: true, reprocessed: changed });
      }
      if (action === "unsend") {
        const eventId = String(input?.event_id || "");
        const receiptId = String(input?.receipt_id || "");
        const subjectHash = String(input?.subject_hash || "");
        if (!/^[A-Za-z0-9_-]{1,120}$/.test(eventId) || !/^[a-f0-9]{64}$/.test(receiptId) || !/^[a-f0-9]{64}$/.test(subjectHash)) {
          return json({ ok: false, error: "invalid_unsend" }, 400);
        }
        const now = Date.now();
        const result = await this.state.storage.transaction(async (txn) => {
          const existing = await txn.get(CAMPAIGN_INGRESS_KEY);
          if (existing?.event_id && existing.event_id !== eventId) return { ok: false, error: "event_key_collision" };
          await txn.put(CAMPAIGN_INGRESS_KEY, {
            event_id: eventId,
            webhook_event_id: existing?.webhook_event_id || "",
            receipt_id: receiptId,
            subject_hash: subjectHash,
            status: "cancelled",
            attempts: Number(existing?.attempts) || 0,
            processed_before_unsend: existing?.status === "done",
            cleanup_pending: ["processing", "done", "dead"].includes(existing?.status),
            expires_at: now + CAMPAIGN_INGRESS_DONE_TTL_MS,
          });
          await this.state.storage.setAlarm(now + CAMPAIGN_INGRESS_DONE_TTL_MS);
          return { ok: true, cancelled: true, previous_status: existing?.status || "missing" };
        });
        if (!result.ok) return json(result, 409);
        const cleaned = ["processing", "done", "dead"].includes(result.previous_status)
          ? await this.cleanupCampaignIngressUnsend()
          : true;
        return json({ ...result, cleanup_pending: !cleaned });
      }
      if (action !== "enqueue") return json({ ok: false, error: "invalid_action" }, 400);
      const event = input?.event;
      // LINE unsend events reference message.id, so message events must use the
      // same durable key even when webhookEventId is also present.
      const eventId = String(event?.message?.id || event?.webhookEventId || "");
      const webhookEventId = String(event?.webhookEventId || eventId);
      const receiptId = String(input?.receipt_id || "");
      if (!/^[a-f0-9]{64}$/.test(receiptId) || !/^[A-Za-z0-9_-]{1,120}$/.test(eventId) || event?.type !== "message" || event?.message?.type !== "text" || event?.source?.type !== "user" || !/^U[a-f0-9]{32}$/i.test(String(event?.source?.userId || "")) || typeof event?.message?.text !== "string" || event.message.text.length > 5000) {
        return json({ ok: false, error: "invalid_event" }, 400);
      }
      const receivedAt = Date.now();
      const result = await this.state.storage.transaction(async (txn) => {
        const existing = await txn.get(CAMPAIGN_INGRESS_KEY);
        if (existing) {
          if (existing.event_id !== eventId || existing.webhook_event_id !== webhookEventId) return { ok: false, error: "event_key_collision" };
          if (existing.status === "cancelled") return { ok: true, accepted: false, cancelled: true, status: existing.status, duplicate: true };
          return { ok: true, accepted: true, status: existing.status, duplicate: true };
        }
        await txn.put(CAMPAIGN_INGRESS_KEY, {
          event_id: eventId,
          webhook_event_id: webhookEventId,
          receipt_id: receiptId,
          status: "pending",
          attempts: 0,
          received_at: receivedAt,
          next_attempt_at: receivedAt,
          event: {
            type: "message", mode: event.mode, timestamp: event.timestamp, webhookEventId: event.webhookEventId,
            replyToken: event.replyToken, deliveryContext: event.deliveryContext,
            source: { type: "user", userId: event.source.userId },
            message: { type: "text", id: event.message.id, text: event.message.text },
          },
        });
        await this.state.storage.setAlarm(receivedAt + 1000);
        return { ok: true, accepted: true, status: "pending", duplicate: false };
      });
      return json(result, result.ok ? 200 : 409);
    }
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
          campaignKey !== "line_card_21829530_lead_v1" ||
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
        const { brief_claim: _briefClaim, ...safeContext } = context;
        return json({ ok: true, found: true, context: safeContext });
      }
      if (action === "claim") {
        const claim = await this.state.storage.transaction(async (txn) => {
          const context = await txn.get(CAMPAIGN_CONTEXT_KEY);
          if (!context || Number(context.expires_at) <= now) return { found: false, claimed: false };
          if (context.campaign_key !== "line_card_21829530_lead_v1" || context.card_id !== "21829530" || !context.lead_inbox_id) {
            return { found: true, claimed: false, reason: "invalid_context" };
          }
          if (context.consumed === true || Number(context.brief_claim?.expires_at) > now) {
            const { brief_claim: _briefClaim, ...safeContext } = context;
            return { found: true, claimed: false, reason: "context_already_claimed", context: safeContext };
          }
          const claimToken = crypto.randomUUID();
          await txn.put(CAMPAIGN_CONTEXT_KEY, {
            ...context,
            brief_claim: { token: claimToken, expires_at: Math.min(context.expires_at, now + CAMPAIGN_LEAD_PROCESSING_TTL_MS) },
          });
          return { found: true, claimed: true, claim_token: claimToken, context };
        });
        return json({ ok: true, ...claim });
      }
      if (action === "release" || action === "commit") {
        const claimToken = String(input?.context?.claim_token || "");
        const changed = await this.state.storage.transaction(async (txn) => {
          const context = await txn.get(CAMPAIGN_CONTEXT_KEY);
          if (!claimToken || !context || context.consumed === true || context.brief_claim?.token !== claimToken || Number(context.brief_claim.expires_at) <= now) return false;
          const next = { ...context };
          delete next.brief_claim;
          if (action === "commit") next.consumed = true;
          await txn.put(CAMPAIGN_CONTEXT_KEY, next);
          return true;
        });
        return json({ ok: true, [action === "commit" ? "committed" : "released"]: changed });
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
    const ingress = await this.state.storage.get(CAMPAIGN_INGRESS_KEY);
    if (ingress?.status === "pending" && Number(ingress.next_attempt_at) <= Date.now()) await this.processCampaignIngress();
    else if (ingress?.status === "processing" && Number(ingress.lease_expires_at) <= Date.now()) {
      await this.state.storage.put(CAMPAIGN_INGRESS_KEY, { ...ingress, status: "pending", next_attempt_at: Date.now() });
      await this.processCampaignIngress();
    } else if (ingress?.expires_at && Number(ingress.expires_at) <= Date.now()) await this.state.storage.delete(CAMPAIGN_INGRESS_KEY);
    else if (ingress?.status === "dead" && ingress.alert_sent !== true && Number(ingress.next_alert_at) <= Date.now()) await this.sendPendingCampaignIngressAlert();
    else if (ingress?.status === "cancelled" && ingress.cleanup_pending === true && Number(ingress.next_cleanup_at) <= Date.now()) await this.cleanupCampaignIngressUnsend();
    const now = Date.now();
    const claims = await this.state.storage.list({ prefix: "claim:" });
    const quotas = await this.state.storage.list({ prefix: "quota:" });
    const campaignLeads = await this.state.storage.list({ prefix: "campaign-lead:" });
    const pending = await this.state.storage.get(MODEL_ACCESS_PENDING_KEY);
    const turnBuffer = await this.state.storage.get(LINE_TURN_BUFFER_KEY);
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
    const turnBufferExpiresAt = Number(turnBuffer?.expires_at) || 0;
    if (turnBuffer && turnBufferExpiresAt <= now) expired.push(LINE_TURN_BUFFER_KEY);
    else if (turnBufferExpiresAt && (!nextAlarm || turnBufferExpiresAt < nextAlarm)) nextAlarm = turnBufferExpiresAt;
    if (expired.length) await this.state.storage.delete(expired);
    const currentIngress = await this.state.storage.get(CAMPAIGN_INGRESS_KEY);
    // Processing retains its earlier queue time; scheduling that past value
    // would wake the object repeatedly until the lease actually expires.
    const ingressAlarmAt = currentIngress?.status === "processing"
      ? currentIngress.lease_expires_at
      : currentIngress?.next_attempt_at || currentIngress?.next_alert_at || currentIngress?.next_cleanup_at || currentIngress?.expires_at;
    const ingressAlarm = Number(ingressAlarmAt) || 0;
    if (ingressAlarm && (!nextAlarm || ingressAlarm < nextAlarm)) nextAlarm = ingressAlarm;
    const messageAlias = await this.state.storage.get(CAMPAIGN_INGRESS_ALIAS_KEY);
    const aliasExpiresAt = Number(messageAlias?.expires_at) || 0;
    if (messageAlias && aliasExpiresAt <= now) await this.state.storage.delete(CAMPAIGN_INGRESS_ALIAS_KEY);
    else if (aliasExpiresAt && (!nextAlarm || aliasExpiresAt < nextAlarm)) nextAlarm = aliasExpiresAt;
    if (nextAlarm) await this.state.storage.setAlarm(nextAlarm);
  }
}
