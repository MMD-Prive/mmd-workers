import assert from "node:assert/strict";
import test from "node:test";
import { customerEtaFromEvents, handleMemberAppSessionApi, isMemberAppSessionPath } from "../src/member-app-session.js";

const IDENTITY = { lineUserId: "U1234567890abcdef1234567890abcdef", memberId: "recMember123" };

function sessionRecord(overrides = {}) {
  return {
    id: "recSession123",
    createdTime: "2026-09-01T00:00:00.000Z",
    fields: {
      session_id: "SESSION-001",
      line_user_id: IDENTITY.lineUserId,
      member_id: IDENTITY.memberId,
      session_state: "confirmed",
      job_date: "2099-09-20",
      start_time: "21:00",
      end_time: "22:30",
      location_name: "MMD verified venue",
      model_name: "Mek",
      model_private_phone: "must-never-leak",
      payout_amount: 9999,
      ...overrides,
    },
  };
}

function jobRecord(events = []) {
  return {
    id: "recJob123",
    fields: {
      session_id: "SESSION-001",
      events_json: JSON.stringify(events),
      model_private_gps: "must-never-leak",
    },
  };
}

function envWith(record = sessionRecord(), { jobRecords = [] } = {}) {
  let current = structuredClone(record);
  const writes = [];
  const reads = { sessions: 0, jobs: 0 };
  return {
    writes,
    reads,
    AIRTABLE_API_KEY: "test-key",
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_TABLE_JOBS: "Jobs",
    AIRTABLE_HTTP: {
      async fetch(request) {
        if (request.method === "PATCH") {
          const payload = await request.json();
          writes.push(payload.fields);
          current.fields = { ...current.fields, ...payload.fields };
          return Response.json({ id: current.id, fields: current.fields });
        }
        const table = decodeURIComponent(new URL(request.url).pathname.split("/").at(-1) || "");
        if (table === "Jobs") {
          reads.jobs += 1;
          return Response.json({ records: jobRecords });
        }
        reads.sessions += 1;
        return Response.json({ records: [current] });
      },
    },
    PAYMENTS_WORKER: {
      async fetch(request) {
        const body = await request.json();
        if (body.t !== "valid-token" || body.expected_role !== "customer") {
          return Response.json({ ok: false }, { status: 403 });
        }
        return Response.json({ ok: true, data: { session_id: "SESSION-001" } });
      },
    },
  };
}

function request(path, init = {}) {
  return new Request(`https://mmdbkk.com${path}`, {
    headers: { cookie: "__Host-mmd_liff_session=test", "content-type": "application/json" },
    ...init,
  });
}

const readIdentity = async () => IDENTITY;

test("recognizes the three bounded MY MMD session routes", () => {
  for (const suffix of ["current", "context", "ack"]) {
    assert.equal(isMemberAppSessionPath(`https://mmdbkk.com/api/member/app/session/${suffix}`), true);
  }
  assert.equal(isMemberAppSessionPath("https://mmdbkk.com/api/member/app/session/admin"), false);
});

test("current returns one customer-safe canonical Session projection", async () => {
  const response = await handleMemberAppSessionApi(request("/api/member/app/session/current"), envWith(), readIdentity);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.sessionId, "SESSION-001");
  assert.equal(body.lifecycle, "confirmed");
  assert.equal(body.jobTimeLabel, "21:00 – 22:30");
  assert.deepEqual(body.model, { displayName: "Mek", displayAllowed: true });
  assert.equal(body.acknowledgement.customerAckAllowed, true);
  assert.doesNotMatch(JSON.stringify(body), /private_phone|payout|9999|must-never-leak/i);
});

test("MY MMD derives its ETA label from the newest active ETA event", async () => {
  const now = Date.now();
  const env = envWith(sessionRecord({ customer_eta_label: "legacy label must not win" }), {
    jobRecords: [jobRecord([
      { ts: new Date(now - 2 * 60_000).toISOString(), event: "eta_update", by: "model", eta_minutes: 70 },
      { ts: new Date(now).toISOString(), event: "eta_update", by: "model", eta_minutes: 25, source: "mmd_model_dashboard" },
    ])],
  });

  const response = await handleMemberAppSessionApi(request("/api/member/app/session/current"), env, readIdentity);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.etaLabel, "ถึงโดยประมาณในอีก 25 นาที");
  assert.equal(env.reads.jobs, 1);
  assert.doesNotMatch(JSON.stringify(body), /events_json|model_private_gps|mmd_model_dashboard|legacy label/i);
});

