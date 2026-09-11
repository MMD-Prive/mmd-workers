const AIRTABLE_API = "https://api.airtable.com/v0";
const PAY_INTENT_PATH = "/v1/pay/verify";
const SLIP_EVIDENCE_PATH = "/v1/pay/slip/evidence";
const CONFIRM_VERIFY_PATH = "/v1/confirm/verify";
const CANONICAL_WEB_SOURCES = new Set(["sigil_pay", "pay_membership", "member_payments"]);
const PAID_STATES = new Set(["paid", "verified", "success", "completed"]);
const PROOF_STATES = new Set(["submitted", "pending", "pending_review", "review", "review_required", "needs_review", "under_review", "matched", "verified", "approved"]);
const MAX_FILE_BYTES = 15 * 1024 * 1024;

function clean(value, max = 4000) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function code(value) {
  return clean(value, 180).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizePath(value) {
  const path = clean(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function positive(value) {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || ""))));
}

function base64UrlEncode(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmacSha256Hex(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(String(secret || "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", key, encoder.encode(String(message || ""))));
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
      ...headers,
    },
  });
}

function rebuildJson(response, data) {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, private");
  return new Response(JSON.stringify(data), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function requestWithJson(request, body) {
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(body),
  });
}

export function isUnifiedPaymentIntentRequest(path, method = "POST") {
  return normalizePath(path) === PAY_INTENT_PATH && String(method).toUpperCase() === "POST";
}

export function isUnifiedSlipEvidenceRequest(path, method = "POST") {
  return normalizePath(path) === SLIP_EVIDENCE_PATH && String(method).toUpperCase() === "POST";
}

export function isUnifiedConfirmVerifyRequest(path, method = "POST") {
  return normalizePath(path) === CONFIRM_VERIFY_PATH && String(method).toUpperCase() === "POST";
}

export async function stablePaymentRef(sessionId, paymentStage) {
  const session = clean(sessionId, 220);
  const stage = code(paymentStage || "deposit") || "deposit";
  if (!session) throw new Error("session_id_required");
  return `pay_${(await sha256Hex(`${session}:${stage}`)).slice(0, 24)}`;
}

function signingSecret(env) {
  return clean(env.PAYMENT_CONFIRMATION_SIGNING_SECRET || env.CONFIRM_KEY, 5000);
}

function tokenTtl(env) {
  const seconds = Math.floor(Number(env.PAY_TOKEN_TTL_SECONDS || 2592000));
  return Math.min(Math.max(Number.isFinite(seconds) ? seconds : 2592000, 60), 2592000);
}

async function mintCustomerToken(env, { session_id, payment_ref, payment_type }) {
  const secret = signingSecret(env);
  if (!secret) throw new Error("missing_payment_confirmation_signing_secret");
  if (!env.PAY_SESSIONS_KV) throw new Error("missing_pay_sessions_kv");

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + tokenTtl(env);
  const claims = {
    kind: "customer_confirm",
    role: "customer",
    session_id: clean(session_id, 220),
    payment_ref: clean(payment_ref, 220),
    payment_type: code(payment_type || "deposit") || "deposit",
    iat,
    exp,
  };
  const encoded = base64UrlEncode(JSON.stringify(claims));
  const token = `${encoded}.${await hmacSha256Hex(encoded, secret)}`;
  const tokenHash = await sha256Hex(token);
  await env.PAY_SESSIONS_KV.put(`sig:${tokenHash.slice(0, 24)}`, JSON.stringify(claims), {
    expirationTtl: tokenTtl(env),
  });
  return token;
}

function paymentPageUrl(token) {
  return `https://mmdbkk.com/sigil/pay?t=${encodeURIComponent(token)}`;
}

