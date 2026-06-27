export const MODEL_SESSION_CONTRACT_VERSION = "model_session_contract_v1";

export const MODEL_SESSION_STATES = Object.freeze([
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

export const MODEL_SESSION_STATE_SET = new Set(MODEL_SESSION_STATES);

export const MODEL_SESSION_STATE_ALIASES = Object.freeze({
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
});

export const MODEL_SESSION_ACTION_ALIASES = Object.freeze({
  go_en_route: "start_travel",
  accept_offer: "accept_job",
  decline_offer: "decline_job",
  finish_work: "mark_work_finished",
  mark_separated: "confirm_separated",
});

export const MODEL_SESSION_PAGE_OWNERSHIP = Object.freeze([
  Object.freeze({
    path: "/model/session/offered",
    states: Object.freeze(["offered", "offer_declined", "offer_expired"]),
  }),
  Object.freeze({
    path: "/model/session/assigned",
    states: Object.freeze(["confirmed"]),
  }),
  Object.freeze({
    path: "/model/session/on-the-way",
    states: Object.freeze(["en_route", "nearby"]),
  }),
  Object.freeze({
    path: "/model/session/arrival-payment",
    states: Object.freeze(["arrived", "met_customer", "final_payment_pending", "final_payment_confirmed"]),
  }),
  Object.freeze({
    path: "/model/session/session-live",
    states: Object.freeze(["work_started"]),
  }),
  Object.freeze({
    path: "/model/session/wrap-up",
    states: Object.freeze(["work_finished", "separated", "under_review", "payout_pending", "closed"]),
  }),
]);

export const MODEL_SESSION_ALLOWED_ACTIONS = Object.freeze({
  offered: Object.freeze(["accept_job", "decline_job"]),
  offer_declined: Object.freeze([]),
  offer_expired: Object.freeze([]),
  confirmed: Object.freeze(["start_travel"]),
  en_route: Object.freeze(["mark_nearby", "mark_arrived", "send_eta"]),
  nearby: Object.freeze(["mark_arrived", "send_eta"]),
  arrived: Object.freeze(["mark_met_customer", "report_delay"]),
  met_customer: Object.freeze(["mark_final_payment_pending", "request_payment_check"]),
  final_payment_pending: Object.freeze(["request_payment_check"]),
  final_payment_confirmed: Object.freeze(["start_work"]),
  work_started: Object.freeze(["mark_work_finished", "emergency"]),
  work_finished: Object.freeze(["confirm_separated"]),
  separated: Object.freeze(["request_review"]),
  under_review: Object.freeze(["mark_payout_pending"]),
  payout_pending: Object.freeze(["close_session"]),
  closed: Object.freeze([]),
});

export const MODEL_SESSION_TRANSITIONS = Object.freeze({
  accept_job: Object.freeze({
    from: Object.freeze(["offered"]),
    to: "confirmed",
  }),
  decline_job: Object.freeze({
    from: Object.freeze(["offered"]),
    to: "offer_declined",
  }),
  expire_offer: Object.freeze({
    from: Object.freeze(["offered"]),
    to: "offer_expired",
  }),
  start_travel: Object.freeze({
    from: Object.freeze(["confirmed"]),
    to: "en_route",
  }),
  mark_nearby: Object.freeze({
    from: Object.freeze(["en_route"]),
    to: "nearby",
  }),
  mark_arrived: Object.freeze({
    from: Object.freeze(["en_route", "nearby"]),
    to: "arrived",
  }),
  mark_met_customer: Object.freeze({
    from: Object.freeze(["arrived"]),
    to: "met_customer",
  }),
  mark_final_payment_pending: Object.freeze({
    from: Object.freeze(["met_customer"]),
    to: "final_payment_pending",
  }),
  confirm_final_payment: Object.freeze({
    from: Object.freeze(["met_customer", "final_payment_pending"]),
    to: "final_payment_confirmed",
    requires: Object.freeze(["backend_official_payment_confirmation"]),
  }),
  start_work: Object.freeze({
    from: Object.freeze(["final_payment_confirmed"]),
    to: "work_started",
    requires: Object.freeze(["current_state_recheck", "payments_worker_live_check"]),
  }),
  mark_work_finished: Object.freeze({
    from: Object.freeze(["work_started"]),
    to: "work_finished",
  }),
  confirm_separated: Object.freeze({
    from: Object.freeze(["work_finished"]),
    to: "separated",
  }),
  request_review: Object.freeze({
    from: Object.freeze(["separated"]),
    to: "under_review",
  }),
  mark_payout_pending: Object.freeze({
    from: Object.freeze(["under_review"]),
    to: "payout_pending",
  }),
  close_session: Object.freeze({
    from: Object.freeze(["payout_pending"]),
    to: "closed",
  }),
});

export const MODEL_SESSION_HARD_RULES = Object.freeze({
  startWorkVisibleOnlyInState: "final_payment_confirmed",
  allowedActionsAreUiHintsOnly: true,
  postTransitionMustRecheckServerState: true,
  startWorkRequiresPaymentsWorkerLiveCheck: true,
  telegramLinksRequireShortLivedSignedLinks: true,
  flashUnlockMustNotUseSlipProofAlone: true,
});

function normalizeInput(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeModelSessionAction(value) {
  const action = normalizeInput(value);
  return MODEL_SESSION_ACTION_ALIASES[action] || action;
}

export function normalizeSessionState(value) {
  const state = normalizeInput(value);
  if (!state) return "";
  if (MODEL_SESSION_STATE_SET.has(state)) return state;
  return MODEL_SESSION_STATE_ALIASES[state] || "";
}

export function resolveModelSessionPage(value) {
  const state = normalizeSessionState(value);
  if (!state) return null;

  const page = MODEL_SESSION_PAGE_OWNERSHIP.find((entry) => entry.states.includes(state));
  if (!page) return null;

  return {
    path: page.path,
    state,
    states: [...page.states],
  };
}

export function getAllowedModelSessionActions(value) {
  const state = normalizeSessionState(value);
  return state ? [...(MODEL_SESSION_ALLOWED_ACTIONS[state] || [])] : [];
}

export function isModelSessionActionVisible(value, action) {
  return getAllowedModelSessionActions(value).includes(normalizeModelSessionAction(action));
}

export function resolveModelSessionTransition(action, currentState) {
  const actionKey = normalizeModelSessionAction(action);
  const transition = MODEL_SESSION_TRANSITIONS[actionKey];
  const state = normalizeSessionState(currentState);

  if (!transition || !state) {
    return { ok: false, reason: "unknown_transition", action: actionKey, state };
  }

  if (!transition.from.includes(state)) {
    return {
      ok: false,
      reason: "invalid_current_state",
      action: actionKey,
      state,
      required_states: [...transition.from],
    };
  }

  return {
    ok: true,
    action: actionKey,
    from: state,
    to: transition.to,
    requires: [...(transition.requires || [])],
  };
}
