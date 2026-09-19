import { badRequest } from "../lib/errors.js";
import { success } from "../lib/response.js";
import { assertActor } from "../services/guardrails.js";
import { buildKenjiConversationMatrix } from "../services/kenji-conversation-matrix.js";

export async function handleKenjiConversationMatrix(req, env, ctx, body) {
  assertActor(body?.actor);
  if (!body?.context_bundle || typeof body.context_bundle !== "object" || Array.isArray(body.context_bundle)) {
    throw badRequest("context_bundle is required");
  }

  const data = buildKenjiConversationMatrix(body.context_bundle);
  return success(req.requestId, data, {
    confidence: data.safety.review_required ? 0.55 : 0.92,
    authority: "context_projection_only",
    rights_authority: "my_mmd_entitlement_resolver_v1",
    read_only: true,
  });
}
