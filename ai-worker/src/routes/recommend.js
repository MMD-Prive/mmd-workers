import { success } from "../lib/response.js";
import { badRequest } from "../lib/errors.js";
import { assertActor } from "../services/guardrails.js";
import { reasonKenjiCustomerContext } from "../services/kenji-customer-reasoning.js";

export async function handleRecommend(req, env, ctx, body) {
  assertActor(body?.actor);
  if (!body?.customer_context || typeof body.customer_context !== "object" || Array.isArray(body.customer_context)) {
    throw badRequest("customer_context is required for recommendations");
  }

  const reasoning = reasonKenjiCustomerContext(body.customer_context);
  const recommendations = [{
    type: "conversation_route",
    strategy: reasoning.conversation.strategy,
    cta: reasoning.conversation.cta,
    acknowledge_history_and_tenure: reasoning.conversation.acknowledge_history_and_tenure,
    review_required: reasoning.review_required,
  }];

  return success(req.requestId, { recommendations, reasoning }, {
    confidence: reasoning.review_required ? 0.55 : 0.9,
    authority: "my_mmd_entitlement_resolver_v1",
    read_only: true,
  });
}
