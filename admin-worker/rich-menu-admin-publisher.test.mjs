#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";

import worker from "./src/index.js";

const ADMIN_BEARER = "test_admin_bearer_rich_menu";
const CONFIRM_KEY = "test_confirm_key_rich_menu";

function canonicalPublicRichMenu() {
  return {
    areas: [
      { action: { type: "message", text: "Hi Per" } },
      { action: { type: "uri", uri: "https://mmdbkk.com/sigil/member/membership?source=line&entry_route=public_membership" } },
      { action: { type: "uri", uri: "https://mmdbkk.com/sigil/member/membership?source=line&entry_route=member_status" } },
      { action: { type: "uri", uri: "https://mmdbkk.com/sigil/member/membership?source=line&entry_route=booking_request&service=dinner_travel" } },
      { action: { type: "uri", uri: "https://mmdbkk.com/pay/membership?source=line&entry_route=payment_proof" } },
      { action: { type: "message", text: "Hi MMD" } },
    ],
  };
}

function canonicalPrivateRichMenu() {
  return {
    areas: [
      { action: { type: "uri", uri: "https://mmdbkk.com/sigil/member/membership?source=line&entry_route=member_status" } },
      { action: { type: "uri", uri: "https://mmdbkk.com/sigil/member/membership?source=line&entry_route=points" } },
      { action: { type: "uri", uri: "https://mmdbkk.com/sigil/member/membership?source=line&entry_route=renewal" } },
      { action: { type: "postback", data: "mmd_action=private_support&source=private_rich_menu", displayText: "Private Support" } },
      { action: { type: "uri", uri: "https://mmdbkk.com/pay/membership?source=line&entry_route=payment_proof" } },
      { action: { type: "message", text: "Hi MMD" } },
    ],
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeEnv({ binding = true, upstreamBody = { ok: true, rich_menu_type: "public_world" }, upstreamStatus = 200 } = {}) {
  const calls = [];
  const env = {
    ADMIN_BEARER,
    CONFIRM_KEY,
  };

  if (binding) {
    env.MEMBER_DASHBOARD_CHAT_WORKER = {
      async fetch(request) {
        calls.push({
          url: request.url,
          method: request.method,
          headers: Object.fromEntries(request.headers.entries()),
          body: request.method === "GET" ? "" : await request.text(),
        });
        return jsonResponse(upstreamBody, upstreamStatus);
      },
    };
  }

  return { env, calls };
}

async function adminFetch(path, { method = "POST", body = {}, headers = {} } = {}, env) {
  const init = {
    method,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  };
  if (method !== "GET") init.body = JSON.stringify(body);
  const response = await worker.fetch(new Request(`https://admin-worker.test${path}`, init), env);
  return { response, body: await response.json() };
}

test("admin rich menu endpoints require existing admin auth", async () => {
  const { env, calls } = makeEnv();
  const { response, body } = await adminFetch("/v1/admin/line/rich-menu/public-world/draft", {}, env);

  assert.equal(response.status, 401);
  assert.equal(body.error, "unauthorized");
  assert.equal(calls.length, 0);
});

test("admin draft calls member-dashboard service binding without forwarding operator auth", async () => {
  const { env, calls } = makeEnv({ upstreamBody: { ok: true, rich_menu_type: "public_world", rich_menu: canonicalPublicRichMenu() } });
  const { response, body } = await adminFetch("/v1/admin/line/rich-menu/public-world/draft", {
    headers: { authorization: `Bearer ${ADMIN_BEARER}` },
  }, env);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.rich_menu.areas.length, 6);
  assert.deepEqual(body.rich_menu.areas[0].action, { type: "message", text: "Hi Per" });
  assert.equal(body.rich_menu.areas[1].action.uri, "https://mmdbkk.com/sigil/member/membership?source=line&entry_route=public_membership");
  assert.equal(body.rich_menu.areas[2].action.uri, "https://mmdbkk.com/sigil/member/membership?source=line&entry_route=member_status");
  assert.equal(body.rich_menu.areas[3].action.uri, "https://mmdbkk.com/sigil/member/membership?source=line&entry_route=booking_request&service=dinner_travel");
  assert.equal(body.rich_menu.areas[4].action.uri, "https://mmdbkk.com/pay/membership?source=line&entry_route=payment_proof");
  assert.deepEqual(body.rich_menu.areas[5].action, { type: "message", text: "Hi MMD" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://member-dashboard-chat-worker.local/__internal/line/rich-menu/public-world/draft");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers["x-mmd-service-binding"], "admin-worker");
  assert.equal(calls[0].headers["x-mmd-internal-call"], "true");
  assert.equal(calls[0].headers.authorization, undefined);
});

test("admin draft route works with duplicate and trailing slashes", async () => {
  const { env, calls } = makeEnv({ upstreamBody: { ok: true, rich_menu_type: "public_world", rich_menu: canonicalPublicRichMenu() } });

  const duplicate = await adminFetch("/v1/admin//line/rich-menu/public-world/draft", {
    headers: { authorization: `Bearer ${ADMIN_BEARER}` },
  }, env);
  const trailing = await adminFetch("/v1/admin/line/rich-menu/public-world/draft/", {
    headers: { authorization: `Bearer ${ADMIN_BEARER}` },
  }, env);

  assert.equal(duplicate.response.status, 200);
  assert.equal(trailing.response.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://member-dashboard-chat-worker.local/__internal/line/rich-menu/public-world/draft");
  assert.equal(calls[1].url, "https://member-dashboard-chat-worker.local/__internal/line/rich-menu/public-world/draft");
});

test("admin publish uses service binding with ADMIN_BEARER only and passes image_url", async () => {
  const { env, calls } = makeEnv({ upstreamBody: { ok: true, default_set: true } });
  const { response, body } = await adminFetch("/v1/admin/line/rich-menu/public-world/publish", {
    headers: { authorization: `Bearer ${ADMIN_BEARER}` },
    body: { image_url: "https://cdn.example/rich-menu.png" },
  }, env);

  assert.equal(response.status, 200);
  assert.equal(body.default_set, true);
  assert.equal(calls[0].url, "https://member-dashboard-chat-worker.local/__internal/line/rich-menu/public-world/publish");
  assert.deepEqual(JSON.parse(calls[0].body), { image_url: "https://cdn.example/rich-menu.png" });
  assert.equal("INTERNAL_TOKEN" in env, false);
});

test("admin validate-minimal calls service binding with debug query, not public URL", async () => {
  const { env, calls } = makeEnv({ upstreamBody: { ok: true, validated: true, variant: "minimal" } });
  const { response, body } = await adminFetch("/v1/admin/line/rich-menu/public-world/validate-minimal?debug=1", {
    headers: { authorization: `Bearer ${ADMIN_BEARER}` },
  }, env);

  assert.equal(response.status, 200);
  assert.equal(body.variant, "minimal");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://member-dashboard-chat-worker.local/__internal/line/rich-menu/public-world/validate-minimal?debug=1");
  assert.equal(calls[0].headers["x-mmd-service-binding"], "admin-worker");
  assert.equal(calls[0].headers["x-mmd-internal-call"], "true");
  assert.equal(calls[0].headers.authorization, undefined);
});

test("admin validate variants use service binding aliases", async () => {
  const { env, calls } = makeEnv({ upstreamBody: { ok: true, validated: true } });
  const endpoints = [
    "validate-no-postback",
    "validate-message-only",
    "validate-uri-only",
  ];

  for (const endpoint of endpoints) {
    const { response } = await adminFetch(`/v1/admin/line/rich-menu/public-world/${endpoint}`, {
      headers: { authorization: `Bearer ${ADMIN_BEARER}` },
    }, env);
    assert.equal(response.status, 200);
  }

  assert.deepEqual(calls.map((call) => call.url), [
    "https://member-dashboard-chat-worker.local/__internal/line/rich-menu/public-world/validate-no-postback",
    "https://member-dashboard-chat-worker.local/__internal/line/rich-menu/public-world/validate-message-only",
    "https://member-dashboard-chat-worker.local/__internal/line/rich-menu/public-world/validate-uri-only",
  ]);
});

test("admin default and list use GET service aliases", async () => {
  const { env, calls } = makeEnv({ upstreamBody: { ok: true, richmenus: [] } });

  await adminFetch("/v1/admin/line/rich-menu/default", {
    method: "GET",
    headers: { "x-confirm-key": CONFIRM_KEY },
  }, env);
  await adminFetch("/v1/admin/line/rich-menu/list", {
    method: "GET",
    headers: { "x-confirm-key": CONFIRM_KEY },
  }, env);

  assert.equal(calls[0].url, "https://member-dashboard-chat-worker.local/__internal/line/rich-menu/default");
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[1].url, "https://member-dashboard-chat-worker.local/__internal/line/rich-menu/list");
  assert.equal(calls[1].method, "GET");
});

test("missing member-dashboard binding returns safe error", async () => {
  const { env } = makeEnv({ binding: false });
  const { response, body } = await adminFetch("/v1/admin/line/rich-menu/public-world/draft", {
    headers: { authorization: `Bearer ${ADMIN_BEARER}` },
  }, env);

  assert.equal(response.status, 502);
  assert.deepEqual(body, { ok: false, error: "service_binding_unavailable" });
});

test("admin private-member draft and validate use service binding", async () => {
  const { env, calls } = makeEnv({ upstreamBody: { ok: true, rich_menu_type: "private_member", rich_menu: canonicalPrivateRichMenu() } });

  const draft = await adminFetch("/v1/admin/line/rich-menu/private-member/draft", {
    headers: { authorization: `Bearer ${ADMIN_BEARER}` },
  }, env);
  const validate = await adminFetch("/v1/admin/line/rich-menu/private-member/validate", {
    headers: { authorization: `Bearer ${ADMIN_BEARER}` },
  }, env);

  assert.equal(draft.response.status, 200);
  assert.equal(draft.body.rich_menu.areas.length, 6);
  assert.equal(draft.body.rich_menu.areas[3].action.data, "mmd_action=private_support&source=private_rich_menu");
  assert.equal(validate.response.status, 200);
  assert.deepEqual(calls.map((call) => call.url), [
    "https://member-dashboard-chat-worker.local/__internal/line/rich-menu/private-member/draft",
    "https://member-dashboard-chat-worker.local/__internal/line/rich-menu/private-member/validate",
  ]);
});

test("admin rich menu response is sanitized", async () => {
  const { env } = makeEnv({
    upstreamBody: {
      ok: false,
      error: "line_failed",
      authorization: "Bearer should-not-leak",
      secret: "hidden",
      nested: { token: "hidden", rich_menu_id: "richmenu-public" },
    },
    upstreamStatus: 502,
  });
  const { response, body } = await adminFetch("/v1/admin/line/rich-menu/public-world/validate", {
    headers: { authorization: `Bearer ${ADMIN_BEARER}` },
  }, env);
  const rendered = JSON.stringify(body);

  assert.equal(response.status, 502);
  assert.equal(body.nested.rich_menu_id, "richmenu-public");
  assert.doesNotMatch(rendered, /should-not-leak|hidden|authorization|secret|token/i);
});
