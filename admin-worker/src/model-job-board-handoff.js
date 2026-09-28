import { resolveModelJobBoardNext } from "../../shared/model-job-board-links.mjs";

export const MODEL_JOB_BOARD_HANDOFF_PATH = "/v1/model/job-board/handoff";
export const MODEL_JOB_BOARD_VALIDATE_PATH = "/__internal/model-job-board/validate";
const HANDOFF_PARAM = "mmd_job_board_handoff";
const TOKEN_TTL_SECONDS = 5 * 60;
const MODEL_RECORD_RE = /^rec[A-Za-z0-9]{14,}$/;

function clean(value, max = 4096) {
  return String(value ?? "").trim().slice(0, max);
}

function base64UrlEncode(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function hmacHex(value, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
  return [...signature].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function constantTimeEqual(left, right) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(String(left || ""))),
    crypto.subtle.digest("SHA-256", encoder.encode(String(right || ""))),
  ]);
  const aa = new Uint8Array(a);
  const bb = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < aa.length; i += 1) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

function signingSecret(env = {}) {
  return clean(
    env.MODEL_JOB_BOARD_HANDOFF_SECRET ||
    env.MODEL_SESSION_SIGNING_SECRET ||
    env.CONFIRM_KEY ||
    env.INTERNAL_TOKEN,
    4096,
  );
}

async function signHandoff(payload, env) {
  const secret = signingSecret(env);
  if (secret.length < 24) throw Object.assign(new Error("model_job_board_signing_unavailable"), { status: 503 });
  const body = base64UrlEncode(JSON.stringify(payload));
  return `${body}.${await hmacHex(body, secret)}`;
}

async function verifyHandoff(token, env) {
  const [body, signature] = String(token || "").split(".");
  if (!body || !signature) throw Object.assign(new Error("model_handoff_invalid"), { status: 401 });
  const secret = signingSecret(env);
  if (secret.length < 24) throw Object.assign(new Error("model_job_board_signing_unavailable"), { status: 503 });
  const expected = await hmacHex(body, secret);
  if (!(await constantTimeEqual(signature, expected))) {
    throw Object.assign(new Error("model_handoff_invalid"), { status: 401 });
  }
  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(body));
  } catch {
    throw Object.assign(new Error("model_handoff_invalid"), { status: 401 });
  }
  const now = Math.floor(Date.now() / 1000);
  if (
    payload?.typ !== "model_job_board_handoff" ||
    !MODEL_RECORD_RE.test(clean(payload?.model_record_id, 160)) ||
    !Number.isInteger(payload?.exp) ||
    payload.exp <= now ||
    payload.exp > now + TOKEN_TTL_SECONDS + 30
  ) {
    throw Object.assign(new Error("model_handoff_invalid"), { status: 401 });
  }
  return payload;
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

function forwardedProfileRequest(request) {
  const url = new URL("/v1/model/profile", request.url);
  const headers = new Headers({ accept: "application/json" });
  for (const name of ["cookie", "origin", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Request(url.toString(), { method: "GET", headers });
}

function safeTargetFromRequest(request) {
  const url = new URL(request.url);
  return resolveModelJobBoardNext({
    job_id: clean(url.searchParams.get("job_id"), 128),
    next: clean(url.searchParams.get("next"), 2048),
  });
}

export function isModelJobBoardHandoffRequest(path, method) {
  return path === MODEL_JOB_BOARD_HANDOFF_PATH && method === "GET";
}

export function isModelJobBoardValidateRequest(path, method) {
  return path === MODEL_JOB_BOARD_VALIDATE_PATH && method === "POST";
}

export async function handleModelJobBoardHandoff(request, env, coreFetch) {
  let next;
  try {
    next = safeTargetFromRequest(request);
  } catch {
    return json({ ok: false, error: "job_board_next_invalid" }, 400);
  }

  const profileResponse = await coreFetch(forwardedProfileRequest(request));
  const profile = await profileResponse.clone().json().catch(() => null);
  if (!profileResponse.ok || profile?.ok !== true) {
    const code = clean(profile?.error, 120) || "model_session_required";
    const status = profileResponse.status === 403 ? 403 : profileResponse.status === 401 ? 401 : 503;
    return json({ ok: false, error: code }, status);
  }

  const modelRecordId = clean(profile?.model?.id || profile?.profile?.id, 160);
  if (!MODEL_RECORD_RE.test(modelRecordId)) {
    return json({ ok: false, error: "model_identity_not_ready" }, 403);
  }

  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  let token;
  try {
    token = await signHandoff({
      typ: "model_job_board_handoff",
      model_record_id: modelRecordId,
      exp,
      nonce: crypto.randomUUID(),
    }, env);
  } catch (error) {
    return json({ ok: false, error: clean(error?.message, 120) || "model_job_board_signing_unavailable" }, error?.status || 503);
  }

  const redirect = new URL(next);
  redirect.searchParams.set(HANDOFF_PARAM, token);
  return json({
    ok: true,
    redirect_url: redirect.toString(),
    next,
    expires_at: new Date(exp * 1000).toISOString(),
  });
}

export async function handleModelJobBoardValidate(request, env) {
  const expected = clean(env.INTERNAL_TOKEN, 4096);
  const supplied = clean(request.headers.get("x-internal-token"), 4096);
  if (!expected || !supplied || !(await constantTimeEqual(expected, supplied))) {
    return json({ ok: false, error: "service_auth_required" }, 403);
  }

  const body = await request.json().catch(() => null);
  const token = clean(body?.token, 4096);
  if (!token) return json({ ok: false, error: "model_handoff_required" }, 400);

  try {
    const payload = await verifyHandoff(token, env);
    return json({
      ok: true,
      model_record_id: payload.model_record_id,
      expires_at: new Date(payload.exp * 1000).toISOString(),
    });
  } catch (error) {
    return json({ ok: false, error: clean(error?.message, 120) || "model_handoff_invalid" }, error?.status || 401);
  }
}
