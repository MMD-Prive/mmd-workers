import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) globalThis.crypto = webcrypto;
if (!globalThis.btoa) globalThis.btoa = (value) => Buffer.from(value, "binary").toString("base64");
if (!globalThis.atob) globalThis.atob = (value) => Buffer.from(value, "base64").toString("binary");

const {
  MmsPartnerAuthStore,
  normalizeMmsPartnerUsername,
  validateMmsPartnerPassword,
} = await import("./src/mms-partner-auth-store.js");

class MemoryStorage {
  constructor() { this.map = new Map(); }
  async get(key) { return this.map.get(key); }
  async put(key, value) { this.map.set(key, structuredClone(value)); }
}

function makeStore() {
  const storage = new MemoryStorage();
  return { store: new MmsPartnerAuthStore({ storage }, {}), storage };
}

async function call(store, path, body) {
  return store.fetch(new Request(`https://test.invalid${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

test("normalizes MMS partner usernames", () => {
  assert.equal(normalizeMmsPartnerUsername(" Partner.One "), "partner.one");
  assert.equal(normalizeMmsPartnerUsername("bad name"), "");
});

test("requires a strong-enough password length", () => {
  assert.equal(validateMmsPartnerPassword("12345678901"), false);
  assert.equal(validateMmsPartnerPassword("correct horse battery staple"), true);
});

test("signup stores hashes only, login works, recovery rotates the recovery code", async () => {
  const { store, storage } = makeStore();
  const signup = await call(store, "/signup", { username: "partner.one", password: "A-strong-partner-password" });
  assert.equal(signup.status, 201);
  const signupPayload = await signup.json();
  assert.equal(signupPayload.ok, true);
  assert.match(signupPayload.recovery_code, /^MMSR-/);

  const record = await storage.get("account");
  assert.equal(record.username, "partner.one");
  assert.equal("password" in record, false);
  assert.equal("recovery_code" in record, false);
  assert.notEqual(record.password_hash, "A-strong-partner-password");

  const bad = await call(store, "/login", { username: "partner.one", password: "wrong-password" });
  assert.equal(bad.status, 401);

  const login = await call(store, "/login", { username: "partner.one", password: "A-strong-partner-password" });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).ok, true);

  const recovered = await call(store, "/recover", {
    username: "partner.one",
    recovery_code: signupPayload.recovery_code,
    new_password: "A-new-strong-partner-password",
  });
  assert.equal(recovered.status, 200);
  const recoveryPayload = await recovered.json();
  assert.equal(recoveryPayload.ok, true);
  assert.notEqual(recoveryPayload.recovery_code, signupPayload.recovery_code);

  const oldPassword = await call(store, "/login", { username: "partner.one", password: "A-strong-partner-password" });
  assert.equal(oldPassword.status, 401);
  const newPassword = await call(store, "/login", { username: "partner.one", password: "A-new-strong-partner-password" });
  assert.equal(newPassword.status, 200);
});
