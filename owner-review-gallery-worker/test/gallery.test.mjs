import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createOwnerReviewGalleryWorker, REVIEW_HOST, SESSION_COOKIE } from "../src/index.mjs";
import { GROUPS, ROUTES, findReviewRoute } from "../src/catalog.mjs";

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const origin = "https://" + REVIEW_HOST;
const code = "owner-review-private-fixture-24characters-2026";
const digestBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code)));
const hash = Array.from(digestBytes, b => b.toString(16).padStart(2, "0")).join("");
const env = {
  OWNER_REVIEW_CODE_SHA256: hash,
  OWNER_REVIEW_SESSION_HMAC_KEY: "fixture-only-super-long-key-at-least-32-bytes-and-not-for-production"
};
const worker = createOwnerReviewGalleryWorker();
const request = (path, init = {}) => new Request(origin + path, init);
const post = (path, form, headers = {}) => request(path, {
  method: "POST",
  headers: { origin, "content-type": "application/x-www-form-urlencoded", ...headers },
  body: new URLSearchParams(form).toString()
});
async function session(now = undefined) {
  const response = await createOwnerReviewGalleryWorker(now ? () => now : () => Date.now()).fetch(post("/unlock", { code }), env);
  assert.equal(response.status, 303);
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie?.includes("HttpOnly"));
  return cookie.split(";")[0];
}
async function authedGet(path, cookie) {
  return worker.fetch(request(path, { headers: { cookie } }), env);
}

test("catalog is unique, path-safe, and treats all entries as illustrative candidates", () => {
  assert.equal(new Set(ROUTES.map(item => item.id)).size, ROUTES.length);
  assert.ok(GROUPS.length >= 6);
  assert.ok(ROUTES.length >= 60);
  for (const route of ROUTES) {
    assert.match(route.id, /^[a-z0-9-]+$/);
    assert.match(route.path, /^\/[a-z0-9/-]+$/);
    assert.equal(route.preview, "illustrative_only");
    assert.equal(findReviewRoute(route.id), route);
    assert.doesNotMatch(route.path, /\?|#|token|secret|@/i);
  }
  assert.equal(findReviewRoute("__proto__"), null);
});

test("wrong host or protocol is never served, including health", async () => {
  const wrong = new Request("https://www.mmdbkk.com/");
  assert.equal((await worker.fetch(wrong, env)).status, 404);
  assert.equal((await worker.fetch(new Request("http://" + REVIEW_HOST + "/"), env)).status, 404);
  assert.equal((await worker.fetch(new Request("https://mmd-owner-review-gallery.evil.invalid/"), env)).status, 404);
});

test("configuration failure is closed, not a test-access bypass", async () => {
  const response = await worker.fetch(request("/"), {});
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /<form[^>]+action="\/unlock"/);
  const health = await worker.fetch(request("/healthz"), {});
  assert.equal(health.status, 200);
  assert.equal((await health.json()).configured, false);
});

test("access code unlocks only synthetic preview, not production authority", async () => {
  const locked = await worker.fetch(request("/"), env);
  assert.equal(locked.status, 200);
  assert.match(await locked.text(), /Preview นี้ใช้เข้าสู่ระบบจริงไม่ได้|ไม่สามารถล็อกอินแทนสมาชิก/);
  const rejected = await worker.fetch(post("/unlock", { code: "wrong-password" }), env);
  assert.equal(rejected.status, 401);
  const actual = await worker.fetch(post("/unlock", { code }), env);
  assert.equal(actual.status, 303);
  assert.equal(actual.headers.get("location"), "/");
  assert.match(actual.headers.get("set-cookie"), /^__Host-mmd_owner_review=/);
  assert.match(actual.headers.get("set-cookie"), /Secure; HttpOnly; SameSite=Strict/);
  const cookie = actual.headers.get("set-cookie").split(";")[0];
  const home = await authedGet("/", cookie);
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.match(html, /Owner Review|OWNER REVIEW/);
  assert.match(html, /Candidate Inventory/);
  assert.match(html, /ไม่มีการอ่านข้อมูลจริง/);
  assert.ok(!html.includes(code));
});

