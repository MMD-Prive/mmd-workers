#!/usr/bin/env node

import assert from "node:assert/strict";
import test from "node:test";

import {
  MODEL_SESSION_ALLOWED_ACTIONS,
  MODEL_SESSION_CONTRACT_VERSION,
  MODEL_SESSION_HARD_RULES,
  MODEL_SESSION_STATES,
  MODEL_SESSION_TRANSITIONS,
  getAllowedModelSessionActions,
  isModelSessionActionVisible,
  normalizeSessionState,
  resolveModelSessionPage,
  resolveModelSessionTransition,
} from "./src/modelSessionContractV1.js";

test("declares canonical model session states in contract order", () => {
  assert.equal(MODEL_SESSION_CONTRACT_VERSION, "model_session_contract_v1");
  assert.deepEqual(MODEL_SESSION_STATES, [
    "offered",
    "offer_declined",
    "offer_expired",
    "confirmed",
    "en_route",
    "nearby",
    "arrived",
    "met_customer",
    "final_payment_pending",
    "final_payment_confirmed",
    "work_started",
    "work_finished",
    "separated",
    "under_review",
    "payout_pending",
    "closed",
  ]);
});

test("normalizes MMD canonical aliases without changing the canonical state list", () => {
  const cases = {
    assigned: "confirmed",
    traveling: "en_route",
    met: "met_customer",
    met_client: "met_customer",
    payment_pending: "final_payment_pending",
    payment_confirmed: "final_payment_confirmed",
    working: "work_started",
    finished: "work_finished",
    review: "under_review",
    payout: "payout_pending",
    "Final Payment Confirmed": "final_payment_confirmed",
    "on-the-way": "",
  };

  for (const [input, expected] of Object.entries(cases)) {
    assert.equal(normalizeSessionState(input), expected, input);
  }

  assert.equal(MODEL_SESSION_STATES.includes("assigned"), false);
  assert.equal(MODEL_SESSION_STATES.includes("traveling"), false);
  assert.equal(MODEL_SESSION_STATES.includes("working"), false);
});

test("resolves model session page ownership from canonical states and aliases", () => {
  assert.deepEqual(resolveModelSessionPage("offered"), {
    path: "/model/session/offered",
    state: "offered",
    states: ["offered", "offer_declined", "offer_expired"],
  });
  assert.equal(resolveModelSessionPage("assigned").path, "/model/session/assigned");
  assert.equal(resolveModelSessionPage("traveling").path, "/model/session/on-the-way");
  assert.equal(resolveModelSessionPage("nearby").path, "/model/session/on-the-way");
  assert.equal(resolveModelSessionPage("arrived").path, "/model/session/arrival-payment");
  assert.equal(resolveModelSessionPage("payment_confirmed").path, "/model/session/arrival-payment");
  assert.equal(resolveModelSessionPage("working").path, "/model/session/session-live");
  assert.equal(resolveModelSessionPage("payout").path, "/model/session/wrap-up");
  assert.equal(resolveModelSessionPage("unknown_state"), null);
});

test("keeps allowed actions as UI hints and only shows Start Work at final_payment_confirmed", () => {
  for (const state of MODEL_SESSION_STATES) {
    const actions = getAllowedModelSessionActions(state);
    assert.deepEqual(actions, MODEL_SESSION_ALLOWED_ACTIONS[state] || []);
    assert.equal(actions.includes("start_work"), state === "final_payment_confirmed", state);
  }

  assert.equal(isModelSessionActionVisible("final_payment_confirmed", "start_work"), true);
  assert.equal(isModelSessionActionVisible("final_payment_pending", "start_work"), false);
  assert.equal(isModelSessionActionVisible("met_customer", "start_work"), false);
  assert.equal(MODEL_SESSION_HARD_RULES.allowedActionsAreUiHintsOnly, true);
});

test("defines future transition table with hard Start Work gate", () => {
  assert.deepEqual(MODEL_SESSION_TRANSITIONS.start_work.from, ["final_payment_confirmed"]);
  assert.equal(MODEL_SESSION_TRANSITIONS.start_work.to, "work_started");
  assert.deepEqual(MODEL_SESSION_TRANSITIONS.start_work.requires, [
    "current_state_recheck",
    "payments_worker_live_check",
  ]);
  assert.equal(MODEL_SESSION_HARD_RULES.postTransitionMustRecheckServerState, true);
  assert.equal(MODEL_SESSION_HARD_RULES.startWorkRequiresPaymentsWorkerLiveCheck, true);
});

test("future transition resolver rejects start_work unless current state is final_payment_confirmed", () => {
  for (const state of MODEL_SESSION_STATES.filter((item) => item !== "final_payment_confirmed")) {
    const result = resolveModelSessionTransition("start_work", state);
    assert.equal(result.ok, false, state);
    assert.equal(result.reason, "invalid_current_state", state);
  }

  assert.deepEqual(resolveModelSessionTransition("start_work", "final_payment_confirmed"), {
    ok: true,
    action: "start_work",
    from: "final_payment_confirmed",
    to: "work_started",
    requires: ["current_state_recheck", "payments_worker_live_check"],
  });
});

test("records future signed-link and Flash constraints without implementing issuers", () => {
  assert.equal(MODEL_SESSION_HARD_RULES.telegramLinksRequireShortLivedSignedLinks, true);
  assert.equal(MODEL_SESSION_HARD_RULES.flashUnlockMustNotUseSlipProofAlone, true);
});
