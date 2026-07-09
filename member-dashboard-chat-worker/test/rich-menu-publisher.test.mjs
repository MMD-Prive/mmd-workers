import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.js";

const AUTH_ENV = {
  INTERNAL_TOKEN: "internal-token",
  LINE_CHANNEL_ACCESS_TOKEN: "line-token",
};

function request(path, { method = "POST", body = {}, headers = {}, host = "worker" } = {}) {
  const init = { method, headers: { ...headers } };
  if (method !== "GET") {
    init.headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  return new Request(`https://${host}${path}`, init);
}

function authHeaders() {
  return { authorization: "Bearer internal-token" };
}

function serviceHeaders(service = "admin-worker") {
  return {
    "x-mmd-service-binding": service,
    "x-mmd-internal-call": "true",
  };
}

async function call(path, options = {}, env = AUTH_ENV) {
  return worker.fetch(request(path, { headers: authHeaders(), ...options }), env);
}

test("draft endpoint rejects without auth", async () => {
  const response = await worker.fetch(request("/v1/internal/line/rich-menu/public-world/draft"), AUTH_ENV);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { ok: false, error: "internal_auth_required" });
});

test("public internal endpoint rejects spoofed service headers without bearer", async () => {
  const response = await worker.fetch(request("/v1/internal/line/rich-menu/public-world/draft", {
    headers: serviceHeaders(),
  }), AUTH_ENV);

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { ok: false, error: "internal_auth_required" });
});

test("service-bound draft alias accepts admin-worker headers without bearer", async () => {
  const response = await worker.fetch(request("/__internal/line/rich-menu/public-world/draft", {
    headers: serviceHeaders(),
    host: "member-dashboard-chat-worker.local",
  }), AUTH_ENV);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.rich_menu_type, "public_world");
  assert.equal(payload.rich_menu.areas[0].action.text, "Hi Per");
});

test("public external service-bound spoof is rejected", async () => {
  const response = await worker.fetch(request("/__internal/line/rich-menu/public-world/draft", {
    headers: serviceHeaders(),
    host: "mmdbkk.com",
  }), AUTH_ENV);

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { ok: false, error: "internal_auth_required" });
});

test("service-bound private-member draft returns canonical mapping", async () => {
  const response = await worker.fetch(request("/__internal/line/rich-menu/private-member/draft", {
    headers: serviceHeaders(),
    host: "member-dashboard-chat-worker.local",
  }), AUTH_ENV);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.rich_menu_type, "private_member");
  assert.equal(payload.rich_menu.name, "MMD Private Member");
  assert.equal(payload.rich_menu.areas.length, 6);
  assert.equal(payload.rich_menu.areas[0].action.uri, "https://mmdbkk.com/member/membership?source=line&entry_route=member_status");
  assert.equal(payload.rich_menu.areas[1].action.uri, "https://mmdbkk.com/member/membership?source=line&entry_route=points");
  assert.equal(payload.rich_menu.areas[2].action.uri, "https://mmdbkk.com/member/membership?source=line&entry_route=renewal");
  assert.deepEqual(payload.rich_menu.areas[3].action, {
    type: "postback",
    data: "mmd_action=private_support&source=private_rich_menu",
    displayText: "Private Support",
  });
  assert.equal(payload.rich_menu.areas[4].action.uri, "https://mmdbkk.com/pay/membership?source=line&entry_route=payment_proof");
  assert.deepEqual(payload.rich_menu.areas[5].action, { type: "message", text: "Hi MMD" });
});

