import { env } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const INTERNAL_URL = "https://care-back-coordinator.internal/__internal/care-back/birthday-wish";

function input(suffix, overrides = {}) {
  return {
    claimId: `CB6-2026-${suffix}`,
    claimRecordId: `rec${"A".repeat(14)}`,
    idempotencyKey: `req_${suffix}_1234567890`,
    verifiedCustomerRefHash: "a".repeat(64),
    wishText: "runtime wish",
    wishOption: "care",
    language: "th",
    publicDisplayText: "runtime display",
    now: "2026-08-12T12:00:00.000Z",
    ...overrides,
  };
}

function request(body) {
  return new Request(INTERNAL_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("CARE BACK coordinator in the Workers runtime", () => {
  it("uses the real binding and serializes five concurrent calls to one create", async () => {
    const body = input("CONCURRENT");
    const stub = env.CARE_BACK_WISH_COORDINATOR.getByName(body.claimId);
    const responses = await Promise.all(Array.from({ length: 5 }, () => stub.fetch(request(body))));
    expect(responses.every((response) => response.status === 200)).toBe(true);
    const ids = await Promise.all(responses.map(async (response) => (await response.json()).wish.wish_id));
    expect(new Set(ids).size).toBe(1);

    await runInDurableObject(stub, async (_instance, state) => {
      expect(await state.storage.get("runtime_create_count")).toBe(1);
      expect(await state.storage.get("pending_wish")).toBeUndefined();
      expect(await state.storage.get("canonical_wish")).toBeTruthy();
    });
  });

  it("recovers a committed timeout after eviction without a second create", async () => {
    const body = input("EVICTION", { wishOption: "runtime_timeout_once" });
    const stub = env.CARE_BACK_WISH_COORDINATOR.getByName(body.claimId);
    const timedOut = await stub.fetch(request(body));
    expect(timedOut.status).toBe(503);
    expect((await timedOut.json()).error.code).toBe("BIRTHDAY_WISH_STORAGE_UNAVAILABLE");

    await runInDurableObject(stub, async (_instance, state) => {
      expect(await state.storage.get("pending_wish")).toBeTruthy();
      expect(await state.storage.get("runtime_upstream_wish")).toBeTruthy();
      expect(await state.storage.get("runtime_create_count")).toBe(1);
    });
    await evictDurableObject(stub);

    const recovered = await stub.fetch(request({ ...body, idempotencyKey: "req_EVICTION_retry_1234567890" }));
    expect(recovered.status).toBe(200);
    expect((await recovered.json()).wish.wish_status).toBe("completed");
    await runInDurableObject(stub, async (_instance, state) => {
      expect(await state.storage.get("runtime_create_count")).toBe(1);
      expect(await state.storage.get("pending_wish")).toBeUndefined();
      expect(await state.storage.get("canonical_wish")).toBeTruthy();
    });
  }, 20_000);
});
