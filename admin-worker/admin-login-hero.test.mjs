import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import adminWorker, {
  APPROVED_ADMIN_LOGIN_APPLE_TOUCH_ICON,
  APPROVED_ADMIN_LOGIN_FAVICON,
  ADMIN_LOGIN_SESSION_PATH,
  APPROVED_ADMIN_LOGIN_HERO,
  APPROVED_ADMIN_LOGIN_LOGO,
  SIGIL_ADMIN_LOGIN_PAGE_PATH,
  normalizeNext,
  renderAdminLogin,
} from "./src/admin-login-hero-worker.js";
import { handleKenjiControlRequest } from "./src/kenji-control-endpoints.js";

const request = (method = "GET") => new Request("https://www.mmdbkk.com/internal/admin/login", { method });

test("admin login renders the approved Webflow visual assets and responsive image treatment", async () => {
  const response = renderAdminLogin(request());
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, new RegExp(APPROVED_ADMIN_LOGIN_HERO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const asset of [APPROVED_ADMIN_LOGIN_HERO, APPROVED_ADMIN_LOGIN_LOGO, APPROVED_ADMIN_LOGIN_FAVICON, APPROVED_ADMIN_LOGIN_APPLE_TOUCH_ICON]) {
    assert.match(html, new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(html, /alt="MMD SIGIL Internal Admin"/);
  assert.match(html, /\.visual:before\{[^}]*center\/cover no-repeat;[^}]*\}/);
  assert.match(html, /\.visual-logo\{[^}]*object-fit:contain;[^}]*\}/);
  assert.match(
    html,
    /class="mmd-login" data-mmd-login data-mmd-page="admin-login-approved-hero"/,
  );
  assert.doesNotMatch(html, /placeholder|default[-_ ]hero/i);
});

test("admin login preserves the canonical secure form contract", async () => {
  const response = renderAdminLogin(request(), {
    next: "/internal/admin/control-room?tab=queue",
  });
  const html = await response.text();

  assert.match(html, new RegExp(`form method="post" action="${ADMIN_LOGIN_SESSION_PATH.replaceAll("/", "\\/")}"`));
  assert.match(html, /id="adminCredential" type="text" required readonly/);
  assert.doesNotMatch(html, /id="adminCredential"[^>]*name="credential"/);
  assert.match(html, /name="next" value="\/internal\/admin\/control-room\?tab=queue"/);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  assert.match(response.headers.get("content-security-policy") || "", /img-src https:\/\/cdn\.prod\.website-files\.com/);
  assert.match(response.headers.get("content-security-policy") || "", /connect-src 'self'/);
  assert.match(response.headers.get("content-security-policy") || "", /form-action 'self'/);
  assert.equal(response.headers.get("x-mmd-route-owner"), "admin-worker");
  assert.equal(response.headers.get("x-mmd-page"), "admin-login-approved-hero");
  assert.doesNotMatch(html, /access_code|\/v1\/admin\/auth\/login|\/kenji\/access-code\/validate/);
});

test("admin login next route fails closed", () => {
  assert.equal(normalizeNext("https://evil.example/internal/admin/control-room"), "/internal/admin/control-room");
  assert.equal(normalizeNext("//evil.example/internal/admin/control-room"), "/internal/admin/control-room");
  assert.equal(normalizeNext("/internal/admin/control-room?token=secret"), "/internal/admin/control-room");
  assert.equal(normalizeNext("/internal/admin/../../private"), "/internal/admin/control-room");
  assert.equal(normalizeNext("/internal/admin/control-room?tab=queue"), "/internal/admin/control-room?tab=queue");
});

test("HEAD returns headers without a response body", async () => {
  const response = renderAdminLogin(request("HEAD"));
  assert.equal(await response.text(), "");
  assert.match(response.headers.get("cache-control") || "", /no-store/);
});

