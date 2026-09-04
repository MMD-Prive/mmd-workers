import currentWorker from "./front-gate-single-file-shell.js";
export { KenjiModelIdempotency } from "./front-gate-single-file-shell.js";

const WORKER_NAME = "member-dashboard-chat-worker";
const QUEUE_SCHEMA = "line_slip_intake_queue_v1";
const LINE_WEBHOOK_PATHS = new Set(["/webhooks/line", "/webhooks/line/", "/webhook/line", "/webhook/line/"]);
const MAX_EVENTS_PER_WEBHOOK = 20;

const clean = (value) => String(value ?? "").trim();
const isEnabled = (value) => ["1", "true", "yes", "on"].includes(clean(value).toLowerCase());

function normalizePath(url) {
  return new URL(url).pathname.toLowerCase().replace(/\/{2,}/g, "/");
}

function imageQueueEnvelope(event = {}, now = new Date()) {
  const messageId = clean(event?.message?.id);
  if (event?.type !== "message" || event?.message?.type !== "image" || !messageId) return null;
  return {
    schema: QUEUE_SCHEMA,
    line_event_id: messageId,
    message_id: messageId,
    webhook_event_id: clean(event?.webhookEventId),
    enqueued_at: now.toISOString(),
  };
}

export async function enqueueLineSlipCandidates(request, env = {}, dependencies = {}) {
  if (!isEnabled(env.LINE_SLIP_QUEUE_ENABLED)) {
    return { ok: true, enabled: false, candidates: 0, enqueued: 0 };
  }
  if (!env.LINE_SLIP_INTAKE_QUEUE?.send) {
    return { ok: false, enabled: true, candidates: 0, enqueued: 0, error: "queue_binding_missing" };
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return { ok: false, enabled: true, candidates: 0, enqueued: 0, error: "invalid_json" };
  }

  const now = dependencies.now instanceof Date ? dependencies.now : new Date();
  const events = Array.isArray(payload?.events) ? payload.events.slice(0, MAX_EVENTS_PER_WEBHOOK) : [];
  const envelopes = events.map((event) => imageQueueEnvelope(event, now)).filter(Boolean);
  let enqueued = 0;
  for (const envelope of envelopes) {
    await env.LINE_SLIP_INTAKE_QUEUE.send(envelope);
    enqueued += 1;
  }
  return { ok: true, enabled: true, candidates: envelopes.length, enqueued };
}

function recordQueueTelemetry(result = {}) {
  const output = {
    event: "mmd_line_slip_queue_producer",
    enabled: result.enabled === true,
    ok: result.ok === true,
    candidates: Number(result.candidates) || 0,
    enqueued: Number(result.enqueued) || 0,
  };
  if (result.error) output.error = clean(result.error).slice(0, 80);
  console.log(JSON.stringify(output));
}

export default {
  async fetch(request, env = {}, ctx) {
    const path = normalizePath(request.url);
    const shouldQueue = request.method === "POST" && LINE_WEBHOOK_PATHS.has(path) && isEnabled(env.LINE_SLIP_QUEUE_ENABLED);
    const queueRequest = shouldQueue ? request.clone() : null;
    const response = await currentWorker.fetch(request, env, ctx);

    // The existing Cloudflare LINE owner verifies the LINE signature and runs
    // its normal webhook path first. Only an accepted webhook may enqueue a
    // minimal image candidate. No reply token, message text, profile, or raw
    // LINE user id is placed on the Queue; the consumer resolves the existing
    // Console Inbox record by message id after dequeue.
    if (queueRequest && response.ok) {
      const work = enqueueLineSlipCandidates(queueRequest, env)
        .then((result) => {
          recordQueueTelemetry(result);
          return result;
        })
        .catch((error) => {
          const result = { ok: false, enabled: true, candidates: 0, enqueued: 0, error: clean(error?.message || error) };
          recordQueueTelemetry(result);
          return result;
        });
      if (typeof ctx?.waitUntil === "function") ctx.waitUntil(work);
      else await work;
    }

    return response;
  },
};
