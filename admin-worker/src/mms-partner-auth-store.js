const ACCOUNT_KEY = "account";
const PASSWORD_ITERATIONS = 210000;
const RECOVERY_ITERATIONS = 210000;
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

export function normalizeMmsPartnerUsername(value) {
  const username = String(value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,64}$/.test(username)) return "";
  return username;
}

export function validateMmsPartnerPassword(value) {
  const password = String(value ?? "");
  return password.length >= 12 && password.length <= 128;
}

export class MmsPartnerAuthStore {
  constructor(state, env) {
    this.state = state;
    this.storage = state.storage;
    this.env = env;
  }

  async fetch(request) {
    if (String(request.method || "GET").toUpperCase() !== "POST") {
      return json({ ok: false, error: "method_not_allowed" }, 405);
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "invalid_json" }, 400);
    }
    const path = new URL(request.url).pathname;
    if (path === "/signup") return this.signup(body);
    if (path === "/login") return this.login(body);
    if (path === "/recover") return this.recover(body);
    return json({ ok: false, error: "not_found" }, 404);
  }

  async signup(body) {
    const username = normalizeMmsPartnerUsername(body?.username);
    const password = String(body?.password ?? "");
    if (!username || !validateMmsPartnerPassword(password)) {
      return json({ ok: false, error: "invalid_partner_credentials" }, 400);
    }
    const existing = await this.storage.get(ACCOUNT_KEY);
    if (existing) return json({ ok: false, error: "partner_account_unavailable" }, 409);

    const now = Date.now();
    const passwordSalt = randomToken(16);
    const recoverySalt = randomToken(16);
    const recoveryCode = `MMSR-${randomToken(24)}`;
    const record = {
      version: 1,
      username,
      status: "active",
      password_salt: passwordSalt,
      password_hash: await pbkdf2(password, passwordSalt, PASSWORD_ITERATIONS),
      password_iterations: PASSWORD_ITERATIONS,
      recovery_salt: recoverySalt,
      recovery_hash: await pbkdf2(recoveryCode, recoverySalt, RECOVERY_ITERATIONS),
      recovery_iterations: RECOVERY_ITERATIONS,
      failed_attempts: 0,
      locked_until: 0,
      created_at: now,
      updated_at: now,
      password_updated_at: now,
    };
    await this.storage.put(ACCOUNT_KEY, record);
    return json({ ok: true, username, recovery_code: recoveryCode }, 201);
  }

  async login(body) {
    const username = normalizeMmsPartnerUsername(body?.username);
    const password = String(body?.password ?? "");
    if (!username || !password) return json({ ok: false, error: "invalid_partner_credentials" }, 401);
    const account = await this.storage.get(ACCOUNT_KEY);
    const now = Date.now();
    if (!account || account.username !== username || account.status !== "active") {
      return json({ ok: false, error: "invalid_partner_credentials" }, 401);
    }
    if (Number(account.locked_until || 0) > now) {
      return json({ ok: false, error: "partner_temporarily_locked" }, 429);
    }
    const ok = await verifyPbkdf2(
      password,
      account.password_salt,
      Number(account.password_iterations || PASSWORD_ITERATIONS),
      account.password_hash,
    );
    if (!ok) {
      await this.noteFailure(account, now);
      return json({ ok: false, error: "invalid_partner_credentials" }, 401);
    }
    account.failed_attempts = 0;
    account.locked_until = 0;
    account.updated_at = now;
    await this.storage.put(ACCOUNT_KEY, account);
    return json({ ok: true, username, actor_id: `mms-partner:${username}` }, 200);
  }

  async recover(body) {
    const username = normalizeMmsPartnerUsername(body?.username);
    const recoveryCode = String(body?.recovery_code ?? "").trim();
    const newPassword = String(body?.new_password ?? "");
    if (!username || !recoveryCode || !validateMmsPartnerPassword(newPassword)) {
      return json({ ok: false, error: "partner_recovery_failed" }, 400);
    }
    const account = await this.storage.get(ACCOUNT_KEY);
    const now = Date.now();
    if (!account || account.username !== username || account.status !== "active") {
      return json({ ok: false, error: "partner_recovery_failed" }, 401);
    }
    if (Number(account.locked_until || 0) > now) {
      return json({ ok: false, error: "partner_temporarily_locked" }, 429);
    }
    const ok = await verifyPbkdf2(
      recoveryCode,
      account.recovery_salt,
      Number(account.recovery_iterations || RECOVERY_ITERATIONS),
      account.recovery_hash,
    );
    if (!ok) {
      await this.noteFailure(account, now);
      return json({ ok: false, error: "partner_recovery_failed" }, 401);
    }

    const passwordSalt = randomToken(16);
    const recoverySalt = randomToken(16);
    const nextRecoveryCode = `MMSR-${randomToken(24)}`;
    account.password_salt = passwordSalt;
    account.password_hash = await pbkdf2(newPassword, passwordSalt, PASSWORD_ITERATIONS);
    account.password_iterations = PASSWORD_ITERATIONS;
    account.recovery_salt = recoverySalt;
    account.recovery_hash = await pbkdf2(nextRecoveryCode, recoverySalt, RECOVERY_ITERATIONS);
    account.recovery_iterations = RECOVERY_ITERATIONS;
    account.failed_attempts = 0;
    account.locked_until = 0;
    account.updated_at = now;
    account.password_updated_at = now;
    await this.storage.put(ACCOUNT_KEY, account);
    return json({ ok: true, username, recovery_code: nextRecoveryCode }, 200);
  }

  async noteFailure(account, now) {
    const failed = Number(account.failed_attempts || 0) + 1;
    account.failed_attempts = failed >= MAX_FAILURES ? 0 : failed;
    account.locked_until = failed >= MAX_FAILURES ? now + LOCK_MS : 0;
    account.updated_at = now;
    await this.storage.put(ACCOUNT_KEY, account);
  }
}

export async function activateMmsPartner(env, credentials) {
  return callPartnerStore(env, "/signup", credentials);
}

export async function authenticateMmsPartner(env, credentials) {
  return callPartnerStore(env, "/login", credentials);
}

export async function recoverMmsPartner(env, credentials) {
  return callPartnerStore(env, "/recover", credentials);
}

async function callPartnerStore(env, path, body) {
  const binding = env?.MMS_PARTNER_AUTH;
  const username = normalizeMmsPartnerUsername(body?.username);
  if (!binding || typeof binding.idFromName !== "function" || typeof binding.get !== "function") {
    return { ok: false, error: "partner_auth_unavailable", status: 503 };
  }
  if (!username) return { ok: false, error: "invalid_partner_credentials", status: 400 };
  try {
    const stub = binding.get(binding.idFromName(username));
    const response = await stub.fetch(`https://mms-partner-auth.internal${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, username }),
    });
    let payload = {};
    try { payload = await response.json(); } catch {}
    return { ...payload, status: response.status };
  } catch {
    return { ok: false, error: "partner_auth_unavailable", status: 503 };
  }
}

async function pbkdf2(secret, saltToken, iterations) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(secret)),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: base64UrlDecode(saltToken), iterations },
    material,
    256,
  );
  return base64UrlEncode(new Uint8Array(bits));
}

async function verifyPbkdf2(secret, saltToken, iterations, expectedHash) {
  const actual = await pbkdf2(secret, saltToken, iterations);
  return timingSafeEqual(actual, String(expectedHash || ""));
}

function randomToken(bytes) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return base64UrlEncode(value);
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const raw = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = raw + "=".repeat((4 - (raw.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function timingSafeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" || left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

function json(body, status) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}
