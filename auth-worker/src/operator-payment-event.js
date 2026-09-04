const ACCESS_LOG_TABLE = "System — Access Log";
const ENTITLEMENT_TABLE = "MMD — Member Entitlements";
const ACTION = "membership_payment_evidence";
const AUTH_HEADER = "authorization";
const IDEMPOTENCY_HEADER = "idempotency-key";
const AUTHORITY = "my_mmd_entitlement_resolver_v1";
const PAYMENT_VERIFIED_EVENT = "membership_payment_verified";

export const OPERATOR_PAYMENT_EVENT_PATH = "/member/api/operator/membership/payment-event";

export async function handleOperatorPaymentEvent(request, env = {}) {
  const auth = authorize(request, env);
  if (!auth.ok) {
    return auditedResponse(env, {
      status: 401,
      payload: { ok: false, error: auth.error, authority: AUTHORITY },
      audit: {
        result: "fail",
        reason: auth.error,
        source_ref: `operator-payment-auth:${makeEventId()}`,
        evidence: { request_path: safeText(new URL(request.url).pathname, 180) },
        actor: "lovable_operator",
      },
    });
  }

  const body = await request.json().catch(() => null);
  const parsed = validatePaymentEvent(body, request.headers.get(IDEMPOTENCY_HEADER));
  if (!parsed.ok) {
    return auditedResponse(env, {
      status: 400,
      payload: { ok: false, error: "invalid_payment_event", details: parsed.errors, authority: AUTHORITY },
      audit: {
        result: "fail",
        reason: "invalid_payment_event",
        source_ref: `operator-payment-invalid:${makeEventId()}`,
        member_email: normalizeEmail(body?.member_email || body?.email),
        evidence: { errors: parsed.errors },
        actor: safeActor(body?.verified_by),
      },
    });
  }

  const evidence = parsed.value;
  const payloadHash = await sha256(stableJson(evidence.payload));
  const sourceRef = `operator-payment:${evidence.idempotency_key}`;

  let existing;
  try {
    existing = await findCanonicalEvidence(env, sourceRef);
  } catch (error) {
    return json({ ok: false, error: "operator_payment_idempotency_lookup_failed", failure_class: safeFailure(error), authority: AUTHORITY }, 503);
  }

  if (existing) {
    const existingHash = safeText(existing.payload_hash, 128);
    if (existingHash === payloadHash) {
      const duplicatePayload = {
        ok: true,
        accepted: true,
        duplicate: true,
        event_id: existing.event_id,
        resolution: existing.resolution || "pending_canonical_resolution",
        authority: AUTHORITY,
      };
      const response = await auditedResponse(env, {
        status: 200,
        payload: duplicatePayload,
        audit: {
          result: "success",
          reason: "duplicate",
          source_ref: `operator-payment-duplicate:${evidence.idempotency_key}:${makeEventId()}`,
          member_email: evidence.payload.member_email,
          evidence: {
            idempotency_key: evidence.idempotency_key,
            payload_hash: payloadHash,
            original_event_id: existing.event_id,
            event: evidence.payload.event,
          },
          actor: evidence.payload.verified_by,
        },
      });
      return withVerifiedPaymentHypeAlert(env, response, evidence);
    }

    return auditedResponse(env, {
      status: 409,
      payload: { ok: false, error: "idempotency_payload_mismatch", accepted: false, duplicate: false, authority: AUTHORITY },
      audit: {
        result: "fail",
        reason: "idempotency_payload_mismatch",
        source_ref: `operator-payment-mismatch:${evidence.idempotency_key}:${makeEventId()}`,
        member_email: evidence.payload.member_email,
        evidence: { idempotency_key: evidence.idempotency_key, payload_hash: payloadHash, original_event_id: existing.event_id },
        actor: evidence.payload.verified_by,
      },
    });
  }

  let memberMatch;
  try {
    memberMatch = await matchCanonicalMember(env, evidence.payload.member_email);
  } catch (error) {
    return auditedResponse(env, {
      status: 503,
      payload: { ok: false, error: "canonical_member_lookup_failed", failure_class: safeFailure(error), authority: AUTHORITY },
      audit: {
        result: "fail",
        reason: "canonical_member_lookup_failed",
        source_ref: `operator-payment-member-lookup:${evidence.idempotency_key}:${makeEventId()}`,
        member_email: evidence.payload.member_email,
        evidence: { idempotency_key: evidence.idempotency_key, payload_hash: payloadHash },
        actor: evidence.payload.verified_by,
      },
    });
  }

  const eventId = makeEventId();
  const resolution = memberMatch.matched ? "pending_canonical_resolution" : "needs_member_match";
  const responseStatus = memberMatch.matched ? 200 : 202;
  const responsePayload = {
    ok: true,
    accepted: true,
    duplicate: false,
    event_id: eventId,
    resolution,
    authority: AUTHORITY,
  };

  const response = await auditedResponse(env, {
    status: responseStatus,
    payload: responsePayload,
    audit: {
      event_id: eventId,
      result: "success",
      reason: resolution,
      source_ref: sourceRef,
      member_email: evidence.payload.member_email,
      evidence: {
        idempotency_key: evidence.idempotency_key,
        payload_hash: payloadHash,
        event: evidence.payload.event,
        order_id: evidence.payload.order_id,
        reference_id: evidence.payload.reference_id,
        payment_reference: evidence.payload.payment_reference,
        amount_thb: evidence.payload.amount_thb,
        currency: evidence.payload.currency,
        product: evidence.payload.product,
        verified_at: evidence.payload.verified_at,
        source: evidence.payload.source,
        member_match: memberMatch.matched,
        canonical_member_record_ids: memberMatch.record_ids,
        resolution,
      },
      actor: evidence.payload.verified_by,
    },
  });
  return withVerifiedPaymentHypeAlert(env, response, evidence);
}

