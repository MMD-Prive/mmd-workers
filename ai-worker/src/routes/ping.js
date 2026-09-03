import { success } from "../lib/response.js";

export function handlePing(req) {
  return success(req.requestId, {
    service: "ai-worker",
    status: "ok",
    version: "v2",
    mode: "read_only_intelligence",
    canonical_entitlement_authority: "my_mmd_entitlement_resolver_v1",
  });
}
