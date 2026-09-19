import { badRequest } from "../lib/errors.js";
import { success } from "../lib/response.js";
import { assertActor } from "../services/guardrails.js";
import { reasonKenjiCustomerContext } from "../services/kenji-customer-reasoning.js";

export async function handleKenjiCustomerReasoning(req, env, ctx, body) {
  assertActor(body?.actor);
  if (!body?.customer_context || typeof body.customer_context !== "object" || Array.isArray(body.customer_context)) {
    throw badRequest("customer_context is required");
  }

  const data = reasonKenjiCustomerContext(body.customer_context);
  return success(req.requestId, data, {
    confidence: data.review_required ? 0.55 : 0.92,
    authority: "my_mmd_entitlement_resolver_v1",
    read_only: true,
  });
}