function authorize(request, env) {
  const expected = String(env.AUTH_SERVICE_LOVABLE_TO_AUTH || "").trim();
  if (!expected) return { ok: false, error: "operator_service_auth_not_configured" };
  const raw = String(request.headers.get(AUTH_HEADER) || "").trim();
  const match = /^Bearer\s+(.+)$/i.exec(raw);
  if (!match) return { ok: false, error: "missing_service_auth" };
  return timingSafeEqual(expected, match[1].trim())
    ? { ok: true }
    : { ok: false, error: "invalid_service_auth" };
}

function validatePaymentEvent(body, headerKey) {
  const errors = [];
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, errors: ["body_required"] };

  const event = safeCode(body.event);
  if (!new Set([PAYMENT_VERIFIED_EVENT, "membership_payment_rejected"]).has(event)) errors.push("event_invalid");

  const orderId = safeText(body.order_id, 180);
  if (!orderId) errors.push("order_id_required");

  const memberEmail = normalizeEmail(body.member_email || body.email);
  if (!memberEmail) errors.push("member_email_required");

  const verifiedAt = isoOrEmpty(body.verified_at);
  if (!verifiedAt) errors.push("verified_at_invalid");

  const key = safeIdempotencyKey(headerKey || body.idempotency_key);
  if (!key) errors.push("idempotency_key_required");
  if (headerKey && body.idempotency_key && safeIdempotencyKey(headerKey) !== safeIdempotencyKey(body.idempotency_key)) errors.push("idempotency_key_mismatch");

  const amount = Number(body.amount_thb);
  if (!Number.isFinite(amount) || amount < 0 || amount > 100000000) errors.push("amount_thb_invalid");

  const currency = safeCode(body.currency || "thb").toUpperCase();
  if (currency !== "THB") errors.push("currency_invalid");

  const payload = {
    event,
    reference_id: safeText(body.reference_id, 180),
    order_id: orderId,
    member_email: memberEmail,
    payment_reference: safeText(body.payment_reference || body.transfer_ref, 240),
    amount_thb: Number.isFinite(amount) ? amount : null,
    currency,
    product: safeCode(body.product || "membership"),
    verified_at: verifiedAt,
    verified_by: safeActor(body.verified_by),
    source: safeCode(body.source || "lovable_blackcard_admin"),
  };

  return errors.length ? { ok: false, errors } : { ok: true, value: { idempotency_key: key, payload } };
}

