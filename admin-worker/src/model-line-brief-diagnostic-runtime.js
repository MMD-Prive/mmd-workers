import { createLineBriefInventoryTransport, createLineBriefInventoryProvider } from "./model-line-brief-inventory.js";

// Source-controlled gate. No env, request, credential or fetch fallback.
export const LINE_BRIEF_INVENTORY_RUNTIME_ENABLED = false;
const EMPTY = Object.freeze({});
const CONTEXT = ["account_id", "namespace_id", "worker_name", "binding_name", "class_name", "store_name"];
const unavailable = () => ({ ok: false, error: "inventory_verification_unavailable", pending_status: "unknown" });

async function boundedCredential(readCredential, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => readCredential({ signal: controller.signal })),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("inventory_credential_timeout"));
        }, timeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

// Explicit injection is for local mocks / a separately approved future release.
// The returned factory is called only after the facade's existing owner gate.
export function createLineBriefDiagnosticRuntimeFactory(options = {}) {
  if (options.enabled !== true) return () => EMPTY;
  const { readCredential, request } = options;
  const credentialTimeoutMs = options.credentialTimeoutMs ?? 5000;
  const baseline = Object.freeze(Object.fromEntries(CONTEXT.map((key) => [key, options.baseline?.[key]])));
  return () => {
    if (typeof readCredential !== "function" || typeof request !== "function" ||
        !Number.isInteger(credentialTimeoutMs) || credentialTimeoutMs < 1 || credentialTimeoutMs > 10000) return EMPTY;
    return Object.freeze({ inventoryBaseline: baseline, verifyExistingObject: async (expected) => {
      const started = Date.now();
      const remaining = () => {
        const elapsed = Date.now() - started;
        if (elapsed < 0 || elapsed >= 60000) throw new Error("inventory_evidence_expired");
        return 60000 - elapsed;
      };
      try {
        // Fresh per-verification state: no token/transport cache across requests.
        let transport;
        const verify = createLineBriefInventoryProvider({ baseline, get: async (resource, parameters) => {
          if (!transport) {
            const token = await boundedCredential(readCredential, Math.min(credentialTimeoutMs, remaining()));
            remaining(); // A late credential must never create a transport.
            transport = createLineBriefInventoryTransport({ baseline, token, request: (url, init) => {
              remaining(); // Recheck immediately before every outbound GET.
              return request(url, init);
            } });
          }
          remaining();
          return transport(resource, parameters);
        } });
        return await verify(expected);
      } catch { return unavailable(); }
    } });
  };
}

// Deliberately supplies neither baseline nor credential/request adapters.
export const lineBriefDiagnosticRuntimeDependencies = createLineBriefDiagnosticRuntimeFactory({
  enabled: LINE_BRIEF_INVENTORY_RUNTIME_ENABLED,
});
