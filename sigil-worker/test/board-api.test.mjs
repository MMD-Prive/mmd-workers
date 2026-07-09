import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

async function call(path, init = {}, env = {}) {
  return worker.fetch(new Request(`https://sigil.mmdbkk.com${path}`, init), env, {
    waitUntil() {},
  });
}

async function json(response) {
  return response.json();
}

const sourceRecords = [
  {
    id: "recSECRET123",
    fields: {
      Title: "Payment proof from +66 812 345 678",
      Lane: "Payment",
      Status: "Need Info",
      Priority: "High",
      Risk: "Slip evidence only slip_url https://private.example/slip.jpg",
      "Next Action": "ตรวจยอดจากระบบทางการก่อนตอบ",
      Owner: "MMD",
      "Needs Per Decision": true,
      Summary: "สลิปจาก user@example.com เป็นหลักฐานเท่านั้น",
      phone: "+66 812 345 678",
      email: "user@example.com",
      line_user_id: "U1234567890abcdef1234567890abcdef",
      telegram_id: "12345678:abcdefghiJKLMNOPQRST",
      bank: "private bank details",
      token: "secret-token",
      passphrase: "secret passphrase",
    },
  },
  {
    fields: {
      title: "SVIP manual review",
      lane: "Private Review",
      status: "Ready for Per",
      priority: "High",
      risk: "Per manual decision only",
      next_action: "สรุป advisory ให้ Per",
      owner: "Per",
      summary: "ต้องให้ Per ตัดสินใจเท่านั้น",
    },
  },
];

test("GET /v1/sigil/board/status returns exact read-only status schema", async () => {
  const response = await call("/v1/sigil/board/status", {}, { SIGIL_BOARD_QUEUE_RECORDS: sourceRecords });
  assert.equal(response.status, 200);
  const body = await json(response);

  assert.deepEqual(Object.keys(body), ["ok", "source", "mode", "last_checked", "counts"]);
  assert.equal(body.ok, true);
  assert.equal(body.source, "worker");
  assert.equal(body.mode, "read_only");
  assert.match(body.last_checked, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(Object.keys(body.counts), ["critical", "ready_for_per", "payment_pending", "need_info"]);
  assert.equal(body.counts.payment_pending, 1);
  assert.equal(body.counts.ready_for_per, 2);
});

test("GET /v1/sigil/board/queue returns exact queue schema with sanitized cards", async () => {
  const response = await call("/v1/sigil/board/queue", {}, { SIGIL_BOARD_QUEUE_RECORDS: sourceRecords });
  assert.equal(response.status, 200);
  const body = await json(response);

  assert.deepEqual(Object.keys(body), ["ok", "source", "mode", "cards"]);
  assert.equal(body.ok, true);
  assert.equal(body.source, "worker");
  assert.equal(body.mode, "read_only");
  assert.equal(body.cards.length, 2);

  const card = body.cards[0];
  assert.deepEqual(Object.keys(card), [
    "id",
    "title",
    "lane",
    "status",
    "priority",
    "risk",
    "next_action",
    "owner",
    "needs_per_decision",
    "summary",
  ]);
  assert.match(card.id, /^sigil_card_[a-z0-9]+$/);
  assert.equal(card.lane, "Payment");
  assert.equal(card.priority, "High");
  assert.equal(card.owner, "MMD");
  assert.equal(card.needs_per_decision, true);

  const serialized = JSON.stringify(body).toLowerCase();
  for (const forbidden of [
    "recsecret",
    "+66",
    "812",
    "user@example.com",
    "line_user_id",
    "telegram_id",
    "slip_url",
    "private.example",
    "bank",
    "secret-token",
    "passphrase",
    "masked_email",
    "masked_phone",
    "masked_line_id",
    "masked_telegram_id",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("empty source returns successful empty board responses", async () => {
  const status = await json(await call("/v1/sigil/board/status"));
  const queue = await json(await call("/v1/sigil/board/queue"));

  assert.deepEqual(status.counts, {
    critical: 0,
    ready_for_per: 0,
    payment_pending: 0,
    need_info: 0,
  });
  assert.deepEqual(queue.cards, []);
});

test("board endpoints are GET-only and do not expose mutation routes", async () => {
  for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
    const status = await call("/v1/sigil/board/status", { method });
    const queue = await call("/v1/sigil/board/queue", { method });
    assert.equal(status.status, 405, method);
    assert.equal(queue.status, 405, method);
    assert.equal(status.headers.get("allow"), "GET, OPTIONS");
    assert.equal(queue.headers.get("allow"), "GET, OPTIONS");
  }

  for (const path of [
    "/v1/sigil/board/approve",
    "/v1/sigil/board/payment-confirm",
    "/v1/sigil/board/rollback",
    "/v1/sigil/board/svip-unlock",
  ]) {
    const response = await call(path, { method: "POST" });
    assert.equal(response.status, 404, path);
  }
});

test("CORS allows existing MMD origins for same-origin board reads", async () => {
  const response = await call(
    "/v1/sigil/board/queue",
    { headers: { origin: "https://mmdbkk.com" } },
    { SIGIL_BOARD_QUEUE_RECORDS: sourceRecords },
  );

  assert.equal(response.headers.get("access-control-allow-origin"), "https://mmdbkk.com");
  assert.equal(response.headers.get("access-control-allow-methods"), "GET,OPTIONS");
});
