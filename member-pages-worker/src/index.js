import liffFoundation from "./liff-identity-foundation.js";
import { handleLiffMemberShell, isLiffMemberShellPath } from "./liff-member-shell.js";
import { handlePublicCareBackWishRoute, isPublicCareBackWishPath } from "./public-care-back-wish.js";
import { handleFindMemberApi, isFindMemberApiPath } from "./find-member-api.js";
import { handleMmsMemberPrebookingRead, isMmsMemberPrebookingReadPath } from "./mms-member-prebooking-read.js";
import { handleMemberAppApi, isMemberAppApiPath } from "./member-app-api.js";
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
    if (request.method === "GET" && isMmsMemberPrebookingReadPath(url)) return handleMmsMemberPrebookingRead(request, env);
    if (isMemberAppApiPath(url)) return handleMemberAppApi(request, env);
    if (isFindMemberApiPath(url)) return handleFindMemberApi(request, env);
    if (isLiffClientDiagnosticPath(url)) return handleLiffClientDiagnostic(request, env);
    if (isPublicCareBackWishPath(url)) return handlePublicCareBackWishRoute(request, env);
    if (isLiffMemberShellPath(url)) {
      const response = handleLiffMemberShell(request, env);
      return decorateLiffShellWithClientDiagnostic(response);
    }
    return liffFoundation.fetch(request, env, ctx);
  },
};