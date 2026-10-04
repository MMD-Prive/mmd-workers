const USER_ID = /^U[0-9a-f]{32}$/i;
const EVENT_TYPES = new Set(["message", "postback", "follow", "unfollow"]);
const MESSAGE_TYPES = new Set(["text", "image", "video", "audio", "file", "location", "sticker"]);

async function hash(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

// Only call after verifying the original MMS LINE webhook signature. Store
// contact evidence, never infer membership, identity bindings or booking truth.
export async function persistVerifiedMmsContactEvents(events, env = {}) {
  const contacts = (Array.isArray(events) ? events : []).slice(0, 50).filter(event =>
    event?.source?.type === "user" && USER_ID.test(event.source.userId || "") &&
    EVENT_TYPES.has(event.type) && Number.isSafeInteger(event.timestamp) &&
    event.timestamp > 0 && event.timestamp <= Date.now() + 300_000 &&
    (event.type !== "message" || MESSAGE_TYPES.has(event.message?.type)) &&
    Boolean(event.webhookEventId || (event.type === "message" && event.message?.id))
  );
  if (!contacts.length) return { ok: true, persisted: 0 };
  const bucket = env.LINE_SLIP_EVIDENCE;
  if (typeof bucket?.put !== "function") throw new Error("mms_contact_history_storage_missing");

  const keys = new Set();
  for (const event of contacts) {
    const userId = event.source.userId;
    const timestamp = new Date(event.timestamp).toISOString();
    const contactHash = await hash(`mms:line:contact:v1:${userId}`);
    const reference = String(event.webhookEventId || event.message.id);
    const eventHash = await hash(`mms:line:event:v1:${userId}:${event.type}:${event.timestamp}:${reference}`);
    const key = `line-mms/customer-contact-history/v1/${timestamp.slice(0, 10)}/${contactHash}/${eventHash}.json`;
    if (keys.has(key)) continue;
    // Redelivery writes the identical object at the identical key. No mutable
    // last-contact counter that can regress under out-of-order webhooks.
    await bucket.put(key, JSON.stringify({
      schema: "mms_customer_contact_event_v1",
      tenant: "mms",
      channel: "line_mms",
      source_type: "user",
      line_user_id: userId,
      contact_hash: contactHash,
      event_hash: eventHash,
      event_type: event.type,
      message_type: event.type === "message" ? event.message.type : null,
      occurred_at: timestamp,
      membership_status: "not_verified",
      evidence_source: "verified_line_webhook",
    }), { httpMetadata: { contentType: "application/json" } });
    keys.add(key);
  }
  return { ok: true, persisted: keys.size };
}
