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
