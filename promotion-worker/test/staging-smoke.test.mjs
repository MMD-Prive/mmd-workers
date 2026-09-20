import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

const SECRET = "staging-smoke-internal-secret-2026";
const NOW = "2026-08-02T12:00:00.000Z";
const INTERNAL_HEADERS = {
  "content-type": "application/json",
  "x-mmd-service-binding": "staging-smoke",
  "x-mmd-internal-secret": SECRET,
};

class MemoryClaimStore {
  constructor() {
    this.byId = new Map();
    this.byIdentity = new Map();
    this.auditEvents = [];
    this.createQueue = Promise.resolve();
  }

  async findByIdentity(identityHash) {
    return structuredClone(this.byIdentity.get(identityHash) || null);
  }

  async findById(claimId) {
    return structuredClone(this.byId.get(claimId) || null);
  }

  async create(claim, audit) {
    let release;
    const turn = new Promise((resolve) => { release = resolve; });
    const previous = this.createQueue;
    this.createQueue = turn;
    await previous;
    try {
      await new Promise((resolve) => setTimeout(resolve, 2));
      const existing = this.byIdentity.get(claim.identityHash);
      if (existing) return structuredClone(existing);
      const saved = structuredClone(claim);
      this.byId.set(saved.claimId, saved);
      this.byIdentity.set(saved.identityHash, saved);
      this.auditEvents.push(structuredClone(audit));
      return structuredClone(saved);
    } finally {
      release();
    }
  }

  async update(next, expectedUpdatedAt, audit) {
    const current = this.byId.get(next.claimId);
    if (!current) throw new Error("claim_not_found");
    if (current.updatedAt !== expectedUpdatedAt) throw new Error("claim_write_conflict");
    const saved = structuredClone(next);
    this.byId.set(saved.claimId, saved);
    this.byIdentity.set(saved.identityHash, saved);
    this.auditEvents.push(structuredClone(audit));
    return structuredClone(saved);
  }
}

class MemoryPaymentsWorker {
  constructor() {
    this.applied = new Set();
    this.calls = [];
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    const body = await request.json();
    this.calls.push({ path, body: structuredClone(body) });
    if (path === "/v1/internal/campaign-payments/verify") {
      const expected = `PAY-${body.claimId}`;
      if (body.paymentRequired && body.paymentReference !== expected) {
        return Response.json({ ok: false, error: "verified_payment_required" }, { status: 409 });
      }
      return Response.json({
        ok: true,
        paymentVerified: !body.paymentRequired || body.paymentReference === expected,
        paymentReference: body.paymentReference || null,
        upgradePaymentVerified: !body.upgradeRequired,
        upgradePaymentReference: body.upgradePaymentReference || null,
        packageStartAt: "2026-08-02T00:00:00.000Z",
        packageEndAt: "2026-08-02T00:00:00.000Z",
      });
    }
    if (path === "/v1/internal/campaign-benefits/apply") {
      const results = body.plan.map((item) => {
        const already = this.applied.has(item.idempotencyKey);
        this.applied.add(item.idempotencyKey);
        return { benefitType: item.benefitType, idempotencyKey: item.idempotencyKey, status: already ? "already_applied" : "applied" };
      });
      const membership = body.plan.find((item) => item.benefitType === "membership_extension");
      return Response.json({
        ok: true,
        status: "completed",
        results,
        newMembershipExpiry: membership?.payload?.newExpiry || null,
      });
    }
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }
}

function identity(index) {
  return Number(index).toString(16).padStart(64, "0");
}

function memberSnapshot(endAt) {
  return {
    membershipTier: "standard",
    membershipStartAt: "2025-01-01",
    membershipEndAt: endAt,
    membershipHistory: [{ tier: "standard", verified: true, endAt }],
    hasVerifiedMembershipHistory: true,
  };
}

function stagingEnv() {
  const store = new MemoryClaimStore();
  const payments = new MemoryPaymentsWorker();
  return {
    store,
    payments,
    env: {
      INTERNAL_SERVICE_SECRET: SECRET,
      TEST_NOW: NOW,
      CAMPAIGN_CLAIM_STORE: store,
      PAYMENTS_WORKER: payments,
    },
  };
}