test("expired ETA events clear stale labels instead of falling back to customer_eta_label", async () => {
  const now = Date.now();
  const env = envWith(sessionRecord({ customer_eta_label: "stale legacy ETA" }), {
    jobRecords: [jobRecord([
      { ts: new Date(now - 21 * 60_000).toISOString(), event: "eta_update", eta_minutes: 20 },
    ])],
  });

  const response = await handleMemberAppSessionApi(request("/api/member/app/session/current"), env, readIdentity);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.etaLabel, null);
});

test("ETA event parser ignores malformed entries and chooses the newest valid timestamp", () => {
  const now = Date.UTC(2026, 8, 24, 12, 0, 0);
  const eta = customerEtaFromEvents(JSON.stringify([
    { ts: "not-a-date", event: "eta_update", eta_minutes: 80 },
    { ts: new Date(now - 3 * 60_000).toISOString(), event: "eta_update", eta_minutes: 35 },
    { ts: new Date(now - 60_000).toISOString(), event: "eta_update", eta_minutes: 12 },
    { ts: new Date(now).toISOString(), event: "other_event", eta_minutes: 240 },
  ]), now);
  assert.deepEqual(eta, { hasEvent: true, label: "ถึงโดยประมาณในอีก 11 นาที" });
});

test("current returns 204 when no owned active Session exists", async () => {
  const env = envWith();
  env.AIRTABLE_HTTP.fetch = async () => Response.json({ records: [] });
  const response = await handleMemberAppSessionApi(request("/api/member/app/session/current"), env, readIdentity);
  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
});

test("context accepts a customer token only after canonical ownership matches", async () => {
  const response = await handleMemberAppSessionApi(request("/api/member/app/session/context?t=valid-token"), envWith(), readIdentity);
  const body = await response.json();
  assert.equal(body.valid, true);
  assert.equal(body.session.sessionId, "SESSION-001");

  const foreign = envWith(sessionRecord({ line_user_id: "Uffffffffffffffffffffffffffffffff", member_id: "recOther" }));
  const denied = await handleMemberAppSessionApi(request("/api/member/app/session/context?t=valid-token"), foreign, readIdentity);
  assert.deepEqual(await denied.json(), { valid: false, session: null });
});

test("ack writes only customer_ack_at and returns refreshed projection", async () => {
  const env = envWith();
  const response = await handleMemberAppSessionApi(
    request("/api/member/app/session/ack", { method: "POST", body: JSON.stringify({ session_id: "SESSION-001", t: "valid-token" }) }),
    env,
    readIdentity,
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(env.writes.length, 1);
  assert.deepEqual(Object.keys(env.writes[0]), ["customer_ack_at"]);
  assert.ok(body.acknowledgement.customerAckAt);
  assert.equal(body.acknowledgement.customerAckAllowed, false);
  assert.equal(body.lifecycle, "confirmed");
});

test("ack rejects unauthenticated, mismatched and repeated writes", async () => {
  const unauthenticated = await handleMemberAppSessionApi(
    request("/api/member/app/session/ack", { method: "POST", body: JSON.stringify({ session_id: "SESSION-001" }) }),
    envWith(),
    async () => null,
  );
  assert.equal(unauthenticated.status, 401);

  const mismatch = await handleMemberAppSessionApi(
    request("/api/member/app/session/ack", { method: "POST", body: JSON.stringify({ session_id: "OTHER", t: "valid-token" }) }),
    envWith(),
    readIdentity,
  );
  assert.equal(mismatch.status, 403);

  const repeated = await handleMemberAppSessionApi(
    request("/api/member/app/session/ack", { method: "POST", body: JSON.stringify({ session_id: "SESSION-001" }) }),
    envWith(sessionRecord({ customer_ack_at: "2026-09-13T00:00:00.000Z" })),
    readIdentity,
  );
  assert.equal(repeated.status, 409);
});
