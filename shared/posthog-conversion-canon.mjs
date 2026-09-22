/**
 * MMD Analytics Canon v1
 * Phase 3 — Analytics Canon + Owner Dashboard
 *
 * Rules:
 * - Do not create synonyms for the same business fact.
 * - Browser intent events may precede server authority events.
 * - Server authority events are the source of truth for completed business facts.
 * - Payment completion canon is payment_verified, not a duplicate payment_completed event.
 * - Booking submission canon is booking_received, not a duplicate booking_submitted event.
 */

export const ANALYTICS_SCHEMA = "mmd_analytics_canon_v1";

export const EVENTS = Object.freeze({
  // Public / Booking
  PROFILE_VIEWED: "profile_viewed",
  BOOKING_STARTED: "booking_started",
  BOOKING_SUBMITTED: "booking_received",

  // Payment
  PAYMENT_STARTED: "payment_started",
  PAYMENT_COMPLETED: "payment_verified",

  // Membership
  MEMBERSHIP_ACTIVATED: "membership_activated",

  // MY MMD
  MY_MMD_SESSION_STARTED: "my_mmd_session_started",

  // MMS
  MMS_BOOKING_SUBMITTED: "mms_prebooking_received",

  // Shop
  SHOP_ORDER_CREATED: "shop_order_created",

  // Partner
  PARTNER_TERMS_ACCEPTED: "partner_terms_accepted",

  // Operational health — never use as a conversion
  ANALYTICS_RUNTIME_HEALTH: "analytics_runtime_health",
});

export const FUNNELS = Object.freeze({
  PUBLIC_TO_PAYMENT: [
    EVENTS.PROFILE_VIEWED,
    EVENTS.BOOKING_STARTED,
    EVENTS.BOOKING_SUBMITTED,
    EVENTS.PAYMENT_STARTED,
    EVENTS.PAYMENT_COMPLETED,
  ],
  MEMBERSHIP: [
    "$pageview:/member/membership",
    EVENTS.PAYMENT_STARTED,
    EVENTS.PAYMENT_COMPLETED,
    EVENTS.MEMBERSHIP_ACTIVATED,
  ],
  MY_MMD: [
    "$pageview:/member/login",
    EVENTS.MY_MMD_SESSION_STARTED,
  ],
  MMS: [
    "$pageview:/male-massage/home",
    EVENTS.MMS_BOOKING_SUBMITTED,
    EVENTS.PAYMENT_STARTED,
    EVENTS.PAYMENT_COMPLETED,
  ],
  SHOP: [
    "$pageview:/mmd-shop",
    EVENTS.SHOP_ORDER_CREATED,
    EVENTS.PAYMENT_STARTED,
    EVENTS.PAYMENT_COMPLETED,
  ],
  PARTNER: [
    "$pageview:/partner/referral",
    EVENTS.PARTNER_TERMS_ACCEPTED,
  ],
});

export const DEPRECATED_EVENT_ALIASES = Object.freeze({
  booking_submitted: EVENTS.BOOKING_SUBMITTED,
  payment_completed: EVENTS.PAYMENT_COMPLETED,
});

export function canonicalEventName(name = "") {
  const value = String(name || "").trim();
  return DEPRECATED_EVENT_ALIASES[value] || value;
}
