import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import coreWorker from "./src/admin-login-hero-worker-core.js";
import { createCredentialBoundAdminSession } from "./src/credential-bound-admin-session.js";
import {
  RECOVERY_CONTROL_API_PATH,
  RECOVERY_CONTROL_PAGE_PATH,
  buildRecoveryControlTransition,
  handleRecoveryControl,
  isRecoveryOperatorActor,
  projectRecoveryRecord,
} from "./src/recovery-control.js";

const CASE_REF = "HYPE-PER-20260919150000-acde1234";
const CLIENT_ID = "recClientA1";

function actor(role = "admin", auth = "credential") {
  return { id: role === "owner" ? "per" : "ops-1", role, auth_method: auth };
}

function env() {
  return {
    AIRTABLE_API_KEY: "test-airtable-key",
    AIRTABLE_BASE_ID: "appTest0000000000",
    AIRTABLE_TABLE_KENJI_CONVERSATION_MATRIX_ID: "tblMatrix",
    ADMIN_LOGIN_CREDENTIAL: "owner-credential",
    ADMIN_SESSION_SECRET: "owner-session-secret",
  };
}

function matrixRecord(state = "reviewing", outcome = "awaiting_operations") {
  return {
    id: "recMatrixA1",
    fields: {
      Client: [CLIENT_ID],
      pending_reference: CASE_REF,
      state_updated_at: "2026-09-19T15:00:00.000Z",
      payload_json: JSON.stringify({
        display_name: "คุณเชน",
        private_note: "must-not-leak",
        handoff_target: "per",
        handoff_tracking: {
          id: CASE_REF,
          target: "per",
          state,
          actor_role: "operator",
          updated_at: "2026-09-19T15:00:00.000Z",
        },
        recovery_case: {
          case_ref: CASE_REF,
          domain: "booking",
          state,
          outcome_code: outcome,
          actor_role: "operator",
          updated_at: "2026-09-19T15:00:00.000Z",
        },
        recovery_correlation: {
          domain: "booking",
          state: "confirmed",
          correlated: true,
          case_ref: CASE_REF,
          booking_ref: "kenji_0123456789abcdef01234567",
          session_id: "sess_exact_001",
          job_id: "JOB-EXACT-001",
          session_state: "confirmed",
          job_state: "confirmed",
          exact_correlation: true,
          payment_ref: "must-not-leak",
        },
        business_truth_mutated: false,
      }),
      version: 4,
    },
  };
}

function request(path, options = {}) {
  return new Request("https://mmdbkk.com" + path, options);
}

test("Recovery Control recognizes credential-bound owner/admin only", () => {
  assert.equal(isRecoveryOperatorActor(actor("owner")), true);
  assert.equal(isRecoveryOperatorActor(actor("admin")), true);
  assert.equal(isRecoveryOperatorActor(actor("admin", "service")), false);
  assert.equal(isRecoveryOperatorActor({ role: "mms_partner", auth_method: "credential" }), false);
});

test("Recovery Control transition policy is monotonic and domain-safe", () => {
  assert.deepEqual(
    buildRecoveryControlTransition({ state: "prepared", domain: "booking" }, "acknowledge", ""),
    { ok: true, next_state: "acknowledged" },
  );
  assert.equal(
    buildRecoveryControlTransition({ state: "prepared", domain: "booking" }, "review", "").error,
    "review_not_allowed_from_current_state",
  );
  assert.deepEqual(
    buildRecoveryControlTransition({ state: "prepared", domain: "booking" }, "set_outcome", "awaiting_customer"),
    { ok: true, next_state: "prepared", outcome_code: "awaiting_customer" },
  );
  assert.equal(
    buildRecoveryControlTransition({ state: "reviewing", domain: "booking" }, "resolve", "").error,
    "terminal_outcome_required",
  );
  assert.equal(
    buildRecoveryControlTransition({ state: "reviewing", domain: "booking" }, "resolve", "reshipment_arranged").error,
    "terminal_outcome_required",
  );
  assert.deepEqual(
    buildRecoveryControlTransition({ state: "reviewing", domain: "booking" }, "resolve", "rebooking_arranged"),
    { ok: true, next_state: "resolved", outcome_code: "rebooking_arranged" },
  );
  assert.deepEqual(
    buildRecoveryControlTransition({ state: "resolved", domain: "booking" }, "customer_notified", ""),
    { ok: true, next_state: "customer_notified" },
  );
});

test("Recovery Control projection excludes private payload fields and exposes bounded Booking correlation", () => {
  const projected = projectRecoveryRecord(matrixRecord());
  assert.equal(projected.case_ref, CASE_REF);
  assert.equal(projected.customer.display_name, "คุณเชน");
  assert.equal(projected.domain, "booking");
  assert.equal(projected.state, "reviewing");
  assert.equal(projected.correlation.booking_ref, "kenji_0123456789abcdef01234567");
  assert.equal(projected.correlation.session_id, "sess_exact_001");
  assert.equal(projected.correlation.job_id, "JOB-EXACT-001");
  assert.doesNotMatch(JSON.stringify(projected), /private_note|payment_ref|must-not-leak/);
});

test("Recovery Control ignores generic handoffs that are not Recovery Cases", () => {
  const row = matrixRecord();
  const payload = JSON.parse(row.fields.payload_json);
  delete payload.recovery_case;
  row.fields.payload_json = JSON.stringify(payload);
  assert.equal(projectRecoveryRecord(row), null);
});

