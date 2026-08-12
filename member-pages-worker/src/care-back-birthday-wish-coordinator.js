import { INTERNAL_JSON_BODY_MAX_BYTES, readBoundedJsonObject } from "./bounded-json.js";
import { BirthdayWishStorageError, getBirthdayWishStore } from "./care-back-birthday-wish-store.js";

const INTERNAL_PATH = "/__internal/care-back/birthday-wish";
const INTERNAL_STATE_PATH = "/__internal/care-back/birthday-wish/state";
const INTERNAL_RECONCILE_PATH = "/__internal/care-back/birthday-wish/reconcile";
const MAX_PUBLIC_RECOVERY_ATTEMPTS = 3;

// Node unit tests exercise this core directly. The production Durable Object
// wrapper extends Cloudflare's DurableObject base class in the sibling module.
export class CareBackBirthdayWishCoordinator {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.tail = Promise.resolve();
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === INTERNAL_STATE_PATH) {
      return this.readState();
    }
    if (request.method !== "POST" || (url.pathname !== INTERNAL_PATH && url.pathname !== INTERNAL_RECONCILE_PATH)) {
      return Response.json({ ok: false, error: { code: "NOT_FOUND" } }, { status: 404 });
    }

    const parsed = await readBoundedJsonObject(request, INTERNAL_JSON_BODY_MAX_BYTES);
    if (!parsed.ok) {
      return Response.json({ ok: false, error: { code: parsed.code } }, { status: parsed.status });
    }
    const operation = url.pathname === INTERNAL_RECONCILE_PATH
      ? () => this.reconcile(parsed.value)
      : () => this.createOrLoad(parsed.value);
    const run = this.tail.then(operation, operation);
    this.tail = run.catch(() => undefined);
    return run;
  }

  async readState() {
    if (!this.ctx?.storage) return coordinatorError("BIRTHDAY_WISH_COORDINATOR_NOT_CONFIGURED", 503);
    try {
      const canonical = await this.ctx.storage.get("canonical_wish");
      if (canonical) return Response.json({ ok: true, state: "completed" });
      const pending = await this.ctx.storage.get("pending_wish");
      if (!pending) return Response.json({ ok: true, state: "ready" });
      return Response.json({ ok: true, state: pending.state === "reconciliation_required" ? "reconciliation_required" : "pending_recovery" });
    } catch {
      return coordinatorError("BIRTHDAY_WISH_COORDINATOR_UNAVAILABLE", 503);
    }
  }

  async createOrLoad(body) {
    const store = getBirthdayWishStore(this.env);
    if (!store || !this.ctx?.storage) return coordinatorError("BIRTHDAY_WISH_STORAGE_NOT_CONFIGURED", 503);
    try {
      const canonical = await this.ctx.storage.get("canonical_wish");
      if (canonical) {
        assertWishOwnership(canonical, body);
        return Response.json({ ok: true, wish: canonical });
      }

      const pending = await this.ctx.storage.get("pending_wish");
      if (pending) {
        assertPendingOwnership(pending, body);
        if (pending.state === "reconciliation_required") {
          throw new BirthdayWishStorageError("BIRTHDAY_WISH_RECONCILIATION_REQUIRED");
        }
        const recovered = await recoverPendingWish(store, pending);
        if (!recovered) await this.recordUncertain(pending);
        await this.ctx.storage.put("canonical_wish", recovered);
        await this.ctx.storage.delete("pending_wish");
        return Response.json({ ok: true, wish: recovered });
      }

      const marker = pendingMarker(body);
      await this.ctx.storage.put("pending_wish", marker);
      let wish;
      try {
        wish = await store.createOrLoadBirthdayWish(body);
        assertWishOwnership(wish, body);
      } catch (error) {
        if (isSafeToRetryCreate(error)) await this.ctx.storage.delete("pending_wish");
        throw error;
      }
      await this.ctx.storage.put("canonical_wish", wish);
      await this.ctx.storage.delete("pending_wish");
      return Response.json({ ok: true, wish });
    } catch (error) {
      return storageErrorResponse(error);
    }
  }

  async reconcile(body) {
    const store = getBirthdayWishStore(this.env);
    if (!store || !this.ctx?.storage) return coordinatorError("BIRTHDAY_WISH_STORAGE_NOT_CONFIGURED", 503);
    try {
      const canonical = await this.ctx.storage.get("canonical_wish");
      if (canonical) {
        assertWishOwnership(canonical, body);
        return Response.json({ ok: true, state: "completed", wish: canonical });
      }
      const pending = await this.ctx.storage.get("pending_wish");
      if (!pending) return Response.json({ ok: true, state: "ready" });
      assertPendingOwnership(pending, body);
      const recovered = await recoverPendingWish(store, pending);
      if (!recovered) {
        await this.ctx.storage.put("pending_wish", {
          ...pending,
          state: "reconciliation_required",
          lastCheckedAt: safeTimestamp(body.now) || new Date().toISOString(),
          operatorChecks: boundedCount(pending.operatorChecks) + 1,
        });
        return Response.json({ ok: true, state: "reconciliation_required" });
      }
      await this.ctx.storage.put("canonical_wish", recovered);
      await this.ctx.storage.delete("pending_wish");
      return Response.json({ ok: true, state: "completed", wish: recovered });
    } catch (error) {
      return storageErrorResponse(error);
    }
  }

  async recordUncertain(pending) {
    const recoveryAttempts = boundedCount(pending.recoveryAttempts) + 1;
    const state = recoveryAttempts >= MAX_PUBLIC_RECOVERY_ATTEMPTS
      ? "reconciliation_required"
      : "pending_recovery";
    await this.ctx.storage.put("pending_wish", {
      ...pending,
      state,
      recoveryAttempts,
      lastCheckedAt: new Date().toISOString(),
    });
    throw new BirthdayWishStorageError(state === "reconciliation_required"
      ? "BIRTHDAY_WISH_RECONCILIATION_REQUIRED"
      : "BIRTHDAY_WISH_WRITE_UNCERTAIN");
  }
}

