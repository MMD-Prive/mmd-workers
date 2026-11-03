import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, webcrypto } from "node:crypto";
import { handleDiscoveryViewer } from "../src/booking-discovery-viewer.js";

globalThis.crypto ||= webcrypto;
const UID = "U" + "a".repeat(32);
const OTHER_UID = "U" + "b".repeat(32);
const MEMBER = "member_existing_A";
const SECRET = "s".repeat(40);
const TOKEN = "a".repeat(64);
const ALIAS = "b".repeat(64);
const SESSION_KEY = "liff:session:" + createHmac("sha256", SECRET).update("session:" + TOKEN).digest("hex");
const memberRow = (memberId = MEMBER, uid = UID, id = "rec" + "A".repeat(14)) => ({ id, fields: { line_id: uid, member_id: memberId } });

function fixture({ pages = [{ records: [memberRow()] }], http, session = {}, overrides = {} } = {}) {
  const storedSession = {
    line_user_id: UID, member_id: MEMBER, member_exists: true,
    member_profile: { membership_status: "active" }, expires_at: Date.now() + 600000,
    ...session,
  };
  const originalSession = structuredClone(storedSession);
  const calls = [], reads = [], writes = [];
  let page = 0;
  const env = {
    AUTH_SERVICE_SIGIL_BOOKING_TO_MEMBER_PAGES: SECRET,
    LIFF_SESSION_SECRET: SECRET,
    AIRTABLE_API_KEY: "test-only", AIRTABLE_BASE_ID: "fixture",
    LIFF_IDENTITY_KV: {
      get: async (key, format) => {
        assert.equal(format, "json");
        reads.push(key);
        if (key === SESSION_KEY) return storedSession;
        if (key === "booking-discovery:" + ALIAS) return { session_token: TOKEN, expires_at: Date.now() + 600000 };
        return null;
      },
      put: async (...args) => { writes.push(args); assert.fail("session write/rotation is forbidden"); },
      delete: async (...args) => { writes.push(args); assert.fail("session invalidation is forbidden"); },
    },
    AIRTABLE_HTTP: { fetch: async request => {
      calls.push(request);
      assert.equal(request.method, "GET", "Airtable writes are forbidden");
      if (http) return http(request);
      const url = new URL(request.url);
      if (url.pathname.endsWith("/Members")) return Response.json(pages[page++]);
      // Optional booking notification-name projection has no evidence here.
      return Response.json({ records: [] });
    } },
    ...overrides,
  };
  const request = (context = "booking", alias = false) => new Request(
    "https://member-pages.internal/__internal/booking/discovery-viewer" + (context === null ? "" : "?context=" + context),
    { headers: { "x-mmd-booking-service-secret": SECRET, cookie: alias ? "__Secure-mmd_discovery_session=" + ALIAS : "__Host-mmd_liff_session=" + TOKEN } },
  );
  return { env, calls, reads, request, assertReadOnly(response) {
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(writes, []);
    assert.deepEqual(storedSession, originalSession);
  } };
}

async function check(f, context = "booking", alias = false) {
  const response = await handleDiscoveryViewer(f.request(context, alias), f.env);
  f.assertReadOnly(response);
  const body = await response.json();
  assert.ok(!JSON.stringify(body).includes(UID), "never expose raw LINE UID");
  assert.ok(!JSON.stringify(body).includes(OTHER_UID));
  return { response, body };
}

for (const context of ["booking", "identity"]) {
  test(`${context}: an existing legacy session with a current matching row remains usable`, async () => {
    // This intentionally has no provenance flag. A previously poisoned current
    // Members.line_id cannot be identified by freshness alone; no global legacy
    // session invalidation is introduced or claimed by this guard.
    const f = fixture();
    const { response, body } = await check(f, context);
    assert.equal(response.status, 200);
    assert.equal(body.identity_binding_verified, true);
    assert.match(body.memberRef, /^[a-f0-9]{64}$/);
    if (context === "booking") assert.equal(body.memberId, MEMBER);
    else assert.deepEqual(Object.keys(body).sort(), ["identity_binding_verified", "memberRef", "ok"]);
    const url = new URL(f.calls[0].url);
    assert.equal(url.pathname, "/v0/fixture/Members");
    assert.equal(url.searchParams.get("filterByFormula"), `{line_id}="${UID}"`);
    assert.equal(url.searchParams.has("fields[]"), false, "optional auth aliases need not exist as fields in every schema");
    assert.equal(url.searchParams.has("maxRecords"), false, "do not hide later duplicates");
  });

  test(`${context}: cached member A is denied when the same LINE now maps to member B`, async () => {
    const f = fixture({ pages: [{ records: [memberRow("member_current_B")] }] });
    const { response, body } = await check(f, context, true);
    assert.equal(response.status, 403);
    assert.deepEqual(body, { ok: false, error: "public_identity_review_required" });
    assert.deepEqual(f.reads, ["booking-discovery:" + ALIAS, SESSION_KEY]);
    assert.equal(f.calls.length, 1, "denial must not resolve notification names");
  });
}

