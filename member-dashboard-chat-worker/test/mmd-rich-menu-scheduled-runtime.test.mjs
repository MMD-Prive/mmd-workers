import test from "node:test";
import assert from "node:assert/strict";
import {
  bangkokHour,
  isMmdRichMenuHidden,
  classifyMmdUsers,
} from "../src/mmd-rich-menu-scheduled-runtime.mjs";

test("MMD Rich Menu hides from 16:00 until 23:00 Bangkok", () => {
  assert.equal(bangkokHour(new Date("2026-09-08T08:59:00Z")), 15);
  assert.equal(isMmdRichMenuHidden(new Date("2026-09-08T08:59:00Z")), false);
  assert.equal(isMmdRichMenuHidden(new Date("2026-09-08T09:00:00Z")), true);
  assert.equal(isMmdRichMenuHidden(new Date("2026-09-08T15:59:59Z")), true);
  assert.equal(isMmdRichMenuHidden(new Date("2026-09-08T16:00:00Z")), false);
});

test("verified customer stays Public without active private entitlement", () => {
  const clients = [{ fields: { line_user_id: "U-public", "Verification Status": "verified" } }];
  const result = classifyMmdUsers(clients, [], new Date("2026-09-08T00:00:00Z"));
  assert.deepEqual(result, { guest: [], public: ["U-public"], private: [] });
});

test("active private entitlement maps to Private", () => {
  const clients = [{ fields: { line_user_id: "U-private", "Verification Status": "verified" } }];
  const entitlements = [{ fields: { line_user_id: "U-private", capability: "private_premium", member_lifecycle_status: "active", expire_at: "2026-12-01T00:00:00Z" } }];
  const result = classifyMmdUsers(clients, entitlements, new Date("2026-09-08T00:00:00Z"));
  assert.deepEqual(result, { guest: [], public: [], private: ["U-private"] });
});

test("expired/grace private entitlement falls back to Public, not Guest", () => {
  const clients = [{ fields: { line_user_id: "U-grace", "Verification Status": "verified" } }];
  const entitlements = [{ fields: { line_user_id: "U-grace", capability: "private_standard", member_lifecycle_status: "grace", expire_at: "2026-09-07T00:00:00Z" } }];
  const result = classifyMmdUsers(clients, entitlements, new Date("2026-09-08T00:00:00Z"));
  assert.deepEqual(result, { guest: [], public: ["U-grace"], private: [] });
});

test("unverified known customer maps to Guest", () => {
  const clients = [{ fields: { line_user_id: "U-guest", "Verification Status": "pending" } }];
  const result = classifyMmdUsers(clients, [], new Date("2026-09-08T00:00:00Z"));
  assert.deepEqual(result, { guest: ["U-guest"], public: [], private: [] });
});
