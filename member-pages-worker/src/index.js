import liffFoundation from "./liff-identity-foundation.js";
import { handleLiffMemberShell, isLiffMemberShellPath } from "./liff-member-shell.js";
import { handlePublicCareBackWishRoute, isPublicCareBackWishPath } from "./public-care-back-wish.js";
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
    if (isLiffClientDiagnosticPath(url)) return handleLiffClientDiagnostic(request, env);
    if (isPublicCareBackWishPath(url)) return handlePublicCareBackWishRoute(request, env);
    if (isLiffMemberShellPath(url)) {
      const response = handleLiffMemberShell(request, env);
      return decorateLiffShellWithClientDiagnostic(response);
    }
    return liffFoundation.fetch(request, env, ctx);
  },
};
