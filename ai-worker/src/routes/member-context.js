import { success } from "../lib/response.js";
import { badRequest } from "../lib/errors.js";
import { assertActor, canViewMemberContext } from "../services/guardrails.js";
import { buildMemberContext } from "../services/retrieval.js";

export async function handleMemberContext(req, env, ctx, body) {
  if (!body?.member_id) throw badRequest("member_id is required");
  assertActor(body.actor);
  if (!canViewMemberContext(body.actor, body.member_id)) {
    const error = new Error("Actor cannot access this member context");
    error.status = 403;
    error.code = "ACCESS_DENIED";
    throw error;
  }
  const data = await buildMemberContext(body.member_id, env);
  return success(req.requestId, data, {
    confidence: 0.9,
    authority: "canonical_upstream_only",
    read_only: true,
  });
}