test("service-bound private-member validate sends raw rich menu and does not set default", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const response = await worker.fetch(request("/__internal/line/rich-menu/private-member/validate", {
      headers: serviceHeaders(),
      host: "member-dashboard-chat-worker.local",
    }), AUTH_ENV);
    const payload = await response.json();
    const sent = JSON.parse(calls[0].init.body);

    assert.equal(response.status, 200);
    assert.equal(payload.rich_menu_type, "private_member");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.line.me/v2/bot/richmenu/validate");
    assert.equal(sent.name, "MMD Private Member");
    assert.equal(sent.rich_menu, undefined);
    assert.equal(calls.some((call) => call.url.includes("/user/all/richmenu")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("service-bound publish alias rejects non-admin callers", async () => {
  const response = await worker.fetch(request("/__internal/line/rich-menu/public-world/publish", {
    headers: serviceHeaders("member-pages-worker"),
    body: { image_url: "https://cdn.example/rich-menu.png" },
    host: "member-dashboard-chat-worker.local",
  }), AUTH_ENV);

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { ok: false, error: "internal_auth_required" });
});

test("service-bound publish alias returns safe missing-image error", async () => {
  const response = await worker.fetch(request("/__internal/line/rich-menu/public-world/publish", {
    headers: serviceHeaders(),
    body: {},
    host: "member-dashboard-chat-worker.local",
  }), AUTH_ENV);

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { ok: false, error: "rich_menu_image_required" });
});

test("draft endpoint returns Public World with Message action Hi Per and safe routes", async () => {
  const response = await call("/v1/internal/line/rich-menu/public-world/draft");
  const payload = await response.json();
  const rendered = JSON.stringify(payload);

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.rich_menu_type, "public_world");
  assert.equal(payload.draft.name, "MMD Public World");
  assert.equal(payload.draft.chatBarText, "MMD");
  assert.equal(payload.draft.areas[0].action.type, "message");
  assert.equal(payload.draft.areas[0].action.text, "Hi Per");
  assert.equal(payload.rich_menu.areas.length, 6);
  assert.equal(payload.draft.areas[3].action.uri, "https://mmdbkk.com/member/membership?source=line&entry_route=booking_request&service=dinner_travel");
  assert.equal(payload.draft.areas[4].action.uri, "https://mmdbkk.com/pay/membership?source=line&entry_route=payment_proof");
  assert.deepEqual(payload.draft.areas[5].action, { type: "message", text: "Hi MMD" });
  assert.doesNotMatch(rendered, /\/member\/dashboard/);
  assert.doesNotMatch(rendered, /\/internal|\/admin/);
  assert.match(rendered, /https:\/\/mmdbkk\.com\/member\/membership/);
});

