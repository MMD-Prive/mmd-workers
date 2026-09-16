import test from "node:test";
import assert from "node:assert/strict";
import {
  buildKenjiLv5BookingDraftPayload,
  evaluateKenjiLv5BookingAction,
  executeKenjiLv5SupervisedAction,
  KENJI_LV5_ACTION_RPC_PATH,
} from "./src/kenji-lv5-supervised-action.js";
import { isKenjiLv5OperationalRpcRequest } from "./src/kenji-lv5-operational-rpc.js";

const context = {
  live_truth_complete: true,
  fan_in: { identity_resolution: "canonical", sources: { entitlement: "verified" } },
  client_360: { canonical_client_id: "recClient123", display_name: "คุณเอ็ม" },
  entitlement_live: { member_blocked: false, lifecycle: "active", private_visibility_envelope: "premium" },
  calendar_live: { status: "available", source: "admin_calendar_live_projection" },
  next_actions: [{ action: "prepare_booking_intent" }, { action: "create_calendar_hold", mode: "supervised" }],
};

const modelAccess = {
  status: "match",
  model: { model_code: "EMs20", working_name: "Rossi" },
  model_access: { record_id: "recModel123", visibility: "private", folder: "premium" },
};

const intent = { model_name: "Rossi", date: "2026-09-20", time: "20:00", location: "สุขุมวิท", line_user_id: "U0123456789abcdef0123456789abcdef" };

test("P4 action RPC remains exact service-only POST surface", () => {
  assert.equal(KENJI_LV5_ACTION_RPC_PATH, "/v1/internal/kenji/actions/execute");
  assert.equal(isKenjiLv5OperationalRpcRequest(KENJI_LV5_ACTION_RPC_PATH, "POST"), true);
  assert.equal(isKenjiLv5OperationalRpcRequest(`${KENJI_LV5_ACTION_RPC_PATH}/extra`, "POST"), false);
  assert.equal(isKenjiLv5OperationalRpcRequest(KENJI_LV5_ACTION_RPC_PATH, "GET"), false);
});

test("P4 permits draft creation only after verified live truth and model lane", () => {
  assert.deepEqual(evaluateKenjiLv5BookingAction(context, modelAccess, intent), { ok: true, reasons: [] });
  assert.equal(evaluateKenjiLv5BookingAction({ ...context, live_truth_complete: false }, modelAccess, intent).ok, false);
  assert.equal(evaluateKenjiLv5BookingAction(context, { ...modelAccess, model_access: null }, intent).ok, false);
  assert.equal(evaluateKenjiLv5BookingAction({ ...context, calendar_live: { status: "unavailable" } }, modelAccess, intent).ok, false);
});

test("P4 booking payload is a SIGIL draft with canonical evidence and no payment mutation", () => {
  const payload = buildKenjiLv5BookingDraftPayload({
    context,
    modelAccess,
    intent,
    actionId: "line:message-123:user",
    refs: { booking_ref: "kenji_abc123", session_id: "kreq_abc123", idempotency_key: "a".repeat(64) },
  });
  assert.equal(payload.source, "kenji_lv5_p4");
  assert.equal(payload.request_status, "draft");
  assert.equal(payload.lane, "private");
  assert.equal(payload.selected_model_id, "recModel123");
  assert.equal(payload.resolver_payload_json.canonical_client_id, "recClient123");
  assert.equal(payload.resolver_payload_json.live_truth_complete, true);
  assert.equal(Object.hasOwn(payload, "payment"), false);
  assert.equal(Object.hasOwn(payload, "amount_thb"), false);
  assert.deepEqual(payload.resolver_payload_json.protected_actions_pending, ["assign_model", "create_calendar_hold", "confirm_payment", "confirm_job"]);
});

test("P4 refuses protected mutations without touching backends", async () => {
  const result = await executeKenjiLv5SupervisedAction({}, { action: "confirm_payment" });
  assert.equal(result.ok, false);
  assert.equal(result.status, "supervision_required");
  assert.equal(result.executed, false);
  assert.equal(result.authority, "canonical_backend_and_per");
});
