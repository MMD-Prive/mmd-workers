import { getPublicMembershipPackage } from "../shared/payment-intelligence.mjs";
import { RED_CARD_INTENT_PATH, RED_CARD_CHECKOUT_MARKER, RED_CARD_SESSION, AIRTABLE_RECORD } from "../shared/red-card-purchase-contract.mjs";
import { constantTimeEqual } from "./lib/payment-primitives.js";
import { handleUnifiedPaymentIntent, stablePaymentRef } from "./unified-payment-proof.js";

const packageItem = getPublicMembershipPackage("red_card");
const allowedKeys = new Set(["session_id", "previous_session_id", "payment_stage", "amount", "package_code", "member_record_id"]);

function json(body, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export function isRedCardCheckoutPath(path, method) {
  return path === RED_CARD_INTENT_PATH && method === "POST";
}

export async function handleRedCardCheckout(request, env) {
  const secret = String(env.AUTH_SERVICE_MEMBER_TO_PAYMENTS || "").trim();
  if (secret.length < 32 || !(await constantTimeEqual(request.headers.get("x-internal-token"), secret))) {
    return json({ ok: false, error: "service_auth_required" }, 401);
  }
  const input = await request.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !allowedKeys.has(key))
    || typeof input.session_id !== "string" || !RED_CARD_SESSION.test(input.session_id)
    || typeof input.previous_session_id !== "string" || !RED_CARD_SESSION.test(input.previous_session_id) || input.previous_session_id === input.session_id
    || input.payment_stage !== "membership" || input.package_code !== "red_card" || input.amount !== packageItem.amount_thb
    || typeof input.member_record_id !== "string" || !AIRTABLE_RECORD.test(input.member_record_id)) {
    return json({ ok: false, error: "red_card_checkout_context_invalid" }, 400);
  }
  const { session_id: sessionId, member_record_id: memberRecordId } = input;
  const ref = await stablePaymentRef(sessionId, "membership");
  const priorRef = await stablePaymentRef(input.previous_session_id, "membership");
  try {
    await ensurePendingLinkedOrder(env, sessionId, ref, memberRecordId, priorRef);
    // Token and JSON are constructed without the member identity. The order is
    // committed and read back before the customer can obtain its payment link.
    return handleUnifiedPaymentIntent(new Request(request.url, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, payment_stage: "membership", package_code: "red_card", payment_ref: ref }),
    }), env, () => json({ ok: true, session_id: sessionId, payment_ref: ref }));
  } catch (error) {
    const conflict = error?.status === 409;
    return json({ ok: false, error: conflict ? error.message : "red_card_order_unavailable" }, conflict ? 409 : 503);
  }
}

function canonicalFields(env) {
  return {
    ref: [env.AT_PAYMENTS__PAYMENT_REF || "Payment Reference", "Payment Reference"],
    amount: [env.AT_PAYMENTS__AMOUNT || "Amount", "Amount"],
    package: [env.AT_PAYMENTS__PACKAGE_CODE || "Package Code", "Package Code"],
    stage: [env.AT_PAYMENTS__PAYMENT_STAGE || "payment_stage", "payment_stage"],
    session: [env.AT_PAYMENTS__SESSION_ID || "session_id", "session_id"],
    notes: [env.AT_PAYMENTS__NOTES || "Notes", "Notes"],
    member: ["Member", "Member"],
    status: [env.AT_PAYMENTS__PAYMENT_STATUS || "Payment Status", "Payment Status"],
    verification: [env.AT_PAYMENTS__VERIFICATION_STATUS || "Verification Status", "Verification Status"],
  };
}

async function airtable(env, url, init) {
  const request = new Request(url, {
    ...init, redirect: "error", signal: AbortSignal.timeout(4000),
    headers: { authorization: "Bearer " + env.AIRTABLE_API_KEY, "content-type": "application/json" },
  });
  const response = await (env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(request) : fetch(request));
  if (!response.ok) throw new Error("red_card_airtable_unavailable");
  return response.json();
}