test("wrong-origin form, overly large body and unsupported methods fail", async () => {
  const evil = await worker.fetch(post("/unlock", { code }, { origin: "https://evil.example" }), env);
  assert.equal(evil.status, 403);
  const huge = await worker.fetch(post("/unlock", { code: code.repeat(200) }), env);
  assert.equal(huge.status, 413);
  const unsupported = await worker.fetch(request("/view/partner-dashboard", { method: "DELETE" }), env);
  assert.equal(unsupported.status, 405);
});

test("signed cookie is tamper-resistant, expires, and is bound to exact host", async () => {
  const now = 1800000000000;
  const fixtureWorker = createOwnerReviewGalleryWorker(() => now);
  const unlock = await fixtureWorker.fetch(post("/unlock", { code }), env);
  const cookie = unlock.headers.get("set-cookie").split(";")[0];
  const good = await fixtureWorker.fetch(request("/catalog.json", { headers: { cookie } }), env);
  assert.equal(good.status, 200);
  const forged = cookie.slice(0, -2) + "xx";
  const denied = await fixtureWorker.fetch(request("/catalog.json", { headers: { cookie: forged } }), env);
  assert.match(await denied.text(), /Access Code สำหรับ Preview/);
  const expiredWorker = createOwnerReviewGalleryWorker(() => now + 21 * 60 * 1000);
  const expired = await expiredWorker.fetch(request("/view/partner-dashboard", { headers: { cookie } }), env);
  assert.match(await expired.text(), /Access Code สำหรับ Preview/);
  const duplicateCookie = cookie + "; " + cookie;
  const duplicate = await fixtureWorker.fetch(request("/catalog.json", { headers: { cookie: duplicateCookie } }), env);
  assert.match(await duplicate.text(), /Access Code สำหรับ Preview/);
});

test("review screens are clearly MOCK only, no active controls or copied production token", async () => {
  const cookie = await session();
  for (const familyId of ["control-room", "my-mmd", "model-console", "partner-dashboard", "job-confirmation", "therapist-me"]) {
    const response = await authedGet("/view/" + familyId + "?state=ready", cookie);
    assert.equal(response.status, 200, familyId);
    const html = await response.text();
    assert.match(html, /data-preview-only="true"/);
    assert.match(html, /MOCK/);
    assert.match(html, /disabled aria-label=/);
    assert.match(html, /เปิดหน้าจริง · ต้อง Login/);
    assert.doesNotMatch(html, /\?t=|sessionStorage|localStorage|Bearer\s/);
    assert.match(response.headers.get("content-security-policy"), /connect-src 'none'/);
    assert.match(response.headers.get("content-security-policy"), /script-src 'none'/);
  }
});

test("empty/loading/error/locked states are selectable, unknown state fails closed", async () => {
  const cookie = await session();
  for (const state of ["ready", "empty", "loading", "error", "locked"]) {
    const r = await authedGet("/view/partner-dashboard?state=" + state, cookie);
    assert.equal(r.status, 200);
    assert.match(await r.text(), new RegExp(state === "ready" ? "ตัวอย่าง" : state.toUpperCase()));
  }
  assert.equal((await authedGet("/view/partner-dashboard?state=not-valid", cookie)).status, 400);
  assert.equal((await authedGet("/view/not-a-route", cookie)).status, 404);
});

test("logout clears cookie and no authenticated POST becomes a business mutation", async () => {
  const cookie = await session();
  const logout = await worker.fetch(post("/logout", {}), env);
  assert.equal(logout.status, 303);
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
  const sampleMutation = await worker.fetch(request("/view/control-room", {
    method: "POST", headers: { origin, cookie }, body: "action=approve"
  }), env);
  assert.equal(sampleMutation.status, 405);
});

test("HEAD carries no body, security headers always prevent indexing/referrers", async () => {
  const cookie = await session();
  const response = await worker.fetch(request("/view/partner-dashboard", { method: "HEAD", headers: { cookie } }), env);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.match(response.headers.get("x-robots-tag"), /noindex/);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
});
