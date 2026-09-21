import { dispatchOpsNotification } from "./line-ops-notification-outbox.mjs";

export const HYPE_OBSERVER_HEALTH_SCHEMA = "hype_payment_observer_health_v1";
export const LINE_PAYMENT_OBSERVER_SCHEMA = "line_payment_evidence_v4";
const HEALTH_TABLE_DEFAULT = "MMD — HYPE Observer Health";
const PAYMENT_PROOFS_DEFAULT = "MMD — Payment Proofs";
const HELD_PREFIX = "line-ofc/held-evidence/";
const OUTBOX_PREFIX = "line-ofc/ops-outbox/";

function text(value, max = 4000) { return String(value ?? "").trim().slice(0, max); }
function num(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function positive(value, fallback, max = Infinity) { const n = Number(value); return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback; }
function bool(value) { return value === true; }
function safeCode(value, max = 120) { return text(value, max).replace(/[^A-Za-z0-9_.:-]/g, "_"); }

function thresholds(env = {}) {
  return {
    silenceWarningHours: positive(env.HYPE_OBSERVER_SILENCE_WARNING_HOURS, 24, 168),
    silenceCriticalHours: positive(env.HYPE_OBSERVER_SILENCE_CRITICAL_HOURS, 48, 336),
    heldNew1hWarning: positive(env.HYPE_OBSERVER_HELD_NEW_1H_WARNING, 5, 1000),
    heldOpenWarning: positive(env.HYPE_OBSERVER_HELD_OPEN_WARNING, 10, 10000),
    extractor1hCritical: positive(env.HYPE_OBSERVER_EXTRACTOR_FAILURES_1H_CRITICAL, 5, 1000),
    extractorConsecutiveCritical: positive(env.HYPE_OBSERVER_EXTRACTOR_CONSECUTIVE_CRITICAL, 3, 100),
  };
}

async function airtable(env = {}, tableName = "", params = null, init = {}) {
  const baseId = text(env.AIRTABLE_BASE_ID, 200);
  const token = text(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 2000);
  if (!baseId || !token) throw new Error("observer_health_airtable_config_missing");
  const target = encodeURIComponent(text(tableName, 200));
  const url = new URL("https://api.airtable.com/v0/" + baseId + "/" + target);
  if (params) for (const [k, v] of params.entries()) url.searchParams.append(k, v);
  const response = await fetch(url.toString(), {
    ...init,
    headers: { authorization: "Bearer " + token, "content-type": "application/json", ...(init.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("observer_health_airtable_" + response.status);
  return payload;
}

function paymentProofsTable(env = {}) { return text(env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || env.AIRTABLE_TABLE_PAYMENT_PROOFS || PAYMENT_PROOFS_DEFAULT, 200); }
function healthTable(env = {}) { return text(env.AIRTABLE_TABLE_HYPE_OBSERVER_HEALTH_ID || HEALTH_TABLE_DEFAULT, 200); }

async function readObserverProofMetrics(env = {}, nowMs = Date.now()) {
  const p = new URLSearchParams();
  p.set("maxRecords", "100");
  p.set("filterByFormula", "AND({channel}='line_ofc',OR(FIND('\"schema\":\"line_payment_evidence_v4\"',{note}),FIND('\"schema\":\"line_payment_evidence_v2\"',{note}),FIND('\"schema\":\"line_group_payment_evidence_v1\"',{note})))");
  p.set("sort[0][field]", "created_at");
  p.set("sort[0][direction]", "desc");
  const payload = await airtable(env, paymentProofsTable(env), p);
  const records = Array.isArray(payload.records) ? payload.records : [];
  let latestMs = 0;
  let accepted24h = 0;
  let v4LatestMs = 0;
  for (const record of records) {
    const created = Date.parse(record?.fields?.created_at || record?.createdTime || "");
    if (Number.isFinite(created)) {
      latestMs = Math.max(latestMs, created);
      if (nowMs - created <= 24 * 3600000) accepted24h += 1;
    }
    const note = text(record?.fields?.note, 20000);
    if (note.includes('"schema":"line_payment_evidence_v4"') && Number.isFinite(created)) v4LatestMs = Math.max(v4LatestMs, created);
  }
  return {
    observer_rows_scanned: records.length,
    last_accepted_slip_at: latestMs ? new Date(latestMs).toISOString() : null,
    accepted_last_24h: accepted24h,
    silence_hours: latestMs ? Math.max(0, (nowMs - latestMs) / 3600000) : null,
    membership_v4_last_seen_at: v4LatestMs ? new Date(v4LatestMs).toISOString() : null,
    real_v4_event_seen: v4LatestMs > 0,
  };
}

async function readJsonObject(bucket, key) {
  const object = await bucket.get(key);
  if (!object) return null;
  try { return JSON.parse(await object.text()); } catch { return null; }
}

async function listAll(bucket, prefix, hardLimit = 500) {
  if (!bucket?.list) return [];
  const objects = [];
  let cursor;
  do {
    const page = await bucket.list({ prefix, limit: Math.min(100, hardLimit - objects.length), ...(cursor ? { cursor } : {}) });
    objects.push(...(Array.isArray(page?.objects) ? page.objects : []));
    cursor = page?.truncated ? page.cursor : null;
  } while (cursor && objects.length < hardLimit);
  return objects.slice(0, hardLimit);
}

async function readRuntimeMetrics(env = {}, nowMs = Date.now()) {
  const bucket = env.LINE_SLIP_EVIDENCE;
  if (!bucket?.list || !bucket?.get) return { available: false };
  const [heldObjects, outboxObjects] = await Promise.all([
    listAll(bucket, HELD_PREFIX, 500),
    listAll(bucket, OUTBOX_PREFIX, 500),
  ]);
  let heldOpen = 0, heldNew1h = 0, extractorFailures1h = 0, extractorConsecutiveFailures = 0;
  for (const entry of heldObjects) {
    if (!text(entry?.key).endsWith("/state.json")) continue;
    const state = await readJsonObject(bucket, entry.key);
    if (!state?.proof_id) continue;
    heldOpen += 1;
    const created = num(state.created_at_ms, 0);
    const updated = num(state.updated_at_ms, created);
    if (created && nowMs - created <= 3600000) heldNew1h += 1;
    const reason = safeCode(state.last_error || state.hold_reason, 120);
    const extractorFailure = /extractor_(?:unavailable|failed)|extractor_unavailable_or_failed/.test(reason);
    if (extractorFailure && updated && nowMs - updated <= 3600000) extractorFailures1h += 1;
    if (extractorFailure) extractorConsecutiveFailures = Math.max(extractorConsecutiveFailures, num(state.attempts, 0) + 1);
  }
  let outboxRetryable = 0, outboxFailedTerminal = 0;
  for (const entry of outboxObjects) {
    if (!text(entry?.key).endsWith(".json")) continue;
    const record = await readJsonObject(bucket, entry.key);
    if (record?.status === "retryable") outboxRetryable += 1;
    if (record?.status === "failed_terminal") outboxFailedTerminal += 1;
  }
  return { available: true, held_open: heldOpen, held_new_1h: heldNew1h, extractor_failures_1h: extractorFailures1h, extractor_consecutive_failures: extractorConsecutiveFailures, outbox_retryable: outboxRetryable, outbox_failed_terminal: outboxFailedTerminal };
}

async function latestHealth(env = {}) {
  const p = new URLSearchParams();
  p.set("maxRecords", "1");
  p.set("sort[0][field]", "checked_at");
  p.set("sort[0][direction]", "desc");
  const payload = await airtable(env, healthTable(env), p);
  return Array.isArray(payload.records) ? payload.records[0] || null : null;
}

export function evaluateObserverHealth({ proof = {}, runtime = {}, previous = null, nowMs = Date.now(), config = {} } = {}) {
  const t = config.thresholds || thresholds(config.env || {});
  const codes = [];
  const silence = Number(proof.silence_hours);
  if (Number.isFinite(silence) && silence >= t.silenceCriticalHours) codes.push("slip_silent_48h");
  else if (Number.isFinite(silence) && silence >= t.silenceWarningHours) codes.push("slip_silent_24h");
  if (runtime.available && (num(runtime.held_new_1h) >= t.heldNew1hWarning || num(runtime.held_open) >= t.heldOpenWarning)) codes.push("held_spike");
  if (runtime.available && (num(runtime.extractor_failures_1h) >= t.extractor1hCritical || num(runtime.extractor_consecutive_failures) >= t.extractorConsecutiveCritical)) codes.push("extractor_degraded");
  if (runtime.available && num(runtime.outbox_failed_terminal) > 0) codes.push("outbox_failed_terminal");
  const heartbeatAt = new Date(nowMs).toISOString();
  const schemaAdvertised = LINE_PAYMENT_OBSERVER_SCHEMA === "line_payment_evidence_v4";
  if (!schemaAdvertised) codes.push("membership_v4_absent");

  const criticalCodes = new Set(["slip_silent_48h","extractor_degraded","outbox_failed_terminal","membership_v4_absent"]);
  let overall = codes.some((code) => criticalCodes.has(code)) ? "critical" : codes.length ? "warning" : "healthy";
  const previousFields = previous?.fields || {};
  const previousAlert = bool(previousFields.hype_alert_required);
  const previousCodes = Array.isArray(previousFields.alert_codes) ? previousFields.alert_codes.slice().sort() : [];
  const changed = JSON.stringify(previousCodes) !== JSON.stringify(codes.slice().sort()) || text(previousFields.overall_status) !== overall;
  const recovered = previousAlert && codes.length === 0;
  if (recovered) overall = "recovering";
  const alertRequired = codes.length > 0;
  return {
    checked_at: new Date(nowMs).toISOString(),
    observer: "line_payment_observer",
    overall_status: overall,
    ...proof,
    ...runtime,
    membership_v4_heartbeat_at: heartbeatAt,
    membership_v4_seen_after_deploy: schemaAdvertised,
    expected_schema: LINE_PAYMENT_OBSERVER_SCHEMA,
    alert_codes: recovered ? ["observer_recovered"] : codes,
    hype_alert_required: alertRequired,
    recovery_state: recovered ? "recovered" : alertRequired ? (previousAlert ? "ongoing" : "opened") : "none",
    should_notify: recovered || (alertRequired && (!previousAlert || changed)),
    recovered,
  };
}

function ownerSummary(health) {
  const parts = [];
  if (health.alert_codes.includes("slip_silent_48h")) parts.push("LINE slip silent " + Number(health.silence_hours).toFixed(1) + "h (critical)");
  else if (health.alert_codes.includes("slip_silent_24h")) parts.push("LINE slip silent " + Number(health.silence_hours).toFixed(1) + "h");
  if (health.alert_codes.includes("held_spike")) parts.push("held open " + num(health.held_open) + " / new 1h " + num(health.held_new_1h));
  if (health.alert_codes.includes("extractor_degraded")) parts.push("extractor failures 1h " + num(health.extractor_failures_1h) + " / consecutive " + num(health.extractor_consecutive_failures));
  if (health.alert_codes.includes("outbox_failed_terminal")) parts.push("outbox failed_terminal " + num(health.outbox_failed_terminal));
  if (health.alert_codes.includes("membership_v4_absent")) parts.push("membership observer v4 heartbeat absent");
  if (health.recovered) parts.push("observer recovered");
  if (!parts.length) parts.push("LINE payment observer healthy");
  parts.push(health.real_v4_event_seen ? "real v4 event seen" : "real v4 event not observed yet; runtime heartbeat is v4");
  return parts.join(" · ").slice(0, 2000);
}

async function persistHealth(env, health) {
  const fields = {
    health_id: "hype_observer_health_" + health.checked_at.replace(/[-:.]/g, ""),
    checked_at: health.checked_at,
    observer: health.observer,
    overall_status: health.overall_status,
    accepted_last_24h: num(health.accepted_last_24h),
    membership_v4_heartbeat_at: health.membership_v4_heartbeat_at,
    membership_v4_seen_after_deploy: health.membership_v4_seen_after_deploy === true,
    alert_codes: health.alert_codes,
    hype_alert_required: health.hype_alert_required === true,
    recovery_state: health.recovery_state,
    owner_summary: ownerSummary(health),
    source: HYPE_OBSERVER_HEALTH_SCHEMA,
    payload_json: JSON.stringify({
      schema: HYPE_OBSERVER_HEALTH_SCHEMA,
      expected_schema: LINE_PAYMENT_OBSERVER_SCHEMA,
      observer_rows_scanned: num(health.observer_rows_scanned),
      runtime_available: health.available === true,
      real_v4_event_seen: health.real_v4_event_seen === true,
      authority: { health_only: true, money_truth: "payments-worker", telegram_route_owner: "telegram-worker" },
    }),
  };
  if (health.last_accepted_slip_at) fields.last_accepted_slip_at = health.last_accepted_slip_at;
  if (Number.isFinite(Number(health.silence_hours))) fields.silence_hours = Number(health.silence_hours);
  if (health.membership_v4_last_seen_at) fields.membership_v4_last_seen_at = health.membership_v4_last_seen_at;
  if (health.available === true) {
    fields.held_open = num(health.held_open);
    fields.held_new_1h = num(health.held_new_1h);
    fields.extractor_failures_1h = num(health.extractor_failures_1h);
    fields.extractor_consecutive_failures = num(health.extractor_consecutive_failures);
    fields.outbox_retryable = num(health.outbox_retryable);
    fields.outbox_failed_terminal = num(health.outbox_failed_terminal);
  }
  const sourceSha = text(env.HYPE_OBSERVER_SOURCE_SHA, 80);
  if (sourceSha) fields.deployed_source_sha = sourceSha;
  return airtable(env, healthTable(env), null, { method:"POST", body: JSON.stringify({ records:[{ fields }] }) });
}

async function notifyHealth(env, health) {
  if (!health.should_notify) return { skipped:true, reason:"no_state_transition" };
  const chatId = text(env.TELEGRAM_OPS_CHAT_ID || env.TELEGRAM_CHAT_ID, 80);
  if (!chatId) return { skipped:true, reason:"telegram_chat_missing" };
  const threadId = Number(env.TELEGRAM_ALERTS_THREAD_ID || env.TG_THREAD_ALERTS) || 9;
  const level = health.recovered ? "🟢" : health.overall_status === "critical" ? "🔴" : "🟠";
  const message = [
    level + " HYPE · PAYMENT OBSERVER HEALTH",
    ownerSummary(health),
    "Checked: " + health.checked_at,
    "Health only — no payment, membership, points, booking or entitlement mutation.",
  ].join("\n");
  const stateKey = health.recovered ? "recovered" : health.alert_codes.slice().sort().join("+") || "healthy";
  return dispatchOpsNotification(env, {
    eventKey: "payment-observer-health:" + stateKey,
    purpose: "payment_observer_health",
    destination: { chat_id: chatId, message_thread_id: threadId, flow:"alert" },
    message,
  });
}

export async function runPaymentObserverHealth(env = {}, options = {}) {
  const nowMs = Number(options.now) || Date.now();
  const [proof, runtime, previous] = await Promise.all([
    readObserverProofMetrics(env, nowMs),
    readRuntimeMetrics(env, nowMs),
    latestHealth(env).catch(() => null),
  ]);
  const health = evaluateObserverHealth({ proof, runtime, previous, nowMs, config:{ env } });
  await persistHealth(env, health);
  const notification = await notifyHealth(env, health).catch((error) => ({ error:safeCode(error?.message || error) }));
  return { health, notification };
}

export const HYPE_OBSERVER_HEALTH_INTERNALS = Object.freeze({
  thresholds,
  readObserverProofMetrics,
  readRuntimeMetrics,
  latestHealth,
  ownerSummary,
});
