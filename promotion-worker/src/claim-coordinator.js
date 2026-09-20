import { DurableObject } from "cloudflare:workers";
import { AirtableClaimStore } from "./airtable-claim-store.js";
import { createSerializedClaimOp } from "./claim-open-core.js";

export class CampaignClaimCoordinator extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.openClaim = createSerializedClaimOp(new AirtableClaimStore(env));
  }

  async fetch(request) {
    const body = await request.json();
    const result = await this.openClaim(body.claim, body.audit);
    return Response.json(result, { status: result.existing ? 200 : 201 });
  }
}
