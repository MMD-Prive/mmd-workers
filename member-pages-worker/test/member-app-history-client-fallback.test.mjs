import assert from "node:assert/strict";
import test from "node:test";

import { handleMemberAppApi } from "../src/member-app-api.js";

const SECRET = "test-only-liff-session-secret-1234567890";
const TOKEN = "client-history-session-token";
const LINE_ID = `U${"b".repeat(32)}`;
const CLIENT_ID = "recClientHistory01";

async function digest(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

class MemoryKv {
  constructor(entries = []) { this.map = new Map(entries); }
  async get(key, type) {
    const value = this.map.get(key);
    if (value === undefined) return null;
    return type === "json" ? JSON.parse(value) : value;
  }
}

function airtableBinding() {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      const table = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1));
      const formula = url.searchParams.get("filterByFormula") || "";
      if (table === "Clients") {
        return Response.json({ records: [{ id: CLIENT_ID, fields: { line_user_id: LINE_ID, email: "joeka@example.com" } }] });
      }
      if (table === "Sessions") {
        return Response.json({ records: [{
          id: "recServiceHistory01",
          fields: {
            email: "joeka@example.com",
            job_date: "2026-08-15",
            "Session Status": "Completed",
            import_review_status: "approved",
            job_type: "historical_service",
          },
        }] });
      }
      if (table === "Payments") {
        return Response.json({ records: [{
          id: "recPaymentHistory01",
          fields: {
            "Member Email": "joeka@example.com",
            "Payment Date": "2026-08-15",
            "Payment Status": "Paid",
            import_review_status: "approved",
            payment_evidence_source: "imported_history",
          },
        }] });
      }
      if (table === "tbl1u0foFBvgFpT9G") {
        return Response.json({ records: formula.includes(LINE_ID) ? [] : [] });
      }
      throw new Error(`unexpected_table:${table}`);
    },
  };
}

test("/api/member/app/history can read verified Client-linked history without widening member rights", async () => {
  const hash = await digest(SECRET, `session:${TOKEN}`);
  const session = {
    line_user_id: LINE_ID,
    member_exists: false,
    member_id: null,
    member_profile: null,
    expires_at: Date.now() + 60_000,
  };
  const env = {
    LIFF_SESSION_SECRET: SECRET,
    LIFF_IDENTITY_KV: new MemoryKv([[`liff:session:${hash}`, JSON.stringify(session)]]),
    AIRTABLE_API_KEY: "pat-test",
    AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
    AIRTABLE_HTTP: airtableBinding(),
  };
  const delegate = {
    async fetch(request) {
      assert.equal(new URL(request.url).pathname, "/api/member/dashboard");
      return Response.json({
        ok: true,
        data: {
          member: {},
          points: { status: "checking", value: null },
          history: { status: "checking", events: [] },
          payment_history: { status: "checking", records: [] },
        },
      });
    },
  };

  const response = await handleMemberAppApi(new Request("https://mmdbkk.com/api/member/app/history", {
    headers: { cookie: `__Host-mmd_liff_session=${TOKEN}` },
  }), env, delegate);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.length, 2);
  assert.deepEqual(body.map((item) => item.kind), ["booking", "payment"]);
  assert.equal(session.member_exists, false);
  assert.equal(session.member_id, null);
});

test("verified-empty canonical history stays checking when Client history lookup fails", async () => {
  const hash = await digest(SECRET, `session:${TOKEN}`);
  const session = { line_user_id: LINE_ID, member_exists: true, member_id: "test-member", expires_at: Date.now() + 60_000 };
  for (const failedTable of ["Clients", "Sessions", "Payments"]) {
    const working = airtableBinding();
    const env = {
      LIFF_SESSION_SECRET: SECRET,
      LIFF_IDENTITY_KV: new MemoryKv([[`liff:session:${hash}`, JSON.stringify(session)]]),
      AIRTABLE_API_KEY: "pat-test", AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
      AIRTABLE_HTTP: { async fetch(request) {
        if (new URL(request.url).pathname.endsWith(`/${failedTable}`)) return Response.json({ error: "unavailable" }, { status: 503 });
        return working.fetch(request);
      } },
    };
    const delegate = { async fetch() { return Response.json({ ok: true, data: {
      history: { status: "empty", events: [] }, payment_history: { status: "empty", records: [] },
    } }); } };
    const response = await handleMemberAppApi(new Request("https://mmdbkk.com/api/member/app/history", {
      headers: { cookie: `__Host-mmd_liff_session=${TOKEN}` },
    }), env, delegate);
    assert.deepEqual(await response.json(), { state: "checking", items: [] }, failedTable);
  }
});
