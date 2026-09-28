import assert from "node:assert/strict";
import test from "node:test";

import { handleMemberAppApi } from "../src/member-app-api.js";

const SECRET = "canonical-identity-guard-test-secret-1234567890";
const TOKEN = "canonical-identity-guard-session";
const LINE_ID = `U${"c".repeat(32)}`;
const CANONICAL_TABLE = "MMD — LINE OFC Client Import Staging";
const LEGACY_TABLE = "tbl1u0foFBvgFpT9G";

async function sessionKey() {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`session:${TOKEN}`));
  return `liff:session:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function envFor({ canonicalRecords = [], legacyRecords = [], canonicalStatus = 200, legacyStatus = 200 } = {}) {
  const key = await sessionKey();
  const store = new Map([[key, {
    line_user_id: LINE_ID,
    member_exists: false,
    member_id: null,
    member_profile: null,
    expires_at: Date.now() + 60_000,
  }]]);
  return {
    LIFF_SESSION_SECRET: SECRET,
    LIFF_IDENTITY_KV: {
      async get(name, format) {
        const value = store.get(name) || null;
        return format === "json" ? value : (value ? JSON.stringify(value) : null);
      },
    },
    AIRTABLE_API_KEY: "test-key",
    AIRTABLE_BASE_ID: "app-test-base",
    AIRTABLE_HTTP: {
      async fetch(request) {
        const url = new URL(request.url);
        const table = decodeURIComponent(url.pathname.split("/").pop());
        if (table === CANONICAL_TABLE) {
          assert.equal(url.searchParams.get("filterByFormula"), `{LINE User ID}='${LINE_ID}'`);
          return Response.json({ records: canonicalRecords }, { status: canonicalStatus });
        }
        if (table === LEGACY_TABLE) {
          assert.equal(url.searchParams.get("filterByFormula"), `{line_user_id}='${LINE_ID}'`);
          return Response.json({ records: legacyRecords }, { status: legacyStatus });
        }
        if (table === "MMD — Identity Merge Requests") return Response.json({ records: [] });
        throw new Error(`unexpected Airtable table: ${table}`);
      },
    },
  };
}

function request() {
  return new Request("https://mmdbkk.com/api/member/app/dashboard", {
    method: "GET",
    headers: { cookie: `__Host-mmd_liff_session=${TOKEN}`, accept: "application/json" },
  });
}

const dashboardDelegate = {
  async fetch(input) {
    assert.equal(new URL(input.url).pathname, "/api/member/dashboard");
    return Response.json({
      ok: true,
      data: {
        member: {
          display_name: "สมาชิก MMD",
          tier: { value: null, status: "checking" },
          membership_status: { value: null, status: "checking" },
        },
        points: { value: null, status: "checking" },
        history: { status: "empty", events: [] },
        payment_history: { status: "empty", records: [] },
      },
    });
  },
};

test("canonical Client link never falls through to Guest/signup before resolver recovery", async () => {
  const env = await envFor({ canonicalRecords: [{
    id: "recCanonicalStage01",
    fields: {
      "LINE User ID": LINE_ID,
      "Canonical Client": ["recCanonicalClient01"],
    },
  }] });

  const payload = await (await handleMemberAppApi(request(), env, dashboardDelegate)).json();
  assert.equal(payload.lifecycle, "checking");
  assert.equal(payload.membership.lifecycle, "checking");
  assert.equal(payload.membership.level, "unknown");
  assert.equal(payload.membership.levelVerified, false);
  assert.equal(payload.nextAction.kind, "checking");
  assert.equal(payload.legacyDisplay, null);
  assert.doesNotMatch(JSON.stringify(payload), /"kind":"signup"/);
});

test("canonical staging outage fails closed instead of creating a new-member signup", async () => {
  const env = await envFor({ canonicalStatus: 503 });
  const payload = await (await handleMemberAppApi(request(), env, dashboardDelegate)).json();

  assert.equal(payload.lifecycle, "checking");
  assert.equal(payload.nextAction.kind, "checking");
  assert.doesNotMatch(JSON.stringify(payload), /"kind":"signup"/);
});

test("successful canonical negative lookup still allows a genuine new customer when legacy history is unavailable", async () => {
  const env = await envFor({ canonicalRecords: [], legacyStatus: 503 });
  const payload = await (await handleMemberAppApi(request(), env, dashboardDelegate)).json();

  assert.equal(payload.lifecycle, "new");
  assert.equal(payload.nextAction.kind, "signup");
  assert.equal(payload.membership.identity_recovery, undefined);
  assert.equal(payload.pointsRecoveryPending, true);
});

test("canonical rename can inform display only without inventing a Premium entitlement", async () => {
  const env = await envFor({ canonicalRecords: [{
    id: "recCanonicalStage02",
    fields: {
      "LINE User ID": LINE_ID,
      "Current LINE Rename": "อาร์ต Premium",
    },
  }] });

  const payload = await (await handleMemberAppApi(request(), env, dashboardDelegate)).json();
  assert.equal(payload.lifecycle, "checking");
  assert.equal(payload.membership.level, "premium");
  assert.equal(payload.membership.levelVerified, false);
  assert.equal(payload.membership.displayOnly, true);
  assert.equal(payload.membership.displaySource, "line_ofc_canonical_display_only");
  assert.equal(payload.nextAction.kind, "checking");
  assert.equal(payload.legacyDisplay.grantsEntitlement, false);
});
