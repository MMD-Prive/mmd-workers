import test from "node:test";
import assert from "node:assert/strict";
import { resolveCanonicalKenjiLineIdentity } from "../src/kenji-line-canonical-client-resolution.mjs";
import { KENJI_LV5_LINE_REQUEST_INTERNALS } from "../src/kenji-lv5-line-operational-request.mjs";
import { applyKenjiLv5BookingActionToDecision, canonicalClientRecheckFailure } from "../src/kenji-lv5-line-action-execution.mjs";
import { KENJI_LV5_HYPE_INTERNALS, notifyKenjiLv5Hype } from "../src/kenji-lv5-hype-alert.mjs";

const userId = "U0123456789abcdef0123456789abcdef";
const clientId = "recClient123";
const event = { type: "message", timestamp: Date.now(), source: { type: "user", userId }, message: { id: "636045785456181661", type: "text", text: "มัดจำ" } };
const prepared = { text: "prepared", live_truth_verified: true, operational: { primary_action: "prepare_booking_intent" } };
const modelGate = { required: true, status: "match", model: { working_name: "Rossi" }, parsed: { type: "booking", model_name: "Rossi", date: "2026-10-20", time: "20:00", location: "สุขุมวิท", amount_thb: 9000 } };

test("P4 canonical identity is independent of memory but still fails closed on identity conflicts and lookup failures", async (t) => {
  const original = globalThis.fetch;
  let clients, renameRows, clientHttp, renameHttp, throwClient, requests, actionCalls;
  const reset = () => {
    clients = [{ id: clientId, fields: { line_user_id: userId } }];
    renameRows = [{ id: "recRename123", fields: { "LINE User ID": userId, "Current LINE Rename": "คุณโจ้", "Canonical Client": [clientId] } }];
    clientHttp = 200; renameHttp = 200; throwClient = false; requests = []; actionCalls = 0;
  };
  const env = {
    AIRTABLE_API_KEY: "test", AIRTABLE_BASE_ID: "appTest", INTERNAL_TOKEN: "test",
    ADMIN_WORKER: { async fetch(request) {
      actionCalls++;
      const payload = await request.json();
      assert.equal(payload.client.canonical_client_id, clientId);
      assert.equal(payload.client.line_user_id, userId);
      return Response.json({ ok: true, executed: true, status: "booking_intent_collected" });
    } },
  };
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    requests.push({ href, method: init.method || "GET" });
    if (href.includes("tblVv58TCbwh5j1fS")) {
      if (throwClient) throw new Error("simulated timeout");
      return Response.json({ records: clients }, { status: clientHttp });
    }
    if (href.includes("Client%20Import%20Staging")) return Response.json({ records: renameRows }, { status: renameHttp });
    // Every memory read/write is unavailable. Successful P4 must never touch it.
    return Response.json({ error: "memory unavailable" }, { status: 429 });
  };
  try {
    await t.test("prepared P4 executes with unavailable memory and only two identity GETs", async () => {
      reset();
      const result = await KENJI_LV5_LINE_REQUEST_INTERNALS.applyP4Action(env, event, modelGate, prepared);
      assert.equal(result.result.executed, true);
      assert.equal(actionCalls, 1);
      assert.equal(requests.length, 2);
      assert.ok(requests.every((r) => r.method === "GET"));
    });
    await t.test("partial deposit capture uses the same memory-independent identity recheck", async () => {
      reset();
      const result = await KENJI_LV5_LINE_REQUEST_INTERNALS.captureIncompleteDepositDraft(env, event, "payment_status", {
        active: true, merged_intent: { type: "booking", trigger: "deposit" },
        draft: { draft_id: "kbd1_test", ready: false, revision: 1, capture_revision: 0 },
      });
      assert.equal(result.executed, true);
      assert.equal(actionCalls, 1);
      assert.ok(requests.every((r) => r.method === "GET"));
    });
    const cases = [
      ["missing Client", () => { clients = []; }, "exact_client_not_found", "not_found", "identity_client_verification_failed"],
      ["duplicate Clients", () => { clients.push({ id: "recOther" }); }, "multiple_exact_clients", "ambiguous", "identity_client_verification_failed"],
      ["wrong rename Client", () => { renameRows[0].fields["Canonical Client"] = ["recOther"]; }, "per_rename_client_conflict", "ambiguous", "identity_client_verification_failed"],
      ["unlinked rename", () => { renameRows[0].fields["Canonical Client"] = []; }, "per_rename_client_conflict", "ambiguous", "identity_client_verification_failed"],
      ["duplicate rename rows", () => { renameRows.push(structuredClone(renameRows[0])); }, "per_rename_client_conflict", "ambiguous", "identity_client_verification_failed"],
      ["Client API 429", () => { clientHttp = 429; }, "airtable_read_failed", "unavailable", "auth_system_degraded"],
      ["rename API 503", () => { renameHttp = 503; }, "airtable_read_failed", "unavailable", "auth_system_degraded"],
      ["Client timeout", () => { throwClient = true; }, "airtable_read_failed", "unavailable", "auth_system_degraded"],
    ];
    for (const [name, setup, reason, status, alert] of cases) {
      await t.test(name, async () => {
        reset(); setup();
        const { result, decision } = await KENJI_LV5_LINE_REQUEST_INTERNALS.applyP4Action(env, event, modelGate, prepared);
        assert.equal(result.executed, false);
        assert.equal(actionCalls, 0);
        assert.equal(result.identity_resolution_reason, reason);
        assert.equal(result.identity_resolution_status, status);
        assert.ok(decision.handoff_reason.endsWith(`:${reason}`));
        assert.equal(KENJI_LV5_HYPE_INTERNALS.routeForDecision({}, decision).event, alert);
        assert.doesNotMatch(decision.text, /คิวที่ขอไม่ชน|รายละเอียดครบ/);
      });
    }
    await t.test("no staging row preserves the existing exact-Client policy", async () => {
      reset(); renameRows = [];
      const result = await resolveCanonicalKenjiLineIdentity({ env, event });
      assert.equal(result.resolved, true);
      assert.equal(result.per_rename_status, "not_found");
    });
    await t.test("group events cannot resolve or query identity", async () => {
      reset();
      const result = await resolveCanonicalKenjiLineIdentity({ env, event: { source: { type: "group", userId } } });
      assert.equal(result.resolved, false);
      assert.equal(requests.length, 0);
    });
    await t.test("invalid identity never executes", async () => {
      reset();
      const result = await resolveCanonicalKenjiLineIdentity({ env, event: { source: { type: "user", userId: "invalid" } } });
      assert.equal(result.resolved, false);
      assert.equal(result.reason, "line_user_identity_invalid");
    });
    await t.test("HYPE receives the real failure and HTTP status without credentials or raw LINE ID", async () => {
      const decision = applyKenjiLv5BookingActionToDecision(prepared, canonicalClientRecheckFailure({ status: "unavailable", reason: "airtable_read_failed", http_status: 429 }));
      let body;
      const result = await notifyKenjiLv5Hype({ INTERNAL_TOKEN: "test-secret", TELEGRAM_CHAT_ID: "test-chat", TELEGRAM_WORKER: { async fetch(request) { body = await request.json(); return Response.json({ ok: true }); } } }, event, decision);
      assert.equal(result.sent, true);
      assert.match(body.text, /auth_system_degraded/);
      assert.match(body.text, /airtable_read_failed/);
      assert.match(body.text, /HTTP: 429/);
      assert.ok(!body.text.includes(userId));
      assert.ok(!body.text.includes("test-secret"));
    });
  } finally { globalThis.fetch = original; }
});
