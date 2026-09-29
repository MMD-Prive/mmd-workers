import assert from "node:assert/strict";
import test from "node:test";
import { createLineSignature } from "../src/index.js";
import {
  handleKenjiSeedLineRequestWithRedeliveryRecovery,
  isKenjiModelNameOnlyTextEvent,
} from "../src/kenji-line-redelivery-recovery.mjs";

const SECRET = "model-only-test-secret";
const USER_ID = "U0123456789abcdef0123456789abcdef";

function event(message) {
  return {
    type: "message",
    mode: "active",
    replyToken: "reply-token",
    source: { type: "user", userId: USER_ID },
    deliveryContext: { isRedelivery: false },
    message: { id: "m1", type: "text", text: message },
  };
}

test("model-only gate accepts a model name/code and rejects ordinary keyword text", () => {
  assert.equal(isKenjiModelNameOnlyTextEvent(event("บุค")), true);
  assert.equal(isKenjiModelNameOnlyTextEvent(event("EMs11")), true);
  assert.equal(isKenjiModelNameOnlyTextEvent(event("จ่ายเต็มเลยเหรอครับ")), false);
  assert.equal(isKenjiModelNameOnlyTextEvent(event("CARE BACK")), false);
  assert.equal(isKenjiModelNameOnlyTextEvent(event("เช็กสถานะสมาชิก")), false);
  assert.equal(isKenjiModelNameOnlyTextEvent(event("ดูนายแบบ")), false);
  assert.equal(isKenjiModelNameOnlyTextEvent(event("ยืนยันนัด")), false);
});

test("non-model customer text is acknowledged silently before any LINE auto-reply path", async () => {
  const body = JSON.stringify({ events: [event("จ่ายเต็มเลยเหรอครับ")] });
  const signature = await createLineSignature(body, SECRET);
  let lineCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("api.line.me")) {
      lineCalls += 1;
      return Response.json({}, { status: 200 });
    }
    return Response.json({ records: [] }, { status: 200 });
  };
  try {
    const request = new Request("https://mmdbkk.com/webhooks/line", {
      method: "POST",
      headers: { "content-type": "application/json", "x-line-signature": signature },
      body,
    });
    const response = await handleKenjiSeedLineRequestWithRedeliveryRecovery(request, {
      LINE_CHANNEL_SECRET: SECRET,
      LINE_KENJI_MODEL_NAME_ONLY_MODE: "true",
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.kenji_mode, "model_name_only");
    assert.equal(payload.replied, false);
    assert.equal(payload.suppressed, true);
    assert.equal(lineCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
