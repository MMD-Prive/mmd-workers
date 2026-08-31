import worker from "./index.js";
import { rewritePendingStatusStartResponse } from "./liff-status-resolution-guard.js";
import { isDriveBootstrapCandidate, tryDriveMemberBootstrap } from "./drive-member-bootstrap.js";
import { withDriveBootstrapDiagnostic } from "./drive-bootstrap-debug.js";
import { withStatusFirstMemberResolver } from "./liff-status-first-member-resolver.js";

export * from "./legacy-member-pages.js";
export { CareBackBirthdayWishCoordinator } from "./care-back-birthday-wish-durable-object.js";

export default {
  async fetch(request, env, ctx) {
    const runtimeEnv = withStatusFirstMemberResolver(request, env);
    const firstRequest = request.clone();
    const bootstrapRequest = request.clone();
    const firstResponse = await worker.fetch(firstRequest, runtimeEnv, ctx);
    const firstPayload = await jsonPayload(firstResponse);

    if (isDriveBootstrapCandidate(request, firstPayload)) {
      const bootstrap = await tryDriveMemberBootstrap(bootstrapRequest, env);
      if (bootstrap.mapped) {
        const retriedResponse = await worker.fetch(request, runtimeEnv, ctx);
        return rewritePendingStatusStartResponse(request, retriedResponse);
      }
      const diagnosticResponse = withDriveBootstrapDiagnostic(request, firstResponse, firstPayload, bootstrap);
      return rewritePendingStatusStartResponse(request, diagnosticResponse);
    }

    return rewritePendingStatusStartResponse(request, firstResponse);
  },
};

async function jsonPayload(response) {
  if (!(response instanceof Response)) return null;
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) return null;
  return response.clone().json().catch(() => null);
}
