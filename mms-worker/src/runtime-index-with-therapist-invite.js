import runtime from "./runtime-index.js";
export { MmsCoordinator } from "./runtime-index.js";
import { maybeHandleTherapistAccessInvite } from "./therapist-invite-runtime.mjs";
import { maybeHandleMyMmsAccess } from "./my-mms-access-runtime.mjs";

export default {
  async fetch(request, env, ctx) {
    const accessResponse = await maybeHandleMyMmsAccess(request, env);
    if (accessResponse) return accessResponse;

    const inviteResponse = await maybeHandleTherapistAccessInvite(request, env);
    if (inviteResponse) return inviteResponse;
    return runtime.fetch(request, env, ctx);
  },
};
