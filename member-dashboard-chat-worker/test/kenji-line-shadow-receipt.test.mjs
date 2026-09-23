import assert from "node:assert/strict";
import test from "node:test";

import {
  handleKenjiConversationShadowReceipt,
  KenjiShadowReceipt,
  recordKenjiConversationShadowReceipt,
} from "../src/kenji-line-shadow-receipt.mjs";

function fakeState() {
  const values = new Map();
  return {
    storage: {
      get: async (key) => values.get(key),
      put: async (key, value) => values.set(key, value),
    },
  };
}

function receiptBinding(receipt) {
  return {
    idFromName: (name) => name,
    get: () => ({ fetch: (request) => receipt.fetch(request) }),
  };
}

test("shadow receipt stores aggregate observation only", async () => {
  const receipt = new KenjiShadowReceipt(fakeState());
  const binding = receiptBinding(receipt);
  const written = await recordKenjiConversationShadowReceipt({ KENJI_SHADOW_RECEIPT: binding }, {
    ok: true,
    events: 1,
    observed: 1,
    succeeded: 1,
    evidence_incomplete: 0,
    memory_used: 1,
    review_required: 0,
    message_text: "must never be stored",
    line_user_id: "U0123456789abcdef0123456789abcdef",
  });
  assert.equal(written.ok, true);

  const response = await receipt.fetch(new Request("https://kenji-shadow-receipt.internal/latest"));
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.receipt.status, "shadow_observed");
  assert.equal(payload.receipt.events, 1);
  assert.equal(payload.receipt.succeeded, 1);
  assert.equal(payload.receipt.shadow_only, true);
  assert.equal(payload.receipt.customer_copy_changed, false);
  assert.equal(payload.receipt.reply_transport_muted, true);
  const serialized = JSON.stringify(payload);
  assert.equal(serialized.includes("must never be stored"), false);
  assert.equal(serialized.includes("U0123456789abcdef0123456789abcdef"), false);
});

test("receipt endpoint accepts only the admin service binding", async () => {
  const receipt = new KenjiShadowReceipt(fakeState());
  const binding = receiptBinding(receipt);
  await recordKenjiConversationShadowReceipt({ KENJI_SHADOW_RECEIPT: binding }, { ok: true, events: 1, observed: 1, succeeded: 1 });

  const denied = await handleKenjiConversationShadowReceipt(new Request("https://member-dashboard-chat-worker.local/__internal/kenji/conversation-shadow-receipt"), {
    KENJI_SHADOW_RECEIPT: binding,
  });
  assert.equal(denied.status, 401);

  const allowed = await handleKenjiConversationShadowReceipt(new Request("https://member-dashboard-chat-worker.local/__internal/kenji/conversation-shadow-receipt", {
    headers: {
      "x-mmd-internal-call": "true",
      "x-mmd-service-binding": "admin-worker",
    },
  }), { KENJI_SHADOW_RECEIPT: binding });
  const payload = await allowed.json();
  assert.equal(allowed.status, 200);
  assert.equal(payload.available, true);
  assert.equal(payload.receipt.customer_copy_changed, false);
});
