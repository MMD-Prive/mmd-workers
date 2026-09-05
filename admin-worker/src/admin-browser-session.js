import { readCredentialBoundAdminActor } from "./credential-bound-admin-session.js";

export async function hasValidAdminBrowserSession(request, env = {}) {
  return Boolean(await readCredentialBoundAdminActor(request, env));
}
