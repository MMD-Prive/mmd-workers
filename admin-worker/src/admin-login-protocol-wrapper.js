import adminWorker from "./admin-login-hero-worker.js";
import protocolWorker, { ProtocolPublishCoordinator } from "../../protocol-center-worker/src/index.js";

export * from "./admin-login-hero-worker.js";
export { ProtocolPublishCoordinator };

const PROTOCOL_API_RE = /^\/v1\/admin\/protocols(?:\/|$)/;

/**
 * Canonical production wrapper for Protocol Center.
 *
 * Auth remains owned by admin-login-hero-worker. The protocol runtime delegates
 * its cookie check back to that exact worker through an in-process service-like
 * adapter, so no second auth implementation or browser secret exists.
 *
 * Airtable/KV/DO bindings are the existing admin-worker environment bindings.
 */
export default {
  async fetch(request, env, ctx) {
    const path = normalizePath(new URL(request.url).pathname);
    if (!PROTOCOL_API_RE.test(path)) {
      return adminWorker.fetch(request, env, ctx);
    }

    const protocolEnv = new Proxy(env, {
      get(target, property, receiver) {
        if (property === "ADMIN_WORKER") {
          return {
            fetch(authRequest) {
              return adminWorker.fetch(authRequest, env, ctx);
            },
          };
        }
        return Reflect.get(target, property, receiver);
      },
    });

    return protocolWorker.fetch(request, protocolEnv, ctx);
  },
};

function normalizePath(value) {
  const path = String(value || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}
