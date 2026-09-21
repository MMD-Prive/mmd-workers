import {
  buildSigilAvailabilitySnapshot,
  safeAvailabilityReceipt,
} from "../../shared/sigil-availability-snapshot-v1.mjs";

export const SIGIL_AVAILABILITY_INTERNAL_PATH = "/v1/internal/sigil/availability-snapshot";
const ALLOWED_INTERNAL_CALLERS = new Set(["model-console-worker", "model-app-worker"]);

function text(value) {
  return String(value == null ? "" : value).trim();
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function internalCaller(request, env = {}) {
  if (text(request.headers.get("x-mmd-internal-call")).toLowerCase() !== "true") return "";
  const caller = text(request.headers.get("x-mmd-service-binding")).toLowerCase();
  if (!ALLOWED_INTERNAL_CALLERS.has(caller)) return "";
  const expected = text(env.INTERNAL_TOKEN);
  if (!expected) return "";
  const supplied = text(request.headers.get("authorization"));
  if (supplied !== `Bearer ${expected}`) return "";
  return caller;
}

export function isSigilAvailabilityInternalRequest(path = "", method = "") {
  return path === SIGIL_AVAILABILITY_INTERNAL_PATH && String(method || "").toUpperCase() === "POST";
}

export async function writeSigilAvailabilitySnapshot(env = {}, input = {}, options = {}) {
  const binding = env.SIGIL_AVAILABILITY_SNAPSHOTS;
  if (!binding || typeof binding.put !== "function") {
    return { ok: false, status: 503, error: "availability_snapshot_storage_unavailable" };
  }

  const built = buildSigilAvailabilitySnapshot(input, options);
  if (!built.ok) return built;

  try {
    await binding.put(
      built.key,
      JSON.stringify(built.snapshot),
      { expirationTtl: built.ttl_seconds },
    );
  } catch {
    return { ok: false, status: 503, error: "availability_snapshot_write_failed" };
  }

  return {
    ok: true,
    status: 200,
    storage: "sigil_availability_snapshot_v1",
    receipt: safeAvailabilityReceipt(built.snapshot),
  };
}

export async function handleSigilAvailabilityInternalRequest(request, env = {}) {
  const caller = internalCaller(request, env);
  if (!caller) return json({ ok: false, error: "internal_auth_required" }, 401);

  const contentType = text(request.headers.get("content-type")).toLowerCase();
  if (!contentType.includes("application/json")) {
    return json({ ok: false, error: "content_type_json_required" }, 415);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const source = caller === "model-console-worker" ? "model_console" : "model_app";
  const confidence = source === "model_console" ? "operator_confirmed" : "model_confirmed";
  const result = await writeSigilAvailabilitySnapshot(env, body, {
    model_key: body.model_key,
    source,
    confidence,
  });
  return json(
    result.ok
      ? { ok: true, source, ...result.receipt }
      : { ok: false, error: result.error },
    result.status || (result.ok ? 200 : 400),
  );
}
