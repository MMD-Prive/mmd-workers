import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const input = process.argv[2] || process.env.CARE_BACK_STAGING_URL || "";
assert.ok(input, "usage: node scripts/smoke-care-back-staging.mjs https://<front-gate>.workers.dev");
const base = new URL(input);
assert.equal(base.protocol, "https:");
assert.ok(base.hostname.endsWith(".workers.dev"), "staging URL must be a workers.dev host");
base.pathname = "/";
base.search = "";
base.hash = "";

const NO_GRANTS = Object.freeze({
  payment: false,
  membership: false,
  points: false,
  hall: false,
  black_card: false,
  svip: false,
  booking: false,
  access: false,
});
const SESSION_NO_GRANTS = Object.freeze({
  membership: false,
  points: false,
  payment_status: false,
  private_access: false,
});

class CookieJar {
  #values = new Map();
  read(response) {
    const values = typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie") || ""];
    for (const value of values) {
      const pair = value.split(";", 1)[0];
      const split = pair.indexOf("=");
      if (split > 0) this.#values.set(pair.slice(0, split), pair.slice(split + 1));
    }
  }
  header() {
    return [...this.#values].map(([name, value]) => `${name}=${value}`).join("; ");
  }
}

async function call(jar, path, { method = "GET", body } = {}) {
  const headers = { accept: "application/json", origin: base.origin };
  const cookie = jar.header();
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(new URL(path, base), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  jar.read(response);
  const payload = await response.json().catch(() => null);
  assert.ok(payload && typeof payload === "object", `${method} ${path} returned non-JSON`);
  return { response, payload };
}

function assertSessionSafe(payload) {
  assert.deepEqual(payload?.data?.grants, SESSION_NO_GRANTS);
  assert.equal(payload?.data?.route_after_liff, null);
}

function assertCareBackSafe(payload) {
  if (payload.grants) assert.deepEqual(payload.grants, NO_GRANTS);
  assert.doesNotMatch(JSON.stringify(payload), /"(?:payment|membership|points|hall|black_card|svip|booking|access)"\s*:\s*true/i);
}

async function startScenario(scenario) {
  const jar = new CookieJar();
  const started = await call(jar, "/member/api/liff/start", {
    method: "POST",
    body: {
      id_token: `care-back-staging-${scenario}`,
      liff_intent: "promo",
      campaign: "care_back",
    },
  });
  assert.equal(started.response.status, 200, `${scenario} start failed: ${JSON.stringify(started.payload)}`);
  assert.equal(started.payload.ok, true);
  assertSessionSafe(started.payload);
  return { jar, started };
}

async function verifyMemberScenario(scenario, expectedStatus) {
  const { jar, started } = await startScenario(scenario);
  assert.equal(started.payload.data.member_resolved, true);
  const profile = await call(jar, "/member/api/liff/profile");
  assert.equal(profile.response.status, 200, `${scenario} profile failed: ${JSON.stringify(profile.payload)}`);
  assert.equal(profile.payload.data.membership_status, expectedStatus);

  const before = await call(jar, "/member/api/liff/care-back/state");
  assert.equal(before.response.status, 200);
  assertCareBackSafe(before.payload);
  if (before.payload.state === "claim_required") {
    const claim = await call(jar, "/member/api/liff/care-back/claim", { method: "POST", body: {} });
    assert.equal(claim.response.status, 200, `${scenario} claim failed: ${JSON.stringify(claim.payload)}`);
    assert.equal(claim.payload.data.benefit_state, "benefit_pending");
    assert.equal(claim.payload.data.code_status, "draft");
    assert.equal(claim.payload.data.single_use, true);
    assertCareBackSafe(claim.payload);
  }

  const available = await call(jar, "/member/api/liff/care-back/state");
  assert.equal(available.response.status, 200);
  assertCareBackSafe(available.payload);
  if (available.payload.state === "wish_available") {
    const wish = await call(jar, "/member/api/liff/care-back/wish", {
      method: "POST",
      body: {
        wish_text: `STAGING ${scenario} · สุขสันต์ปีที่หกครับ`,
        request_id: `staging-${scenario}-${randomUUID()}`,
      },
    });
    assert.equal(wish.response.status, 200, `${scenario} wish failed: ${JSON.stringify(wish.payload)}`);
    assert.equal(wish.payload.state, "completed");
    assertCareBackSafe(wish.payload);
  } else {
    assert.equal(available.payload.state, "completed", `${scenario} unexpected state`);
  }

  const returned = await call(jar, "/member/api/liff/care-back/state");
  assert.equal(returned.response.status, 200);
  assert.equal(returned.payload.state, "completed");
  assert.match(returned.payload.final_display.message, /MMD/);
  assertCareBackSafe(returned.payload);
}

async function verifyNewScenario() {
  const { jar, started } = await startScenario("new");
  assert.equal(started.payload.data.member_resolved, false);
  assert.equal(started.payload.data.pending_identity, true);
  const state = await call(jar, "/member/api/liff/care-back/state");
  assert.equal(state.response.status, 200);
  assert.equal(state.payload.state, "verification_required");
  assertCareBackSafe(state.payload);
  const blocked = await call(jar, "/member/api/liff/care-back/claim", { method: "POST", body: {} });
  assert.equal(blocked.response.status, 409);
  assert.equal(blocked.payload.error.code, "CARE_BACK_MEMBER_REQUIRED");
  assertCareBackSafe(blocked.payload);
}

async function verifyPublicWishBridge() {
  const publicWish = await call(new CookieJar(), "/member/api/care-back/public-wish", {
    method: "POST",
    body: {
      wish_text: "STAGING public Wish bridge V7",
      request_id: `staging-public-wish-${randomUUID()}`,
      language: "th",
    },
  });
  assert.equal(publicWish.response.status, 200, `public Wish failed: ${JSON.stringify(publicWish.payload)}`);
  assert.equal(publicWish.payload.ok, true);
  assert.equal(publicWish.payload.state, "completed");
  assert.equal(publicWish.payload.benefits?.verification_required, true);
  assert.deepEqual(publicWish.payload.grants, NO_GRANTS);
  assert.match(publicWish.payload.wish_link_token || "", /^pw_[A-Za-z0-9_-]+$/);
  assert.match(publicWish.payload.final_display?.message || "", /MMD/);
}

const shell = await fetch(new URL("/member/liff?intent=promo&campaign=care_back&scenario=current", base));
assert.equal(shell.status, 200);
assert.equal(shell.headers.get("x-mmd-route-owner"), "member-dashboard-chat-worker");
assert.match(await shell.text(), /"stagingScenario":"current"/);

await verifyMemberScenario("current", "active");
await verifyMemberScenario("returning", "expired");
await verifyNewScenario();
await verifyPublicWishBridge();

const legacy = await fetch(new URL("/api/care-back-wish", base), {
  method: "POST",
  headers: { "content-type": "application/json", origin: base.origin },
  body: JSON.stringify({ wish: "must stay closed" }),
});
assert.equal(legacy.status, 404);

console.log(`CARE BACK full staging passed at ${base.origin}`);