test("validate endpoint calls LINE rich menu validate", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const response = await call("/v1/internal/line/rich-menu/public-world/validate");
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload, { ok: true, validated: true, variant: "full" });
    assert.equal(calls[0].url, "https://api.line.me/v2/bot/richmenu/validate");
    assert.equal(calls[0].init.method, "POST");
    const sent = JSON.parse(calls[0].init.body);
    assert.equal(sent.areas[0].action.text, "Hi Per");
    assert.equal(sent.richMenu, undefined);
    assert.equal(sent.draft, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("validate failure returns safe LINE diagnostics without debug excerpt by default", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    message: "invalid richmenu richmenu-secret Authorization: Bearer should-not-leak",
  }), { status: 400, headers: { "content-type": "application/json" } });

  try {
    const response = await call("/v1/internal/line/rich-menu/public-world/validate");
    const payload = await response.json();
    const rendered = JSON.stringify(payload);

    assert.equal(response.status, 502);
    assert.equal(payload.error, "line_api_failed");
    assert.equal(payload.operation, "rich_menu_validate");
    assert.equal(payload.line_status, 400);
    assert.equal(payload.safe_reason, "payload_invalid");
    assert.equal(payload.line_error_excerpt, undefined);
    assert.doesNotMatch(rendered, /should-not-leak|authorization|secret|line-token|internal-token/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("validate debug with authenticated internal caller includes sanitized LINE excerpt", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    message: "invalid richmenu richmenu-abc123 Authorization: Bearer should-not-leak",
  }), { status: 400, headers: { "content-type": "application/json" } });

  try {
    const response = await call("/v1/internal/line/rich-menu/public-world/validate?debug=1");
    const payload = await response.json();
    const rendered = JSON.stringify(payload);

    assert.equal(response.status, 502);
    assert.equal(payload.error, "line_api_failed");
    assert.equal(payload.safe_reason, "payload_invalid");
    assert.match(payload.line_error_excerpt, /invalid richmenu/);
    assert.doesNotMatch(rendered, /should-not-leak|richmenu-abc123|authorization|secret|line-token|internal-token/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("debug without auth does not include LINE excerpt", async () => {
  const response = await worker.fetch(request("/v1/internal/line/rich-menu/public-world/validate?debug=1"), AUTH_ENV);
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.line_error_excerpt, undefined);
});

test("validate-minimal exists, requires auth, and sends one Hi Per message action", async () => {
  const unauthenticated = await worker.fetch(request("/v1/internal/line/rich-menu/public-world/validate-minimal"), AUTH_ENV);
  assert.equal(unauthenticated.status, 401);

  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const response = await call("/v1/internal/line/rich-menu/public-world/validate-minimal");
    const payload = await response.json();
    const sent = JSON.parse(calls[0].init.body);

    assert.equal(response.status, 200);
    assert.equal(payload.variant, "minimal");
    assert.equal(sent.areas.length, 1);
    assert.deepEqual(sent.areas[0].action, { type: "message", text: "Hi Per" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("service-bound validate-minimal accepts admin-worker auth", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } });

  try {
    const response = await worker.fetch(request("/__internal/line/rich-menu/public-world/validate-minimal", {
      headers: serviceHeaders(),
      host: "member-dashboard-chat-worker.local",
    }), AUTH_ENV);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.variant, "minimal");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("validate variants isolate postback message and URI actions", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const variants = [
      ["validate-no-postback", "no-postback"],
      ["validate-message-only", "message-only"],
      ["validate-uri-only", "uri-only"],
    ];
    for (const [pathSuffix, variant] of variants) {
      const response = await call(`/v1/internal/line/rich-menu/public-world/${pathSuffix}`);
      const payload = await response.json();
      assert.equal(response.status, 200);
      assert.equal(payload.variant, variant);
    }

    const noPostback = JSON.parse(calls[0].init.body);
    const messageOnly = JSON.parse(calls[1].init.body);
    const uriOnly = JSON.parse(calls[2].init.body);

    assert.equal(noPostback.areas[5].action.type, "message");
    assert.equal(noPostback.areas[5].action.text, "Hi Per");
    assert.equal(messageOnly.areas.every((area) => area.action.type === "message"), true);
    assert.equal(uriOnly.areas.every((area) => area.action.type === "uri" && area.action.uri.startsWith("https://mmdbkk.com/member/membership")), true);
    assert.equal(JSON.stringify({ noPostback, messageOnly, uriOnly }).includes("/member/dashboard"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("create endpoint calls LINE rich menu create", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ richMenuId: "richmenu-created" }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const response = await call("/v1/internal/line/rich-menu/public-world/create");
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.created, true);
    assert.equal(payload.rich_menu_type, "public_world");
    assert.equal(payload.rich_menu_id, "richmenu-created");
    assert.equal(calls[0].url, "https://api.line.me/v2/bot/richmenu");
    assert.equal(calls[0].init.method, "POST");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("upload endpoint rejects missing rich_menu_id", async () => {
  const response = await call("/v1/internal/line/rich-menu/public-world/upload-image", {
    body: { image_url: "https://cdn.example/rich-menu.png" },
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "rich_menu_id_missing");
});

test("upload endpoint rejects invalid image content type", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("<svg></svg>", {
    status: 200,
    headers: { "content-type": "image/svg+xml" },
  });

  try {
    const response = await call("/v1/internal/line/rich-menu/public-world/upload-image", {
      body: { rich_menu_id: "richmenu-created", image_url: "https://cdn.example/rich-menu.svg" },
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.equal(payload.error, "rich_menu_image_type_invalid");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("upload endpoint calls api-data rich menu content", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).startsWith("https://cdn.example/")) {
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }
    return new Response("{}", { status: 200 });
  };

  try {
    const response = await call("/v1/internal/line/rich-menu/public-world/upload-image", {
      body: { rich_menu_id: "richmenu-created", image_url: "https://cdn.example/rich-menu.png" },
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.image_uploaded, true);
    assert.equal(calls[1].url, "https://api-data.line.me/v2/bot/richmenu/richmenu-created/content");
    assert.equal(calls[1].init.method, "POST");
    assert.equal(calls[1].init.headers["content-type"], "image/png");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("set-default calls LINE all-user default endpoint", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return new Response("{}", { status: 200 });
  };

  try {
    const response = await call("/v1/internal/line/rich-menu/public-world/set-default", {
      body: { rich_menu_id: "richmenu-created" },
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.default_set, true);
    assert.equal(calls[0].url, "https://api.line.me/v2/bot/user/all/richmenu/richmenu-created");
    assert.equal(calls[0].init.method, "POST");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("publish does not set default if image upload fails", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/validate")) return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    if (String(url) === "https://api.line.me/v2/bot/richmenu") return new Response(JSON.stringify({ richMenuId: "richmenu-created" }), { status: 200, headers: { "content-type": "application/json" } });
    if (String(url).startsWith("https://cdn.example/")) return new Response("jpg-bytes", { status: 200, headers: { "content-type": "image/jpeg" } });
    if (String(url).startsWith("https://api-data.line.me/v2/bot/richmenu/")) return new Response("upload failed", { status: 400 });
    throw new Error("set default should not be called");
  };

  try {
    const response = await call("/v1/internal/line/rich-menu/public-world/publish", {
      body: { image_url: "https://cdn.example/rich-menu.jpg" },
    });
    const payload = await response.json();

    assert.equal(response.status, 502);
    assert.equal(payload.ok, false);
    assert.equal(payload.created, true);
    assert.equal(payload.image_uploaded, false);
    assert.equal(payload.default_set, false);
    assert.equal(payload.error, "rich_menu_image_upload_failed");
    assert.equal(calls.some((callItem) => callItem.url.includes("/user/all/richmenu/")), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("publish returns sanitized success result", async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/validate")) return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    if (String(url) === "https://api.line.me/v2/bot/richmenu") return new Response(JSON.stringify({ richMenuId: "richmenu-created" }), { status: 200, headers: { "content-type": "application/json" } });
    if (String(url).startsWith("https://cdn.example/")) return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg" } });
    return new Response("{}", { status: 200 });
  };

  try {
    const response = await call("/v1/internal/line/rich-menu/public-world/publish", {
      body: { image_url: "https://cdn.example/rich-menu.jpg" },
    });
    const payload = await response.json();
    const rendered = JSON.stringify(payload);

    assert.equal(response.status, 200);
    assert.equal(payload.validated, true);
    assert.equal(payload.created, true);
    assert.equal(payload.image_uploaded, true);
    assert.equal(payload.default_set, true);
    assert.equal(payload.rich_menu_type, "public_world");
    assert.doesNotMatch(rendered, /line-token|internal-token|authorization|secret/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("list/default endpoints require auth", async () => {
  for (const [method, path] of [
    ["GET", "/v1/internal/line/rich-menu/list"],
    ["GET", "/v1/internal/line/rich-menu/default"],
  ]) {
    const response = await worker.fetch(request(path, { method }), AUTH_ENV);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, "internal_auth_required");
  }
});

test("list and default endpoints return sanitized LINE data", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/list")) {
      return new Response(JSON.stringify({
        richmenus: [{
          richMenuId: "richmenu-public",
          name: "MMD Public World",
          chatBarText: "MMD Public World",
          selected: true,
          areas: [{}, {}],
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ richMenuId: "richmenu-public" }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const list = await call("/v1/internal/line/rich-menu/list", { method: "GET" });
    const def = await call("/v1/internal/line/rich-menu/default", { method: "GET" });
    const listPayload = await list.json();
    const defPayload = await def.json();

    assert.equal(list.status, 200);
    assert.deepEqual(listPayload.richmenus[0], {
      richMenuId: "richmenu-public",
      name: "MMD Public World",
      chatBarText: "MMD Public World",
      selected: true,
      areas_count: 2,
    });
    assert.equal(def.status, 200);
    assert.equal(defPayload.rich_menu_id, "richmenu-public");
    assert.doesNotMatch(JSON.stringify({ listPayload, defPayload }), /line-token|internal-token|authorization|secret/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("publisher responses never include token secret or authorization", async () => {
  const response = await call("/v1/internal/line/rich-menu/public-world/draft", {}, {
    INTERNAL_TOKEN: "very-secret-internal",
    LINE_CHANNEL_ACCESS_TOKEN: "very-secret-line-token",
  });
  const rendered = JSON.stringify(await response.json());

  assert.doesNotMatch(rendered, /very-secret-internal|very-secret-line-token|authorization|secret/i);
});
