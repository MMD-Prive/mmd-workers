import assert from "node:assert/strict";
import test from "node:test";
import { buildAudit, DECISION, REASON, isDryRun, isEnabled } from "./src/premium-group-cleanup/audit.js";
import { handlePremiumGroupCleanupOwnerRequest } from "./src/premium-group-cleanup/owner.js";

const NOW = Date.parse("2026-10-11T00:00:00Z");
const day = (n) => new Date(NOW + n * 86400000).toISOString();
const row = (over = {}) => ({ fields: { line_user_id: "Uaaaa1111", capability: "private_premium", access_status: "active", expire_at: day(-40), start_at: day(-400), ...over } });
const linked = async () => ({ state: "linked", telegram_user_id: "123456789" });
const one = async (records, lookup = linked) => (await buildAudit(records, { now: NOW, lookupTelegram: lookup })).items;

test("expired premium with verified telegram link is a dry-run candidate", async () => {
  const [it] = await one([row()]);
  assert.equal(it.decision, DECISION.CANDIDATE);
  assert.equal(it.reason, REASON.EXPIRED_NOT_RENEWED);
  assert.equal(it.telegram_user_id_masked, "…6789");
  assert.ok(it.days_since_expiry >= 39);
});

test("active, expiring and grace premium are ignored", async () => {
  for (const d of [200, 3, -3]) {
    const [it] = await one([row({ expire_at: day(d) })]);
    assert.equal(it.decision, DECISION.IGNORED, `offset ${d}`);
  }
});

test("protected tier is escalated", async () => {
  const [it] = await one([row(), row({ capability: "vip", expire_at: day(100) })]);
  assert.equal(it.decision, DECISION.REVIEW);
  assert.equal(it.reason, REASON.PROTECTED_TIER);
});

test("pending payment / renewal is escalated", async () => {
  const [it] = await one([row({ member_lifecycle_status: "pending_payment" })]);
  assert.equal(it.decision, DECISION.REVIEW);
  assert.equal(it.reason, REASON.PAYMENT_PENDING);
});

test("owner grant is escalated", async () => {
  const [it] = await one([row({ source: "owner_grant" })]);
  assert.equal(it.reason, REASON.OWNER_GRANT);
});

test("ambiguous / missing telegram match is escalated", async () => {
  for (const state of ["ambiguous", "not_linked"]) {
    const [it] = await one([row()], async () => ({ state }));
    assert.equal(it.decision, DECISION.REVIEW);
    assert.equal(it.reason, REASON.NO_TELEGRAM_MATCH);
  }
  const [bad] = await one([row()], async () => ({ state: "linked", telegram_user_id: "abc" }));
  assert.equal(bad.reason, REASON.NO_TELEGRAM_MATCH);
});

test("lookup failure or throw is resolver_source_failure, never a candidate", async () => {
  const [a] = await one([row()], async () => ({ state: "lookup_failed" }));
  const [b] = await one([row()], async () => { throw new Error("x"); });
  assert.equal(a.reason, REASON.SOURCE_FAILURE);
  assert.equal(b.reason, REASON.SOURCE_FAILURE);
});

test("non-premium members are not listed; flags default safe", () => {
  assert.equal(isEnabled({}), false);
  assert.equal(isDryRun({}), true);
  assert.equal(isDryRun({ PREMIUM_GROUP_CLEANUP_DRY_RUN: "false" }), false);
});

test("owner endpoint: auth, method, dry-run output, no network write", async () => {
  const url = "https://x.test/internal/admin/premium-group-cleanup/preview";
  const deps = {
    now: NOW,
    readEntitlements: async () => ({ records: [row()], truncated: false }),
    lookupTelegram: linked,
    fetch: () => { throw new Error("network blocked"); },
  };
  const as = (role) => ({ ...deps, readActor: async () => (role ? { role } : null) });
  assert.equal((await handlePremiumGroupCleanupOwnerRequest(new Request(url), {}, as(null))).status, 401);
  assert.equal((await handlePremiumGroupCleanupOwnerRequest(new Request(url), {}, as("admin"))).status, 403);
  assert.equal((await handlePremiumGroupCleanupOwnerRequest(new Request(url, { method: "POST" }), {}, as("owner"))).status, 405);
  const res = await handlePremiumGroupCleanupOwnerRequest(new Request(url), {}, as("owner"));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.sends_nothing, true);
  assert.equal(body.removes_nothing, true);
  assert.equal(body.telegram_presence, "not_checked");
  assert.equal(body.counts.candidates, 1);
  assert.ok(!JSON.stringify(body).includes("Uaaaa1111"));
  const st = await (await handlePremiumGroupCleanupOwnerRequest(new Request(url.replace("preview", "status")), {}, as("owner"))).json();
  assert.equal(st.flag_enabled, false);
});

test("presence check: absent ignored, present confirmed, unknown/privileged escalated", async () => {
  const run = (presence) => one([row()], linked).then(() => buildAudit([row()], { now: NOW, lookupTelegram: linked, checkPresence: async () => ({ presence }) }));
  const absent = (await run("absent")).items[0];
  assert.equal(absent.decision, DECISION.IGNORED);
  assert.equal(absent.reason, REASON.NOT_IN_GROUP);
  const present = (await run("present")).items[0];
  assert.equal(present.decision, DECISION.CANDIDATE);
  assert.equal(present.telegram_presence, "present");
  assert.equal((await run("privileged")).items[0].reason, REASON.PRIVILEGED_IN_GROUP);
  assert.equal((await run("unknown")).items[0].reason, REASON.SOURCE_FAILURE);
  const thrown = (await buildAudit([row()], { now: NOW, lookupTelegram: linked, checkPresence: async () => { throw new Error("x"); } })).items[0];
  assert.equal(thrown.reason, REASON.SOURCE_FAILURE);
});
