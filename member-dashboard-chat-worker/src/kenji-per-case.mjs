import { restrictedReplyCategories } from "./kenji-reply-category-gate.mjs";
import { KENJI_LIVE_TRUTH_AUTHORITY, resolveKenjiLineLiveTruth } from "./kenji-line-live-truth.mjs";
import { resolveKenjiLineClientIdentity } from "./kenji-line-customer-memory-runtime.mjs";

const KEY = "kenji-per-case:v1";
const DELAY = 10 * 60_000;
const TTL = 24 * 60 * 60_000;
const ID = /^U[0-9a-f]{32}$/i;
const SUBJECT = /^[0-9a-f]{24}$/;
const EVENT_KEY = /^[0-9a-f]{64}$/;
const TOKEN = /^[0-9a-f]{32}$/;
const PRIORITY = new Set(["potential", "black_card", "svip"]);
const FOLLOWUP_COPY = new Map([
  ["booking_details:per_review", "ขอทราบพื้นที่หรือจุดนัดที่สะดวกเพิ่มอีกนิดครับ เปอร์จะได้ตรวจรายละเอียดกับคิว"],
  ["location_details:per_review", "ขอทราบวันกับช่วงเวลาที่สะดวกด้วยครับ เปอร์จะได้ตรวจคู่กับสถานที่ที่ส่งมา"],
  ["budget_details:per_review", "ถ้ามีชื่อหรือรหัสคนที่สนใจ ฝากไว้ได้ครับ เปอร์จะได้ตรวจเรทให้ตรงกับบรีฟ"],
  ["budget_flexibility:per_review", "ถ้ามีชื่อหรือรหัสคนที่สนใจ ฝากไว้ได้ครับ เปอร์จะได้ตรวจเงื่อนไขให้ตรงกับบรีฟ"],
  ["model_reference:per_review", "ขอชื่อหรือรหัสคนที่หมายถึงหน่อยครับ เปอร์จะได้ตรวจให้ตรงคน"],
  ["clarify_open_case:per_review", "ขอทราบว่าต้องการให้เปอร์ช่วยดูจุดไหนของนัดนี้เพิ่มครับ"],
]);

export function perCasesEnabled(env = {}) {
  return env.KENJI_LINE_PER_HANDOFF_ENABLED === "true";
}

async function digest(value) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function callCase(env, subject, body) {
  if (!SUBJECT.test(subject) || !env.KENJI_MODEL_DEDUPE?.idFromName) return { ok: false };
  try {
    const binding = env.KENJI_MODEL_DEDUPE;
    const stub = binding.get(binding.idFromName("kenji-per-case-v1:" + subject));
    const response = await stub.fetch("https://kenji-model-dedupe.internal/kenji-per-case", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(1500),
    });
    return response.ok ? await response.json() : { ok: false };
  } catch {
    return { ok: false };
  }
}

// Only the signed MMD LINE handler registers a turn. Newer messages disarm a
// previous alarm even if the new message has no eligible automated answer.
export async function beginKenjiPerTurn(env, event) {
  const user = String(event.source?.userId || "");
  const id = String(event.message?.id || event.webhookEventId || "");
  const stamp = Number(event.timestamp);
  const now = Date.now();
  if (event.source?.type !== "user" || !["message", "postback", "unsend"].includes(event.type) ||
      event.mode === "standby" || event.deliveryContext?.isRedelivery === true ||
      !ID.test(user) || !/^[A-Za-z0-9._:-]{3,120}$/.test(id) ||
      !Number.isSafeInteger(stamp) || stamp < now - 300_000 || stamp > now + 60_000) return null;
  const subject = (await digest("line-per-case:" + user)).slice(0, 24);
  const key = await digest(id);
  return { subject, key, ...await callCase(env, subject, { action: "turn", key, stamp }) };
}

export async function readKenjiPerTakeover(env, lineUserId) {
  if (!perCasesEnabled(env)) return { ok: true, taken: false };
  if (!ID.test(lineUserId || "")) return { ok: false };
  const subject = (await digest("line-per-case:" + lineUserId)).slice(0, 24);
  return callCase(env, subject, { action: "owner" });
}

export async function kenjiPerMayReply(env, turn, event) {
  if (!turn) {
    const owner = await readKenjiPerTakeover(env, event.source?.userId);
    return owner.ok === true && owner.taken !== true;
  }
  const result = await callCase(env, turn.subject, { action: "reply", key: turn.key });
  return result.ok === true && result.allowed === true;
}

export function shouldDelayKenjiPerReply(decision = {}) {
  return decision.reply_source === "bounded_context_followup" && FOLLOWUP_COPY.has(decision.handoff_reason) &&
    !decision.guard_blocked;
}