async function ensurePendingLinkedOrder(env, sessionId, ref, memberRecordId, priorRef) {
  if (!env.AIRTABLE_BASE_ID || !env.AIRTABLE_API_KEY) throw new Error("red_card_airtable_unavailable");
  const url = "https://api.airtable.com/v0/" + encodeURIComponent(env.AIRTABLE_BASE_ID) + "/" +
    encodeURIComponent(env.AIRTABLE_TABLE_PAYMENTS_ID || env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ");
  const fields = canonicalFields(env);
  const proofUrl = "https://api.airtable.com/v0/" + encodeURIComponent(env.AIRTABLE_BASE_ID) + "/" +
    encodeURIComponent(env.AIRTABLE_TABLE_PAYMENT_PROOFS || env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || "tblfJfM4Sqag9zrLi");
  const cell = (row, key) => row?.fields?.[fields[key][0]] ?? row?.fields?.[fields[key][1]];
  const reviewNeeded = error => Object.assign(new Error(error), { status: 409 });
  async function assertCanIssue(row) {
    const state = String(cell(row, "status") || "").trim().toLowerCase();
    const verification = String(cell(row, "verification") || "").trim().toLowerCase();
    if (["paid", "verified", "success", "confirmed"].includes(state) || verification === "verified") {
      throw reviewNeeded("red_card_order_already_paid");
    }
    if ((state && state !== "pending") ||
      (verification && !["pending", "pending_review", "pending_verification"].includes(verification))) {
      throw reviewNeeded("red_card_order_review_required");
    }
    const query = new URLSearchParams({ filterByFormula: "{payment_ref}='" + ref + "'", maxRecords: "1" });
    const proof = await airtable(env, proofUrl + "?" + query, { method: "GET" });
    if (!Array.isArray(proof.records)) throw new Error("red_card_proof_unavailable");
    if (proof.records.length || proof.offset) throw reviewNeeded("red_card_order_proof_already_received");
  }
  const truth = { ref, amount: packageItem.amount_thb, package: "red_card", stage: "membership", session: sessionId, notes: RED_CARD_CHECKOUT_MARKER, member: [memberRecordId] };
  const matches = row => row?.id && Object.entries(truth).every(([key, expected]) => {
    const actual = cell(row, key);
    // Notes also acquire operational annotations later; the dedicated field for
    // identity is the Member relation, never free text.
    if (key === "notes") return true; // Official Verify replaces notes; the Member link survives.
    return Array.isArray(expected) ? Array.isArray(actual) && actual.length === 1 && actual[0] === expected[0] : actual === expected;
  });
  const read = (lookupRef = ref) => {
    const query = new URLSearchParams({ filterByFormula: "{Payment Reference}='" + lookupRef + "'", maxRecords: "2" });
    return airtable(env, url + "?" + query, { method: "GET" });
  };
  // A historical order's opaque ref follows the verified LINE identity, but
  // does not prove its beneficiary. Never attach or reissue it, and don't
  // invite another transfer while it exists (even if it still says pending).
  const prior = await read(priorRef);
  if (!Array.isArray(prior.records) || prior.offset || prior.records.length) {
    throw Object.assign(new Error("red_card_prior_order_review_required"), { status: 409 });
  }
  const conflict = () => Object.assign(new Error("red_card_order_identity_conflict"), { status: 409 });
  const before = await read();
  if (!Array.isArray(before.records) || before.offset || before.records.length > 1) throw conflict();
  if (before.records.length) {
    if (!matches(before.records[0])) throw conflict();
    await assertCanIssue(before.records[0]);
    return;
  }
  const write = Object.fromEntries(Object.entries(truth).map(([key, value]) => [fields[key][0], value]));
  // Do not reset status or verification on an idempotent retry. Only the
  // service-authenticated deterministic member + session can mint this ref.
  await airtable(env, url, { method: "PATCH", body: JSON.stringify({
    performUpsert: { fieldsToMergeOn: [fields.ref[0]] }, records: [{ fields: write }], typecast: false,
  }) });
  const after = await read();
  if (!Array.isArray(after.records) || after.offset || after.records.length !== 1 || !matches(after.records[0])) throw conflict();
  await assertCanIssue(after.records[0]);
}

// This is called only after reviewed-proof service authentication and canonical
// order validation, before the trusted notifier can mark money truth Paid.
export async function verifyBoundRedCardReview(env, order, input) {
  const fields = order?.fields || {};
  const notes = fields[env.AT_PAYMENTS__NOTES] ?? fields.Notes;
  if (input.packageCode !== "red_card" || !String(notes || "").includes(RED_CARD_CHECKOUT_MARKER)) return false;
  const conflict = () => Object.assign(new Error("red_card_order_member_binding_mismatch"), { status: 409 });
  const link = fields.Member;
  if (!Array.isArray(link) || link.length !== 1 || !AIRTABLE_RECORD.test(link[0]) ||
      link[0] !== input.memberRecordId || !input.memberId || !input.memberEmail) throw conflict();

  const table = env.AIRTABLE_TABLE_MEMBERS_ID || env.AIRTABLE_TABLE_MEMBERS || "tblgWc5VRon5o8Mhk";
  const url = "https://api.airtable.com/v0/" + encodeURIComponent(env.AIRTABLE_BASE_ID) + "/" + encodeURIComponent(table);
  const address = JSON.stringify(input.memberEmail);
  const query = new URLSearchParams({
    filterByFormula: `OR(LOWER({Contact Email}&"")=${address},LOWER({email}&"")=${address})`,
    maxRecords: "2",
  });
  const result = await airtable(env, url + "?" + query, { method: "GET" });
  if (result.offset || !Array.isArray(result.records) || result.records.length !== 1) throw conflict();
  const [member] = result.records;
  const contacts = [...new Set([member.fields?.["Contact Email"], member.fields?.email].filter(Boolean).map(value => String(value).trim().toLowerCase()))];
  if (member.id !== link[0] || member.fields?.member_id !== input.memberId ||
      contacts.length !== 1 || contacts[0] !== input.memberEmail) throw conflict();
  return true;
}
