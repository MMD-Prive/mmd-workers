import assert from "node:assert/strict";
import test from "node:test";
import worker from "./src/index.js";

const ADMIN_BEARER = "test-admin";
const CONFIRM_KEY = "test-confirm";
const strictBadPattern = /rec[A-Za-z0-9]{10,}|Canonical Client|LINE Official immigration identity|line_user_i|line_user_id|nickname:|emails:|email|phone|telegram:|@[A-Za-z0-9_]|proof_attached|requested_path|payment_method|bank|SVIP|Black Card|raw_payload|secret|token|passphrase|api_key/;

function baseEnv(overrides = {}) {
  return {
    ADMIN_BEARER,
    CONFIRM_KEY,
    AIRTABLE_API_KEY: "pat_test",
    AIRTABLE_BASE_ID: "app_test",
    AIRTABLE_TABLE_CONSOLE_INBOX_ID: "console_inbox",
    AIRTABLE_TABLE_PAYMENT_PROOFS_ID: "payment_proofs",
    AIRTABLE_TABLE_SESSIONS: "sessions",
    AIRTABLE_TABLE_PAYMENTS: "payments",
    AIRTABLE_TABLE_MEMBER_PACKAGES: "member_packages",
    SIGIL_BOARD_KV: mockKv(),
    ...overrides,
  };
}

function mockKv() {
  return {
    writes: [],
    async put(key, value) {
      this.writes.push({ key, value });
    },
  };
}

async function publish(env, init = {}) {
  return worker.fetch(new Request("https://admin-worker.test/v1/admin/sigil/board/publish", {
    method: "POST",
    ...init,
  }), env);
}

function airtableResponse(records) {
  return new Response(JSON.stringify({ records }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function withMockedFetch(fn, handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    await fn();
  } finally {
    globalThis.fetch = original;
  }
}

function recordsForUrl(url) {
  const decoded = decodeURIComponent(new URL(url).pathname);
  if (decoded.includes("/payment_proofs")) {
    return [
      {
        id: "recPAYMENTRAW12345",
        fields: {
          payment_ref: "pay_raw_private",
          title: "Payment proof review",
          status: "pending",
          risk: "Slip evidence only",
          admin_note: "Canonical Client Slip uploaded by user@example.com phone +66 812 345 678 slip_url https://private.example/slip.jpg requested_path payment_method bank",
          phone: "+66 812 345 678",
          email: "user@example.com",
          line_user_id: "U1234567890abcdef1234567890abcdef",
          telegram_id: "12345678:abcdefghiJKLMNOPQRST",
          telegram_username: "@private_user",
          bank: "private bank",
          bank_account: "123-456-7890",
          amount_raw: "99000",
          payment_ref_raw: "pay_raw_private",
          airtable_record_id: "recPAYMENTRAW12345",
          raw_payload: { private: true },
          admin_note_raw: "private note",
          token: "secret-token",
          passphrase: "secret passphrase",
          api_key: "private-key",
        },
      },
    ];
  }
  if (decoded.includes("/console_inbox")) {
    return [
      {
        id: "recINBOXRAW12345",
        fields: {
          inbox_id: "inbox_svip_1",
          intent: "svip_review",
          status: "review",
          admin_note: "SVIP review / Black Card review / complaint LINE Official immigration identity line_user_i telegram: @private_user",
        },
      },
    ];
  }
  return [];
}

test("POST /v1/admin/sigil/board/publish rejects unauthorized requests", async () => {
  const response = await publish(baseEnv(), {});
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error, "unauthorized");
});

test("authorized publish writes sanitized cards to SIGIL_BOARD_KV", async () => {
  const env = baseEnv();
  await withMockedFetch(async () => {
    const response = await publish(env, {
      headers: { Authorization: `Bearer ${ADMIN_BEARER}` },
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      ok: true,
      published: 2,
      key: "sigil:board:v1:cards",
      source: "admin-worker",
      mode: "internal_publish",
    });

    const cardsWrite = env.SIGIL_BOARD_KV.writes.find((write) => write.key === "sigil:board:v1:cards");
    const metaWrite = env.SIGIL_BOARD_KV.writes.find((write) => write.key === "sigil:board:v1:meta");
    assert(cardsWrite);
    assert(metaWrite);

    const cards = JSON.parse(cardsWrite.value);
    assert.equal(cards.length, 2);
    const paymentCard = cards.find((card) => card.lane === "Payment");
    const reviewCard = cards.find((card) => card.lane === "Private Review");
    assert(paymentCard);
    assert(reviewCard);

    assert.deepEqual(Object.keys(paymentCard), [
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
    assert.match(paymentCard.id, /^sigil_card_[a-z0-9]+$/);
    assert.notEqual(paymentCard.id, "recPAYMENTRAW12345");
    assert.equal(paymentCard.priority, "High");
    assert.equal(paymentCard.risk, "Slip evidence only");
    assert.equal(paymentCard.owner, "MMD");
    assert.equal(paymentCard.summary, "รายการชำระเงินต้องตรวจสอบจากระบบทางการก่อนตอบ");
    assert.equal(paymentCard.next_action, "ตรวจยอดจากระบบทางการก่อนตอบ");
    assert.equal(reviewCard.owner, "Per");
    assert.equal(reviewCard.summary, "ต้องสรุปเข้าคิวพิจารณาแบบส่วนตัว");

    const serialized = JSON.stringify(cards).toLowerCase();
    for (const forbidden of [
      "recpaymentraw",
      "recinboxraw",
      "user@example.com",
      "+66",
      "812",
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
    ]) {
      assert.equal(serialized.includes(forbidden), false, forbidden);
    }
    assert.equal(strictBadPattern.test(JSON.stringify(cards)), false);
  }, async (input) => airtableResponse(recordsForUrl(input.url || input)));
});

test("confirm key auth can publish and empty sources write an empty array safely", async () => {
  const env = baseEnv();
  await withMockedFetch(async () => {
    const response = await publish(env, {
      headers: { "X-Confirm-Key": CONFIRM_KEY },
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.published, 0);
    const cardsWrite = env.SIGIL_BOARD_KV.writes.find((write) => write.key === "sigil:board:v1:cards");
    assert.deepEqual(JSON.parse(cardsWrite.value), []);
  }, async () => airtableResponse([]));
});
