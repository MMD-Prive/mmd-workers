import liffFoundation from "./liff-payment-binding.js";
import { handleLiffMemberShell, isLiffMemberShellPath } from "./liff-member-shell.js";
import { decorateMemberLiffJobClaim } from "./job-identity-member-claim.js";
import { handlePublicCareBackWishRoute, isPublicCareBackWishPath } from "./public-care-back-wish.js";
import { handleFindMemberApi, isFindMemberApiPath } from "./find-member-api.js";
import { handleMemberEmailRecovery, isMemberEmailRecoveryPath } from "./member-email-recovery.js";
import { handleMmsMemberPrebookingRead, isMmsMemberPrebookingReadPath } from "./mms-member-prebooking-read.js";
import { handleMmsServiceZoneCatalog, isMmsServiceZoneCatalogPath } from "./mms-service-zone-catalog.js";
import { handleMemberAppApi, isMemberAppApiPath } from "./member-app-api.js";
import {
  ensureMemberHistoryRecoveryOnAccess,
  isMemberHistoryOnAccessPath,
} from "./member-history-on-access.js";
import {
  handleMemberHistoryRecoveryRequest,
  isLiffHistoryRecoveryStartPath,
  isMemberHistoryRecoveryPath,
  scheduleMemberHistoryRecoveryFromLiffResponse,
} from "./member-history-recovery.js";
import {
  applyMyMmdCanonicalEntitlementResponse,
  prepareMyMmdCanonicalEntitlementContext,
} from "./my-mmd-canonical-entitlement-bridge.js";
import {
  applyMyMmdLifetimePointsResponse,
  prepareMyMmdLifetimePointsContext,
} from "./my-mmd-lifetime-points.js";
import {
  decorateLiffShellWithClientDiagnostic,
  handleLiffClientDiagnostic,
  isLiffClientDiagnosticPath,
} from "./liff-client-runtime-diagnostic.js";

export * from "./legacy-member-pages.js";
export { CareBackBirthdayWishCoordinator } from "./care-back-birthday-wish-coordinator.js";

export default {
  async fetch(request, env = {}, ctx) {
    const url = new URL(request.url);
    const canonicalContext = await prepareMyMmdCanonicalEntitlementContext(request, env);
    if (canonicalContext?.unavailable) {
      return Response.json({
        ok: false,
        state: "checking",
        error: { code: "MEMBER_PROFILE_REFRESH_UNAVAILABLE" },
      }, { status: 503, headers: { "cache-control": "no-store" } });
    }
    const lifetimePointsContext = await prepareMyMmdLifetimePointsContext(request, env);
    const finish = async (response) => {
      const canonical = await applyMyMmdCanonicalEntitlementResponse(request, response, canonicalContext);
      return applyMyMmdLifetimePointsResponse(request, canonical, lifetimePointsContext);
    };

    if (isMmsServiceZoneCatalogPath(url)) return finish(await handleMmsServiceZoneCatalog(request, env));
    if (request.method === "GET" && isMmsMemberPrebookingReadPath(url)) return finish(await handleMmsMemberPrebookingRead(request, env));
    if (isMemberHistoryRecoveryPath(url)) return finish(await handleMemberHistoryRecoveryRequest(request, env, ctx));
    if (isMemberAppApiPath(url)) {
      await ensureMemberHistoryRecoveryOnAccess(request, env, ctx);
      return finish(await handleMemberAppApi(request, env));
    }
    if (isMemberEmailRecoveryPath(url)) return finish(await handleMemberEmailRecovery(request, env));
    if (isFindMemberApiPath(url)) return finish(await handleFindMemberApi(request, env));
    if (isLiffClientDiagnosticPath(url)) return finish(await handleLiffClientDiagnostic(request, env));
    if (isPublicCareBackWishPath(url)) return finish(await handlePublicCareBackWishRoute(request, env));
    if (isLiffMemberShellPath(url)) {
      const response = handleLiffMemberShell(request, env);
      const diagnostic = decorateLiffShellWithClientDiagnostic(response);
      return finish(await decorateMemberLiffJobClaim(diagnostic, request));
    }
    if (isLiffHistoryRecoveryStartPath(url)) {
      const response = await liffFoundation.fetch(request, env, ctx);
      scheduleMemberHistoryRecoveryFromLiffResponse(response, env, ctx);
      return finish(response);
    }
    if (isMemberHistoryOnAccessPath(url)) {
      await ensureMemberHistoryRecoveryOnAccess(request, env, ctx);
    }
    return finish(await liffFoundation.fetch(request, env, ctx));
  },
};