const PUBLIC_LIMITS = Object.freeze({ photo: 8, clip: 1 });
const PRIVATE_LIMITS = Object.freeze({ photo: 2, clip: 1 });
const RESERVATION_TTL_MS = Object.freeze({ public: 10 * 60 * 1000, private: 30 * 60 * 1000 });
const COMMITTED_BRIDGE_TTL_MS = 5 * 60 * 1000;
const STORAGE_KEY = "model-media-slots:v1";

function clean(value, max = 200) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

function validModelRecordId(value) {
  return /^rec[A-Za-z0-9]{3,36}$/.test(clean(value, 40));
}

function validUploadRef(value) {
  return /^media_[A-Za-z0-9-]{8,80}$/.test(clean(value, 96));
}

function normalizeClaim(input = {}) {
  const lane = clean(input.lane, 20).toLowerCase();
  const kind = clean(input.kind, 20).toLowerCase();
  const uploadRef = clean(input.upload_ref, 96);
  const authoritativeRefs = Array.isArray(input.authoritative_refs)
    ? [...new Set(input.authoritative_refs.map((value) => clean(value, 96)).filter(validUploadRef))].slice(0, 20)
    : [];
  if (!["public", "private"].includes(lane) || !["photo", "clip"].includes(kind) || !validUploadRef(uploadRef)) {
    return { ok: false, error: "media_slot_claim_invalid" };
  }
  return { ok: true, lane, kind, uploadRef, authoritativeRefs };
}

function limitsFor(lane) {
  return lane === "private" ? PRIVATE_LIMITS : PUBLIC_LIMITS;
}

function json(body, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

export class ModelMediaSlotCoordinator {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    if (request.method.toUpperCase() !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
    const input = await request.json().catch(() => null);
    const normalized = normalizeClaim(input);
    if (!normalized.ok) return json(normalized, 400);

    const url = new URL(request.url);
    const result = await this.state.storage.transaction(async (txn) => {
      const now = Date.now();
      const stored = await txn.get(STORAGE_KEY);
      const slots = stored?.version === 1 && stored.slots && typeof stored.slots === "object" ? { ...stored.slots } : {};
      for (const [ref, slot] of Object.entries(slots)) {
        if (!slot || Number(slot.expires_at) <= now) delete slots[ref];
      }

      const { lane, kind, uploadRef, authoritativeRefs } = normalized;
      for (const ref of authoritativeRefs) {
        const slot = slots[ref];
        if (slot && (slot.lane !== lane || slot.kind !== kind)) {
          return { body: { ok: false, error: "media_slot_authority_conflict" }, status: 409 };
        }
        slots[ref] = { lane, kind, state: "committed", expires_at: now + COMMITTED_BRIDGE_TTL_MS };
      }

      const existing = slots[uploadRef];
      if (url.pathname === "/claim") {
        if (existing) {
          if (existing.lane !== lane || existing.kind !== kind) return { body: { ok: false, error: "media_slot_ref_conflict" }, status: 409 };
          await txn.put(STORAGE_KEY, { version: 1, slots });
          return { body: { ok: true, duplicate: true, state: existing.state, lane, kind, upload_ref: uploadRef }, status: 200 };
        }
        const used = Object.values(slots).filter((slot) => slot?.lane === lane && slot?.kind === kind).length;
        const limit = limitsFor(lane)[kind];
        if (used >= limit) return { body: { ok: false, error: `${lane}_${kind}_limit_reached`, used, max_files: limit }, status: 409 };
        slots[uploadRef] = { lane, kind, state: "reserved", expires_at: now + RESERVATION_TTL_MS[lane] };
        await txn.put(STORAGE_KEY, { version: 1, slots });
        return { body: { ok: true, duplicate: false, state: "reserved", lane, kind, upload_ref: uploadRef, used: used + 1, max_files: limit }, status: 200 };
      }

      if (url.pathname === "/commit") {
        if (!existing || existing.lane !== lane || existing.kind !== kind) return { body: { ok: false, error: "media_slot_reservation_missing" }, status: 409 };
        slots[uploadRef] = { lane, kind, state: "committed", expires_at: now + COMMITTED_BRIDGE_TTL_MS };
        await txn.put(STORAGE_KEY, { version: 1, slots });
        return { body: { ok: true, state: "committed", lane, kind, upload_ref: uploadRef }, status: 200 };
      }

      if (url.pathname === "/release") {
        if (existing?.lane === lane && existing?.kind === kind && existing.state === "reserved") delete slots[uploadRef];
        await txn.put(STORAGE_KEY, { version: 1, slots });
        return { body: { ok: true, state: "released", lane, kind, upload_ref: uploadRef }, status: 200 };
      }

      if (url.pathname === "/remove") {
        if (existing?.lane === lane && existing?.kind === kind) delete slots[uploadRef];
        await txn.put(STORAGE_KEY, { version: 1, slots });
        return { body: { ok: true, state: "removed", lane, kind, upload_ref: uploadRef }, status: 200 };
      }

      return { body: { ok: false, error: "not_found" }, status: 404 };
    });
    return json(result.body, result.status);
  }
}

async function coordinatorCall(env, action, input) {
  const modelRecordId = clean(input?.model_record_id, 40);
  if (!validModelRecordId(modelRecordId)) return { ok: false, status: 400, error: "model_record_id_invalid" };
  const namespace = env?.MODEL_MEDIA_SLOT_COORDINATOR;
  if (!namespace?.idFromName || !namespace?.get) return { ok: false, status: 503, error: "media_slot_coordinator_not_ready" };
  try {
    const stub = namespace.get(namespace.idFromName(modelRecordId));
    const response = await stub.fetch(`https://model-media-slot.internal/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await response.json().catch(() => ({}));
    return { ...data, status: response.status };
  } catch {
    return { ok: false, status: 503, error: "media_slot_coordinator_unavailable" };
  }
}

export function claimModelMediaSlot(env, input) {
  return coordinatorCall(env, "claim", input);
}

export function commitModelMediaSlot(env, input) {
  return coordinatorCall(env, "commit", input);
}

export function releaseModelMediaSlot(env, input) {
  return coordinatorCall(env, "release", input);
}

export function removeModelMediaSlot(env, input) {
  return coordinatorCall(env, "remove", input);
}

export const modelMediaSlotInternals = Object.freeze({
  PUBLIC_LIMITS,
  PRIVATE_LIMITS,
  RESERVATION_TTL_MS,
  COMMITTED_BRIDGE_TTL_MS,
});