async function recoverPendingWish(store, pending) {
  const byClaim = await store.getBirthdayWishByClaim({ claimId: pending.claimId });
  if (byClaim) {
    assertWishOwnership(byClaim, pending);
    return completeRecoveredWish(store, byClaim, pending);
  }
  const byIdempotency = await store.getBirthdayWishByIdempotencyKey({ idempotencyKey: pending.idempotencyKey });
  if (!byIdempotency) return null;
  assertWishOwnership(byIdempotency, pending);
  return completeRecoveredWish(store, byIdempotency, pending);
}

function completeRecoveredWish(store, wish, pending) {
  if (wish.wish_status !== "submitted") return wish;
  return store.completeBirthdayWish({
    recordId: wish.record_id,
    publicDisplayText: pending.publicDisplayText,
    completedAt: pending.now,
  });
}

function assertPendingOwnership(pending, input) {
  if (pending.claimId !== String(input.claimId || "") || pending.claimRecordId !== String(input.claimRecordId || "")) {
    throw new BirthdayWishStorageError("BIRTHDAY_WISH_CLAIM_CONFLICT");
  }
  if (pending.verifiedCustomerRefHash !== String(input.verifiedCustomerRefHash || "").trim().toLowerCase()) {
    throw new BirthdayWishStorageError("BIRTHDAY_WISH_IDENTITY_CONFLICT");
  }
}

function assertWishOwnership(wish, input) {
  if (!wish || wish.claim_record_id !== String(input.claimRecordId || "")) {
    throw new BirthdayWishStorageError("BIRTHDAY_WISH_CLAIM_CONFLICT");
  }
  if (wish.verified_customer_ref_hash !== String(input.verifiedCustomerRefHash || "").trim().toLowerCase()) {
    throw new BirthdayWishStorageError("BIRTHDAY_WISH_IDENTITY_CONFLICT");
  }
}

