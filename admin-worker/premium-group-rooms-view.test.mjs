import assert from "node:assert/strict";
import test from "node:test";
import { handlePremiumGroupCleanupOwnerRequest } from "./src/premium-group-cleanup/owner.js";
import { buildRoomsPreview } from "./src/premium-group-cleanup/rooms-preview.js";

const NOW = Date.parse("2026-11-15T00:00:00+07:00");
const day = (n) => new Date(NOW + n * 86400000).toISOString();
const env = { PREMIUM_GROUP_PROMO_GRACE_UNTIL: "2026-12-31T23:59:59+07:00" };
const row = (line, cap, over = {}) => ({ fields: { line_user_id: line, capability: cap, access_status: "active", start_at: day(-400), expire_at: day(200), ...over } });
const linked = async () => ({ state: "linked", telegram_user_id: "123456789" });
const present = async () => ({ presence: "present" });

test("rooms view: premium expired in promo grace is listed as grace, not a removal candidate", async () => {
  const v = await buildRoomsPreview({ records: [row("Uaaaa1111", "private_premium", { expire_at: day(-30) })], now: NOW, env, lookupTelegram: linked, checkPresence: present });
  const premium = v.rooms.find((r) => r.room === "premium");
  assert.equal(premium.policy.grace_promo, 1);
  assert.equal(premium.policy.remove_candidate, 0);
  const it = v.items.find((i) => i.room === "premium");
  assert.equal(it.state, "grace_promo");
  assert.equal(it.telegram_user_id_masked, "…6789");
});

test("rooms view: after the grace window an expired Premium present in the room is a candidate", async () => {
  const late = Date.parse("2027-01-05T00:00:00+07:00");
  const v = await buildRoomsPreview({ records: [row("Uaaaa1111", "private_premium", { expire_at: new Date(late - 40 * 86400000).toISOString() })], now: late, env, lookupTelegram: linked, checkPresence: present });
  assert.equal(v.items.find((i) => i.room === "premium").state, "remove_candidate");
});

test("rooms view: members absent from the room are not listed; unlinked ones are only counted", async () => {
  const absent = async () => ({ presence: "absent" });
  const v1 = await buildRoomsPreview({ records: [row("Uaaaa1111", "private_standard")], now: NOW, env, lookupTelegram: linked, checkPresence: absent });
  assert.equal(v1.items.length, 0);
  const v2 = await buildRoomsPreview({ records: [row("Uaaaa1111", "private_standard")], now: NOW, env, lookupTelegram: async () => ({ state: "not_linked" }), checkPresence: present });
  assert.equal(v2.items.length, 0);
  assert.ok(v2.rooms.find((r) => r.room === "inner").unlinked_non_entitled >= 1);
});

test("rooms view: expired VIP-class in Black Room is review, never candidate; preview channel is view only", async () => {
  const v = await buildRoomsPreview({ records: [row("Ubbbb2222", "vip", { expire_at: day(-40) })], now: NOW, env, lookupTelegram: linked, checkPresence: present });
  assert.equal(v.items.find((i) => i.room === "black").state, "review_required");
  assert.ok(!v.items.some((i) => i.state === "remove_candidate" && ["black", "inner"].includes(i.room) && i.reason === "vip_class_expired_owner_decides"));
  const prev = v.rooms.find((r) => r.room === "preview");
  assert.equal(prev.view_only, true);
  assert.equal(prev.can_remove, false);
});

const owner = async () => ({ role: "owner" });
const deps = { readActor: owner, now: NOW, readEntitlements: async () => ({ records: [row("Uaaaa1111", "private_premium", { expire_at: day(-30) })], truncated: false }), lookupTelegram: linked, checkPresence: present };
const req = (path, headers = {}) => new Request(`https://www.mmdbkk.com/internal/admin/premium-group-cleanup/${path}`, { headers });

test("endpoint: /rooms returns JSON for owner only; non-owner 403; POST 405", async () => {
  const ok = await handlePremiumGroupCleanupOwnerRequest(req("rooms"), env, deps);
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.sends_nothing, true);
  assert.equal(body.removes_nothing, true);
  const no = await handlePremiumGroupCleanupOwnerRequest(req("rooms"), env, { ...deps, readActor: async () => ({ role: "admin" }) });
  assert.equal(no.status, 403);
  const post = await handlePremiumGroupCleanupOwnerRequest(new Request("https://x/internal/admin/premium-group-cleanup/rooms", { method: "POST" }), env, deps);
  assert.equal(post.status, 405);
});

test("endpoint: /preview serves the HTML page to a browser, JSON otherwise; page never needs innerHTML", async () => {
  const page = await handlePremiumGroupCleanupOwnerRequest(req("preview", { accept: "text/html" }), env, deps);
  assert.match(page.headers.get("content-type"), /text\/html/);
  const html = await page.text();
  assert.match(html, /Telegram Rooms/);
  assert.ok(!html.includes("innerHTML"));
  const unauth = await handlePremiumGroupCleanupOwnerRequest(req("preview", { accept: "text/html" }), env, { ...deps, readActor: async () => null });
  assert.equal(unauth.status, 401);
  const json = await handlePremiumGroupCleanupOwnerRequest(req("preview"), env, deps);
  assert.match(json.headers.get("content-type"), /json/);
});