test("fresh binding is reread each time rather than cached or repaired", async () => {
  const f = fixture({ pages: [{ records: [memberRow()] }, { records: [memberRow("member_B")] }] });
  assert.equal((await check(f, "identity")).response.status, 200);
  assert.equal((await check(f, "identity")).response.status, 403);
  assert.equal(f.calls.length, 2);
});

test("explicit member IDs are trimmed, never lowercased or truncated", async () => {
  const good = fixture({ pages: [{ records: [memberRow("  " + MEMBER + "  ")] }], session: { member_id: " " + MEMBER + " " } });
  assert.equal((await check(good)).body.memberId, MEMBER);
  for (const memberId of [undefined, null, 42, [MEMBER], {}, "", " ", MEMBER.toUpperCase(), MEMBER + "x".repeat(160), MEMBER + "\n"]) {
    const row = memberRow(); row.fields.member_id = memberId;
    assert.equal((await check(fixture({ pages: [{ records: [row] }] }))).response.status, 403);
  }
});

test("existing auth synthetic identity is preserved only for the fresh exact LINE record", async () => {
  const row = memberRow(); delete row.fields.member_id;
  const syntheticId = "mmd_rec_" + row.id;
  const options = { pages: [{ records: [row] }], session: { member_id: syntheticId } };
  const good = await check(fixture(options));
  assert.equal(good.response.status, 200);
  assert.equal(good.body.memberId, syntheticId);
  for (const bad of [
    { ...options, session: { member_id: "mmd_rec_rec" + "B".repeat(14) } },
    { ...options, pages: [{ records: [{ ...row, id: "rec" + "B".repeat(14) }] }] },
    { ...options, pages: [{ records: [memberRow("another_explicit_member")] }] },
    { ...options, pages: [{ records: [{ ...row, fields: { line_id: OTHER_UID } }] }] },
  ]) assert.equal((await check(fixture(bad))).response.status, 403);
});

test("known auth member-ID aliases stay compatible and contradictory aliases never win by priority", async () => {
  for (const alias of ["Member ID", "auth_member_id"]) {
    const row = memberRow(); delete row.fields.member_id; row.fields[alias] = MEMBER;
    assert.equal((await check(fixture({ pages: [{ records: [row] }] }))).response.status, 200);
    const syntheticSession = { member_id: "mmd_rec_" + row.id };
    assert.equal((await check(fixture({ pages: [{ records: [row] }], session: syntheticSession }))).response.status, 403);
    row.fields.member_id = "another_member";
    assert.equal((await check(fixture({ pages: [{ records: [row] }] }))).response.status, 403);
  }
  const matching = memberRow(); matching.fields["Member ID"] = " " + MEMBER + " "; matching.fields.auth_member_id = MEMBER;
  assert.equal((await check(fixture({ pages: [{ records: [matching] }] }))).response.status, 200);
});

test("missing, contradictory, duplicate and later-page members deny without choosing a winner", async () => {
  for (const pages of [
    [{ records: [] }],
    [{ records: [memberRow(MEMBER, OTHER_UID)] }],
    [{ records: [memberRow(MEMBER, UID.toUpperCase())] }],
    [{ records: [memberRow(), memberRow()] }],
    [{ records: [memberRow(), memberRow(MEMBER, UID, "rec" + "B".repeat(14))] }],
    [{ records: [memberRow()], offset: "next" }, { records: [memberRow("member_B")] }],
    [{ records: [memberRow()], offset: "next" }, { records: [memberRow()] }],
    [{ records: [memberRow()], offset: "next" }, { records: [memberRow(MEMBER, OTHER_UID)] }],
  ]) {
    const f = fixture({ pages });
    const { response, body } = await check(f);
    assert.equal(response.status, 403);
    assert.equal(body.error, "public_identity_review_required");
  }
});

test("complete pagination is required even after a matching first page", async () => {
  const f = fixture({ pages: [{ records: [memberRow()], offset: "next" }, { records: [] }] });
  assert.equal((await check(f, "identity")).response.status, 200);
  assert.equal(new URL(f.calls[1].url).searchParams.get("offset"), "next");
});

test("malformed response, row and offset or incomplete pagination is unavailable", async () => {
  const cases = [
    [null], [{}], [[]], [{ records: null }], [{ records: {} }],
    [{ records: [null] }], [{ records: [{ id: "not-a-record", fields: {} }] }],
    [{ records: [{ id: memberRow().id, fields: [] }] }],
    ...[null, false, 42, {}, [], "", "x".repeat(4097)].map(offset => [{ records: [memberRow()], offset }]),
    [{ records: [memberRow()], offset: "repeat" }, { records: [], offset: "repeat" }],
    Array.from({ length: 20 }, (_, i) => ({ records: i ? [] : [memberRow()], offset: "page" + i })),
  ];
  for (const pages of cases) {
    const { response, body } = await check(fixture({ pages }), "identity");
    assert.equal(response.status, 503);
    assert.deepEqual(body, { ok: false, error: "public_identity_unavailable" });
  }
});

