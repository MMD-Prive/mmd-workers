const AIRTABLE_API = "https://api.airtable.com/v0";
export const CONFIRM_ACK_PATH = "/v1/confirm/ack";

function clean(value, max = 5000) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function allowedOrigins(env = {}) {
  return clean(env.ALLOWED_ORIGINS || "", 5000)
    .replace(/^['\"]|['\"]$/g, "")
    .split(",")
    .map((value) => value.trim().replace(/^['\"]|['\"]$/g, ""))
    .filter(Boolean);
}

function corsHeaders(request, env = {}) {
  const origin = clean(request.headers.get("origin"), 500);
  const allowed = allowedOrigins(env);
  const headers = {
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
  if (origin && allowed.includes(origin)) headers["access-control-allow-origin"] = origin;
  return headers;
}

function withCors(request, env, response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request, env))) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function isAllowedOrigin(request, env = {}) {
  const origin = clean(request.headers.get("origin"), 500);
  return Boolean(origin && allowedOrigins(env).includes(origin));
}

function base64UrlDecode(input) {
  const value = clean(input).replace(/-/g, "+").replace(/_/g, "/");
  const padded = value.padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(digest);
}

function confirmationSecret(env = {}) {
  return clean(env.PAYMENT_CONFIRMATION_SIGNING_SECRET || env.CONFIRM_KEY, 5000);
}

async function verifyToken(env, token, expectedRole) {
  const raw = clean(token, 12000);
  const [payloadPart, suppliedSignature, extra] = raw.split(".");
  if (!payloadPart || !suppliedSignature || extra !== undefined) throw new Error("invalid_confirmation_token");

  const secret = confirmationSecret(env);
  if (!secret) {
    const error = new Error("confirmation_signing_not_ready");
    error.status = 503;
    throw error;
  }

  const expectedSignature = await hmacSha256Hex(payloadPart, secret);
  if (expectedSignature.length !== suppliedSignature.length) throw new Error("invalid_confirmation_token_signature");
  let mismatch = 0;
  for (let i = 0; i < expectedSignature.length; i += 1) {
    mismatch |= expectedSignature.charCodeAt(i) ^ suppliedSignature.charCodeAt(i);
  }
  if (mismatch !== 0) throw new Error("invalid_confirmation_token_signature");

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadPart));
  } catch {
    throw new Error("invalid_confirmation_token");
  }

  const role = clean(payload?.role, 40);
  const kind = clean(payload?.kind, 80);
  const validKind =
    (role === "customer" && kind === "customer_confirm") ||
    (role === "model" && kind === "model_confirm");
  if (!validKind || !["customer", "model"].includes(role)) throw new Error("invalid_confirmation_token_purpose");
  if (!expectedRole || expectedRole !== role) throw new Error("confirmation_role_mismatch");
  if (!clean(payload?.session_id, 200) || !clean(payload?.payment_ref, 200)) throw new Error("invalid_confirmation_token_subject");

  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(payload?.iat) || !Number.isInteger(payload?.exp) || payload.exp <= payload.iat) {
    throw new Error("invalid_confirmation_token_lifetime");
  }
  if (payload.iat > now + 60) throw new Error("confirmation_token_not_yet_valid");
  if (payload.exp <= now) {
    const error = new Error("confirmation_token_expired");
    error.status = 410;
    throw error;
  }

  if (!env.PAY_SESSIONS_KV) {
    const error = new Error("confirmation_token_store_not_ready");
    error.status = 503;
    throw error;
  }
  const tokenHash = await sha256Hex(raw);
  const storedRaw = await env.PAY_SESSIONS_KV.get(`sig:${tokenHash.slice(0, 24)}`);
  if (!storedRaw) throw new Error("confirmation_token_not_active");

  let stored;
  try {
    stored = JSON.parse(storedRaw);
  } catch {
    throw new Error("confirmation_token_record_invalid");
  }
  for (const field of ["kind", "role", "session_id", "payment_ref", "payment_type", "iat", "exp"]) {
    if (stored?.[field] !== payload?.[field]) throw new Error("confirmation_token_record_mismatch");
  }
  return payload;
}

