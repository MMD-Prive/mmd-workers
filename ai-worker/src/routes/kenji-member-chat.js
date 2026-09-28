import { badRequest } from "../lib/errors.js";
import { success } from "../lib/response.js";
import { assertActor } from "../services/guardrails.js";
import { buildKenjiMemberChat } from "../services/kenji-member-chat.js";

export async function handleKenjiMemberChat(req, env, ctx, body) {
  assertActor(body?.actor);
  if (!body?.message || typeof body.message !== "string") throw badRequest("message is required");
  if (!body?.context_bundle || typeof body.context_bundle !== "object" || Array.isArray(body.context_bundle)) {
    throw badRequest("context_bundle is required");
  }
  const data = buildKenjiMemberChat(body);
  return success(req.requestId, data, {
    confidence: data.matrix?.safety?.review_required ? 0.55 : 0.9,
    authority: "context_projection_only",
    rights_authority: "my_mmd_entitlement_resolver_v1",
    read_only: true,
  });
}
