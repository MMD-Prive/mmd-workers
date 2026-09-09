import runtime from "./runtime-index.js";
export { MmsCoordinator } from "./runtime-index.js";
import { maybeHandleTherapistAccessInvite } from "./therapist-invite-runtime.mjs";
import { augmentAdminSnapshotWithMyMmsAccess, maybeHandleMyMmsAccess } from "./my-mms-access-runtime.mjs";

const ADMIN_SNAPSHOT_PATH = "/internal/mms/admin/snapshot";

export default {
  async fetch(request, env, ctx) {
    const accessResponse = await maybeHandleMyMmsAccess(request, env);
    if (accessResponse) return accessResponse;

    const inviteResponse = await maybeHandleTherapistAccessInvite(request, env);
    if (inviteResponse) return inviteResponse;

    const response = await runtime.fetch(request, env, ctx);
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname.replace(/\/$/, "") === ADMIN_SNAPSHOT_PATH && response.ok) {
      try {
        const snapshot = await response.clone().json();
        const augmented = await augmentAdminSnapshotWithMyMmsAccess(snapshot, env);
        const headers = new Headers(response.headers);
        headers.set("Cache-Control", "no-store, max-age=0");
        headers.set("Content-Type", "application/json; charset=utf-8");
        return new Response(JSON.stringify(augmented), { status: response.status, headers });
      } catch {
        return response;
      }
    }

    return response;
  },
};
