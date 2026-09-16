import test from "node:test";
import assert from "node:assert/strict";

import {
  groupEntitlementsByMember,
  runLifecycleReconciliation,
} from "../src/member-lifecycle-reconciliation.js";

const NOW = Date.parse("2026-09-03T00:00:00.000Z");

test("groups rows for the same member across email and LINE aliases", () => {
  const rows = [
    row("a", { member_email: "member@example.com", line_user_id: "U11111111111111111111111111111111", capability: "private_standard", member_lifecycle_status: "active" }),
    row("b", { line_user_id: "U11111111111111111111111111111111", telegram_user_id: "123456789", capability: "vip", member_lifecycle_status: "active" }),
  ];
  const groups = groupEntitlementsByMember(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].member_email, "member@example.com");
  assert.equal(groups[0].telegram_user_id, "123456789");
  assert.equal(groups[0].records.length, 2);
});

test("scheduled sweep derives grace from expire_at and sends canonical identity to reconciliation", async () => {
  const seen = [];
  const env = fixtureEnv([
    row("grace", {
      member_email: "member@example.com",
      telegram_user_id: "123456789",
      capability: "private_premium",
      member_lifecycle_status: "active",
      expire_at: "2026-09-01T00:00:00.000Z",
    }),
  ]);

  const summary = await runLifecycleReconciliation(env, {
    now: NOW,
    async reconcileMember(identity, snapshot) {
      seen.push({ identity, snapshot });
      return { ok: true, http_status: 200 };
    },
  });

  assert.equal(summary.authority, "my_mmd_entitlement_resolver_v1");
  assert.equal(summary.reconciled, 1);
  assert.deepEqual(seen[0].identity, {
    member_email: "member@example.com",
    line_user_id: "",
    telegram_user_id: "123456789",
  });
  assert.deepEqual(seen[0].snapshot.capability_state.grace, ["private_premium"]);
  assert.equal(seen[0].snapshot.access.new_drive_grants_allowed, false);
  assert.equal(seen[0].snapshot.access.new_telegram_grants_allowed, false);
});

test("scheduled sweep derives expired after grace and still reconciles downstream removal", async () => {
  let snapshot;
  const env = fixtureEnv([
    row("expired", {
      member_email: "member@example.com",
      capability: "private_standard",
      member_lifecycle_status: "active",
      expire_at: "2026-08-20T00:00:00.000Z",
    }),
  ]);

  const summary = await runLifecycleReconciliation(env, {
    now: NOW,
    async reconcileMember(_identity, resolved) {
      snapshot = resolved;
      return { ok: true, http_status: 200 };
    },
  });

  assert.equal(summary.reconciled, 1);
  assert.deepEqual(snapshot.capability_state.active, []);
  assert.deepEqual(snapshot.capability_state.grace, []);
  assert.deepEqual(snapshot.capability_state.inactive, ["private_standard"]);
});

test("Guest Pass receives no grace during scheduled evaluation", async () => {
  let snapshot;
  const env = fixtureEnv([
    row("guest", {
      member_email: "guest@example.com",
      capability: "guest_pass",
      member_lifecycle_status: "active",
      expire_at: "2026-09-02T00:00:00.000Z",
    }),
  ]);
  await runLifecycleReconciliation(env, {
    now: NOW,
    async reconcileMember(_identity, resolved) {
      snapshot = resolved;
      return { ok: true, http_status: 200 };
    },
  });
  assert.deepEqual(snapshot.capability_state.grace, []);
  assert.deepEqual(snapshot.capability_state.inactive, ["guest_pass"]);
});

test("sweep fails closed when member count exceeds configured cap", async () => {
  const env = fixtureEnv([
    row("one", { member_email: "one@example.com", capability: "private_standard", member_lifecycle_status: "active" }),
    row("two", { member_email: "two@example.com", capability: "private_standard", member_lifecycle_status: "active" }),
  ]);
  env.LIFECYCLE_RECONCILIATION_MAX_MEMBERS = "1";
  await assert.rejects(() => runLifecycleReconciliation(env, {
    now: NOW,
    reconcileMember: async () => ({ ok: true }),
  }), /lifecycle_member_limit_exceeded_2_1/);
});

test("disabled lifecycle worker does not touch Airtable or downstream", async () => {
  let called = false;
  const summary = await runLifecycleReconciliation({ LIFECYCLE_RECONCILIATION_ENABLED: "false" }, {
    reconcileMember: async () => { called = true; return { ok: true }; },
  });
  assert.equal(summary.disabled, true);
  assert.equal(called, false);
});

function row(id, fields) { return { id, fields }; }

function fixtureEnv(records) {
  return {
    AIRTABLE_API_KEY: "test-key",
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_TABLE_MEMBER_ENTITLEMENTS: "MMD — Member Entitlements",
    AIRTABLE_HTTP: {
      async fetch() {
        return new Response(JSON.stringify({ records }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  };
}
