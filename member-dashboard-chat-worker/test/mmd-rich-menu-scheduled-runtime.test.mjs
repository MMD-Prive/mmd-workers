import test from "node:test";
import assert from "node:assert/strict";
import {
  bangkokHour,
  isMmdRichMenuHidden,
  classifyMmdUsers,
  getMmdRichMenuActionMap,
} from "../src/mmd-rich-menu-scheduled-runtime.mjs";

test("MMD Rich Menu hides from 16:00 until 23:00 Bangkok", () => {
  assert.equal(bangkokHour(new Date("2026-09-08T08:59:00Z")), 15);
  assert.equal(isMmdRichMenuHidden(new Date("2026-09-08T08:59:00Z")), false);
  assert.equal(isMmdRichMenuHidden(new Date("2026-09-08T09:00:00Z")), true);
  assert.equal(isMmdRichMenuHidden(new Date("2026-09-08T15:59:59Z")), true);
  assert.equal(isMmdRichMenuHidden(new Date("2026-09-08T16:00:00Z")), false);
});

test("MMD 3-level Rich Menu actions match the canonical customer labels", () => {
  const map = getMmdRichMenuActionMap();

  assert.deepEqual(map.guest, [
    { type: "uri", label: "START HERE", uri: "https://mmdbkk.com/public/access?source=line&entry_route=rich_menu_guest_start" },
    { type: "uri", label: "PUBLIC MODELS", uri: "https://mmdbkk.com/profiles?source=line&entry_route=rich_menu_guest_models" },
    { type: "uri", label: "BOOKING", uri: "https://mmdbkk.com/booking?source=line&entry_route=rich_menu_guest_booking" },
    { type: "uri", label: "PUBLIC SERVICES", uri: "https://mmdbkk.com/services/companion?source=line&entry_route=rich_menu_guest_services" },
    { type: "uri", label: "ABOUT MMD", uri: "https://mmdbkk.com/tmib?source=line&entry_route=rich_menu_guest_about" },
    { type: "message", label: "SUPPORT", text: "ขอคุยกับเจ้าหน้าที่" },
  ]);

  assert.deepEqual(map.public, [
    { type: "message", label: "คุยกับ PER", text: "Hi Per" },
    { type: "uri", label: "PUBLIC MODELS", uri: "https://mmdbkk.com/profiles?source=line&entry_route=rich_menu_public_models" },
    { type: "uri", label: "BOOKING", uri: "https://mmdbkk.com/booking?source=line&entry_route=rich_menu_public_booking" },
    { type: "uri", label: "MY MMD", uri: "https://liff.line.me/2010862595-yT4DCEMc?intent=status&view=profile" },
    { type: "uri", label: "PRIVE ACCESS", uri: "https://mmdbkk.com/membership?source=line&entry_route=rich_menu_prive_access" },
    { type: "message", label: "SUPPORT", text: "ขอคุยกับเจ้าหน้าที่" },
  ]);

  assert.deepEqual(map.private, [
    { type: "message", label: "KENJI AI", text: "Hi Kenji" },
    { type: "uri", label: "MODEL CARDS", uri: "https://mmdbkk.com/member/private?source=line&entry_route=rich_menu_model_cards#detail-model" },
    { type: "uri", label: "BOOKING", uri: "https://mmdbkk.com/find?source=line&entry_route=rich_menu_private_booking" },
    { type: "uri", label: "MY MMD", uri: "https://liff.line.me/2010862595-yT4DCEMc?intent=status&view=profile" },
    { type: "uri", label: "PRIVE UPDATE", uri: "https://mmdbkk.com/member/private?source=line&entry_route=rich_menu_prive_update#access" },
    { type: "message", label: "SUPPORT", text: "ขอคุยกับเจ้าหน้าที่" },
  ]);
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
