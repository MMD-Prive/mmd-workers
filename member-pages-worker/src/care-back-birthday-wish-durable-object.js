import { DurableObject } from "cloudflare:workers";

import { CareBackBirthdayWishCoordinator as CoordinatorCore } from "./care-back-birthday-wish-coordinator.js";

export class CareBackBirthdayWishCoordinator extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.coordinator = new CoordinatorCore(ctx, env);
  }

  async fetch(request) {
    return this.coordinator.fetch(request);
  }
}
