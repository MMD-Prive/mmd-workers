import liffFoundation from "./liff-identity-foundation.js";
import { handleLiffMemberShell, isLiffMemberShellPath } from "./liff-member-shell.js";

export * from "./legacy-member-pages.js";
export { CareBackBirthdayWishCoordinator } from "./care-back-birthday-wish-coordinator.js";

export default {
  async fetch(request, env = {}, ctx) {
    const url = new URL(request.url);
    if (isLiffMemberShellPath(url)) return handleLiffMemberShell(request, env);
    return liffFoundation.fetch(request, env, ctx);
  },
};
