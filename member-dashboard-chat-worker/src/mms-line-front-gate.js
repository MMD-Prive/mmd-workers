import currentWorker from "./my-mmd-bounded-status-front-gate.js";
import { handleMmsLineRequest, isMmsLineRequest } from "./mms-line-runtime.mjs";
import { handleKenjiSeedLineRequest, isKenjiSeedLineRequest } from "./kenji-seed-line-runtime.mjs";

export { KenjiModelIdempotency } from "./my-mmd-bounded-status-front-gate.js";

const KENJI_RUNTIME_STATUS_RPC_PATH = "/v1/internal/kenji/control/runtime/status";
const KENJI_RUNTIME_TABLE_FALLBACK = "tblPRUGp6AxWMM5gQ";
const KENJI_RUNTIME_SCOPES = Object.freeze([
  "line_oa_auto_reply",
  "model_keyword_auto_reply",
  "all_kenji_mutations",
]);
const RUNTIME_STATUS_SENTINEL = "service-binding-runtime-status";

function text(value) {
  return value == null ? "" : String(value).trim();
}

function escapeFormulaValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function runtimeStatusRequest(request) {
  if (!request || String(request.method || "GET").toUpperCase() !== "POST") return false;
  try {
    const url = new URL(request.url);
    return url.hostname === "admin-worker.local" && url.pathname === KENJI_RUNTIME_STATUS_RPC_PATH;
  } catch (_) {
    return false;
  }
}

function runtimeJson(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
      "x-mmd-runtime-status-source": status === 200 ? "airtable-fallback" : "fail-closed",
    },
  });
}

async function readRuntimeScopeFromAirtable(env = {}, scope = "") {
  const apiKey = text(env.AIRTABLE_API_KEY);
  const baseId = text(env.AIRTABLE_BASE_ID);
  const table = text(env.AIRTABLE_TABLE_KENJI_RUNTIME_CONTROLS_ID || KENJI_RUNTIME_TABLE_FALLBACK);
  if (!apiKey || !baseId || !table || !scope) throw new Error("runtime_control_config_missing");

  const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("maxRecords", "1");
  url.searchParams.set("filterByFormula", `{scope}=\"${escapeFormulaValue(scope)}\"`);
  url.searchParams.set("sort[0][field]", "version");
  url.searchParams.set("sort[0][direction]", "desc");
  url.searchParams.append("fields[]", "enabled_state");
  url.searchParams.append("fields[]", "version");

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) throw new Error(`runtime_control_airtable_${response.status}`);
  const payload = await response.json().catch(() => ({}));
  const record = Array.isArray(payload?.records) ? payload.records[0] : null;
  return text(record?.fields?.enabled_state).toLowerCase() === "enabled";
}

export async function readKenjiRuntimeControlsFallback(env = {}) {
  const pairs = await Promise.all(
    KENJI_RUNTIME_SCOPES.map(async (scope) => [scope, await readRuntimeScopeFromAirtable(env, scope)]),
  );
  return Object.fromEntries(pairs);
}

export function buildKenjiSeedRuntimeEnv(env = {}) {
  const sourceEnv = env || {};
  const upstream = Reflect.get(sourceEnv, "ADMIN_WORKER", sourceEnv);
  const originalInternalToken = text(Reflect.get(sourceEnv, "INTERNAL_TOKEN", sourceEnv));

  const adminProxy = {
    async fetch(request) {
      if (runtimeStatusRequest(request)) {
        if (upstream?.fetch && originalInternalToken) {
          try {
            const primary = await upstream.fetch(request);
            if (primary?.ok) return primary;
          } catch (_) {
            // Fall through to the same canonical Runtime Controls table.
          }
        }

        try {
          const controls = await readKenjiRuntimeControlsFallback(sourceEnv);
          return runtimeJson({
            ok: true,
            controls,
            authority: "kenji_runtime_controls_airtable_fallback",
          });
        } catch (_) {
          // Preserve the existing fail-closed behavior if both the service RPC
          // and canonical Runtime Controls table are unavailable.
          return runtimeJson({ ok: false, error: "runtime_control_unavailable" }, 503);
        }
      }

      if (upstream?.fetch && originalInternalToken) return upstream.fetch(request);
      return runtimeJson({ ok: false, error: "service_binding_unavailable" }, 503);
    },
  };

  // Cloudflare's env object is a runtime binding container, not a plain data
  // object. Do not move it onto another object's prototype or spread/copy it:
  // either approach can make secret/service bindings disappear in production.
  // This transparent proxy overrides only the two runtime-status dependencies
  // and resolves every other binding against the original env receiver.
  return new Proxy(sourceEnv, {
    get(target, property) {
      if (property === "ADMIN_WORKER") return adminProxy;
      if (property === "INTERNAL_TOKEN") return originalInternalToken || RUNTIME_STATUS_SENTINEL;
      return Reflect.get(target, property, target);
    },
    has(target, property) {
      if (property === "ADMIN_WORKER" || property === "INTERNAL_TOKEN") return true;
      return Reflect.has(target, property);
    },
  });
}

function seedSmokeRequest(request) {
  if (request.method !== "GET" || request.headers.get("x-mmd-kenji-seed-smoke") !== "1") return request;
  const url = new URL(request.url);
  url.searchParams.set("kenji_seed_smoke", "1");
  const intent = String(request.headers.get("x-mmd-kenji-seed-intent") || "").trim();
  if (intent) url.searchParams.set("intent", intent);
  return new Request(url.toString(), request);
}

export default {
  async fetch(request, env = {}, ctx) {
    if (isMmsLineRequest(request)) return handleMmsLineRequest(request, env, ctx);
    if (isKenjiSeedLineRequest(request)) {
      return handleKenjiSeedLineRequest(seedSmokeRequest(request), buildKenjiSeedRuntimeEnv(env), ctx, currentWorker);
    }
    return currentWorker.fetch(request, env, ctx);
  },
};
