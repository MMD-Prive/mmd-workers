import worker from "./index.js";
import { rewritePendingStatusStartResponse } from "./liff-status-resolution-guard.js";
import { isDriveBootstrapCandidate, tryDriveMemberBootstrap } from "./drive-member-bootstrap-cutover.js";
import { withDriveBootstrapDiagnostic } from "./drive-bootstrap-debug.js";
import { withStatusFirstMemberResolver } from "./liff-status-first-member-resolver.js";
import { attachTraceId, createLiffResolutionTrace, createLiffShellBoundaryTrace } from "./liff-resolution-trace.js";

export * from "./legacy-member-pages.js";
export { CareBackBirthdayWishCoordinator } from "./care-back-birthday-wish-durable-object.js";

export default {
  async fetch(request, env, ctx) {
    const shellBoundary = createLiffShellBoundaryTrace(request, env, ctx);
    const trace = createLiffResolutionTrace(request, env, ctx);
    const runtimeEnv = withStatusFirstMemberResolver(request, env);
    const firstRequest = request.clone();
    const bootstrapRequest = request.clone();
    let firstResponse = await worker.fetch(firstRequest, runtimeEnv, ctx);

    if (shellBoundary) {
      shellBoundary.finish(firstResponse);
      firstResponse = shellBoundary.attach(firstResponse);
    }

    const firstPayload = await jsonPayload(firstResponse);

    if (trace) {
      trace.event("member_status", firstResponse.ok ? "complete" : "failed", firstPayload?.error?.code || "", {
        http_status: firstResponse.status,
        member_resolved: firstPayload?.data?.member_resolved === true,
        pending_identity: firstPayload?.data?.pending_identity === true,
      });
    }

    if (isDriveBootstrapCandidate(request, firstPayload, env)) {
      trace?.event("drive_bootstrap", "candidate", "", { candidate: true });
      const bootstrap = await tryDriveMemberBootstrap(bootstrapRequest, env);
      trace?.event("drive_bootstrap", bootstrap.mapped ? "mapped" : "unresolved", bootstrap.reason || "", {
        mapped: bootstrap.mapped === true,
        package_code: bootstrap.package_code || "",
      });
      if (bootstrap.mapped) {
        const retriedResponse = await worker.fetch(request, runtimeEnv, ctx);
        trace?.event("member_retry", retriedResponse.ok ? "complete" : "failed", "", {
          http_status: retriedResponse.status,
        });
        trace?.finish(retriedResponse.ok ? "resolved" : "failed", retriedResponse.ok ? "drive_bootstrap_mapped" : "member_retry_failed");
        const rewritten = await rewritePendingStatusStartResponse(request, retriedResponse, trace?.traceId || "");
        return attachTraceId(rewritten, trace?.traceId || "");
      }
      const diagnosticResponse = withDriveBootstrapDiagnostic(request, firstResponse, firstPayload, bootstrap);
      trace?.finish("unresolved", bootstrap.reason || "drive_bootstrap_unresolved");
      const rewritten = await rewritePendingStatusStartResponse(request, diagnosticResponse, trace?.traceId || "");
      return attachTraceId(rewritten, trace?.traceId || "");
    }

    trace?.finish(firstResponse.ok ? "complete" : "failed", firstPayload?.error?.code || "not_drive_candidate");
    const rewritten = await rewritePendingStatusStartResponse(request, firstResponse, trace?.traceId || "");
    return attachTraceId(rewritten, trace?.traceId || "");
  },
};

async function jsonPayload(response) {
  if (!(response instanceof Response)) return null;
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) return null;
  return response.clone().json().catch(() => null);
}
