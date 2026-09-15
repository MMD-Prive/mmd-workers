import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPendingClientLinkBody,
  buildPendingIdentityBody,
  hasCanonicalClientLink,
  hasCanonicalModelLink,
  holdPendingClientLinkResponse,
  holdPendingIdentityResponse,
  pendingIdentityStatus,
  shouldCreatePendingClientLink,
  shouldCreatePendingIdentityHold,
} from "./src/sigil-jobs-pending-client-link.js";

const pendingPrivate = {
  operational_create_mode: "pending_client_link",
  visibility: "private",
  job_details: { world: "private", folder: "vip", lane: "gay" },
  client_name: "Client Snapshot",
  model_name: "EMs21 · J Dye",
  model_record_id: "rec12345678901234",
};

test("name-only private client can be recorded as pending client link", () => {
  assert.equal(hasCanonicalClientLink(pendingPrivate), false);
  assert.equal(hasCanonicalModelLink(pendingPrivate), true);
  assert.equal(shouldCreatePendingClientLink(pendingPrivate), true);
  assert.equal(pendingIdentityStatus(pendingPrivate), "pending_client_link");
  const forwarded = buildPendingClientLinkBody(pendingPrivate);
  assert.equal(forwarded.visibility, "pending_private");
  assert.equal(forwarded.job_details.requested_world, "private");
  assert.equal(forwarded.job_details.operational_status, "pending_client_link");
  assert.equal(forwarded.job_details.pending_identity_status, "pending_client_link");
  assert.equal(forwarded.job_details.confirmation_hold, true);
  assert.match(forwarded.note, /MMD_PENDING_IDENTITY_V1/);
});

test("missing Model only uses pending_model_link while core wire hold stays pending_client_link", () => {
  const body = {
    operational_create_mode: "pending_model_link",
    visibility: "public",
    client_record_id: "rec12345678901234",
    client_name: "Canonical Client",
    model_name: "Model Snapshot",
    job_details: { world: "public", folder: "travel", lane: "straight" },
  };
  assert.equal(hasCanonicalClientLink(body), true);
  assert.equal(hasCanonicalModelLink(body), false);
  assert.equal(pendingIdentityStatus(body), "pending_model_link");
  assert.equal(shouldCreatePendingIdentityHold(body), true);
  const forwarded = buildPendingIdentityBody(body);
  assert.equal(forwarded.job_details.operational_status, "pending_client_link");
  assert.equal(forwarded.job_details.pending_identity_status, "pending_model_link");
  assert.equal(forwarded.model.identity_status, "pending_reconcile");
});

test("missing both identities uses pending_identity_link and records snapshots first", () => {
  const body = {
    operational_create_mode: "pending_identity_link",
    visibility: "public",
    client_name: "Client Snapshot",
    model_name: "Model Snapshot",
    job_details: { world: "public", folder: "travel" },
  };
  assert.equal(pendingIdentityStatus(body), "pending_identity_link");
  assert.equal(shouldCreatePendingIdentityHold(body), true);
  const forwarded = buildPendingIdentityBody(body);
  assert.equal(forwarded.client_lineage.identity_status, "pending_reconcile");
  assert.equal(forwarded.model.identity_status, "pending_reconcile");
  assert.match(forwarded.note, /Client \+ Model canonical link pending/);
});

test("current SIGIL Jobs V10 source auto-enters hold even before frontend sends operational mode", () => {
  const body = {
    source: "sigil_jobs_v10",
    page: "/sigil/jobs",
    visibility: "public",
    client_name: "Client Snapshot",
    model_name: "Model Snapshot",
  };
  assert.equal(pendingIdentityStatus(body), "pending_identity_link");
  assert.equal(shouldCreatePendingIdentityHold(body), true);
});

test("unrelated create flows do not auto-enter progressive identity hold", () => {
  const body = {
    source: "internal_admin_create_job_v2",
    page: "/internal/admin/jobs/create-job",
    visibility: "public",
    client_name: "Client Snapshot",
    model_name: "Model Snapshot",
  };
  assert.equal(pendingIdentityStatus(body), "pending_identity_link");
  assert.equal(shouldCreatePendingIdentityHold(body), false);
});

test("lookup hints do not count as canonical Client IDs", () => {
  const hinted = { ...pendingPrivate, line_identity: { line_user_id: "UlookupHintOnly" }, member_email: "hint@example.test" };
  assert.equal(hasCanonicalClientLink(hinted), false);
  assert.equal(shouldCreatePendingClientLink(hinted), true);
});

test("both canonical identities leave the hold lane", () => {
  const linked = {
    ...pendingPrivate,
    client_record_id: "recABCDEFGHIJKLMN",
    model_record_id: "rec12345678901234",
  };
  assert.equal(hasCanonicalClientLink(linked), true);
  assert.equal(hasCanonicalModelLink(linked), true);
  assert.equal(pendingIdentityStatus(linked), "linked");
  assert.equal(shouldCreatePendingIdentityHold(linked), false);
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

test("held response exposes the exact missing-identity status without links", () => {
  const held = holdPendingIdentityResponse({ ok: true, session_id: "sess_2" }, "pending_model_link");
  assert.equal(held.operational_status, "pending_model_link");
  assert.equal(held.confirmations_held, true);
  assert.equal(held.customer_confirmation_url, null);
  assert.equal(held.model_confirmation_url, null);
});