export async function queueKenjiPerCase(env, event, turn, decision = {}, knownTruth = null) {
  if (turn?.ok !== true || turn.accepted !== true || turn.taken === true ||
      event.type !== "message" || event.message?.type !== "text") return;
  const chat = String(env.TELEGRAM_OPS_CHAT_ID || "");
  const thread = Number(env.TELEGRAM_ALERTS_THREAD_ID || env.TG_THREAD_ALERTS);
  const auth = env.AUTH_SERVICE_LINE_TO_TELEGRAM;
  if (!/^-\d+$/.test(chat) || !Number.isSafeInteger(thread) || thread <= 0 || !auth || !env.TELEGRAM_WORKER?.fetch) {
    console.warn("kenji_per_case_alert_unconfigured");
    return;
  }

  const [truth, identity] = await Promise.all([
    knownTruth?.ok === true ? knownTruth : resolveKenjiLineLiveTruth({ env, event, intent: "membership_status" }),
    resolveKenjiLineClientIdentity({ env, event }),
  ]);
  const member = truth?.membership;
  const level = truth?.ok === true && truth.authority === KENJI_LIVE_TRUTH_AUTHORITY && truth.identity_status === "resolved" &&
    identity.status !== "ambiguous" && member?.member_blocked !== true && ["active", "expiring_soon", "grace"].includes(member?.lifecycle)
    ? member.level : "";
  const priority = level === "svip" ? "svip" : ["vip", "black_card"].includes(level) ? "black_card"
    : identity.resolved === true && identity.imported_potential === true ? "potential" : "";
  if (!priority && decision.handoff_required !== true) return;

  const delayed = shouldDelayKenjiPerReply(decision) && !restrictedReplyCategories(env);
  const result = await callCase(env, turn.subject, {
    action: "reserve", key: turn.key, priority, ...(delayed ? { user: event.source.userId, reason: decision.handoff_reason } : {}),
  });
  if (!result.reserved || !TOKEN.test(result.token)) return;
  const label = { potential: "Potential", black_card: "VIP / Black Card", svip: "SVIP" }[priority] || "รอเปอร์ตรวจ";
  const callback = action => ["kpc", action, turn.subject, result.token].join("|");
  let sent = false;
  try {
    const response = await env.TELEGRAM_WORKER.fetch(new Request("https://telegram-worker/telegram/internal/send", {
      method: "POST",
      headers: { authorization: "Bearer " + auth, "content-type": "application/json" },
      body: JSON.stringify({
        flow: "alert", kenji_per_case: true, chat_id: chat, message_thread_id: thread,
        text: "MMD LINE · " + label + "\nเคส " + result.token.slice(0, 8) + " · เปิด LINE OA เพื่อตรวจข้อความครับ",
        reply_markup: { inline_keyboard: [[
          { text: "รับเรื่อง", callback_data: callback("a") },
          { text: "ตอบแล้ว", callback_data: callback("d") },
        ]] },
      }),
      signal: AbortSignal.timeout(4000),
    }));
    const body = await response.json().catch(() => null);
    sent = response.ok && body?.ok === true && body?.telegram?.ok === true;
  } catch {
    // Delivery may have happened despite the timeout. Never send it again.
  }
  const confirmed = await callCase(env, turn.subject, { action: "confirm", token: result.token, sent });
  if (!sent || confirmed.ok !== true) console.warn("kenji_per_case_alert_unconfirmed");
}

// Only invoked via the private binding, after Telegram verifies the ops owner.
export async function transitionKenjiPerCase(env, { action, subject, token } = {}) {
  if (!perCasesEnabled(env) || !TOKEN.test(token || "") || !["a", "d"].includes(action)) return { ok: false };
  return callCase(env, subject, { action, token });
}