test("HTTP, body and configuration failures are unavailable rather than a false nonmember", async () => {
  for (const options of [
    { http: async () => { throw Error("network outage"); } },
    { http: async () => new Response("limited", { status: 429 }) },
    { http: async () => new Response("not JSON") },
    { overrides: { AIRTABLE_API_KEY: "" } },
    { overrides: { AIRTABLE_BASE_ID: "" } },
    { overrides: { AIRTABLE_MEMBERS_LINE_USER_ID_FIELD: "" } },
  ]) {
    const { response, body } = await check(fixture(options), "identity");
    assert.equal(response.status, 503);
    assert.equal(body.error, "public_identity_unavailable");
  }
});

test("existing schema overrides are explicit and do not enable guessed field fallback", async () => {
  const f = fixture({
    overrides: { AIRTABLE_TABLE_MEMBERS: "Members Fixture", AIRTABLE_MEMBERS_LINE_USER_ID_FIELD: "Verified LINE", AIRTABLE_MEMBERS_MEMBER_ID_FIELD: "Canonical Member" },
    http: async request => {
      const url = new URL(request.url);
      assert.equal(decodeURIComponent(url.pathname), "/v0/fixture/Members Fixture");
      assert.equal(url.searchParams.get("filterByFormula"), `{Verified LINE}="${UID}"`);
      assert.equal(url.searchParams.has("fields[]"), false);
      return Response.json({ records: [{ id: memberRow().id, fields: { "Verified LINE": UID, "Canonical Member": MEMBER } }] });
    },
  });
  assert.equal((await check(f, "identity")).response.status, 200);
  const row = memberRow(); delete row.fields.line_id; row.fields.line_user_id = UID;
  assert.equal((await check(fixture({ pages: [{ records: [row] }] }), "identity")).response.status, 403);
});

test("existing member-table ID override takes precedence over a table name", async () => {
  const f = fixture({
    overrides: { AIRTABLE_TABLE_MEMBERS_ID: "tblFixtureMembers", AIRTABLE_TABLE_MEMBERS: "Old Members Name" },
    http: async request => {
      assert.equal(new URL(request.url).pathname, "/v0/fixture/tblFixtureMembers");
      return Response.json({ records: [memberRow()] });
    },
  });
  assert.equal((await check(f, "identity")).response.status, 200);
});

test("hard deadline covers ignored abort, stalled body and later-page stalled body", async () => {
  await Promise.all(["fetch", "body", "later-body"].map(async kind => {
    let count = 0;
    const f = fixture({ http: async () => {
      count++;
      if (kind === "fetch") return new Promise(() => {});
      if (kind === "later-body" && count === 1) return Response.json({ records: [memberRow()], offset: "next" });
      return { ok: true, json: () => new Promise(() => {}) };
    } });
    const started = Date.now();
    const { response, body } = await check(f, "identity");
    assert.equal(response.status, 503);
    assert.equal(body.error, "public_identity_unavailable");
    assert.ok(Date.now() - started < 4500, "full-body lookup must not hang");
    assert.ok(f.calls.every(request => request.signal.aborted));
  }));
});

test("legacy contexts keep their existing hash-only response and do not read Members", async () => {
  for (const context of [null, "", "search"]) {
    const f = fixture({ http: async () => assert.fail("legacy lookup changed") });
    const { response, body } = await check(f, context);
    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(body).sort(), ["memberRef", "ok"]);
    assert.equal(f.calls.length, 0);
  }
});

test("service secret, missing session, nonmember and existing blocked/grace denials are preserved", async () => {
  const f = fixture();
  const unauthenticated = new Request(f.request(), { headers: {} });
  assert.equal((await handleDiscoveryViewer(unauthenticated, f.env)).status, 401);
  assert.deepEqual(f.reads, []); assert.deepEqual(f.calls, []);
  const noSession = new Request(f.request(), { headers: { "x-mmd-booking-service-secret": SECRET } });
  assert.equal((await handleDiscoveryViewer(noSession, f.env)).status, 401);
  for (const session of [{ read_grace_only: true }, ...["blocked", "suspended", "revoked", "pending_review"].map(status => ({ member_profile: { status } }))]) {
    const blocked = fixture({ session });
    assert.equal((await check(blocked)).response.status, 401);
    assert.equal(blocked.calls.length, 0);
  }
  const nonmember = fixture({ session: { member_exists: false, member_id: null } });
  const result = await check(nonmember);
  assert.equal(result.response.status, 403);
  assert.equal(result.body.error, "public_membership_required");
  assert.equal(nonmember.calls.length, 0);
});

test("identity context now reports unavailable session storage rather than anonymous success", async () => {
  const f = fixture({ overrides: { LIFF_IDENTITY_KV: { get: async () => { throw Error("storage outage"); } } } });
  assert.equal((await check(f, "identity")).response.status, 503);
  assert.equal(f.calls.length, 0);
});
