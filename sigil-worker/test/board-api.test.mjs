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

function mockKv(value) {
  return {
    calls: [],
    async get(key) {
      this.calls.push(key);
      return value;
    },
  };
}

const sourceRecords = [
  {
    id: "recXXXXXXXXXXXXXX",
    fields: {
      id: "recXXXXXXXXXXXXXX",
      Title: "Payment proof review",
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
      telegram_username: "@private_user",
      bank: "private bank details",
      bank_account: "123-456-7890",
      amount_raw: "99000",
      payment_ref_raw: "pay_raw_private",
      airtable_record_id: "recPRIVATEID12345",
      raw_payload: { should: "not return" },
      admin_note_raw: "private admin note",
      token: "secret-token",
      passphrase: "secret passphrase",
      api_key: "private-api-key",
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

function makeCards(count, overrides = {}) {
  return Array.from({ length: count }, (_, index) => ({
    id: `safe_${index}`,
    title: `line_[masked] archive item ${index}`,
    lane: "Need Info",
    status: "Awaiting Info",
    priority: "Low",
    risk: "Read-only advisory",
    next_action: "อ่านข้อมูลและจัดลำดับต่อ",
    owner: "Kenji",
    needs_per_decision: false,
    summary: "ข้อมูลนี้เป็น advisory read-only",
    ...overrides,
  }));
}

const strictBadPattern = /rec[A-Za-z0-9]{10,}|Canonical Client|LINE Official immigration identity|line_user_i|line_user_id|nickname:|emails:|email|phone|telegram:|@[A-Za-z0-9_]|proof_attached|requested_path|payment_method|bank|SVIP|Black Card|raw_payload|secret|token|passphrase|api_key/;

test("GET /v1/sigil/board/status returns exact read-only status schema", async () => {
  const kv = mockKv(JSON.stringify(sourceRecords));
  const response = await call("/v1/sigil/board/status", {}, { SIGIL_BOARD_KV: kv });
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
  assert.equal(body.counts.need_info, 1);
  assert.deepEqual(kv.calls, ["sigil:board:v1:cards"]);
});

test("GET /v1/sigil/board/queue reads sanitized cards from mocked KV", async () => {
  const kv = mockKv(JSON.stringify(sourceRecords));
  const response = await call("/v1/sigil/board/queue", {}, { SIGIL_BOARD_KV: kv });
  assert.equal(response.status, 200);
  const body = await json(response);

  assert.deepEqual(Object.keys(body), ["ok", "source", "mode", "total_cards", "returned_cards", "limit", "cards"]);
  assert.equal(body.ok, true);
  assert.equal(body.source, "worker");
  assert.equal(body.mode, "read_only");
  assert.equal(body.total_cards, 2);
  assert.equal(body.returned_cards, 2);
  assert.equal(body.limit, 50);
  assert.equal(body.cards.length, 2);

  const card = body.cards.find((item) => item.lane === "Payment");
  assert(card);
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
  assert.notEqual(card.id, "recXXXXXXXXXXXXXX");
  assert.equal(card.lane, "Payment");
  assert.equal(card.priority, "High");
  assert.equal(card.owner, "MMD");
  assert.equal(card.needs_per_decision, true);
  assert.equal(card.title, "Payment proof review");
  assert.equal(card.next_action, "ตรวจยอดจากระบบทางการก่อนตอบ");

  const serialized = JSON.stringify(body).toLowerCase();
  for (const forbidden of [
    "recxxxxxxxxxxxxxx",
    "recprivateid",
    "+66",
    "812",
    "user@example.com",
    "line_user_id",
    "telegram_id",
    "telegram_username",
    "slip_url",
    "private.example",
    "bank",
    "bank_account",
    "amount_raw",
    "payment_ref_raw",
    "airtable_record_id",
    "raw_payload",
    "admin_note_raw",
    "secret-token",
    "passphrase",
    "api_key",
    "masked_email",
    "masked_phone",
    "masked_line_id",
    "masked_telegram_id",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("missing KV returns successful empty board responses", async () => {
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

test("invalid KV JSON returns ok true and empty cards", async () => {
  const kv = mockKv("{not-json");
  const queueResponse = await call("/v1/sigil/board/queue", {}, { SIGIL_BOARD_KV: kv });
  const statusResponse = await call("/v1/sigil/board/status", {}, { SIGIL_BOARD_KV: kv });
  const queue = await json(queueResponse);
  const status = await json(statusResponse);

  assert.equal(queueResponse.status, 200);
  assert.equal(statusResponse.status, 200);
  assert.equal(queue.ok, true);
  assert.deepEqual(queue.cards, []);
  assert.deepEqual(status.counts, {
    critical: 0,
    ready_for_per: 0,
    payment_pending: 0,
    need_info: 0,
  });
});

test("status counts are derived from sanitized cards using V8.2.1 rules", async () => {
  const kv = mockKv(JSON.stringify([
    { title: "Risk item", lane: "Risk", status: "Read Only", priority: "Low", owner: "Admin" },
    { title: "Per item", lane: "Private Review", status: "Ready for Per", priority: "High", owner: "Per" },
    { title: "Payment pending", lane: "Payment", status: "Pending Review", priority: "High", owner: "MMD" },
    { title: "Missing info", lane: "Need Info", status: "Read Only", priority: "Medium", owner: "MMD" },
  ]));
  const body = await json(await call("/v1/sigil/board/status", {}, { SIGIL_BOARD_KV: kv }));

  assert.deepEqual(body.counts, {
    critical: 1,
    ready_for_per: 1,
    payment_pending: 1,
    need_info: 1,
  });
});

test("explicit needs_per_decision false stays false", async () => {
  const kv = mockKv(JSON.stringify([
    { title: "Payment pending", lane: "Payment", status: "Pending Review", priority: "High", owner: "MMD", needs_per_decision: false },
  ]));
  const body = await json(await call("/v1/sigil/board/queue", {}, { SIGIL_BOARD_KV: kv }));

  assert.equal(body.cards[0].needs_per_decision, false);
});

test("queue default returns max 50 cards with metadata", async () => {
  const kv = mockKv(JSON.stringify(makeCards(108)));
  const body = await json(await call("/v1/sigil/board/queue", {}, { SIGIL_BOARD_KV: kv }));

  assert.equal(body.total_cards, 108);
  assert.equal(body.returned_cards, 50);
  assert.equal(body.limit, 50);
  assert.equal(body.cards.length, 50);
});

test("queue limit query supports 30 and caps at 100", async () => {
  const kv30 = mockKv(JSON.stringify(makeCards(108)));
  const body30 = await json(await call("/v1/sigil/board/queue?limit=30", {}, { SIGIL_BOARD_KV: kv30 }));
  assert.equal(body30.limit, 30);
  assert.equal(body30.returned_cards, 30);
  assert.equal(body30.cards.length, 30);

  const kv100 = mockKv(JSON.stringify(makeCards(108)));
  const body100 = await json(await call("/v1/sigil/board/queue?limit=999", {}, { SIGIL_BOARD_KV: kv100 }));
  assert.equal(body100.limit, 100);
  assert.equal(body100.returned_cards, 100);
  assert.equal(body100.cards.length, 100);
});

test("status counts are based on all cards, not limited queue", async () => {
  const cards = [
    ...makeCards(60),
    { title: "Critical complaint", lane: "Risk", status: "Ready for Per", priority: "Critical", owner: "Per", needs_per_decision: true },
    { title: "Payment proof", lane: "Payment", status: "Pending Review", priority: "High", owner: "MMD", needs_per_decision: false },
  ];
  const kv = mockKv(JSON.stringify(cards));
  const status = await json(await call("/v1/sigil/board/status", {}, { SIGIL_BOARD_KV: kv }));
  const queue = await json(await call("/v1/sigil/board/queue?limit=30", {}, { SIGIL_BOARD_KV: kv }));

  assert.equal(queue.cards.length, 30);
  assert.equal(status.counts.critical, 1);
  assert.equal(status.counts.ready_for_per, 1);
  assert.equal(status.counts.payment_pending, 1);
  assert.equal(status.counts.need_info, 60);
});

test("queue sort puts Critical and Per decision cards first", async () => {
  const cards = [
    ...makeCards(3),
    { title: "Payment proof", lane: "Payment", status: "Pending Review", priority: "High", owner: "MMD", needs_per_decision: false },
    { title: "Per decision", lane: "Private Review", status: "Ready for Per", priority: "Medium", owner: "Per", needs_per_decision: true },
    { title: "Critical route risk", lane: "Risk", status: "Ready for Per", priority: "Critical", owner: "Admin", needs_per_decision: true },
  ];
  const kv = mockKv(JSON.stringify(cards));
  const body = await json(await call("/v1/sigil/board/queue", {}, { SIGIL_BOARD_KV: kv }));

  assert.equal(body.cards[0].title, "Critical route risk");
  assert.equal(body.cards[1].title, "Per decision");
  assert.equal(body.cards[2].title, "Payment proof");
});

test("low priority Kenji cards are not labeled Ready for Per", async () => {
  const kv = mockKv(JSON.stringify([
    { title: "line_[masked] item", lane: "Need Info", status: "Ready for Per", priority: "Low", owner: "Kenji", needs_per_decision: false },
  ]));
  const body = await json(await call("/v1/sigil/board/queue", {}, { SIGIL_BOARD_KV: kv }));

  assert.equal(body.cards[0].status, "Awaiting Info");
  assert.equal(body.cards[0].owner, "Kenji");
  assert.equal(body.cards[0].needs_per_decision, false);
});

test("deep sanitizer replaces raw operational summary with safe lane template", async () => {
  const kv = mockKv(JSON.stringify([
    {
      id: "recSENSITIVE123456",
      title: "Canonical Client recSENSITIVE123456",
      lane: "Private Review",
      status: "Ready for Per",
      priority: "High",
      risk: "SVIP raw note with line_user_id and LINE Official immigration identity",
      next_action: "telegram: @rawhandle requested_path proof_attached",
      owner: "Per",
      needs_per_decision: true,
      summary: "Canonical Client คุณทดสอบ SVIP recSENSITIVE123456 LINE Official immigration identity line_user_id telegram: @rawhandle",
    },
  ]));
  const body = await json(await call("/v1/sigil/board/queue", {}, { SIGIL_BOARD_KV: kv }));
  const card = body.cards[0];

  assert.equal(card.summary, "ต้องสรุปเข้าคิวพิจารณาแบบส่วนตัว");
  assert.equal(card.title, "Private review item");
  assert.equal(card.next_action, "สรุป advisory ให้ Per");
  assert.equal(card.risk, "Read-only advisory");
  assert.equal(strictBadPattern.test(JSON.stringify(body)), false);
});

test("deep sanitizer replaces renewal form dump summary with safe template", async () => {
  const kv = mockKv(JSON.stringify([
    {
      title: "renewal raw title nickname: boss",
      lane: "Payment",
      status: "Pending Review",
      priority: "High",
      risk: "payment_method bank transfer",
      next_action: "phone email telegram: @rawhandle",
      owner: "MMD",
      needs_per_decision: false,
      summary: "renewal dump nickname: abc emails: a@example.com phone 0812345678 telegram: @rawhandle bank payment_method raw_payload",
    },
  ]));
  const body = await json(await call("/v1/sigil/board/queue", {}, { SIGIL_BOARD_KV: kv }));
  const card = body.cards[0];

  assert.equal(card.summary, "รายการชำระเงินต้องตรวจสอบจากระบบทางการก่อนตอบ");
  assert.equal(card.title, "Payment review");
  assert.equal(card.next_action, "ตรวจยอดจากระบบทางการก่อนตอบ");
  assert.equal(card.risk, "Slip evidence only");
  assert.equal(strictBadPattern.test(JSON.stringify(body)), false);
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
