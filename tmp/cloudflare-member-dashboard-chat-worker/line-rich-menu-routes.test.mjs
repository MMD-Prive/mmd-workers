import assert from "node:assert/strict";
import test from "node:test";
import worker from "./index.js";

// Tests for /internal/line/rich-menu/create and /internal/line/rich-menu/maintain
// These routes must be:
//   - guarded by x-admin-key (CONFIRM_KEY / ADMIN_TEST_KEY)
//   - safe when LINE_CHANNEL_ACCESS_TOKEN is absent (no LINE API call made)
//   - unreachable from GET / non-POST methods
// These tests do NOT call the real LINE API.

const ROUTES = [
  "/internal/line/rich-menu/create",
  "/internal/line/rich-menu/maintain",
];

for (const path of ROUTES) {
  test(`${path} — rejects when admin key is not configured`, async () => {
    const env = {};
    const response = await worker.fetch(
      new Request(`https://www.mmdbkk.com${path}`, { method: "POST" }),
      env,
      {}
    );
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.error, "admin_key_not_configured");
  });

  test(`${path} — rejects with 401 when x-admin-key header is missing`, async () => {
    const env = { CONFIRM_KEY: "test-confirm-key" };
    const response = await worker.fetch(
      new Request(`https://www.mmdbkk.com${path}`, { method: "POST" }),
      env,
      {}
    );
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.error, "missing_admin_key");
  });

  test(`${path} — rejects with 403 when x-admin-key is wrong`, async () => {
    const env = { CONFIRM_KEY: "test-confirm-key" };
    const response = await worker.fetch(
      new Request(`https://www.mmdbkk.com${path}`, {
        method: "POST",
        headers: { "x-admin-key": "wrong-key" },
      }),
      env,
      {}
    );
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.error, "invalid_admin_key");
  });

  test(`${path} — rejects with 500 and does not call LINE API when token is absent`, async () => {
    const env = { CONFIRM_KEY: "test-confirm-key" };
    let lineApiCalled = false;
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (input) => {
        const url = typeof input === "string" ? input : input.url;
        if (String(url).includes("api.line.me")) {
          lineApiCalled = true;
        }
        return new Response("{}", { status: 200 });
      };
      const response = await worker.fetch(
        new Request(`https://www.mmdbkk.com${path}`, {
          method: "POST",
          headers: { "x-admin-key": "test-confirm-key" },
        }),
        env,
        {}
      );
      assert.equal(response.status, 500);
      const body = await response.json();
      assert.equal(body.ok, false);
      assert.equal(body.error, "line_token_not_configured");
      assert.equal(lineApiCalled, false, "LINE API must not be called when token is absent");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test(`${path} — GET is not routed (returns 404)`, async () => {
    const env = { CONFIRM_KEY: "test-confirm-key", LINE_CHANNEL_ACCESS_TOKEN: "tok" };
    const response = await worker.fetch(
      new Request(`https://www.mmdbkk.com${path}`, { method: "GET" }),
      env,
      {}
    );
    // GET should fall through to not_found
    assert.equal(response.status, 404);
  });
}

// --- Idempotency tests for /internal/line/rich-menu/maintain ---

// Shared LINE API mock builder: returns a rich menu with one area already set to Hi Per message action
function makeLineApiMockAlreadyCorrect(lineApiCallLog) {
  return async (input) => {
    const url = typeof input === "string" ? input : input.url;
    const urlStr = String(url);
    if (urlStr.includes("/v2/bot/user/all/richmenu") && !urlStr.includes("/v2/bot/user/all/richmenu/")) {
      lineApiCallLog.push("GET_default");
      return new Response(JSON.stringify({ richMenuId: "rmid-existing-123" }), { status: 200 });
    }
    if (urlStr.match(/\/v2\/bot\/richmenu\/rmid-existing-123$/) && !urlStr.includes("/content")) {
      lineApiCallLog.push("GET_richmenu");
      return new Response(JSON.stringify({
        richMenuId: "rmid-existing-123",
        name: "MMD Test Menu",
        chatBarText: "Menu",
        areas: [{
          bounds: { x: 0, y: 0, width: 833, height: 270 },
          action: { type: "message", label: "Hi Per", text: "Hi Per" }
        }]
      }), { status: 200 });
    }
    // Any write endpoint — should not be reached when already correct
    if (urlStr.includes("/v2/bot/richmenu") && (input.method === "POST" || (typeof input !== "string" && input.method === "POST"))) {
      lineApiCallLog.push("POST_write");
    }
    return new Response("{}", { status: 200 });
  };
}

// Shared LINE API mock builder: returns a rich menu with one area needing patch (postback action)
function makeLineApiMockNeedsUpdate(lineApiCallLog) {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    const method = init?.method || (typeof input !== "string" ? input.method : "GET") || "GET";
    const urlStr = String(url);
    if (urlStr.includes("/v2/bot/user/all/richmenu") && !urlStr.includes("/v2/bot/user/all/richmenu/")) {
      lineApiCallLog.push("GET_default");
      return new Response(JSON.stringify({ richMenuId: "rmid-old-456" }), { status: 200 });
    }
    if (urlStr.match(/\/v2\/bot\/richmenu\/rmid-old-456$/) && !urlStr.includes("/content")) {
      lineApiCallLog.push("GET_richmenu");
      return new Response(JSON.stringify({
        richMenuId: "rmid-old-456",
        name: "MMD Old Menu",
        chatBarText: "Menu",
        areas: [{
          bounds: { x: 0, y: 0, width: 833, height: 270 },
          action: { type: "postback", label: "Per AI", data: "talk_to_per_ai" }
        }]
      }), { status: 200 });
    }
    if (urlStr === "https://api.line.me/v2/bot/richmenu" && method === "POST") {
      lineApiCallLog.push("POST_create");
      return new Response(JSON.stringify({ richMenuId: "rmid-new-789" }), { status: 200 });
    }
    if (urlStr.includes("/content") && method === "POST") {
      lineApiCallLog.push("POST_image_upload");
      return new Response("{}", { status: 200 });
    }
    if (urlStr.includes("/content") && method !== "POST") {
      lineApiCallLog.push("GET_image");
      return new Response(new Uint8Array([1, 2, 3]).buffer, {
        status: 200,
        headers: { "content-type": "image/png" }
      });
    }
    if (urlStr.includes("/v2/bot/user/all/richmenu/rmid-new-789") && method === "POST") {
      lineApiCallLog.push("POST_set_default");
      return new Response("{}", { status: 200 });
    }
    return new Response("{}", { status: 200 });
  };
}