export async function handleUnifiedPaymentIntent(request, env, downstream) {
  const body = await request.clone().json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return downstream(request);

  const sessionId = clean(body.session_id, 220);
  const stage = code(body.payment_stage || body.payment_type || "deposit") || "deposit";
  if (!sessionId) return downstream(request);

  const paymentRef = clean(body.payment_ref || body.transaction_ref, 220) || await stablePaymentRef(sessionId, stage);
  const nextBody = { ...body, payment_ref: paymentRef };
  const response = await downstream(requestWithJson(request, nextBody));
  if (!response.ok) return response;
  const data = await response.clone().json().catch(() => null);
  if (!data || data.ok !== true) return response;

  try {
    const canonicalRef = clean(data.payment_ref || paymentRef, 220);
    const canonicalSession = clean(data.session_id || sessionId, 220);
    const canonicalStage = code(data.payment_stage || stage) || stage;
    const customerToken = await mintCustomerToken(env, {
      session_id: canonicalSession,
      payment_ref: canonicalRef,
      payment_type: canonicalStage,
    });
    return rebuildJson(response, {
      ...data,
      payment_ref: canonicalRef,
      session_id: canonicalSession,
      customer_t: customerToken,
      customer_payment_url: paymentPageUrl(customerToken),
      unified_payment_flow: "v1",
    });
  } catch (error) {
    return json({
      ok: false,
      error: clean(error?.message || error || "customer_payment_link_failed", 300),
      authority: "payments-worker",
    }, 503);
  }
}

function airtableTable(env, kind) {
  if (kind === "proofs") return clean(env.AIRTABLE_TABLE_PAYMENT_PROOFS || env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || "tblfJfM4Sqag9zrLi");
  return clean(env.AIRTABLE_TABLE_PAYMENTS_ID || env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ");
}

function airtableReady(env) {
  return Boolean(clean(env.AIRTABLE_BASE_ID) && clean(env.AIRTABLE_API_KEY));
}

function formulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function airtableFetch(env, url, init = {}) {
  const request = new Request(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request) : await fetch(request);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`airtable_${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function findFirstByFields(env, tableName, fieldNames, value) {
  if (!airtableReady(env) || !clean(value)) return null;
  for (const fieldName of fieldNames) {
    const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(tableName)}`);
    url.searchParams.set("maxRecords", "1");
    url.searchParams.set("filterByFormula", `{${fieldName}}='${formulaValue(value)}'`);
    try {
      const data = await airtableFetch(env, url.toString(), { method: "GET" });
      if (Array.isArray(data.records) && data.records[0]) return data.records[0];
    } catch (error) {
      if (Number(error?.status) !== 422) throw error;
    }
  }
  return null;
}

async function findPayment(env, paymentRef) {
  return findFirstByFields(env, airtableTable(env, "payments"), ["payment_ref", "Payment Reference"], paymentRef);
}

async function findProof(env, paymentRef) {
  return findFirstByFields(env, airtableTable(env, "proofs"), ["payment_ref", "transaction_ref"], paymentRef);
}

async function createProof(env, fields) {
  if (!airtableReady(env)) throw new Error("airtable_not_ready");
  const url = `${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${encodeURIComponent(airtableTable(env, "proofs"))}`;
  const data = await airtableFetch(env, url, {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });
  return data?.records?.[0] || null;
}

function paymentFields(record) {
  return record?.fields || {};
}

function firstValue(fields, keys) {
  for (const key of keys) {
    if (fields[key] !== undefined && fields[key] !== null && fields[key] !== "") return fields[key];
  }
  return null;
}

function paymentSnapshot(record, form = null) {
  const fields = paymentFields(record);
  return {
    amount_thb: positive(firstValue(fields, ["amount_thb", "amount", "Amount", "Amount THB"])) || positive(form?.get("amount_thb")),
    session_id: clean(firstValue(fields, ["session_id", "Session ID"]) || form?.get("session_id"), 220),
    member_email: clean(firstValue(fields, ["member_email", "email", "Contact Email"]) || form?.get("member_email"), 320).toLowerCase(),
    package_code: code(firstValue(fields, ["package_code", "package", "Package Code"]) || form?.get("package_code")),
    payment_stage: code(firstValue(fields, ["payment_stage", "payment_type", "stage"]) || form?.get("payment_stage") || form?.get("payment_type")) || "deposit",
    payment_status: code(firstValue(fields, ["Payment Status", "payment_status", "status"])),
    verification_status: code(firstValue(fields, ["Verification Status", "verification_status"])),
    payer_name: clean(form?.get("payer_name") || form?.get("client_name"), 180),
  };
}

function proofSnapshot(record) {
  const fields = record?.fields || {};
  return {
    proof_id: clean(fields.proof_id, 160),
    status: code(fields.status || fields.verification_status || fields.payment_status || "submitted") || "submitted",
  };
}