function airtableConfig(env = {}) {
  const baseId = clean(env.AIRTABLE_BASE_ID, 100);
  const tableId = clean(env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX", 100);
  const apiKey = clean(env.AIRTABLE_API_KEY, 5000);
  if (!baseId || !tableId || !apiKey) {
    const error = new Error("airtable_not_ready");
    error.status = 503;
    throw error;
  }
  return { baseId, tableId, apiKey };
}

function formulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function airtableRequest(env, path, init = {}) {
  const { baseId, apiKey } = airtableConfig(env);
  const response = await fetch(`${AIRTABLE_API}/${baseId}/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("airtable_request_failed");
    error.status = response.status >= 500 ? 503 : 500;
    throw error;
  }
  return data;
}

async function findSession(env, sessionId) {
  const { tableId } = airtableConfig(env);
  const formula = `{session_id}='${formulaValue(sessionId)}'`;
  const query = new URLSearchParams({
    maxRecords: "1",
    filterByFormula: formula,
    returnFieldsByFieldId: "true",
  });
  const data = await airtableRequest(env, `${encodeURIComponent(tableId)}?${query.toString()}`, { method: "GET" });
  return data?.records?.[0] || null;
}

async function patchAcknowledgement(env, session, role) {
  const { tableId } = airtableConfig(env);
  const fieldId = role === "customer"
    ? clean(env.AT_SESSIONS__CUSTOMER_ACK_AT || "fldJSS5GNN7quJwa8", 100)
    : clean(env.AT_SESSIONS__MODEL_ACK_AT || "fldFgkHXivIAThfDz", 100);
  const existing = clean(session?.fields?.[fieldId], 200);
  if (existing) return { acknowledged_at: existing, idempotent: true };

  const acknowledgedAt = new Date().toISOString();
  await airtableRequest(env, `${encodeURIComponent(tableId)}/${encodeURIComponent(session.id)}?returnFieldsByFieldId=true`, {
    method: "PATCH",
    body: JSON.stringify({ fields: { [fieldId]: acknowledgedAt } }),
  });
  return { acknowledged_at: acknowledgedAt, idempotent: false };
}

function errorStatus(error) {
  if (Number.isInteger(error?.status)) return error.status;
  const code = clean(error?.message, 200);
  if (code === "confirmation_token_expired") return 410;
  if (code.startsWith("airtable_")) return 503;
  return 401;
}

export async function handleConfirmationAck(request, env = {}) {
  if (request.method.toUpperCase() === "OPTIONS") {
    return withCors(request, env, new Response(null, { status: 204 }));
  }
  if (request.method.toUpperCase() !== "POST") {
    return withCors(request, env, json({ ok: false, error: "method_not_allowed" }, 405));
  }
  if (!isAllowedOrigin(request, env)) {
    return withCors(request, env, json({ ok: false, error: "origin_not_allowed" }, 403));
  }

  const body = await request.json().catch(() => null);
  const token = clean(body?.t || body?.token, 12000);
  const expectedRole = clean(body?.expected_role || body?.role, 40).toLowerCase();
  if (!token) return withCors(request, env, json({ ok: false, error: "confirmation_token_required" }, 400));
  if (!["customer", "model"].includes(expectedRole)) {
    return withCors(request, env, json({ ok: false, error: "expected_role_required" }, 400));
  }

  try {
    const claims = await verifyToken(env, token, expectedRole);
    const session = await findSession(env, claims.session_id);
    if (!session?.id) return withCors(request, env, json({ ok: false, error: "session_not_found" }, 404));

    const paymentRefField = clean(env.AT_SESSIONS__PAYMENT_REF || "fldojgjSQLaO0uQLX", 100);
    const sessionPaymentRef = clean(session?.fields?.[paymentRefField], 200);
    if (sessionPaymentRef && sessionPaymentRef !== clean(claims.payment_ref, 200)) {
      return withCors(request, env, json({ ok: false, error: "confirmation_session_mismatch" }, 409));
    }

    const ack = await patchAcknowledgement(env, session, expectedRole);
    return withCors(request, env, json({
      ok: true,
      role: expectedRole,
      session_id: claims.session_id,
      acknowledged_at: ack.acknowledged_at,
      idempotent: ack.idempotent,
    }));
  } catch (error) {
    return withCors(request, env, json({ ok: false, error: clean(error?.message || "confirmation_ack_failed", 200) }, errorStatus(error)));
  }
}