async function call(env, path, { method = "POST", body } = {}) {
  const response = await worker.fetch(new Request(`https://promotion-worker.local${path}`, {
    method,
    headers: INTERNAL_HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
  return { response, body: await response.json() };
}

async function open(env, identityHash, snapshot) {
  return call(env, "/v1/internal/promotions/claims/open", {
    body: {
      campaignId: "mmd_6th_anniversary_2026",
      identityHash,
      memberId: `member_${identityHash.slice(-4)}`,
      snapshot,
    },
  });
}

function adminBody(overrides = {}) {
  return {
    actor: { id: "per", sessionId: "adm_staging_signed_001" },
    requestId: `smoke_${crypto.randomUUID()}`,
    reason: "staging smoke verified",
    ...overrides,
  };
}

test("staging smoke: five eligibility statuses, repeat claims, and concurrent opens", async () => {
  const { env, store } = stagingEnv();
  const cases = [
    [1, memberSnapshot("2026-12-01"), "current_member"],
    [2, memberSnapshot("2026-07-01"), "recently_expired"],
    [3, memberSnapshot("2026-01-01"), "inactive_expired"],
    [4, memberSnapshot("2025-07-01"), "former_member"],
    [5, { membershipHistory: [] }, "new_member"],
  ];
  const opened = new Map();
  for (const [index, snapshot, expected] of cases) {
    const result = await open(env, identity(index), snapshot);
    assert.ok([200, 201].includes(result.response.status));
    assert.equal(result.body.claim.status, expected);
    opened.set(expected, result.body.claim);
  }

  const repeated = await open(env, identity(1), cases[0][1]);
  assert.equal(repeated.response.status, 200);
  assert.equal(repeated.body.resumed, true);
  assert.equal(repeated.body.claim.claimId, opened.get("current_member").claimId);

  const concurrentIdentity = identity(6);
  const [first, second] = await Promise.all([
    open(env, concurrentIdentity, memberSnapshot("2026-12-01")),
    open(env, concurrentIdentity, memberSnapshot("2026-12-01")),
  ]);
  assert.equal(first.body.claim.claimId, second.body.claim.claimId);
  assert.equal([first.body.resumed, second.body.resumed].filter(Boolean).length, 1);
  assert.equal([...store.byIdentity.keys()].filter((value) => value === concurrentIdentity).length, 1);
});

test("staging smoke: payment and Apply fail closed, then preserve complete before/after audit", async () => {
  const { env, store, payments } = stagingEnv();
  const opened = await open(env, identity(20), memberSnapshot("2026-07-01"));
  const claimId = opened.body.claim.claimId;

  const earlyApply = await call(env, "/v1/internal/promotions/apply", {
    body: adminBody({ claimId }),
  });
  assert.equal(earlyApply.response.status, 409);
  assert.equal(earlyApply.body.error, "claim_not_approved_for_apply");

  const missingPayment = await call(env, `/v1/internal/promotions/admin/claims/${claimId}/decision`, {
    body: adminBody({ action: "approve", approvedMonths: 4 }),
  });
  assert.equal(missingPayment.response.status, 409);
  assert.equal(missingPayment.body.error, "verified_payment_required");
  assert.equal((await store.findById(claimId)).claimStatus, "matched");

  const approved = await call(env, `/v1/internal/promotions/admin/claims/${claimId}/decision`, {
    body: adminBody({ action: "approve", approvedMonths: 4, paymentReference: `PAY-${claimId}` }),
  });
  assert.equal(approved.response.status, 200);
  assert.equal(approved.body.claim.claimStatus, "benefit_approved");
  assert.equal(approved.body.audit.actorId, "per");
  assert.equal(approved.body.audit.adminSessionId, "adm_staging_signed_001");
  assert.equal(approved.body.audit.before.claimStatus, "matched");
  assert.equal(approved.body.audit.after.claimStatus, "benefit_approved");

  const applied = await call(env, "/v1/internal/promotions/apply", {
    body: adminBody({ claimId, reason: "approved staging apply" }),
  });
  assert.equal(applied.response.status, 200);
  assert.equal(applied.body.status, "benefit_applied");
  assert.equal(applied.body.data.monthsAdded, 4);
  assert.equal(applied.body.data.pointsAdded, 200);
  assert.equal(Object.hasOwn(applied.body.data, "classification"), false);
  assert.equal(Object.hasOwn(applied.body.data, "considerations"), false);

  const saved = await store.findById(claimId);
  assert.equal(saved.claimStatus, "benefit_applied");
  assert.equal(saved.audits.length, 3);
  assert.deepEqual(saved.audits.map((audit) => audit.eventType), ["claim_created", "admin_approve", "benefit_applied"]);
  for (const audit of saved.audits) {
    assert.ok(audit.requestId);
    assert.ok(audit.actorId);
    assert.ok(audit.adminSessionId);
    assert.ok(audit.timestamp);
    assert.equal(audit.claimId, claimId);
  }
  assert.equal(store.auditEvents.length, 3);
  assert.equal(payments.applied.size, 2);

  const readback = await call(env, `/v1/internal/promotions/claims/${claimId}`, { method: "GET" });
  assert.equal(readback.response.status, 200);
  assert.equal(readback.body.claim.claimStatus, "benefit_applied");
  assert.equal(readback.body.data.status, "completed");
});

test("staging smoke: manual review and rejection keep actor/session audit server requirements", async () => {
  const { env } = stagingEnv();
  const manualClaim = (await open(env, identity(30), memberSnapshot("2026-01-01"))).body.claim;
  const reviewed = await call(env, `/v1/internal/promotions/admin/claims/${manualClaim.claimId}/decision`, {
    body: adminBody({ action: "manual_review", reason: "history needs one more check" }),
  });
  assert.equal(reviewed.response.status, 200);
  assert.equal(reviewed.body.claim.claimStatus, "manual_review");
  assert.equal(reviewed.body.audit.actorId, "per");

  const rejected = await call(env, `/v1/internal/promotions/admin/claims/${manualClaim.claimId}/decision`, {
    body: adminBody({ action: "reject", reason: "verified ineligible" }),
  });
  assert.equal(rejected.response.status, 200);
  assert.equal(rejected.body.claim.claimStatus, "rejected");
  assert.equal(rejected.body.audit.before.claimStatus, "manual_review");
  assert.equal(rejected.body.audit.after.claimStatus, "rejected");
});
