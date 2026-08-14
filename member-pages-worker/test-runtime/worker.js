import { DurableObject } from "cloudflare:workers";

import { CareBackBirthdayWishCoordinator as CoordinatorCore } from "../src/care-back-birthday-wish-coordinator.js";

class RuntimeBirthdayWishStore {
  constructor(storage) {
    this.storage = storage;
  }

  async getBirthdayWishByClaim() {
    return this.storage.get("runtime_upstream_wish");
  }

  async getBirthdayWishByIdempotencyKey() {
    return this.storage.get("runtime_upstream_wish");
  }

  async createBirthdayWish() {
    return this.storage.get("runtime_upstream_wish");
  }

  async completeBirthdayWish() {
    return this.storage.get("runtime_upstream_wish");
  }

  async createOrLoadBirthdayWish(input) {
    const existing = await this.storage.get("runtime_upstream_wish");
    if (existing) return existing;
    const wish = runtimeWish(input);
    const count = Number(await this.storage.get("runtime_create_count") || 0) + 1;
    await this.storage.put({ runtime_upstream_wish: wish, runtime_create_count: count });
    if (input.wishOption === "runtime_timeout_once") {
      throw new Error("runtime test: timeout after upstream commit");
    }
    return wish;
  }
}

export class CareBackBirthdayWishCoordinator extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.coordinator = new CoordinatorCore(ctx, {
      ...env,
      BIRTHDAY_WISH_STORE: new RuntimeBirthdayWishStore(ctx.storage),
    });
  }

  async fetch(request) {
    return this.coordinator.fetch(request);
  }
}

function runtimeWish(input) {
  return {
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
    language: input.language,
    display_version: "care_back_v1",
    idempotency_key: input.idempotencyKey,
    verified_customer_ref_hash: input.verifiedCustomerRefHash,
  };
}

export default {
  async fetch() {
    return new Response("runtime test only", { status: 404 });
  },
};