const MAINTAIN = "/internal/line/rich-menu/maintain";
const AUTH_ENV = { CONFIRM_KEY: "test-key", LINE_CHANNEL_ACCESS_TOKEN: "tok" };
const AUTH_HEADERS = { "x-admin-key": "test-key", "content-type": "application/json" };

test(`${MAINTAIN} plan — already_correct:true when candidate has exact Hi Per message action`, async () => {
  const log = [];
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = makeLineApiMockAlreadyCorrect(log);
    const response = await worker.fetch(
      new Request(`https://www.mmdbkk.com${MAINTAIN}`, {
        method: "POST",
        headers: AUTH_HEADERS,
        body: JSON.stringify({ mode: "plan" }),
      }),
      AUTH_ENV,
      {}
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.mode, "plan");
    assert.equal(body.already_correct, true, "plan should signal already_correct:true");
    assert.equal(body.would_create, false, "plan should signal would_create:false");
    assert.equal(log.includes("POST_write"), false, "plan must not call any write endpoint");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test(`${MAINTAIN} execute — returns already_correct and calls no LINE write API when candidate is exact`, async () => {
  const log = [];
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = makeLineApiMockAlreadyCorrect(log);
    const response = await worker.fetch(
      new Request(`https://www.mmdbkk.com${MAINTAIN}`, {
        method: "POST",
        headers: AUTH_HEADERS,
        body: JSON.stringify({ mode: "execute" }),
      }),
      AUTH_ENV,
      {}
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.mode, "execute");
    assert.equal(body.result, "already_correct");
    assert.deepEqual(body.changed_area_indexes, []);
    assert.equal(log.includes("POST_create"), false, "must not create rich menu");
    assert.equal(log.includes("POST_image_upload"), false, "must not upload image");
    assert.equal(log.includes("POST_set_default"), false, "must not set default");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test(`${MAINTAIN} execute — creates clone and sets default when candidate needs update`, async () => {
  const log = [];
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = makeLineApiMockNeedsUpdate(log);
    const response = await worker.fetch(
      new Request(`https://www.mmdbkk.com${MAINTAIN}`, {
        method: "POST",
        headers: AUTH_HEADERS,
        body: JSON.stringify({ mode: "execute" }),
      }),
      AUTH_ENV,
      {}
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.mode, "execute");
    assert.equal(body.result, undefined, "should not return already_correct when update was needed");
    assert.equal(body.linked_as, "default");
    assert.equal(log.includes("POST_create"), true, "must create new rich menu");
    assert.equal(log.includes("POST_set_default"), true, "must set new menu as default");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test(`${MAINTAIN} execute — unauthorized requests still rejected before any LINE API call`, async () => {
  const log = [];
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input) => {
      log.push("called");
      return new Response("{}", { status: 200 });
    };
    const response = await worker.fetch(
      new Request(`https://www.mmdbkk.com${MAINTAIN}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "execute" }),
      }),
      {},
      {}
    );
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.error, "admin_key_not_configured");
    assert.equal(log.length, 0, "no LINE API call before auth");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
