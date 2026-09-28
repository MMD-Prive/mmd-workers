import test from "node:test";
import assert from "node:assert/strict";
import {
  claimModelMediaSlot,
  commitModelMediaSlot,
  releaseModelMediaSlot,
  removeModelMediaSlot,
} from "./model-media-slot-coordinator.mjs";
import { modelMediaSlotCoordinatorFixture } from "./model-media-slot-coordinator-fixture.mjs";

const modelId = "recModel";
const ref = (suffix) => `media_01234567-${suffix}`;
const call = (env, lane, kind, uploadRef, authoritativeRefs = []) => ({
  model_record_id: modelId,
  lane,
  kind,
  upload_ref: uploadRef,
  authoritative_refs: authoritativeRefs,
});

test("same upload ref is idempotent and cannot change lane", async () => {
  const env = { MODEL_MEDIA_SLOT_COORDINATOR: modelMediaSlotCoordinatorFixture() };
  const first = await claimModelMediaSlot(env, call(env, "public", "photo", ref("same")));
  const replay = await claimModelMediaSlot(env, call(env, "public", "photo", ref("same")));
  const conflict = await claimModelMediaSlot(env, call(env, "private", "photo", ref("same")));
  assert.equal(first.ok, true);
  assert.equal(first.duplicate, false);
  assert.equal(replay.duplicate, true);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.error, "media_slot_ref_conflict");
});

test("concurrent private claims serialize at the two-photo limit", async () => {
  const env = { MODEL_MEDIA_SLOT_COORDINATOR: modelMediaSlotCoordinatorFixture() };
  const results = await Promise.all(["one", "two", "three"].map((suffix) =>
    claimModelMediaSlot(env, call(env, "private", "photo", ref(suffix))),
  ));
  assert.equal(results.filter((result) => result.ok).length, 2);
  assert.equal(results.filter((result) => result.error === "private_photo_limit_reached").length, 1);
});

test("public and private lanes keep independent quotas", async () => {
  const env = { MODEL_MEDIA_SLOT_COORDINATOR: modelMediaSlotCoordinatorFixture() };
  for (const suffix of ["private1", "private2"]) {
    assert.equal((await claimModelMediaSlot(env, call(env, "private", "photo", ref(suffix)))).ok, true);
  }
  assert.equal((await claimModelMediaSlot(env, call(env, "public", "photo", ref("public1")))).ok, true);
  assert.equal((await claimModelMediaSlot(env, call(env, "private", "photo", ref("private3")))).error, "private_photo_limit_reached");
});

test("authoritative legacy refs consume quota without taking another model slot", async () => {
  const env = { MODEL_MEDIA_SLOT_COORDINATOR: modelMediaSlotCoordinatorFixture() };
  const legacy = ref("legacy");
  const blocked = await claimModelMediaSlot(env, call(env, "public", "clip", ref("new"), [legacy]));
  assert.equal(blocked.status, 409);
  assert.equal(blocked.error, "public_clip_limit_reached");
});

test("release, commit, and remove maintain a retry-safe reservation lifecycle", async () => {
  const env = { MODEL_MEDIA_SLOT_COORDINATOR: modelMediaSlotCoordinatorFixture() };
  const uploadRef = ref("lifecycle");
  assert.equal((await claimModelMediaSlot(env, call(env, "private", "clip", uploadRef))).ok, true);
  assert.equal((await releaseModelMediaSlot(env, call(env, "private", "clip", uploadRef))).state, "released");
  assert.equal((await claimModelMediaSlot(env, call(env, "private", "clip", uploadRef))).ok, true);
  assert.equal((await commitModelMediaSlot(env, call(env, "private", "clip", uploadRef))).state, "committed");
  assert.equal((await claimModelMediaSlot(env, call(env, "private", "clip", ref("blocked")))).status, 409);
  assert.equal((await removeModelMediaSlot(env, call(env, "private", "clip", uploadRef))).state, "removed");
  assert.equal((await claimModelMediaSlot(env, call(env, "private", "clip", ref("after-remove")))).ok, true);
});

test("missing coordinator binding fails closed", async () => {
  const result = await claimModelMediaSlot({}, call({}, "public", "photo", ref("missing")));
  assert.equal(result.status, 503);
  assert.equal(result.error, "media_slot_coordinator_not_ready");
});