async function findCanonicalEvidence(env, sourceRef) {
  requireAirtable(env);
  const table = String(env.AIRTABLE_TABLE_ACCESS_LOG || ACCESS_LOG_TABLE).trim() || ACCESS_LOG_TABLE;
  const formula = `AND({Action}='${ACTION}',{Source Ref}=${formulaString(sourceRef)})`;
  const records = await airtableList(env, table, { filterByFormula: formula, maxRecords: 1 });
  const record = records[0];
  if (!record) return null;
  const fields = record.fields || {};
  const evidence = parseJson(fields["Before JSON"]);
  return {
    event_id: safeText(fields["Event ID"], 180),
    payload_hash: safeText(evidence.payload_hash, 128),
    resolution: safeCode(evidence.resolution),
  };
}

async function matchCanonicalMember(env, email) {
  requireAirtable(env);
  const table = String(env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS || ENTITLEMENT_TABLE).trim() || ENTITLEMENT_TABLE;
  const field = String(env.AIRTABLE_ENTITLEMENT_MEMBER_EMAIL_FIELD || "member_email").trim() || "member_email";
  const formula = `LOWER({${field}})=${formulaString(email)}`;
  const records = await airtableList(env, table, { filterByFormula: formula, maxRecords: 10 });
  return { matched: records.length > 0, record_ids: records.map((record) => safeText(record.id, 80)).filter(Boolean) };
}

async function withVerifiedPaymentHypeAlert(env, response, evidence) {
  const required = String(env.PAYMENT_HYPE_ALERT_REQUIRED || "").trim().toLowerCase() === "true";
  if (!required || evidence?.payload?.event !== PAYMENT_VERIFIED_EVENT || !response?.ok) return response;

  const body = await response.clone().json().catch(() => null);
  if (!body?.accepted) return response;

  const alert = await notifyVerifiedPaymentHype(env, evidence).catch((error) => ({
    ok: false,
    error: safeFailure(error),
  }));

  if (alert.ok) {
    return json({ ...body, hype_alert: "sent" }, response.status);
  }

  return json({
    ...body,
    hype_alert: "retry_required",
    alert_failure_class: safeFailure(alert.error || alert.reason || "telegram_alert_failed"),
  }, 503);
}

async function notifyVerifiedPaymentHype(env, evidence) {
  const secret = String(env.AUTH_SERVICE_AUTH_TO_TELEGRAM || "").trim();
  const service = env.TELEGRAM_ACCESS_RECONCILER;
  if (!secret || !service?.fetch) {
    return { ok: false, reason: "payment_hype_alert_not_configured" };
  }

  const payment = evidence.payload || {};
  const maskedRef = maskPaymentRef(payment.payment_reference || payment.reference_id || payment.order_id);
  const request = new Request("https://telegram-worker/telegram/internal/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      flow: "payment_verified",
      amount_thb: payment.amount_thb,
      currency: payment.currency || "THB",
      ref: maskedRef,
      status: "verified",
      source: "canonical_payment_verification",
      ts: payment.verified_at || new Date().toISOString(),
    }),
  });

  const response = await service.fetch(request);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.telegram?.ok !== true) {
    return {
      ok: false,
      reason: safeText(body?.error || body?.telegram?.error || `telegram_http_${response.status}`, 160),
    };
  }
  return { ok: true };
}

function maskPaymentRef(value) {
  const ref = safeText(value, 240);
  if (!ref) return "";
  if (ref.length <= 4) return "••••";
  if (ref.length <= 8) return `${ref.slice(0, 2)}…${ref.slice(-2)}`;
  return `${ref.slice(0, 4)}…${ref.slice(-4)}`;
}

async function auditedResponse(env, { status, payload, audit }) {
  try {
    const result = await writeOperatorAudit(env, audit);
    return json({ ...payload, audit_event_id: result.event_id }, status);
  } catch (error) {
    return json({
      ok: false,
      error: "operator_payment_audit_write_failed",
      failure_class: safeFailure(error),
      original_status: status,
      authority: AUTHORITY,
    }, 503);
  }
}

