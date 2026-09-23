/**
 * MMD Analytics Canon v2
 * Phase 3B — Analytics Canon + Owner Dashboard
 *
 * Intent and business truth are deliberately separated:
 * - client/browser identity is used only for intent funnels;
 * - server authority identity is record/session scoped and cannot be joined to browser people;
 * - cross-layer ratios are volumes, never person conversion rates, until an explicit safe join key exists.
 */

export const ANALYTICS_SCHEMA = "mmd_analytics_canon_v2";

export const EVENTS = Object.freeze({
  PROFILE_VIEWED: "profile_viewed",
  BOOKING_STARTED: "booking_started",
  BOOKING_RECEIVED: "booking_received",

  PAYMENT_STARTED: "payment_started",
  PAYMENT_VERIFIED: "payment_verified",

  MEMBERSHIP_ACTIVATED: "membership_activated",

  MY_MMD_LOGIN_STARTED: "my_mmd_login_started",
  MY_MMD_SESSION_STARTED: "my_mmd_session_started",

  MMS_PREBOOKING_RECEIVED: "mms_prebooking_received",
  SHOP_ORDER_CREATED: "shop_order_created",
  PARTNER_TERMS_ACCEPTED: "partner_terms_accepted",

  ANALYTICS_RUNTIME_HEALTH: "analytics_runtime_health",
});

export const IDENTITY_POLICY = Object.freeze({
  intent_identity: "posthog_client_person",
  business_truth_identity: "mmd_authority_record_hash",
  cross_layer_person_join: "forbidden_without_explicit_safe_join_key",
  cross_layer_rate_label: "not_a_conversion_rate",
});

export const LANES = Object.freeze({
  public_booking: Object.freeze({
    label: "Public → Booking",
    intent: [EVENTS.PROFILE_VIEWED, EVENTS.BOOKING_STARTED],
    truth: [EVENTS.BOOKING_RECEIVED, EVENTS.PAYMENT_VERIFIED],
    truth_flow: Object.freeze({ booking: "booking_intake", payment: "booking_payment" }),
  }),
  membership: Object.freeze({
    label: "Membership",
    intent_routes: ["/member/membership", "/pay/membership"],
    truth: [EVENTS.PAYMENT_VERIFIED, EVENTS.MEMBERSHIP_ACTIVATED],
    truth_flow: Object.freeze({ payment: "membership_payment", activation: "membership_activation" }),
  }),
  my_mmd: Object.freeze({
    label: "MY MMD",
    intent_routes: ["/member/login"],
    intent: [EVENTS.MY_MMD_LOGIN_STARTED],
    truth: [EVENTS.MY_MMD_SESSION_STARTED],
    truth_flow: Object.freeze({ session: "my_mmd_login" }),
  }),
  mms: Object.freeze({
    label: "MMS",
    intent_routes: ["/male-massage/home", "/male-massage/member/mms-booking"],
    truth: [EVENTS.MMS_PREBOOKING_RECEIVED, EVENTS.PAYMENT_VERIFIED],
    truth_flow: Object.freeze({ prebooking: "mms_prebooking", payment: "mms_payment" }),
  }),
  shop: Object.freeze({
    label: "Shop",
    intent_routes: ["/mmd-shop", "/shop", "/mmd-shop/order"],
    truth: [EVENTS.SHOP_ORDER_CREATED, EVENTS.PAYMENT_VERIFIED],
    truth_flow: Object.freeze({ order: "shop_checkout", payment: "shop_payment" }),
  }),
  partner: Object.freeze({
    label: "Partner",
    intent_routes: ["/partner", "/partner/terms"],
    truth: [EVENTS.PARTNER_TERMS_ACCEPTED],
    truth_flow: Object.freeze({ terms: "partner_onboarding" }),
  }),
});

export const INTENT_FUNNELS = Object.freeze({
  PUBLIC_PROFILE_TO_BOOKING_START: Object.freeze({
    layer: "intent",
    joinable: true,
    identity: IDENTITY_POLICY.intent_identity,
    steps: [EVENTS.PROFILE_VIEWED, EVENTS.BOOKING_STARTED],
    order: "ordered",
    window_days: 14,
  }),
  MY_MMD_LOGIN_INTENT: Object.freeze({
    layer: "intent",
    joinable: true,
    identity: IDENTITY_POLICY.intent_identity,
    steps: ["$pageview:/member/login", EVENTS.MY_MMD_LOGIN_STARTED],
    order: "ordered",
    window_days: 1,
  }),
  PARTNER_ENTRY_TO_TERMS: Object.freeze({
    layer: "intent",
    joinable: true,
    identity: IDENTITY_POLICY.intent_identity,
    steps: ["$pageview:/partner", "$pageview:/partner/terms"],
    order: "ordered",
    window_days: 14,
  }),
});

export const BUSINESS_TRUTH_METRICS = Object.freeze({
  booking_received: Object.freeze({ event: EVENTS.BOOKING_RECEIVED, flow: "booking_intake", aggregation: "count" }),
  payment_verified: Object.freeze({ event: EVENTS.PAYMENT_VERIFIED, aggregation: "count" }),
  payment_verified_thb: Object.freeze({ event: EVENTS.PAYMENT_VERIFIED, aggregation: "sum", property: "amount_thb", currency: "THB" }),
  membership_activated: Object.freeze({ event: EVENTS.MEMBERSHIP_ACTIVATED, flow: "membership_activation", aggregation: "count" }),
  my_mmd_session_started: Object.freeze({ event: EVENTS.MY_MMD_SESSION_STARTED, flow: "my_mmd_login", aggregation: "count" }),
  mms_prebooking_received: Object.freeze({ event: EVENTS.MMS_PREBOOKING_RECEIVED, flow: "mms_prebooking", aggregation: "count" }),
  shop_order_created: Object.freeze({ event: EVENTS.SHOP_ORDER_CREATED, flow: "shop_checkout", aggregation: "count" }),
  partner_terms_accepted: Object.freeze({ event: EVENTS.PARTNER_TERMS_ACCEPTED, flow: "partner_onboarding", aggregation: "count" }),
});

export const OPERATIONAL_HEALTH = Object.freeze({
  event: EVENTS.ANALYTICS_RUNTIME_HEALTH,
  window_hours: 24,
  required_authorities: Object.freeze([
    "sigil-booking-worker",
    "payments-worker",
    "member-pages-worker",
    "mms-worker",
    "himai-chat-worker",
    "partners-worker",
  ]),
});

export const OWNER_DASHBOARD = Object.freeze({
  schema: "mmd.owner_analytics_dashboard.v1",
  title: "MMD Owner — Intent & Business Truth",
  default_window_days: 30,
  compare_days: 7,
  sections: Object.freeze(["intent", "business_truth", "operational_health"]),
  posthog_project_id: 621022,
});

export const DEPRECATED_EVENT_ALIASES = Object.freeze({
  booking_submitted: EVENTS.BOOKING_RECEIVED,
  payment_completed: EVENTS.PAYMENT_VERIFIED,
});

export function canonicalEventName(name = "") {
  const value = String(name || "").trim();
  return DEPRECATED_EVENT_ALIASES[value] || value;
}

export function isCrossLayerPersonConversionAllowed() {
  return false;
}
