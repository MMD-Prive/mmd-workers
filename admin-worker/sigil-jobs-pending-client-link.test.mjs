import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPendingClientLinkBody,
  hasCanonicalClientLink,
  holdPendingClientLinkResponse,
  shouldCreatePendingClientLink,
} from "./src/sigil-jobs-pending-client-link.js";

const pendingPrivate = {
  operational_create_mode: "pending_client_link",
  visibility: "private",
  job_details: { world: "private", folder: "vip" },
  client_name: "Client Snapshot",
  model_name: "EMs21 · J Dye",
};

test("name-only private work can be created as pending client link", () => {
  assert.equal(hasCanonicalClientLink(pendingPrivate), false);
  assert.equal(shouldCreatePendingClientLink(pendingPrivate), true);
  const forwarded = buildPendingClientLinkBody(pendingPrivate);
  assert.equal(forwarded.visibility, "pending_private");
  assert.equal(forwarded.job_details.requested_world, "private");
  assert.equal(forwarded.job_details.operational_status, "pending_client_link");
  assert.equal(forwarded.job_details.confirmation_hold, true);
});

test("lookup hints do not block operational creation before canonical Client link", () => {
  const hinted = { ...pendingPrivate, line_identity: { line_user_id: "UlookupHintOnly" }, member_email: "hint@example.test" };
  assert.equal(hasCanonicalClientLink(hinted), false);
  assert.equal(shouldCreatePendingClientLink(hinted), true);
});

test("canonical Client selection never bypasses authoritative private gate", () => {
  const linked = { ...pendingPrivate, client_record_id: "rec12345678901234" };
  assert.equal(hasCanonicalClientLink(linked), true);
  assert.equal(shouldCreatePendingClientLink(linked), false);
});

test("held response never exposes confirmation tokens or urls", () => {
  const held = holdPendingClientLinkResponse({
    ok: true,
    session_id: "sess_1",
    payment_ref: "pay_1",
    customer_t: "secret-customer",
    model_t: "secret-model",
    customer_confirmation_url: "https://example.test/customer?t=secret",
    model_confirmation_url: "https://example.test/model?t=secret",
    raw: { session_id: "sess_1", payment_ref: "pay_1", customer_t: "nested-secret" },
  });
  assert.equal(held.operational_status, "pending_client_link");
  assert.equal(held.confirmations_held, true);
  assert.equal(held.customer_confirmation_url, null);
  assert.equal(held.model_confirmation_url, null);
  assert.equal("customer_t" in held, false);
  assert.equal("model_t" in held, false);
  assert.deepEqual(held.raw, { ok: undefined, session_id: "sess_1", payment_ref: "pay_1", job_id: null, held: true });
});
