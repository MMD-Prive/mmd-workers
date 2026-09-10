import liffFoundation from "./liff-identity-foundation.js";
import { handleLiffMemberShell, isLiffMemberShellPath } from "./liff-member-shell.js";
import { handlePublicCareBackWishRoute, isPublicCareBackWishPath } from "./public-care-back-wish.js";
import { handleFindMemberApi, isFindMemberApiPath } from "./find-member-api.js";
import { handleMemberEmailRecovery, isMemberEmailRecoveryPath } from "./member-email-recovery.js";
import { handleMmsMemberPrebookingRead, isMmsMemberPrebookingReadPath } from "./mms-member-prebooking-read.js";
import { handleMmsServiceZoneCatalog, isMmsServiceZoneCatalogPath } from "./mms-service-zone-catalog.js";
import { handleMemberAppApi, isMemberAppApiPath } from "./member-app-api.js";
import {
  applyMyMmdCanonicalEntitlementResponse,
  prepareMyMmdCanonicalEntitlementContext,
} from "./my-mmd-canonical-entitlement-bridge.js";
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
    if (canonicalContext?.unavailable) return Response.json({ ok: false, state: "checking", error: { code: "MEMBER_PROFILE_REFRESH_UNAVAILABLE" } }, { status: 503, headers: { "cache-control": "no-store" } });
    const finish = (response) => applyMyMmdCanonicalEntitlementResponse(request, response, canonicalContext);

    if (isMmsServiceZoneCatalogPath(url)) return finish(await handleMmsServiceZoneCatalog(request, env));
    if (request.method === "GET" && isMmsMemberPrebookingReadPath(url)) return finish(await handleMmsMemberPrebookingRead(request, env));
    if (isMemberAppApiPath(url)) return finish(await handleMemberAppApi(request, env));
    if (isMemberEmailRecoveryPath(url)) return finish(await handleMemberEmailRecovery(request, env));
    if (isFindMemberApiPath(url)) return finish(await handleFindMemberApi(request, env));
    if (isLiffClientDiagnosticPath(url)) return finish(await handleLiffClientDiagnostic(request, env));
    if (isPublicCareBackWishPath(url)) return finish(await handlePublicCareBackWishRoute(request, env));
    if (isLiffMemberShellPath(url)) {
      const response = handleLiffMemberShell(request, env);
      return finish(decorateLiffShellWithClientDiagnostic(response));
    }
    return finish(await liffFoundation.fetch(request, env, ctx));
  },
};