async function writeOperatorAudit(env, input) {
  requireAirtable(env);
  const eventId = safeEventId(input.event_id) || makeEventId();
  const table = String(env.AIRTABLE_TABLE_ACCESS_LOG || ACCESS_LOG_TABLE).trim() || ACCESS_LOG_TABLE;
  const fields = compact({
    "Member Email": normalizeEmail(input.member_email),
    "Identity Ref": normalizeEmail(input.member_email) ? `email:${normalizeEmail(input.member_email)}` : "unknown",
    Action: ACTION,
    Target: "membership_payment_event",
    Result: input.result === "success" ? "success" : "fail",
    "Event ID": eventId,
    "Created At (ISO)": new Date().toISOString(),
    "Source Ref": safeText(input.source_ref, 240),
    Reason: safeCode(input.reason),
    "Before JSON": boundedJson(input.evidence || {}),
    "After JSON": boundedJson({ authority: AUTHORITY, entitlement_mutation: false, points_mutation: false }),
    "Snapshot JSON": boundedJson({ authority: AUTHORITY, evidence_only: true }),
    "Error Code": input.result === "success" ? "" : safeCode(input.reason),
    Actor: safeActor(input.actor),
  });

  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(String(env.AIRTABLE_BASE_ID).trim())}/${encodeURIComponent(table)}`);
  const response = await airtableFetch(env, new Request(url.toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${String(env.AIRTABLE_API_KEY).trim()}`, "content-type": "application/json" },
    body: JSON.stringify({ records: [{ fields }] }),
  }));
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.records?.[0]?.id) throw new Error(`operator_payment_audit_${response.status || "malformed"}`);
  return { event_id: eventId, record_id: data.records[0].id };
}

async function airtableList(env, tableName, params = {}) {
  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(String(env.AIRTABLE_BASE_ID).trim())}/${encodeURIComponent(tableName)}`);
  if (params.filterByFormula) url.searchParams.set("filterByFormula", params.filterByFormula);
  if (params.maxRecords) url.searchParams.set("maxRecords", String(params.maxRecords));
  const response = await airtableFetch(env, new Request(url.toString(), { headers: { Authorization: `Bearer ${String(env.AIRTABLE_API_KEY).trim()}` } }));
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(data.records)) throw new Error(`operator_payment_airtable_${response.status || "malformed"}`);
  return data.records;
}

async function airtableFetch(env, request) {
  return env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(request) : fetch(request);
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function requireAirtable(env) {
  if (!String(env.AIRTABLE_API_KEY || "").trim() || !String(env.AIRTABLE_BASE_ID || "").trim()) throw new Error("operator_payment_airtable_not_configured");
}
function timingSafeEqual(a, b) { if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0; }
function parseJson(value) { try { const parsed = JSON.parse(String(value || "{}")); return parsed && typeof parsed === "object" ? parsed : {}; } catch { return {}; } }
function boundedJson(value) { const json = JSON.stringify(value ?? {}); return json.length <= 12000 ? json : JSON.stringify({ truncated: true, original_length: json.length }); }
function formulaString(value) { return `'${String(value || "").replace(/'/g, "\\'")}'`; }
function normalizeEmail(value) { const email = String(value || "").trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ""; }
function safeIdempotencyKey(value) { const key = String(value || "").trim(); return /^[A-Za-z0-9:_\-.]{8,220}$/.test(key) ? key : ""; }
function isoOrEmpty(value) { const parsed = Date.parse(String(value || "")); return Number.isFinite(parsed) ? new Date(parsed).toISOString() : ""; }
function safeEventId(value) { return String(value || "").trim().replace(/[^a-zA-Z0-9_:\-.]/g, "_").slice(0, 180); }
function makeEventId() { return `mmdpe_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`; }
function safeActor(value) { return safeCode(value || "lovable_operator") || "lovable_operator"; }
function safeCode(value) { return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_:\-.]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 160); }
function safeText(value, max = 500) { return String(value || "").replace(/[\r\n\t]+/g, " ").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max); }
function safeFailure(error) { return String(error?.message || error || "unknown").toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 80) || "unknown"; }
function compact(object) { return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== "")); }
function json(payload, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }); }