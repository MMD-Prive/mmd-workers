import test from "node:test";
import assert from "node:assert/strict";

import coreWorker from "./src/admin-login-hero-worker-core.js";
import { createCredentialBoundAdminSession } from "./src/credential-bound-admin-session.js";
import {
  OWNER_MY_MMD_RECOVERY_API_PATH,
  OWNER_MY_MMD_RECOVERY_PAGE_PATH,
  handleOwnerMyMmdRecoveryDiagnostic,
  isOwnerActor,
} from "./src/owner-my-mmd-recovery-diagnostic.js";

const CLIENT_ID = "recABCDEF123456";
const LINE_ID = `U${"b".repeat(32)}`;

function env() {
  return {
    AIRTABLE_API_KEY: "test-airtable-key",
    AIRTABLE_BASE_ID: "appTest0000000000",
    MEMBER_PAGES_MEMBER_WALLET: {
      async fetch(request) {
        assert.equal(new URL(request.url).pathname, "/__internal/admin/my-mmd/recovery-diagnostic");
        assert.equal(request.headers.get("x-mmd-service-binding"), "admin-worker");
        const body = await request.json();
        assert.equal(body.line_user_id, LINE_ID);
        return Response.json({
          ok: true,
          membership: {
            level: "svip",
            label: "SVIP",
            lifecycle: "active",
            active_through: "2028-09-19",
            source: "my_mmd_entitlement_resolver_v1",
          },
          recovery: {
            state: "reconciled",
            terminal: true,
            review_required: false,
            reason: "note_first_recovery_complete",
            pending_review_count: 0,
            source_note_count: 12,
            candidate_count: 8,
            materialized_count: 8,
            updated_at: "2026-09-19T12:00:00.000Z",
          },
          points: { status: "verified", value: 1250, source: "history_recovery" },
          acceptance: {
            status: "recorded",
            evidence_id: "mmdacc_1234567890abcdef12345678",
            recorded_at: "2026-09-19T11:30:00.000Z",
          },
          guardrails: {
            read_only: true,
            raw_line_user_id_exposed: false,
            session_token_required: false,
          },
        });
      },
    },
  };
}

function request(path) {
  return new Request("https://mmdbkk.com" + path, { method: "GET" });
}

test("owner diagnostic recognizes owner and Per credential-bound owner session only", () => {
  assert.equal(isOwnerActor({ id: "per", role: "owner", auth_method: "credential" }), true);
  assert.equal(isOwnerActor({ id: "per", role: "admin", auth_method: "credential" }), true);
  assert.equal(isOwnerActor({ id: "staff-1", role: "admin", auth_method: "credential" }), false);
  assert.equal(isOwnerActor({ id: "per", role: "admin", auth_method: "service" }), false);
});

test("generic admin cannot open owner recovery page or API", async () => {
  const actor = { id: "staff-1", role: "admin", auth_method: "credential" };
  const page = await handleOwnerMyMmdRecoveryDiagnostic(request(OWNER_MY_MMD_RECOVERY_PAGE_PATH), env(), actor);
  assert.equal(page.status, 403);
  const api = await handleOwnerMyMmdRecoveryDiagnostic(
    request(OWNER_MY_MMD_RECOVERY_API_PATH + "?client_id=" + CLIENT_ID),
    env(),
    actor,
  );
  assert.equal(api.status, 403);
});

test("owner API resolves canonical client then returns recovery truth without raw LINE identity", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname === "api.airtable.com") {
      return Response.json({
        id: CLIENT_ID,
        fields: {
          "Client Name (Display)": "เชน",
          line_user_id: LINE_ID,
        },
      });
    }
    throw new Error("unexpected_fetch:" + url.toString());
  };

  try {
    const response = await handleOwnerMyMmdRecoveryDiagnostic(
      request(OWNER_MY_MMD_RECOVERY_API_PATH + "?client_id=" + CLIENT_ID),
      env(),
      { id: "per", role: "admin", auth_method: "credential" },
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.customer.display_name, "เชน");
    assert.equal(body.membership.label, "SVIP");
    assert.equal(body.recovery.state, "reconciled");
    assert.equal(body.points.value, 1250);
    assert.equal(body.acceptance.evidence_id, "mmdacc_1234567890abcdef12345678");
    assert.equal(body.guardrails.owner_session_required, true);
    assert.equal(body.guardrails.browser_raw_line_user_id_exposed, false);
    assert.doesNotMatch(JSON.stringify(body), new RegExp(LINE_ID));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("owner page is noindex and does not embed customer identity", async () => {
  const response = await handleOwnerMyMmdRecoveryDiagnostic(
    request(OWNER_MY_MMD_RECOVERY_PAGE_PATH),
    env(),
    { id: "per", role: "admin", auth_method: "credential" },
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("x-robots-tag") || "", /noindex/);
  const html = await response.text();
  assert.match(html, /MY MMD Recovery Diagnostic/);
  assert.doesNotMatch(html, new RegExp(LINE_ID));
});


test("active admin core dispatches owner diagnostic behind credential-bound session", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname === "api.airtable.com") {
      return Response.json({
        id: CLIENT_ID,
        fields: {
          "Client Name (Display)": "เชน",
          line_user_id: LINE_ID,
        },
      });
    }
    throw new Error("unexpected_fetch:" + url.toString());
  };

  const runtimeEnv = {
    ...env(),
    ADMIN_LOGIN_CREDENTIAL: "owner-credential",
    ADMIN_SESSION_SECRET: "owner-session-secret",
  };
  const token = await createCredentialBoundAdminSession(
    new Request("https://mmdbkk.com/internal/admin/login/session"),
    { id: "per", role: "owner", auth_method: "credential" },
    runtimeEnv,
  );

  try {
    const req = new Request(
      "https://mmdbkk.com" + OWNER_MY_MMD_RECOVERY_API_PATH + "?client_id=" + CLIENT_ID,
      {
        method: "GET",
        headers: {
          Cookie: "mmd_admin_gate_v1=" + token,
          Origin: "https://mmdbkk.com",
          Accept: "application/json",
        },
      },
    );
    const response = await coreWorker.fetch(req, runtimeEnv, {});
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.customer.display_name, "เชน");
    assert.equal(body.recovery.state, "reconciled");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
