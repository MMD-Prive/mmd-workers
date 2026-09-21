import {
  buildSigilAvailabilitySnapshot,
  safeAvailabilityReceipt,
  SIGIL_AVAILABILITY_KV_PREFIX,
} from "../../shared/sigil-availability-snapshot-v1.mjs";
import { safeModelKey } from "../../shared/kenji-recommendation-contract-v1.mjs";

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
  const normalizedMethod = String(method || "").toUpperCase();
  return path === SIGIL_AVAILABILITY_INTERNAL_PATH && ["GET", "POST"].includes(normalizedMethod);
}

export async function readSigilAvailabilitySnapshot(env = {}, modelKeyInput = "", nowMs = Date.now()) {
  const binding = env.SIGIL_AVAILABILITY_SNAPSHOTS;
  if (!binding || typeof binding.get !== "function") {
    return { ok: false, status: 503, error: "availability_snapshot_storage_unavailable" };
  }

  const modelKey = safeModelKey(modelKeyInput);
  if (!modelKey) return { ok: false, status: 400, error: "model_key_invalid" };

  let snapshot;
  try {
    snapshot = await binding.get(`${SIGIL_AVAILABILITY_KV_PREFIX}${modelKey}`, "json");
  } catch {
    return { ok: false, status: 503, error: "availability_snapshot_read_failed" };
  }

  if (!snapshot || typeof snapshot !== "object") {
    return {
      ok: true,
      status: 200,
      model_key: modelKey,
      snapshot_state: "missing",
      fresh: false,
      stale: false,
      age_seconds: null,
      ttl_remaining_seconds: null,
      receipt: null,
    };
  }

  const receipt = safeAvailabilityReceipt(snapshot);
  const updatedMs = Date.parse(text(receipt.updated_at));
  const expiresMs = Date.parse(text(receipt.expires_at));
  const fresh = Number.isFinite(expiresMs) && expiresMs > nowMs;
  const stale = Number.isFinite(expiresMs) && expiresMs <= nowMs;
  const ageSeconds = Number.isFinite(updatedMs) ? Math.max(0, Math.floor((nowMs - updatedMs) / 1000)) : null;
  const ttlRemainingSeconds = fresh ? Math.max(0, Math.ceil((expiresMs - nowMs) / 1000)) : 0;

  return {
    ok: true,
    status: 200,
    model_key: modelKey,
    snapshot_state: fresh ? "fresh" : stale ? "stale" : "invalid_expiry",
    fresh,
    stale,
    age_seconds: ageSeconds,
    ttl_remaining_seconds: ttlRemainingSeconds,
    receipt,
  };
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

  if (request.method.toUpperCase() === "GET") {
    if (caller !== "model-console-worker") return json({ ok: false, error: "internal_auth_required" }, 401);
    const modelKey = new URL(request.url).searchParams.get("model_key") || "";
    const result = await readSigilAvailabilitySnapshot(env, modelKey);
    return json(
      result.ok
        ? {
            ok: true,
            model_key: result.model_key,
            snapshot_state: result.snapshot_state,
            fresh: result.fresh,
            stale: result.stale,
            age_seconds: result.age_seconds,
            ttl_remaining_seconds: result.ttl_remaining_seconds,
            snapshot: result.receipt,
          }
        : { ok: false, error: result.error },
      result.status || (result.ok ? 200 : 400),
    );
  }

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
