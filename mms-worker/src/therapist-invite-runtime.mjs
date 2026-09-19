const AIRTABLE_API = "https://api.airtable.com/v0";
const INTERNAL_HOST = "mms.internal";
const INVITE_TTL_MINUTES_DEFAULT = 30;
const INVITE_TTL_MINUTES_MAX = 24 * 60;
const THERAPIST_PATH = /^\/internal\/mms\/admin\/therapists\/([A-Za-z0-9_-]{4,80})$/;

/**
 * Handle only the internal Therapist one-time invite action.
 *
 * This module intentionally has no dependency on runtime-index.js so it can
 * be unit-tested under Node without importing Cloudflare-only modules.
 * Returns null when the request is not the invite action and the caller
 * should continue to the normal Worker runtime.
 */
export async function maybeHandleTherapistAccessInvite(request, env) {
  const url = new URL(request.url);
  const match = url.pathname.match(THERAPIST_PATH);

  if (!match || request.method.toUpperCase() !== "PATCH" || url.hostname !== INTERNAL_HOST) {
    return null;
  }

  const probe = request.clone();
  let body = null;
  try {
    body = await probe.json();
  } catch {
    body = null;
  }

  if (body?.issue_access_invite !== true) return null;
  return issueTherapistAccessInvite(match[1], body, env);
}

export async function issueTherapistAccessInvite(therapistId, body, env) {
  requireConfig(env);
  const ttlMinutes = normalizeTtl(body?.ttl_minutes);
  const record = await findTherapist(env, therapistId);
  if (!record) return reply({ ok: false, error: { code: "THERAPIST_NOT_FOUND" } }, 404);

  const fields = record.fields || {};
  if (clean(fields.Status, 40) !== "Active") {
    return reply({ ok: false, error: { code: "THERAPIST_ACCESS_REQUIRES_ACTIVE" } }, 409);
  }

  const authStatus = clean(fields["Therapist Auth Status"], 40) || "Unlinked";
  if (authStatus === "Suspended" || authStatus === "Revoked") {
    return reply({ ok: false, error: { code: "THERAPIST_AUTH_BLOCKED" } }, 409);
  }
  if (authStatus === "Active" || clean(fields["LINE Subject Hash"], 200)) {
    return reply({ ok: false, error: { code: "THERAPIST_ALREADY_LINKED" } }, 409);
  }

  const rawToken = randomBase64Url(32);
  const inviteHash = await sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();

  await updateTherapist(env, record.id, {
    "Therapist Auth Status": "Unlinked",
    "Therapist Access Invite Hash": inviteHash,
    "Therapist Access Invite Expires At": expiresAt,
  });

  const loginBase = clean(env.MMS_THERAPIST_LOGIN_URL, 500) || "https://www.mmdbkk.com/male-massage/therapists/login";
  const inviteUrl = new URL(loginBase);
  inviteUrl.searchParams.set("invite", rawToken);

  return reply({
    ok: true,
    therapist: {
      therapist_id: clean(fields["Therapist ID"], 80),
      display_name: clean(fields["Display Name"], 120),
      auth_status: "Unlinked",
    },
    access_invite: {
      token: rawToken,
      expires_at: expiresAt,
      login_url: inviteUrl.toString(),
      one_time: true,
    },
  }, 200);
}

async function findTherapist(env, therapistId) {
  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(env.AIRTABLE_THERAPISTS_TABLE_ID)}`);
  url.searchParams.set("maxRecords", "2");
  url.searchParams.set("filterByFormula", `{Therapist ID}=${formulaString(therapistId)}`);
  for (const field of [
    "Therapist ID",
    "Display Name",
    "Status",
    "Therapist Auth Status",
    "LINE Subject Hash",
  ]) url.searchParams.append("fields[]", field);

  const data = await airtableFetch(url, { method: "GET" }, env);
  const records = Array.isArray(data.records) ? data.records : [];
  if (records.length > 1) throw new Error("THERAPIST_IDENTITY_CONFLICT");
  return records[0] || null;
}

async function updateTherapist(env, recordId, fields) {
  const url = `${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(env.AIRTABLE_THERAPISTS_TABLE_ID)}/${encodeURIComponent(recordId)}`;
  await airtableFetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields, typecast: false }),
  }, env);
}

async function airtableFetch(url, init, env) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_API_TOKEN}`,
      ...(init.headers || {}),
    },
  });
  if (!response.ok) throw new Error("AIRTABLE_WRITE_FAILED");
  return response.json();
}

function requireConfig(env) {
  if (!env.AIRTABLE_API_TOKEN || !clean(env.AIRTABLE_BASE_ID) || !clean(env.AIRTABLE_THERAPISTS_TABLE_ID)) {
    throw new Error("THERAPIST_INVITE_NOT_CONFIGURED");
  }
}

function normalizeTtl(value) {
  if (value === undefined || value === null || value === "") return INVITE_TTL_MINUTES_DEFAULT;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 5 || parsed > INVITE_TTL_MINUTES_MAX) return INVITE_TTL_MINUTES_DEFAULT;
  return parsed;
}

function randomBase64Url(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Hex(value) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value))));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function formulaString(value) {
  return `'${String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function clean(value, max = 500) {
  if (value === undefined || value === null) return "";
  return String(value).trim().slice(0, max);
}

function reply(payload, status) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, private, max-age=0",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
