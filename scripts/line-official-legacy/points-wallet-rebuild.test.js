const test = require("node:test");
const assert = require("node:assert/strict");

const { buildWalletRebuildPlan, rebuildPointsWallet } = require("./points-wallet-rebuild.js");

const MEMBER_ID = "member-history-001";

function row(id, postedAt, eligibleAmount, fields = {}) {
  return {
    id,
    fields: {
      member_id: MEMBER_ID,
      points_bucket: "base_phase1",
      transaction_status: "posted",
      payment_ref: `pay-${id}`,
      posted_at: postedAt,
      eligible_amount_thb: eligibleAmount,
      amount_thb: eligibleAmount,
      prior_remainder_thb: 0,
      pool_thb: eligibleAmount,
      points: Math.floor(eligibleAmount / 100),
      remainder_after_thb: eligibleAmount % 100,
      ...fields,
    },
  };
}

test("rebuild sorts historical events chronologically and carries THB remainder", () => {
  const rows = [
    row("recNEW", "2026-03-01T00:00:00.000Z", 50),
    row("recOLD", "2026-01-01T00:00:00.000Z", 150),
  ];
  const plan = buildWalletRebuildPlan(rows, { memberId: MEMBER_ID });
  assert.deepEqual(plan.events.map((event) => event.record_id), ["recOLD", "recNEW"]);
  assert.deepEqual(plan.events[0].expected, {
    prior_remainder_thb: 0,
    pool_thb: 150,
    points: 1,
    remainder_after_thb: 50,
  });
  assert.deepEqual(plan.events[1].expected, {
    prior_remainder_thb: 50,
    pool_thb: 100,
    points: 1,
    remainder_after_thb: 0,
  });
  assert.equal(plan.final_remainder_thb, 0);
});

test("rebuild ignores non-base and other-member ledger rows", () => {
  const plan = buildWalletRebuildPlan([
    row("recBASE", "2026-01-01T00:00:00.000Z", 125),
    row("recBONUS", "2026-01-02T00:00:00.000Z", 900, { points_bucket: "care_back_bonus" }),
    row("recOTHER", "2026-01-03T00:00:00.000Z", 900, { member_id: "member-other" }),
  ], { memberId: MEMBER_ID });
  assert.equal(plan.total_events, 1);
  assert.equal(plan.events[0].record_id, "recBASE");
  assert.deepEqual(plan.forbidden_writes, ["MMD — Member Entitlements"]);
});

test("already rebuilt wallet is idempotent", () => {
  const rows = [
    row("rec1", "2026-01-01T00:00:00.000Z", 150, {
      prior_remainder_thb: 0,
      pool_thb: 150,
      points: 1,
      remainder_after_thb: 50,
    }),
    row("rec2", "2026-02-01T00:00:00.000Z", 50, {
      prior_remainder_thb: 50,
      pool_thb: 100,
      points: 1,
      remainder_after_thb: 0,
    }),
  ];
  const plan = buildWalletRebuildPlan(rows, { memberId: MEMBER_ID });
  assert.equal(plan.changed_events, 0);
});

class FakeAirtable {
  constructor(rows) {
    this.rows = rows;
    this.patches = [];
  }

  async list() {
    return this.rows;
  }

  async requestWithFieldFallback(_table, init) {
    const target = this.rows.find((item) => item.id === init.recordId);
    Object.assign(target.fields, init.body.fields);
    this.patches.push({ id: init.recordId, fields: { ...init.body.fields } });
    return target;
  }
}

test("apply patches only wallet math and converges with no entitlement write", async () => {
  const airtable = new FakeAirtable([
    row("rec2", "2026-02-01T00:00:00.000Z", 50),
    row("rec1", "2026-01-01T00:00:00.000Z", 150),
  ]);
  const result = await rebuildPointsWallet({ memberId: MEMBER_ID, apply: true, airtable });
  assert.equal(result.ok, true);
  assert.equal(result.entitlement_write, false);
  assert.equal(result.final_remainder_thb, 0);
  assert.equal(airtable.patches.length, 1);
  assert.deepEqual(Object.keys(airtable.patches[0].fields).sort(), [
    "points",
    "pool_thb",
    "prior_remainder_thb",
    "remainder_after_thb",
  ]);
});