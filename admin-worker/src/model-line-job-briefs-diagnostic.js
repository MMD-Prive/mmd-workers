// No inventory provider is wired in Production. Request JSON is never evidence.
const STORE_NAME = "line-job-briefs-v1";
const PREFIX = "line_brief_response:";
const INTERNAL_URL = "https://model-activation.internal/line-job-briefs";
const HEX = /^[a-f0-9]{64}$/;
const CONTRACT = "line_brief_diagnostic_v1";
const CURSOR_TTL_MS = 5 * 60 * 1000;
const CURSOR_PATTERN = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{24,1024}$/;
const CONTEXT_KEYS = ["account_id", "namespace_id", "worker_name", "binding_name", "class_name", "store_name"];
const reply = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store, private" },
});
const fail = (error, status = 503) => reply({ ok: false, error, pending_status: "unknown" }, status);
const keysOnly = (body, allowed) => Object.keys(body).every((key) => allowed.includes(key));

export function isLineBriefDiagnosticAction(action) {
  return action === "diagnostic_resolve" || action === "diagnostic_pending";
}

function options(body) {
  const limit = body.limit ?? 50;
  const cursor = body.cursor ?? "";
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || typeof cursor !== "string" || (cursor && !CURSOR_PATTERN.test(cursor))) return null;
  return { limit, cursor };
}

// Called only after the existing facade's origin/session/owner checks.
// Both dependencies come from trusted server code, never env or request data.
export async function handleLineBriefDiagnostic(body, env, { verifyExistingObject, inventoryBaseline } = {}) {
  const pending = body.action === "diagnostic_pending";
  if (!isLineBriefDiagnosticAction(body.action) || !keysOnly(body, pending
    ? ["action", "existing_object_id", "limit", "cursor"] : ["action"])) return fail("unsupported_field", 400);
  const page = pending ? options(body) : null;
  if (pending && (!page || !HEX.test(body.existing_object_id || ""))) return fail("diagnostic_input_invalid", 400);
  try {
    const namespace = env.MODEL_ACTIVATION_COORDINATOR;
    const objectId = namespace.idFromName(STORE_NAME).toString();
    if (!HEX.test(objectId)) return fail("diagnostic_identity_unavailable");
    if (!pending) return reply({ ok: true, contract: CONTRACT, read_only: true,
      store_name: STORE_NAME, object_id: objectId, existence_verified: false, observed_at: new Date().toISOString() });
    if (body.existing_object_id !== objectId) return fail("diagnostic_object_mismatch", 409);
    if (typeof verifyExistingObject !== "function") return fail("existing_inventory_verifier_unavailable");
    // Copy before awaiting the verifier: its response cannot redefine the target.
    const baseline = Object.fromEntries(CONTEXT_KEYS.map((key) => [key, inventoryBaseline?.[key]]));
    if (!/^[a-f0-9]{32}$/.test(baseline.account_id || "") || !/^[a-f0-9]{32}$/.test(baseline.namespace_id || "") ||
        baseline.worker_name !== "admin-worker" || baseline.binding_name !== "MODEL_ACTIVATION_COORDINATOR" ||
        baseline.class_name !== "ModelActivationCoordinator" || baseline.store_name !== STORE_NAME) return fail("existing_inventory_baseline_unavailable");
    const proof = await verifyExistingObject({ ...baseline, object_id: objectId });
    const age = Date.now() - Date.parse(proof?.observed_at);
    if (proof?.ok !== true || proof.source !== "cloudflare_existing_objects" || proof.object_id !== objectId ||
        CONTEXT_KEYS.some((key) => proof[key] !== baseline[key]) || !/^[A-Za-z0-9_-]{1,120}$/.test(proof.evidence_id || "") ||
        !Number.isFinite(age) || age < 0 || age > 60000) return fail("existing_inventory_unverified");
    // No stub is obtained until trusted, fresh inventory confirms this exact ID.
    const id = namespace.idFromString(objectId);
    if (id.toString() !== objectId) return fail("diagnostic_object_mismatch", 409);
    return await namespace.get(id).fetch(INTERNAL_URL, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ audience: "owner", action: "diagnostic_pending", expected_object_id: objectId, ...page }),
    });
  } catch { return fail("diagnostic_read_unavailable"); }
}

function encode(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decode(value) {
  const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4));
  const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
  if (encode(bytes) !== value) throw new Error("Noncanonical cursor");
  return bytes;
}