function fileFromForm(form) {
  const value = form.get("file") || form.get("slip") || form.get("proof") || form.get("receipt") || form.get("receipt_photo") || null;
  return value && typeof value === "object" && typeof value.arrayBuffer === "function" ? value : null;
}

function extensionFor(file) {
  const name = clean(file?.name, 180);
  const match = name.match(/\.([a-z0-9]{1,10})$/i);
  if (match) return match[1].toLowerCase();
  const type = clean(file?.type, 120).toLowerCase();
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "application/pdf") return "pdf";
  return "bin";
}

async function storeEvidence(env, file, proofId, paymentRef) {
  if (!file) return { stored: false, reason: "file_missing" };
  if (Number(file.size || 0) > MAX_FILE_BYTES) {
    const error = new Error("slip_file_too_large");
    error.status = 413;
    throw error;
  }
  const bytes = await file.arrayBuffer();
  const sha256 = bytesToHex(await crypto.subtle.digest("SHA-256", bytes));
  const date = new Date();
  const key = `web-payment-proofs/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${proofId}/original.${extensionFor(file)}`;
  const bucket = env.PAYMENT_SLIP_EVIDENCE;
  if (!bucket || typeof bucket.put !== "function") return { stored: false, reason: "r2_not_bound", key, sha256 };
  await bucket.put(key, bytes, {
    httpMetadata: { contentType: clean(file.type, 120) || "application/octet-stream" },
    customMetadata: { proof_id: proofId, payment_ref: paymentRef, sha256 },
  });
  return { stored: true, provider: "cloudflare_r2", key, sha256 };
}

async function notifyTelegramFile(env, file, { proofId, paymentRef, amountThb, stage }) {
  const token = clean(env.TELEGRAM_BOT_TOKEN, 5000);
  const chatId = clean(env.TELEGRAM_CHAT_ID || "-1003546439681", 120);
  const thread = clean(env.TG_THREAD_CONFIRM || "61", 40);
  if (!token || !file) return { ok: false, skipped: true };
  const form = new FormData();
  form.append("chat_id", chatId);
  if (thread) form.append("message_thread_id", thread);
  form.append("parse_mode", "HTML");
  form.append("caption", [
    "<b>PAYMENT PROOF · PENDING REVIEW</b>",
    `Proof: <code>${proofId}</code>`,
    `Ref: <code>${paymentRef}</code>`,
    amountThb ? `Amount: <b>${amountThb} THB</b>` : "",
    stage ? `Stage: <b>${stage}</b>` : "",
    "Evidence only · Official Verify required",
  ].filter(Boolean).join("\n"));
  form.append("document", file, clean(file.name, 180) || "payment-proof");
  const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: "POST", body: form });
  return { ok: response.ok, status: response.status };
}

async function buildProofFields(env, form, payment, paymentRef, file) {
  const snapshot = paymentSnapshot(payment, form);
  if (!snapshot.amount_thb) {
    const error = new Error("canonical_payment_amount_missing");
    error.status = 409;
    throw error;
  }
  const proofId = `webproof_${(await sha256Hex(paymentRef)).slice(0, 24)}`;
  const storage = await storeEvidence(env, file, proofId, paymentRef);
  const note = [
    "schema=mmd_web_payment_proof_v1",
    "evidence_only=true",
    "official_verification_required=true",
    storage.key ? `r2_key=${storage.key}` : "",
    storage.sha256 ? `evidence_sha256=${storage.sha256}` : "",
  ].filter(Boolean).join("; ");
  return {
    proofId,
    storage,
    snapshot,
    fields: compact({
      proof_id: proofId,
      channel: "web_pay",
      note,
      status: "submitted",
      payer_name: snapshot.payer_name,
      amount_thb: snapshot.amount_thb,
      payment_ref: paymentRef,
      session_id: snapshot.session_id,
      member_email: snapshot.member_email,
      payment_stage: snapshot.payment_stage,
      created_at: new Date().toISOString(),
    }),
  };
}