function pendingMarker(body) {
  const now = safeTimestamp(body.now) || new Date().toISOString();
  return {
    version: 1,
    state: "pending_recovery",
    claimId: String(body.claimId || ""),
    claimRecordId: String(body.claimRecordId || ""),
    idempotencyKey: String(body.idempotencyKey || ""),
    verifiedCustomerRefHash: String(body.verifiedCustomerRefHash || "").trim().toLowerCase(),
    publicDisplayText: String(body.publicDisplayText || ""),
    now,
    firstSeenAt: now,
    lastCheckedAt: "",
    recoveryAttempts: 0,
    operatorChecks: 0,
  };
}

function safeTimestamp(value) {
  const input = String(value || "");
  const timestamp = new Date(input);
  return input && !Number.isNaN(timestamp.getTime()) && timestamp.toISOString() === input ? input : "";
}

function boundedCount(value) {
  const count = Number(value);
  return Number.isInteger(count) && count >= 0 && count < Number.MAX_SAFE_INTEGER ? count : 0;
}

function isSafeToRetryCreate(error) {
  const code = error instanceof BirthdayWishStorageError ? error.code : "";
  return code.endsWith("_INVALID") || code.endsWith("_REQUIRED") || code.endsWith("_CONFLICT");
}

function storageErrorResponse(error) {
  const code = error instanceof BirthdayWishStorageError
    ? error.code
    : "BIRTHDAY_WISH_STORAGE_UNAVAILABLE";
  const status = code.endsWith("_CONFLICT") ? 409 : isBirthdayWishInputError(code) ? 400 : 503;
  return coordinatorError(code, status);
}

function isBirthdayWishInputError(code) {
  return code.endsWith("_INVALID") || code === "BIRTHDAY_WISH_CONTENT_REQUIRED";
}

function coordinatorError(code, status) {
  return Response.json({ ok: false, error: { code } }, { status });
}

function coordinatorStub(binding, claimKey) {
  if (!binding?.idFromName || !binding?.get) return null;
  return binding.get(binding.idFromName(String(claimKey)));
}

export async function createOrLoadBirthdayWishThroughCoordinator(env, claimKey, input) {
  const binding = env.CARE_BACK_WISH_COORDINATOR;
  if (binding && typeof binding.createOrLoad === "function") return binding.createOrLoad(input);
  const stub = coordinatorStub(binding, claimKey);
  if (!stub) throw new BirthdayWishStorageError("BIRTHDAY_WISH_COORDINATOR_NOT_CONFIGURED");
  const response = await stub.fetch(new Request(`https://care-back-coordinator.internal${INTERNAL_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  }));
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true || !payload.wish) {
    throw new BirthdayWishStorageError(String(payload?.error?.code || "BIRTHDAY_WISH_COORDINATOR_UNAVAILABLE"));
  }
  return payload.wish;
}

export async function getBirthdayWishCoordinatorState(env, claimKey) {
  const binding = env.CARE_BACK_WISH_COORDINATOR;
  if (binding && typeof binding.getState === "function") return binding.getState(claimKey);
  const stub = coordinatorStub(binding, claimKey);
  if (!stub) return { state: "ready" };
  const response = await stub.fetch(`https://care-back-coordinator.internal${INTERNAL_STATE_PATH}`);
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true) {
    throw new BirthdayWishStorageError(String(payload?.error?.code || "BIRTHDAY_WISH_COORDINATOR_UNAVAILABLE"));
  }
  return { state: String(payload.state || "ready") };
}

export async function reconcileBirthdayWishThroughCoordinator(env, claimKey, input) {
  const binding = env.CARE_BACK_WISH_COORDINATOR;
  const stub = coordinatorStub(binding, claimKey);
  if (!stub) throw new BirthdayWishStorageError("BIRTHDAY_WISH_COORDINATOR_NOT_CONFIGURED");
  const response = await stub.fetch(new Request(`https://care-back-coordinator.internal${INTERNAL_RECONCILE_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  }));
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok !== true) {
    throw new BirthdayWishStorageError(String(payload?.error?.code || "BIRTHDAY_WISH_COORDINATOR_UNAVAILABLE"));
  }
  return payload;
}