async function cursorKey(env, objectId) {
  // Reuse an existing admin secret; no new binding, key persistence or auth change.
  const secret = env.ADMIN_SESSION_SECRET || env.SESSION_SECRET;
  if (typeof secret !== "string" || !secret.trim()) return null;
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new TextEncoder().encode(objectId),
    info: new TextEncoder().encode(`${CONTRACT}:cursor:v1`) }, material,
  { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function sealCursor(key, after, objectId) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const now = Date.now();
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv,
    additionalData: new TextEncoder().encode(`${CONTRACT}:${objectId}`) }, key,
  new TextEncoder().encode(JSON.stringify({ after, issued_at: now, expires_at: now + CURSOR_TTL_MS })));
  return `v1.${encode(iv)}.${encode(cipher)}`;
}

async function openCursor(key, token, objectId) {
  try {
    const [, iv, cipher] = token.split(".");
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(iv),
      additionalData: new TextEncoder().encode(`${CONTRACT}:${objectId}`) }, key, decode(cipher));
    const value = JSON.parse(new TextDecoder().decode(plain));
    const now = Date.now();
    if (!Number.isSafeInteger(value.issued_at) || !Number.isSafeInteger(value.expires_at) || value.issued_at > now ||
        value.expires_at <= now || value.expires_at - value.issued_at !== CURSOR_TTL_MS ||
        !/^line_brief_response:brf_[A-Za-z0-9-]{10,70}:[a-f0-9]{64}$/.test(value.after || "")) return null;
    return value.after;
  } catch { return null; }
}

function safeMetadata(value) {
  const validDate = (v) => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
  if (!value || !/^brf_[A-Za-z0-9-]{10,70}$/.test(value.brief_id || "") ||
      !/^rsp_[A-Za-z0-9-]{10,70}$/.test(value.response_id || "") ||
      !["pending", "selected", "not_selected"].includes(value.decision) ||
      !Number.isSafeInteger(value.version) || value.version < 1 ||
      !validDate(value.created_at) || !validDate(value.updated_at)) return null;
  return { brief_id: value.brief_id, response_id: value.response_id, decision: value.decision,
    version: value.version, created_at: value.created_at, updated_at: value.updated_at };
}

export async function readLineBriefPendingDiagnostic(state, env, command) {
  if (command?.audience !== "owner" || command.action !== "diagnostic_pending" ||
      !keysOnly(command, ["audience", "action", "expected_object_id", "limit", "cursor"])) return fail("diagnostic_forbidden", 403);
  const page = options(command);
  if (!page || !HEX.test(command.expected_object_id || "")) return fail("diagnostic_input_invalid", 400);
  try {
    const derived = env.MODEL_ACTIVATION_COORDINATOR.idFromName(STORE_NAME).toString();
    if (state.id.toString() !== derived || command.expected_object_id !== derived) return fail("diagnostic_object_mismatch", 409);
    // Authenticated encrypted cursor hides identity-bearing keys and permits
    // a bounded seek (one list + optional boundary get), not a cumulative rescan.
    const key = await cursorKey(env, derived);
    if (!key) return fail("diagnostic_cursor_key_unavailable");
    const after = page.cursor ? await openCursor(key, page.cursor, derived) : "";
    if (after === null) return fail("diagnostic_cursor_invalid", 409);
    if (after && await state.storage.get(after) === undefined) return fail("diagnostic_cursor_stale", 409);
    const rows = await state.storage.list({ prefix: PREFIX, limit: page.limit + 1, ...(after ? { startAfter: after } : {}) });
    if (!(rows instanceof Map) || rows.size > page.limit + 1) return fail("diagnostic_storage_invalid");
    const items = [];
    let examined = 0, previous = after, lastKey = after;
    for (const [recordKey, value] of rows) {
      if (typeof recordKey !== "string" || !recordKey.startsWith(PREFIX) || recordKey <= previous) return fail("diagnostic_storage_invalid");
      previous = recordKey;
      if (examined === page.limit) break;
      const safe = safeMetadata(value);
      if (!safe || recordKey !== `${PREFIX}${safe.brief_id}:${value.subject_hash}` || !HEX.test(value.subject_hash || "")) return fail("diagnostic_record_invalid");
      examined++;
      lastKey = recordKey;
      if (safe.decision === "pending") items.push(safe);
    }
    const more = rows.size > page.limit;
    return reply({ ok: true, contract: CONTRACT, read_only: true, store_name: STORE_NAME, object_id: derived,
      items, examined, pending_count: items.length, count_scope: "page", has_more: more,
      next_cursor: more ? await sealCursor(key, lastKey, derived) : null,
      consistency: "live_page_not_snapshot", observed_at: new Date().toISOString() });
  } catch { return fail("diagnostic_read_unavailable"); }
}