export async function handleUnifiedSlipEvidence(request, env, downstream) {
  let form;
  try {
    form = await request.clone().formData();
  } catch {
    return downstream(request);
  }
  const paymentRef = clean(form.get("payment_ref") || form.get("transaction_ref"), 220);
  if (!paymentRef) return downstream(request);

  try {
    const existing = await findProof(env, paymentRef);
    if (existing) {
      const proof = proofSnapshot(existing);
      return json({
        ok: true,
        evidence_only: true,
        official_verification_required: true,
        duplicate: true,
        idempotent: true,
        already_submitted: true,
        evidence_submitted: true,
        payment_ref: paymentRef,
        proof_id: proof.proof_id || null,
        verification_status: proof.status === "verified" ? "verified" : "pending_verification",
        payment_status: proof.status === "verified" ? "paid" : "pending",
        message: "Payment proof already received. Do not submit it again.",
      });
    }

    const source = code(form.get("source_page") || "");
    const payment = await findPayment(env, paymentRef);
    if (!payment && CANONICAL_WEB_SOURCES.has(source)) {
      return json({ ok: false, error: "canonical_payment_not_found", payment_ref: paymentRef }, 409);
    }

    const file = fileFromForm(form);
    if (CANONICAL_WEB_SOURCES.has(source) && !file) {
      return json({ ok: false, error: "payment_proof_file_required" }, 400);
    }

    let proofBundle = null;
    if (payment) proofBundle = await buildProofFields(env, form, payment, paymentRef, file);

    const downstreamResponse = await downstream(request);
    if (!downstreamResponse.ok) return downstreamResponse;
    const downstreamData = await downstreamResponse.clone().json().catch(() => null);
    if (!downstreamData || downstreamData.ok !== true) return downstreamResponse;

    if (!proofBundle) return downstreamResponse;
    const created = await createProof(env, proofBundle.fields);
    const telegram = await notifyTelegramFile(env, file, {
      proofId: proofBundle.proofId,
      paymentRef,
      amountThb: proofBundle.snapshot.amount_thb,
      stage: proofBundle.snapshot.payment_stage,
    }).catch(() => ({ ok: false }));

    return rebuildJson(downstreamResponse, {
      ...downstreamData,
      proof_id: proofBundle.proofId,
      proof_record_id: created?.id || null,
      evidence_submitted: true,
      already_submitted: false,
      duplicate: false,
      verification_status: "pending_verification",
      payment_status: "pending",
      storage: proofBundle.storage.stored ? proofBundle.storage.provider : downstreamData.storage,
      telegram_file_received: telegram.ok === true,
      unified_payment_flow: "v1",
      message: "Payment proof received. MMD is reviewing it; no need to submit again.",
    });
  } catch (error) {
    return json({
      ok: false,
      error: clean(error?.message || error || "payment_proof_intake_failed", 300),
      authority: "payments-worker",
    }, Number(error?.status || 500));
  }
}

function unifiedStatus(payment, proof) {
  const paymentState = code(firstValue(paymentFields(payment), ["Payment Status", "payment_status", "status"]));
  const verificationState = code(firstValue(paymentFields(payment), ["Verification Status", "verification_status"]));
  if (PAID_STATES.has(paymentState) || PAID_STATES.has(verificationState)) return "paid";
  if (proof) {
    const proofState = proofSnapshot(proof).status;
    if (proofState === "verified" || proofState === "approved") return "paid";
    if (PROOF_STATES.has(proofState)) return "pending_verification";
  }
  return "awaiting_payment";
}

export async function enrichUnifiedConfirmVerify(request, env, downstream) {
  const response = await downstream(request);
  if (!response.ok) return response;
  const data = await response.clone().json().catch(() => null);
  const claims = data?.claims;
  const paymentRef = clean(claims?.payment_ref, 220);
  if (!data?.ok || !paymentRef || !airtableReady(env)) return response;

  try {
    const [payment, proof] = await Promise.all([findPayment(env, paymentRef), findProof(env, paymentRef)]);
    if (!payment) return response;
    const snapshot = paymentSnapshot(payment);
    const status = unifiedStatus(payment, proof);
    const verificationStatus = status === "paid" ? "verified" : status;
    return rebuildJson(response, {
      ...data,
      status,
      payment_status: status === "paid" ? "paid" : "pending",
      verification_status: verificationStatus,
      evidence_submitted: Boolean(proof),
      claims: {
        ...claims,
        status,
        payment_status: status === "paid" ? "paid" : "pending",
        verification_status: verificationStatus,
        amount_thb: snapshot.amount_thb || undefined,
        total_amount: snapshot.amount_thb || undefined,
        package_code: snapshot.package_code || undefined,
      },
      unified_payment_flow: "v1",
    });
  } catch {
    return response;
  }
}
