import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CareBackBirthdayWishCoordinator } from "../src/care-back-birthday-wish-coordinator.js";

const INPUT = {
  claimId: "CB6-2026-ABCDEF12345678",
  claimRecordId: `rec${"A".repeat(14)}`,
  idempotencyKey: "req_1234567890abcdef",
  verifiedCustomerRefHash: "a".repeat(64),
  wishText: "ขอให้ MMD เติบโตอย่างอบอุ่นต่อไปครับ",
  wishOption: "care",
  language: "th",
  publicDisplayText: "MMD ได้รับคำอวยพรของคุณแล้วครับ",
  now: "2026-08-10T12:00:00.000Z",
};

function internalRequest(body = INPUT) {
  return new Request("https://care-back-coordinator.internal/__internal/care-back/birthday-wish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

class MemoryDoStorage {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.get(key); }
  async put(key, value) { this.values.set(key, structuredClone(value)); }
  async delete(key) { this.values.delete(key); }
}

function state() {
  return { storage: new MemoryDoStorage() };
}

describe("CARE BACK Birthday Wish Durable Object coordinator", () => {
  it("serializes five concurrent submissions for the same canonical claim", async () => {
    let active = 0;
    let maxActive = 0;
    let canonical = null;
    let creates = 0;
    const store = {
      async getBirthdayWishByClaim() { return canonical; },
      async getBirthdayWishByIdempotencyKey() { return null; },
      async createBirthdayWish() { return null; },
      async completeBirthdayWish() { return null; },
      async createOrLoadBirthdayWish() {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        if (!canonical) {
          creates += 1;
          canonical = {
            record_id: `rec${"B".repeat(14)}`,
            claim_record_id: INPUT.claimRecordId,
            wish_id: "wish_1234567890abcdef1234567890abcdef",
            campaign_id: "care_back",
            wish_text: INPUT.wishText,
            wish_option: INPUT.wishOption,
            wish_status: "completed",
            submitted_at: INPUT.now,
            completed_at: INPUT.now,
            public_display_text: INPUT.publicDisplayText,
            language: "th",
            display_version: "care_back_v1",
            idempotency_key: INPUT.idempotencyKey,
            verified_customer_ref_hash: INPUT.verifiedCustomerRefHash,
          };
        }
        active -= 1;
        return canonical;
      },
    };
    const coordinator = new CareBackBirthdayWishCoordinator(state(), { BIRTHDAY_WISH_STORE: store });
    const responses = await Promise.all(Array.from({ length: 5 }, () => coordinator.fetch(internalRequest())));
    const payloads = await Promise.all(responses.map((response) => response.json()));

    assert.equal(maxActive, 1);
    assert.equal(creates, 1);
    assert.ok(responses.every((response) => response.status === 200));
    assert.ok(payloads.every((payload) => payload.wish.wish_id === canonical.wish_id));
  });

  it("recovers an ambiguous Airtable create timeout without issuing a second create", async () => {
    let creates = 0;
    let canonical = null;
    const store = {
      async getBirthdayWishByClaim() { return canonical; },
      async getBirthdayWishByIdempotencyKey() { return canonical; },
      async createBirthdayWish() { return null; },
      async completeBirthdayWish() { return canonical; },
      async createOrLoadBirthdayWish(input) {
        creates += 1;
        canonical = {
          record_id: `rec${"B".repeat(14)}`,
          claim_record_id: input.claimRecordId,
          wish_id: "wish_1234567890abcdef1234567890abcdef",
          campaign_id: "care_back",
          wish_text: input.wishText,
          wish_option: input.wishOption,
          wish_status: "completed",
          submitted_at: input.now,
          completed_at: input.now,
          public_display_text: input.publicDisplayText,
          language: "th",
          display_version: "care_back_v1",
          idempotency_key: input.idempotencyKey,
          verified_customer_ref_hash: input.verifiedCustomerRefHash,
        };
        throw new Error("ambiguous timeout after upstream commit");
      },
    };
    const coordinator = new CareBackBirthdayWishCoordinator(state(), { BIRTHDAY_WISH_STORE: store });
    const timedOut = await coordinator.fetch(internalRequest());
    const recovered = await coordinator.fetch(internalRequest({ ...INPUT, idempotencyKey: "different_1234567890" }));
    const payload = await recovered.json();

    assert.equal(timedOut.status, 503);
    assert.equal(recovered.status, 200);
    assert.equal(payload.wish.wish_id, canonical.wish_id);
    assert.equal(creates, 1);
  });

  it("does not persist a recovered completion whose ownership changed", async () => {
    let canonical = null;
    const storage = new MemoryDoStorage();
    const store = {
      async getBirthdayWishByClaim() { return canonical; },
      async getBirthdayWishByIdempotencyKey() { return null; },
      async createBirthdayWish() { return null; },
      async completeBirthdayWish() {
        return { ...canonical, verified_customer_ref_hash: "b".repeat(64), wish_status: "completed" };
      },
      async createOrLoadBirthdayWish() { throw new Error("ambiguous upstream timeout"); },
    };
    const coordinator = new CareBackBirthdayWishCoordinator({ storage }, { BIRTHDAY_WISH_STORE: store });
    assert.equal((await coordinator.fetch(internalRequest())).status, 503);

    canonical = {
      record_id: `rec${"B".repeat(14)}`,
      claim_record_id: INPUT.claimRecordId,
      wish_id: "wish_1234567890abcdef1234567890abcdef",
      campaign_id: "care_back",
      wish_text: INPUT.wishText,
      wish_option: INPUT.wishOption,
      wish_status: "submitted",
      submitted_at: INPUT.now,
      completed_at: "",
      public_display_text: "",
      language: "th",
      display_version: "care_back_v1",
      idempotency_key: INPUT.idempotencyKey,
      verified_customer_ref_hash: INPUT.verifiedCustomerRefHash,
    };
    const recovered = await coordinator.fetch(internalRequest());
    assert.equal(recovered.status, 409);
    assert.equal((await recovered.json()).error.code, "BIRTHDAY_WISH_IDENTITY_CONFLICT");
    assert.equal(await storage.get("canonical_wish"), undefined);
    assert.ok(await storage.get("pending_wish"));
  });

  it("fails closed without the exact store contract and rejects public routes", async () => {
    const coordinator = new CareBackBirthdayWishCoordinator(state(), {});
    const unavailable = await coordinator.fetch(internalRequest());
    assert.equal(unavailable.status, 503);
    assert.equal((await unavailable.json()).error.code, "BIRTHDAY_WISH_STORAGE_NOT_CONFIGURED");

    const publicRoute = await coordinator.fetch(new Request("https://care-back-coordinator.internal/member/api/liff/care-back/wish", { method: "POST" }));
    assert.equal(publicRoute.status, 404);
  });

  it("bounds internal JSON and quarantines unresolved writes for operator reconciliation", async () => {
    let canonical = null;
    let creates = 0;
    const store = {
      async getBirthdayWishByClaim() { return canonical; },
      async getBirthdayWishByIdempotencyKey() { return canonical; },
      async createBirthdayWish() { return null; },
      async completeBirthdayWish() { return canonical; },
      async createOrLoadBirthdayWish() {
        creates += 1;
        throw new Error("ambiguous upstream timeout");
      },
    };
    const coordinator = new CareBackBirthdayWishCoordinator(state(), { BIRTHDAY_WISH_STORE: store });
    const declaredOversized = await coordinator.fetch(new Request("https://care-back-coordinator.internal/__internal/care-back/birthday-wish", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(8 * 1024 + 1) },
      body: "{}",
    }));
    assert.equal(declaredOversized.status, 413);
    assert.equal((await declaredOversized.json()).error.code, "REQUEST_BODY_TOO_LARGE");

    const invalidJson = await coordinator.fetch(new Request("https://care-back-coordinator.internal/__internal/care-back/birthday-wish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }));
    assert.equal(invalidJson.status, 400);
    assert.equal((await invalidJson.json()).error.code, "INVALID_INPUT");

    const oversized = await coordinator.fetch(internalRequest({ ...INPUT, wishText: "x".repeat(9000) }));
    assert.equal(oversized.status, 413);
    assert.equal((await oversized.json()).error.code, "REQUEST_BODY_TOO_LARGE");

    assert.equal((await coordinator.fetch(internalRequest())).status, 503);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await coordinator.fetch(internalRequest());
      const payload = await response.json();
      assert.equal(response.status, 503);
      assert.equal(payload.error.code, attempt === 3
        ? "BIRTHDAY_WISH_RECONCILIATION_REQUIRED"
        : "BIRTHDAY_WISH_WRITE_UNCERTAIN");
    }
    assert.equal(creates, 1);
    const quarantined = await coordinator.fetch(new Request("https://care-back-coordinator.internal/__internal/care-back/birthday-wish/state"));
    assert.equal((await quarantined.json()).state, "reconciliation_required");

    canonical = {
      record_id: `rec${"B".repeat(14)}`,
      claim_record_id: INPUT.claimRecordId,
      wish_id: "wish_1234567890abcdef1234567890abcdef",
      campaign_id: "care_back",
      wish_text: INPUT.wishText,
      wish_option: INPUT.wishOption,
      wish_status: "completed",
      submitted_at: INPUT.now,
      completed_at: INPUT.now,
      public_display_text: INPUT.publicDisplayText,
      language: "th",
      display_version: "care_back_v1",
      idempotency_key: INPUT.idempotencyKey,
      verified_customer_ref_hash: INPUT.verifiedCustomerRefHash,
    };
    const reconciled = await coordinator.fetch(new Request("https://care-back-coordinator.internal/__internal/care-back/birthday-wish/reconcile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(INPUT),
    }));
    assert.equal(reconciled.status, 200);
    assert.equal((await reconciled.json()).state, "completed");
  });
});