export async function updateKenjiPerCase(storage, input) {
  const now = Date.now();
  return storage.transaction(async txn => {
    const saved = await txn.get(KEY);
    const current = saved?.expires > now ? saved : null;
    const taken = current?.state === "taken";
    switch (input.action) {
      case "turn": {
        if (!EVENT_KEY.test(input.key) || !Number.isSafeInteger(input.stamp) ||
            input.stamp < now - 300_000 || input.stamp > now + 60_000) return { ok: false };
        if (current && (input.key === current.key || current.seen?.includes(input.key) || input.stamp < current.stamp)) {
          return { ok: true, accepted: false, taken };
        }
        const keepOpen = current && (taken || current.state === "open");
        const next = {
          key: input.key, stamp: input.stamp, expires: keepOpen ? current.expires : now + TTL,
          seen: [input.key, ...(current?.seen || [])].slice(0, 32),
          ...(keepOpen ? { state: current.state, token: current.token, sent: current.sent, priority: current.priority } : {}),
        };
        await txn.put(KEY, next);
        await txn.setAlarm(next.expires);
        return { ok: true, accepted: true, taken };
      }
      case "owner":
        return { ok: true, taken };
      case "reply":
        return { ok: true, allowed: current?.key === input.key && !taken && current?.state !== "done" };
      case "reserve": {
        if (!current || current.key !== input.key || taken || current.state === "done") return { ok: true };
        const priority = PRIORITY.has(input.priority) ? input.priority : "";
        const delay = ID.test(input.user || "") && FOLLOWUP_COPY.has(input.reason) && now + DELAY < current.expires
          ? { user: input.user, reason: input.reason, due: now + DELAY } : {};
        if (current.token && (!priority || priority === current.priority || current.sent !== true)) {
          if (delay.due && !current.due) {
            await txn.put(KEY, { ...current, ...delay });
            if (current.sent === true) await txn.setAlarm(delay.due);
          }
          return { ok: true };
        }
        const token = crypto.randomUUID().replaceAll("-", "");
        const next = { ...current, token, state: "open", sent: false, priority, ...delay };
        await txn.put(KEY, next);
        return { ok: true, reserved: true, token };
      }
      case "confirm": {
        if (!current || current.token !== input.token) return { ok: false };
        const next = { ...current, sent: input.sent === true };
        await txn.put(KEY, next);
        if (next.sent && next.state === "open" && next.due) await txn.setAlarm(next.due);
        return { ok: true };
      }
      case "a":
      case "d": {
        if (!current || current.token !== input.token) return { ok: false };
        const { user, due, reason, ...rest } = current;
        const state = input.action === "d" || current.state === "done" ? "done" : "taken";
        await txn.put(KEY, { ...rest, state });
        await txn.setAlarm(current.expires);
        return { ok: true, state };
      }
      default:
        return { ok: false };
    }
  });
}

export async function runKenjiPerCaseAlarm(state, env) {
  const storage = state.storage;
  const now = Date.now();
  const pending = await storage.get(KEY);
  if (!pending) return false;
  if (pending.expires <= now) {
    await storage.transaction(async txn => {
      const latest = await txn.get(KEY);
      if (latest?.expires <= now) await txn.delete(KEY);
    });
    return true;
  }
  if (pending.state !== "open" || !pending.sent || !pending.due || pending.due > now) return true;
  const replyText = FOLLOWUP_COPY.get(pending.reason);
  const eligible = replyText && perCasesEnabled(env) && !restrictedReplyCategories(env) &&
    env.LINE_AUTO_REPLY_ENABLED === "true" && env.LINE_KENJI_AI_ENABLED === "true" &&
    ID.test(pending.user || "") && now - pending.due <= 60_000;

  const { requestKenjiRuntimeStatus, getLineOwnerTakeoverState, deliverLineText } = await import("./index.js");
  const { resolveKenjiLineContinuity } = await import("./kenji-line-continuity-runtime.mjs");
  const event = { source: { type: "user", userId: pending.user } };
  const [runtime, continuity] = eligible ? await Promise.all([
    requestKenjiRuntimeStatus(env).catch(() => ({ ok: false })),
    resolveKenjiLineContinuity({ env, event, currentIntent: "human_handoff" }).catch(() => null),
  ]) : [{ ok: false }, null];
  const owner = continuity?.available === true
    ? await getLineOwnerTakeoverState(env, pending.user, continuity,
      { signal: AbortSignal.timeout(1500), skipPerCase: true }) : null;

  // Serialize only the final bounded send with inbound updates and callbacks.
  await state.blockConcurrencyWhile(async () => {
    const latest = await storage.get(KEY);
    if (!latest || latest.key !== pending.key || latest.token !== pending.token ||
        latest.state !== "open" || latest.due !== pending.due) return;
    const { user, due, reason, ...rest } = latest;
    await storage.put(KEY, rest);
    await storage.setAlarm(latest.expires);
    if (!eligible || Date.now() - due > 60_000 || runtime.ok !== true || runtime.controls?.all_kenji_mutations === true ||
        runtime.controls?.line_oa_auto_reply === true || owner?.ok !== true || owner.active === true) return;
    try {
      const result = await deliverLineText(env, user, replyText, { trusted_event: true, signal: AbortSignal.timeout(4000) });
      if (result.ok !== true) console.warn("kenji_per_case_followup_unconfirmed");
    } catch {
      console.warn("kenji_per_case_followup_unconfirmed");
    }
  });
  return true;
}
