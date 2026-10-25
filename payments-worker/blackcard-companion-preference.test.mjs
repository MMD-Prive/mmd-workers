import assert from "node:assert/strict";
import test from "node:test";
import {
  isBlackCardSession,
  parseStored,
  preferenceStatus,
  replaceMarker,
  selected,
} from "./blackcard-companion-preference.js";

const env = {
  AT_SESSIONS__PACKAGE_CODE: "package_code",
  AT_SESSIONS__NOTE: "note",
};

test("only a canonical Black Card session may enter the preference flow", () => {
  assert.equal(isBlackCardSession({ fields: { package_code: "black_card" } }, env), true);
  assert.equal(isBlackCardSession({ fields: { package_code: "mmd_member", note: "Black Card inquiry" } }, env), true);
  assert.equal(isBlackCardSession({ fields: { package_code: "mmd_member", note: "booking" } }, env), false);
});

test("companion catalog is the canonical Personal Main catalog and rejects travel models", () => {
  assert.equal(selected("hito")?.id, "hito");
  assert.equal(selected("HIRO")?.id, "hiro");
  assert.equal(selected("travel_model") , null);
  assert.equal(selected("not-a-companion") , null);
});

test("preference marker is readable and replacement is idempotent", () => {
  const first = { schema: 1, companion_id: "hito", updated_at: "2026-10-25T00:00:00.000Z" };
  const second = { ...first, companion_id: "hiro", updated_at: "2026-10-25T00:01:00.000Z" };
  const note = replaceMarker("existing operational note", first);
  assert.deepEqual(parseStored(note), first);
  const updated = replaceMarker(note, second);
  assert.deepEqual(parseStored(updated), second);
  assert.equal((updated.match(/MMD BLACK CARD COMPANION PREFERENCE V1/g) || []).length, 1);
});

test("selection status never implies entitlement", () => {
  assert.equal(preferenceStatus("pending"), "selected_pending_verification");
  assert.equal(preferenceStatus("pending_verification"), "selected_pending_verification");
  assert.equal(preferenceStatus("paid"), "selected_verified_pending_entitlement");
  assert.equal(preferenceStatus("cancelled"), "unavailable");
});
