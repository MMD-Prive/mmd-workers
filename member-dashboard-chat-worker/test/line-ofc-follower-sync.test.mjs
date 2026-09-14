import test from "node:test";
import assert from "node:assert/strict";
import { LINE_OFC_FOLLOWER_SYNC_INTERNALS as I } from "../src/line-ofc-follower-sync.mjs";

test("new LINE OFC follower creates identity-only Client fields", () => {
  const uid = "U1234567890abcdef1234567890abcdef";
  const fields = I.newClientFields(uid, "  Boss  Test  ", "ok");
  assert.equal(fields[I.FIELDS.lineUserId], uid);
  assert.equal(fields[I.FIELDS.clientName], "Boss Test");
  assert.equal(fields[I.FIELDS.displayName], "Boss Test");
  assert.equal(fields[I.FIELDS.source], "line_ofc_follower_sync_v1");
  assert.equal(fields[I.FIELDS.channel], "LINE OFC");
  assert.match(fields[I.FIELDS.notes], /LINE_OFC_FOLLOWER_SYNC_V1/);
});

test("missing LINE profile uses stable non-sensitive placeholder", () => {
  const uid = "Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  assert.equal(I.placeholderName(uid), "LINE-aaaaaaaa");
  const fields = I.newClientFields(uid, "", "http_404");
  assert.equal(fields[I.FIELDS.clientName], "LINE-aaaaaaaa");
});

test("existing canonical names are never overwritten by LINE profile", () => {
  const uid = "Ubbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const record = { fields: {
    [I.FIELDS.clientName]: "Per Canonical",
    [I.FIELDS.mmdClientName]: "Per Canonical",
    [I.FIELDS.nickname]: "Per",
    [I.FIELDS.displayName]: "Per Canonical",
    [I.FIELDS.lineUserId]: uid,
    [I.FIELDS.source]: "owner_reviewed",
    [I.FIELDS.channel]: "LINE OFC",
  } };
  assert.deepEqual(I.existingClientPatch(record, uid, "New LINE Name"), {});
});

test("blank names may be filled from current LINE profile", () => {
  const uid = "Ucccccccccccccccccccccccccccccccc";
  const record = { fields: { [I.FIELDS.lineUserId]: uid, [I.FIELDS.source]: "existing" } };
  const patch = I.existingClientPatch(record, uid, "Official Name");
  assert.equal(patch[I.FIELDS.clientName], "Official Name");
  assert.equal(patch[I.FIELDS.displayName], "Official Name");
  assert.equal(patch[I.FIELDS.source], undefined);
  assert.equal(patch[I.FIELDS.channel], "LINE OFC");
});

test("duplicate exact LINE IDs remain detectable for human review", () => {
  const uid = "Udddddddddddddddddddddddddddddddd";
  const indexed = I.indexClientsByLine([
    { id: "rec1", fields: { [I.FIELDS.lineUserId]: uid } },
    { id: "rec2", fields: { [I.FIELDS.lineUserId]: uid } },
  ]);
  assert.equal(indexed.get(uid).length, 2);
});

test("sync receipt is count-only and contains no LINE user IDs", () => {
  const fields = I.buildReceiptFields(
    "line_ofc_follower_sync_v1_2026-09-14T08:00:00.000Z",
    "2026-09-14T08:00:00.000Z",
    {
      ok: true,
      supported: true,
      followers_returned: 420,
      pages: 1,
      clients_scanned: 347,
      already_canonical: 340,
      missing_clients: 7,
      clients_created: 7,
      clients_updated: 2,
      duplicate_line_identity_review: 0,
      profiles_requested: 9,
      profile_errors: 0,
      completed_at: "2026-09-14T08:00:03.000Z",
    },
  );
  assert.equal(fields[I.RECEIPT_FIELDS.status], "success");
  assert.equal(fields[I.RECEIPT_FIELDS.followersReturned], 420);
  assert.equal(fields[I.RECEIPT_FIELDS.clientsCreated], 7);
  assert.equal(fields[I.RECEIPT_FIELDS.source], "line_ofc_follower_sync_v1");
  assert.doesNotMatch(JSON.stringify(fields), /U[0-9a-f]{32}/i);
});

test("unsupported follower API persists a skipped count-only receipt", () => {
  const fields = I.buildReceiptFields("run-1", "2026-09-14T08:00:00.000Z", {
    ok: true,
    skipped: true,
    supported: false,
    reason: "followers_endpoint_requires_verified_or_premium_oa",
  });
  assert.equal(fields[I.RECEIPT_FIELDS.status], "skipped");
  assert.equal(fields[I.RECEIPT_FIELDS.supported], false);
  assert.equal(fields[I.RECEIPT_FIELDS.followersReturned], 0);
  assert.equal(fields[I.RECEIPT_FIELDS.reason], "followers_endpoint_requires_verified_or_premium_oa");
});
