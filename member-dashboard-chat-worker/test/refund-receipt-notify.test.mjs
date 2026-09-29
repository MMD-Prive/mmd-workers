import test from "node:test";
import assert from "node:assert/strict";

import worker from "../src/index.js";

const PATH = "https://member-dashboard-chat-worker.local/__internal/line/refund-receipt-notify";
const LINE_ID = "U" + "a".repeat(32);
const RECEIPT = "https://www.mmdbkk.com/refund-receipt/media?i=refund_test&e=9999999999&s=" + "a".repeat(64);

function internalRequest(body, service = "admin-worker") {
  return new Request(PATH, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mmd-internal-call": "true",
      "x-mmd-service-binding": service,
    },
    body: JSON.stringify(body),
  });
}

test("service-bound refund receipt sends text plus image for small JPEG or PNG", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await worker.fetch(internalRequest({
      line_user_id: LINE_ID,
      customer_name: "แมน",
      job_id: "JOB-FILM-J-001",
      receipt_url: RECEIPT,
      mime_type: "image/jpeg",
      byte_size: 420000,
      money_truth_mutated: false,
    }), { LINE_CHANNEL_ACCESS_TOKEN: "line-token" }, { waitUntil() {} });

    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, "image");
    assert.equal(payload.money_truth_mutated, false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.line.me/v2/bot/message/push");
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.to, LINE_ID);
    assert.equal(body.messages.length, 2);
    assert.match(body.messages[0].text, /เปอร์ส่งสลิปการโอนคืนให้ครับ/);
    assert.match(body.messages[0].text, /JOB-FILM-J-001/);
    assert.equal(body.messages[1].type, "image");
    assert.equal(body.messages[1].originalContentUrl, RECEIPT);
    assert.equal(body.messages[1].previewImageUrl, RECEIPT);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("large or WebP refund receipt falls back to secure signed link in LINE text", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return new Response("{}", { status: 200 });
  };
  try {
    const response = await worker.fetch(internalRequest({
      line_user_id: LINE_ID,
      receipt_url: RECEIPT,
      mime_type: "image/webp",
      byte_size: 2 * 1024 * 1024,
    }), { LINE_CHANNEL_ACCESS_TOKEN: "line-token" }, { waitUntil() {} });

    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, "secure_link");
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.messages.length, 1);
    assert.match(body.messages[0].text, /ดูสลิป: https:\/\/www\.mmdbkk\.com\/refund-receipt\/media/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("refund receipt notify rejects external receipt URLs and non-service callers", async () => {
  const badUrl = await worker.fetch(internalRequest({
    line_user_id: LINE_ID,
    receipt_url: "https://evil.example/receipt.jpg",
    mime_type: "image/jpeg",
    byte_size: 1000,
  }), { LINE_CHANNEL_ACCESS_TOKEN: "line-token" }, { waitUntil() {} });
  assert.equal(badUrl.status, 400);
  assert.equal((await badUrl.json()).error, "receipt_url_invalid");

  const badCaller = await worker.fetch(internalRequest({
    line_user_id: LINE_ID,
    receipt_url: RECEIPT,
    mime_type: "image/jpeg",
    byte_size: 1000,
  }, "telegram-worker"), { LINE_CHANNEL_ACCESS_TOKEN: "line-token" }, { waitUntil() {} });
  assert.equal(badCaller.status, 401);
  assert.equal((await badCaller.json()).error, "internal_auth_required");
});


test("small image refund receipt retries as secure link when LINE rejects image push", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url:String(url), init });
    return calls.length === 1
      ? new Response(JSON.stringify({ message:"invalid image message" }), { status:400, headers:{ "content-type":"application/json" } })
      : new Response("{}", { status:200, headers:{ "content-type":"application/json" } });
  };
  try {
    const response = await worker.fetch(internalRequest({
      line_user_id: LINE_ID,
      customer_name: "แมน",
      job_id: "JOB-FILM-J-001",
      receipt_url: RECEIPT,
      mime_type: "image/jpeg",
      byte_size: 420000,
    }), { LINE_CHANNEL_ACCESS_TOKEN:"line-token" }, { waitUntil() {} });

    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.mode, "secure_link_fallback");
    assert.equal(payload.fallback_from_status, 400);
    assert.equal(calls.length, 2);

    const first = JSON.parse(calls[0].init.body);
    assert.equal(first.messages.length, 2);
    assert.equal(first.messages[1].type, "image");

    const second = JSON.parse(calls[1].init.body);
    assert.equal(second.messages.length, 1);
    assert.equal(second.messages[0].type, "text");
    assert.match(second.messages[0].text, /ดูสลิป: https:\/\/www\.mmdbkk\.com\/refund-receipt\/media/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("refund receipt 429 reads LINE monthly quota and does not immediately push fallback again", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    calls.push({ href, init });
    if (href === "https://api.line.me/v2/bot/message/push") {
      return new Response(JSON.stringify({ message:"Too Many Requests" }), {
        status:429,
        headers:{ "content-type":"application/json" },
      });
    }
    if (href === "https://api.line.me/v2/bot/message/quota") {
      return Response.json({ type:"limited", value:1000 });
    }
    if (href === "https://api.line.me/v2/bot/message/quota/consumption") {
      return Response.json({ totalUsage:1000 });
    }
    throw new Error("unexpected URL " + href);
  };
  try {
    const response = await worker.fetch(internalRequest({
      line_user_id: LINE_ID,
      customer_name: "แมน",
      job_id: "JOB-FILM-J-001",
      receipt_url: RECEIPT,
      mime_type: "image/jpeg",
      byte_size: 420000,
    }), { LINE_CHANNEL_ACCESS_TOKEN:"line-token" }, { waitUntil() {} });

    const payload = await response.json();
    assert.equal(response.status, 502);
    assert.equal(payload.ok, false);
    assert.equal(payload.error, "line_push_rate_limited");
    assert.equal(payload.status, 429);
    assert.equal(payload.mode, "image");
    assert.equal(payload.quota.ok, true);
    assert.equal(payload.quota.quota_type, "limited");
    assert.equal(payload.quota.quota_value, 1000);
    assert.equal(payload.quota.total_usage, 1000);
    assert.equal(payload.quota.monthly_exhausted, true);
    assert.equal(calls.filter((x) => x.href === "https://api.line.me/v2/bot/message/push").length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
