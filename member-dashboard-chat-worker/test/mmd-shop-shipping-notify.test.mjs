import test from "node:test";
import assert from "node:assert/strict";

import worker from "../src/index.js";

const PATH = "https://member-dashboard-chat-worker.local/__internal/line/shop-shipping-notify";
const LINE_ID = "U" + "a".repeat(32);

function internalRequest(body, headers = {}) {
  return new Request(PATH, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mmd-internal-call": "true",
      "x-mmd-service-binding": "admin-worker",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test("service-bound admin worker can send MMD Shop shipping notification through LINE runtime", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const response = await worker.fetch(internalRequest({
      line_user_id: LINE_ID,
      order_id: "MMD-260919-TEST",
      customer_name: "ลูกค้า",
      courier: "Kerry",
      tracking_number: "TRACK123456",
    }), {
      LINE_CHANNEL_ACCESS_TOKEN: "line-token",
    }, { waitUntil() {} });

    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.status, "sent");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.line.me/v2/bot/message/push");
    const lineBody = JSON.parse(calls[0].init.body);
    assert.equal(lineBody.to, LINE_ID);
    assert.match(lineBody.messages[0].text, /MMD SHOP/);
    assert.match(lineBody.messages[0].text, /TRACK123456/);
    assert.match(lineBody.messages[0].text, /my-mmd\/orders/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("shop shipping notification route rejects non service-bound callers", async () => {
  const response = await worker.fetch(new Request(PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      line_user_id: LINE_ID,
      order_id: "MMD-260919-TEST",
      courier: "Kerry",
      tracking_number: "TRACK123456",
    }),
  }), {
    LINE_CHANNEL_ACCESS_TOKEN: "line-token",
  }, { waitUntil() {} });

  const payload = await response.json();
  assert.equal(response.status, 401);
  assert.equal(payload.error, "internal_auth_required");
});