test("SIGIL admin login renders the approved Worker page without redirecting", async () => {
  const response = await adminWorker.fetch(
    new Request(`https://www.mmdbkk.com${SIGIL_ADMIN_LOGIN_PAGE_PATH}`),
    {},
    {}
  );
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("location"), null);
  assert.match(html, new RegExp(APPROVED_ADMIN_LOGIN_HERO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("active admin entrypoint forwards Model Console V16 schema-patch routes to core", async () => {
  const flash = await adminWorker.fetch(
    new Request("https://mmdbkk.com/v1/model/private-flash/authorize", { method: "GET" }),
    {},
    {}
  );
  assert.equal(flash.status, 401);
  assert.equal((await flash.json()).error, "unauthorized");

  const rate = await adminWorker.fetch(
    new Request("https://mmdbkk.com/v1/model/rate/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model_id: "recModel", rates: { minimum_rate_thb: 5000 } }),
    }),
    {},
    {}
  );
  assert.equal(rate.status, 401);
  assert.equal((await rate.json()).error, "signed_t_required");
});

test("wrangler claims only the exact Model Console V16 additive routes on apex and www", () => {
  const wrangler = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
  const routes = [
    "/v1/model/visibility/update",
    "/v1/model/rate/request",
    "/v1/model/media/upload-init",
    "/v1/model/media/upload-complete",
    "/v1/model/media/review-request",
    "/v1/model/private-gallery/request",
    "/v1/model/private-flash/request",
    "/v1/model/private-flash/authorize",
  ];

  for (const route of routes) {
    assert.match(wrangler, new RegExp(`pattern = "mmdbkk\\.com${route}"`));
    assert.match(wrangler, new RegExp(`pattern = "www\\.mmdbkk\\.com${route}"`));
  }
  assert.doesNotMatch(wrangler, /pattern = "(?:www\.)?mmdbkk\.com\/v1\/model\/\*"/);
});

test("Kenji CEO control rejects arbitrary service-shaped headers", async () => {
  const response = await adminWorker.fetch(
    new Request("https://mmdbkk.com/v1/admin/kenji/control/memory?client_id=rec12345678901234", {
      headers: { Authorization: "Bearer forged" },
    }),
    { INTERNAL_TOKEN: "internal-real", ADMIN_BEARER: "admin-real", CONFIRM_KEY: "confirm-real" },
    {}
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "unauthorized");
});

test("Kenji CEO control rejects ADMIN_BEARER without a credential-bound admin session", async () => {
  const response = await adminWorker.fetch(
    new Request("https://mmdbkk.com/v1/admin/kenji/control/memory?client_id=rec12345678901234", {
      headers: { Authorization: "Bearer admin-real" },
    }),
    { INTERNAL_TOKEN: "internal-real", ADMIN_BEARER: "admin-real" },
    {}
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "unauthorized");
});

test("wrangler claims only exact Kenji CEO control routes on apex and www", () => {
  const wrangler = readFileSync(new URL("./wrangler.toml", import.meta.url), "utf8");
  const routes = [
    "/v1/admin/kenji/control/memory",
    "/v1/admin/kenji/control/conversations",
    "/v1/admin/kenji/control/approvals",
  ];
  for (const route of routes) {
    assert.match(wrangler, new RegExp(`pattern = "mmdbkk\\.com${route}"`));
    assert.match(wrangler, new RegExp(`pattern = "www\\.mmdbkk\\.com${route}"`));
  }
  assert.doesNotMatch(wrangler, /pattern = "(?:www\.)?mmdbkk\.com\/v1\/admin\/kenji\/control\/\*"/);
});

test("Kenji CEO memory uses canonical client and entitlement fields without returning identity PII", async () => {
  const originalFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    seen.push(url);
    if (url.includes("tblVv58TCbwh5j1fS")) {
      return Response.json({ records: [{
        id: "recClient12345678",
        fields: {
          "Client Name": "Test Client",
          Status: "active",
          "Verification Status": "verified",
          "Privacy Level": "private",
          "Date Added": "2025-01-01",
          "Last Contacted": "2026-09-01",
          primary_channel: "line",
          line_user_id: "U-secret-line",
          email: "secret@example.com",
          memberstack_id: "ms-secret",
        },
      }] });
    }
    if (url.includes("tblNImdF9PKAxhXGi")) {
      return Response.json({ records: [{
        id: "recEntitlement123",
        fields: {
          member_status: "active",
          access_status: "active",
          entitlement_level: "premium",
          package_code: "premium",
          start_at: "2026-01-01T00:00:00.000Z",
          expire_at: "2026-12-31T00:00:00.000Z",
          renewal_status: "current",
          relationship_tier: "premium",
          points_balance_snapshot: 321,
        },
      }] });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  try {
    const response = await handleKenjiControlRequest(
      new Request("https://mmdbkk.com/v1/admin/kenji/control/memory?line_user_id=U-secret-line"),
      { AIRTABLE_API_KEY: "pat-test" }
    );
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.memory.display_name, "Test Client");
    assert.equal(payload.memory.membership_tier, "premium");
    assert.equal(payload.memory.points_confirmed, 321);
    const serialized = JSON.stringify(payload);
    assert.doesNotMatch(serialized, /U-secret-line|secret@example\.com|ms-secret/);
    assert.ok(seen.every((url) => !url.includes("Sensitive+Information") && !url.includes("Internal+Notes")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Kenji CEO conversation projection excludes raw user and generated message bodies", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("tblVv58TCbwh5j1fS")) {
      return Response.json({ records: [{
        id: "recClient12345678",
        fields: { "Client Name": "Test Client", line_user_id: "U123" },
      }] });
    }
    if (url.includes("tbljCYfYqfm8gBTPq")) {
      return Response.json({ records: [{
        id: "recEvent123456789",
        fields: {
          event_id: "evt_1",
          created_at: "2026-09-02T01:00:00.000Z",
          channel: "line",
          source_path: "/member/kenji",
          detected_intent: "membership_status",
          risk_level: "low",
          response_mode: "answer",
          handoff_required: false,
          final_status: "answered",
          linked_session_id: "session-safe-ref",
          user_message: "RAW CUSTOMER BODY MUST NOT LEAK",
          generated_reply: "RAW GENERATED BODY MUST NOT LEAK",
          payload_json: "SECRET RAW PAYLOAD",
          contact_value: "secret@example.com",
          line_user_id: "U123",
        },
      }] });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  try {
    const response = await handleKenjiControlRequest(
      new Request("https://mmdbkk.com/v1/admin/kenji/control/conversations?line_user_id=U123"),
      { AIRTABLE_API_KEY: "pat-test" }
    );
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.count, 1);
    assert.equal(payload.conversations[0].intent, "membership_status");
    const serialized = JSON.stringify(payload);
    assert.doesNotMatch(serialized, /RAW CUSTOMER BODY|RAW GENERATED BODY|SECRET RAW PAYLOAD|secret@example\.com|U123/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Kenji CEO approvals map the real Console Inbox and Model Review Request schemas", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("tblFHmfpB2TTrzO2e")) {
      return Response.json({ records: [{
        id: "recInbox123456789",
        fields: {
          inbox_id: "inbox_1",
          created_at: "2026-09-02T01:00:00.000Z",
          created_by: "worker",
          source: "kenji",
          intent: "review",
          status: "pending",
          admin_note: "MUST NOT LEAK",
        },
      }] });
    }
    if (url.includes("tblJ52hVu0f4uhEmS")) {
      return Response.json({ records: [{
        id: "recReview12345678",
        fields: {
          request_id: "review_1",
          request_type: "kenji_model_keyword_profile",
          request_status: "pending_review",
          requested_by: "boss-per",
          requested_at: "2026-09-02T00:30:00.000Z",
          requested_visibility: "curated",
          payload_json: "MUST NOT LEAK",
        },
      }] });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  try {
    const response = await handleKenjiControlRequest(
      new Request("https://mmdbkk.com/v1/admin/kenji/control/approvals?status=pending"),
      { AIRTABLE_API_KEY: "pat-test" }
    );
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.count, 2);
    assert.equal(payload.approvals[0].source, "MMD — Console Inbox");
    assert.equal(payload.approvals[1].source, "MMD — Model Review Requests");
    assert.doesNotMatch(JSON.stringify(payload), /MUST NOT LEAK/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
