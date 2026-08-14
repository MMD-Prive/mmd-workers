const CHANNEL_ID = "care-back-staging-channel";
const FIXTURES = Object.freeze({
  "care-back-staging-current": {
    lineUserId: "U00000000000000000000000000000001",
    memberId: "MMD-STAGING-CURRENT-01",
    profile: {
      display_name: "สมาชิกปัจจุบัน · STAGING",
      tier: "Premium",
      membership_status: "active",
      points: 0,
      history_window: { from: "2025-08-14", to: "2026-08-14", timezone: "Asia/Bangkok" },
      history: [],
    },
  },
  "care-back-staging-returning": {
    lineUserId: "U00000000000000000000000000000002",
    memberId: "MMD-STAGING-RETURNING-01",
    profile: {
      display_name: "สมาชิกเก่า · STAGING",
      tier: "Standard",
      membership_status: "expired",
      points: 0,
      history_window: { from: "2024-08-14", to: "2026-08-14", timezone: "Asia/Bangkok" },
      history: [],
    },
  },
  "care-back-staging-new": {
    lineUserId: "U00000000000000000000000000000003",
    memberId: "",
    profile: null,
  },
});

const BY_LINE_USER_ID = new Map(Object.values(FIXTURES).map((fixture) => [fixture.lineUserId, fixture]));

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function trusted(request, env) {
  const expected = String(env.MEMBER_STATUS_RESOLVER_SECRET || "");
  const received = String(request.headers.get("x-mmd-member-resolver-secret") || "");
  return expected.length >= 32 && expected === received;
}

async function verifyLineToken(request) {
  const form = await request.formData().catch(() => null);
  const token = String(form?.get("id_token") || "");
  const clientId = String(form?.get("client_id") || "");
  const fixture = FIXTURES[token];
  if (!fixture || clientId !== CHANNEL_ID) return json({ error: "invalid_request" }, 401);
  return json({ sub: fixture.lineUserId, aud: CHANNEL_ID, exp: Math.floor(Date.now() / 1000) + 3600 });
}

async function resolveMember(request, env, profileMode) {
  if (!trusted(request, env)) return json({ ok: false, error: "internal_auth_required" }, 401);
  const body = await request.json().catch(() => null);
  const fixture = BY_LINE_USER_ID.get(String(body?.line_user_id || ""));
  if (!fixture) return json({ ok: false, error: "fixture_not_found" }, 404);
  if (!fixture.memberId) return json({ ok: true, data: { member_exists: false } });
  if (!profileMode) return json({ ok: true, data: { member_exists: true, mmd_member_id: fixture.memberId } });
  return json({ ok: true, data: { member_exists: true, member_id: fixture.memberId, profile: fixture.profile } });
}

export default {
  async fetch(request, env = {}) {
    const path = new URL(request.url).pathname;
    if (request.method === "POST" && path === "/oauth2/v2.1/verify") return verifyLineToken(request);
    if (request.method === "POST" && path === "/__internal/member-status/resolve") return resolveMember(request, env, false);
    if (request.method === "POST" && path === "/__internal/member-profile/read") return resolveMember(request, env, true);
    return json({ ok: false, error: "not_found" }, 404);
  },
};