test("Recovery Control page is noindex and rejects non-credential actors", async () => {
  const forbidden = await handleRecoveryControl(
    request(RECOVERY_CONTROL_PAGE_PATH),
    env(),
    actor("admin", "service"),
  );
  assert.equal(forbidden.status, 403);

  const page = await handleRecoveryControl(
    request(RECOVERY_CONTROL_PAGE_PATH),
    env(),
    actor("admin"),
  );
  assert.equal(page.status, 200);
  assert.match(page.headers.get("x-robots-tag") || "", /noindex/);
  const html = await page.text();
  assert.match(html, /Recovery Control/);
  assert.match(html, /MMD Shop, Booking และ MMS/);
});

test("Recovery Control API list and exact read are bounded", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname === "api.airtable.com") return Response.json({ records: [matrixRecord()] });
    throw new Error("unexpected_fetch:" + url.toString());
  };
  try {
    const list = await handleRecoveryControl(
      request(RECOVERY_CONTROL_API_PATH + "?limit=12"),
      env(),
      actor("admin"),
    );
    assert.equal(list.status, 200);
    const listBody = await list.json();
    assert.equal(listBody.cases.length, 1);
    assert.equal(listBody.cases[0].case_ref, CASE_REF);
    assert.doesNotMatch(JSON.stringify(listBody), /private_note|payment_ref|must-not-leak/);

    const exact = await handleRecoveryControl(
      request(RECOVERY_CONTROL_API_PATH + "?case_ref=" + encodeURIComponent(CASE_REF)),
      env(),
      actor("owner"),
    );
    assert.equal(exact.status, 200);
    const exactBody = await exact.json();
    assert.equal(exactBody.case.domain, "booking");
    assert.equal(exactBody.case.controls.can_resolve, true);
    assert.equal(exactBody.guardrails.payment_mutated, false);
    assert.equal(exactBody.guardrails.browser_service_binding_exposed, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Recovery Control writes require same-origin browser request before Airtable mutation", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("must_not_fetch");
  };
  try {
    const response = await handleRecoveryControl(
      request(RECOVERY_CONTROL_API_PATH, {
        method: "POST",
        headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
        body: JSON.stringify({ case_ref: CASE_REF, action: "review" }),
      }),
      env(),
      actor("admin"),
    );
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, "forbidden_origin");
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Recovery Control resolves through shared transition engine without mutating business truth", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let stored = matrixRecord();
  let patchCount = 0;

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = String(init.method || "GET").toUpperCase();
    if (url.hostname !== "api.airtable.com") throw new Error("unexpected_fetch:" + url.toString());

    if (method === "GET") return Response.json({ records: [stored] });
    if (method === "PATCH") {
      patchCount += 1;
      const body = JSON.parse(String(init.body || "{}"));
      const row = body.records[0];
      stored = {
        id: stored.id,
        fields: { ...stored.fields, ...row.fields },
      };
      return Response.json({ records: [stored] });
    }
    throw new Error("unexpected_method:" + method);
  };

  try {
    const response = await handleRecoveryControl(
      request(RECOVERY_CONTROL_API_PATH, {
        method: "POST",
        headers: { Origin: "https://mmdbkk.com", "Content-Type": "application/json" },
        body: JSON.stringify({
          case_ref: CASE_REF,
          action: "resolve",
          outcome_code: "rebooking_arranged",
        }),
      }),
      env(),
      actor("owner"),
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.case.state, "resolved");
    assert.equal(body.case.outcome_code, "rebooking_arranged");
    assert.equal(body.guardrails.job_mutated, false);
    assert.equal(body.guardrails.payment_mutated, false);
    assert.equal(patchCount, 1);

    const persisted = JSON.parse(stored.fields.payload_json);
    assert.equal(persisted.recovery_case.state, "resolved");
    assert.equal(persisted.recovery_case.outcome_code, "rebooking_arranged");
    assert.equal(persisted.business_truth_mutated, false);
    assert.equal(persisted.recovery_correlation.job_id, "JOB-EXACT-001");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("active admin core gates Recovery Control and dispatches authenticated page", { concurrency: false }, async () => {
  const runtimeEnv = env();

  const unauth = await coreWorker.fetch(
    request(RECOVERY_CONTROL_API_PATH + "?limit=1", { headers: { Accept: "application/json" } }),
    runtimeEnv,
    {},
  );
  assert.equal(unauth.status, 401);

  const token = await createCredentialBoundAdminSession(
    request("/internal/admin/login/session"),
    actor("owner"),
    runtimeEnv,
  );
  const authed = await coreWorker.fetch(
    request(RECOVERY_CONTROL_PAGE_PATH, {
      headers: { Cookie: "mmd_admin_gate_v1=" + token, Accept: "text/html" },
    }),
    runtimeEnv,
    {},
  );
  assert.equal(authed.status, 200);
  assert.match(await authed.text(), /Recovery Control/);
});

test("wrangler owns exact and query-safe Recovery Control routes only", async () => {
  const wrangler = await readFile(new URL("./wrangler.toml", import.meta.url), "utf8");
  const routes = [
    "mmdbkk.com/internal/admin/recovery",
    "www.mmdbkk.com/internal/admin/recovery",
    "mmdbkk.com/internal/admin/recovery*",
    "www.mmdbkk.com/internal/admin/recovery*",
    "mmdbkk.com/v1/admin/recovery/cases",
    "www.mmdbkk.com/v1/admin/recovery/cases",
    "mmdbkk.com/v1/admin/recovery/cases*",
    "www.mmdbkk.com/v1/admin/recovery/cases*",
  ];
  for (const route of routes) assert.ok(wrangler.includes('pattern = "' + route + '"'), "missing route " + route);
  assert.equal(wrangler.includes('pattern = "mmdbkk.com/internal/admin/*"'), false);
});
