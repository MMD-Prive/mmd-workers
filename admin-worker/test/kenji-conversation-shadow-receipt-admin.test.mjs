import assert from "node:assert/strict";
import test from "node:test";

import {
  handleKenjiConversationShadowReceiptAdmin,
  isKenjiConversationShadowReceiptAdminRequest,
} from "../src/kenji-conversation-shadow-receipt-admin.js";

test("owner receipt route is exact and owner-only", async () => {
  assert.equal(isKenjiConversationShadowReceiptAdminRequest("/v1/admin/kenji/conversation-shadow-receipt", "GET"), true);
  assert.equal(isKenjiConversationShadowReceiptAdminRequest("/v1/admin/kenji/conversation-shadow-receipt/other", "GET"), false);

  const binding = {
    fetch: async (request) => {
      assert.equal(request.headers.get("x-mmd-internal-call"), "true");
      assert.equal(request.headers.get("x-mmd-service-binding"), "admin-worker");
      return Response.json({ ok: true, available: true, receipt: { shadow_only: true, customer_copy_changed: false } });
    },
  };
  const denied = await handleKenjiConversationShadowReceiptAdmin({ MEMBER_DASHBOARD_CHAT_WORKER: binding }, null);
  assert.equal(denied.status, 401);

  const response = await handleKenjiConversationShadowReceiptAdmin({ MEMBER_DASHBOARD_CHAT_WORKER: binding }, { id: "owner-1", role: "owner" });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.receipt.shadow_only, true);
  assert.equal(payload.receipt.customer_copy_changed, false);
});
