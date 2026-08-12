import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  BIRTHDAY_WISH_SCHEMA,
  BirthdayWishStorageError,
  getBirthdayWishStore,
} from "../src/care-back-birthday-wish-store.js";

const realFetch = globalThis.fetch;
const CLAIM_RECORD_ID = `rec${"A".repeat(14)}`;
const WISH_RECORD_ID = `rec${"B".repeat(14)}`;
const OTHER_CLAIM_RECORD_ID = `rec${"C".repeat(14)}`;
const CLAIM_ID = "CB6-2026-ABCDEF12345678";
const REQUEST_ID = "req_1234567890abcdef";
const NOW = "2026-08-10T12:00:00.000Z";

afterEach(() => {
  globalThis.fetch = realFetch;
});

function env(overrides = {}) {
  return {
    AIRTABLE_API_KEY: "test-airtable-key",
    AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg",
    AIRTABLE_REQUEST_TIMEOUT_MS: "50",
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    claimId: CLAIM_ID,
    claimRecordId: CLAIM_RECORD_ID,
    idempotencyKey: REQUEST_ID,
    verifiedCustomerRefHash: "a".repeat(64),
    wishText: "ขอให้ MMD เติบโตอย่างอบอุ่นต่อไปครับ",
    wishOption: "care",
    language: "th",
    publicDisplayText: "MMD ได้รับคำอวยพรของคุณแล้วครับ",
    now: NOW,
    ...overrides,
  };
}

function wishRecord(overrides = {}) {
  return {
    id: WISH_RECORD_ID,
    fields: {
      wish_id: "wish_1234567890abcdef1234567890abcdef",
      "Campaign Claim": [CLAIM_RECORD_ID],
      campaign_id: "care_back",
      verified_customer_ref_hash: "a".repeat(64),
      wish_text: "ขอให้ MMD เติบโตอย่างอบอุ่นต่อไปครับ",
      wish_option: "care",
      wish_status: "completed",
      idempotency_key: REQUEST_ID,
      submitted_at: NOW,
      completed_at: NOW,
      public_display_text: "MMD ได้รับคำอวยพรของคุณแล้วครับ",
      source: "line_liff",
      source_path: "/member/liff",
      language: "th",
      display_version: "care_back_v1",
      payload_json: "{}",
      created_at: NOW,
      updated_at: NOW,
      ...(overrides.fields || {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== "fields")),
  };
}

describe("CARE BACK Birthday Wishes Airtable adapter", () => {
  it("locks the approved production table and source contract", () => {
    assert.deepEqual(BIRTHDAY_WISH_SCHEMA, {
      table_id: "tblvMJjYXy29mgDLb",
      campaign_id: "care_back",
      source: "line_liff",
      source_path: "/member/liff",
      display_version: "care_back_v1",
    });
  });

  it("creates and completes one canonical wish with the exact production field map", async () => {
    const calls = [];
    let createdFields;
    globalThis.fetch = async (url, init) => {
      const parsed = new URL(url);
      calls.push({ url: parsed, init });
      if (init.method === "GET") return Response.json({ records: [] });
      if (init.method === "POST") {
        createdFields = JSON.parse(init.body).fields;
        return Response.json({ id: WISH_RECORD_ID, fields: createdFields });
      }
      const fields = { ...createdFields, ...JSON.parse(init.body).fields };
      return Response.json({ id: WISH_RECORD_ID, fields });
    };

    const wish = await getBirthdayWishStore(env()).createOrLoadBirthdayWish(input());

    assert.equal(wish.wish_status, "completed");
    assert.equal(wish.public_display_text, "MMD ได้รับคำอวยพรของคุณแล้วครับ");
    assert.deepEqual(Object.keys(createdFields).sort(), [
      "Campaign Claim",
      "campaign_id",
      "created_at",
      "display_version",
      "idempotency_key",
      "language",
      "payload_json",
      "source",
      "source_path",
      "submitted_at",
      "updated_at",
      "verified_customer_ref_hash",
      "wish_id",
      "wish_option",
      "wish_status",
      "wish_text",
    ].sort());
    assert.deepEqual(createdFields["Campaign Claim"], [CLAIM_RECORD_ID]);
    assert.equal(createdFields.campaign_id, "care_back");
    assert.equal(createdFields.source, "line_liff");
    assert.equal(createdFields.source_path, "/member/liff");
    assert.equal(createdFields.language, "th");
    assert.equal(createdFields.wish_status, "submitted");
    assert.equal(createdFields.display_version, "care_back_v1");
    assert.match(createdFields.wish_id, /^wish_[a-f0-9]{32}$/);
    assert.deepEqual(JSON.parse(createdFields.payload_json), {
      schema_version: 1,
      campaign_id: "care_back",
      claim_id: CLAIM_ID,
      source: "line_liff",
    });
    assert.doesNotMatch(JSON.stringify(createdFields), /test-airtable-key|raw-line-user|id_token|access_token|cookie|session_secret/i);
    assert.ok(calls.every((call) => decodeURIComponent(call.url.pathname).includes("tblvMJjYXy29mgDLb")));
  });

  it("loads by the exact Campaign Claim display value and returns one canonical record", async () => {
    let formula = "";
    globalThis.fetch = async (url) => {
      formula = new URL(url).searchParams.get("filterByFormula") || "";
      return Response.json({ records: [wishRecord()] });
    };
    const wish = await getBirthdayWishStore(env()).getBirthdayWishByClaim({ claimId: CLAIM_ID });

    assert.match(formula, /ARRAYJOIN\(\{Campaign Claim\}\)/);
    assert.match(formula, /care_back/);
    assert.match(formula, new RegExp(CLAIM_ID));
    assert.equal(wish.wish_id, "wish_1234567890abcdef1234567890abcdef");
    assert.equal(wish.claim_record_id, CLAIM_RECORD_ID);
    assert.equal(wish.verified_customer_ref_hash, "a".repeat(64));
  });

  it("recovers a completed replay before attempting any create", async () => {
    const methods = [];
    globalThis.fetch = async (_url, init) => {
      methods.push(init.method);
      return Response.json({ records: [wishRecord()] });
    };
    const wish = await getBirthdayWishStore(env()).createOrLoadBirthdayWish(input({ idempotencyKey: "different_1234567890" }));

    assert.equal(wish.wish_status, "completed");
    assert.deepEqual(methods, ["GET"]);
  });

  it("recovers a submitted wish by completing the same Airtable record", async () => {
    const methods = [];
    globalThis.fetch = async (_url, init) => {
      methods.push(init.method);
      if (init.method === "GET") return Response.json({ records: [wishRecord({ fields: { wish_status: "submitted", completed_at: "", public_display_text: "" } })] });
      return Response.json({
        ...wishRecord(),
        fields: { ...wishRecord().fields, ...JSON.parse(init.body).fields },
      });
    };
    const wish = await getBirthdayWishStore(env()).createOrLoadBirthdayWish(input());

    assert.equal(wish.wish_status, "completed");
    assert.deepEqual(methods, ["GET", "PATCH"]);
  });

  it("fails closed if the completion response changes record ownership", async () => {
    globalThis.fetch = async (_url, init) => {
      if (init.method === "GET") {
        return Response.json({ records: [wishRecord({ fields: { wish_status: "submitted", completed_at: "", public_display_text: "" } })] });
      }
      return Response.json(wishRecord({
        fields: {
          "Campaign Claim": [OTHER_CLAIM_RECORD_ID],
          wish_status: "completed",
        },
      }));
    };

    await assert.rejects(
      getBirthdayWishStore(env()).createOrLoadBirthdayWish(input()),
      (error) => error?.code === "BIRTHDAY_WISH_CLAIM_CONFLICT",
    );
  });

  it("fails closed when an idempotency key is already tied to another claim", async () => {
    let reads = 0;
    globalThis.fetch = async () => {
      reads += 1;
      if (reads === 1) return Response.json({ records: [] });
      return Response.json({ records: [wishRecord({ fields: { "Campaign Claim": [OTHER_CLAIM_RECORD_ID] } })] });
    };
    await assert.rejects(
      getBirthdayWishStore(env()).createOrLoadBirthdayWish(input()),
      (error) => error?.code === "BIRTHDAY_WISH_IDEMPOTENCY_CONFLICT",
    );
  });

  it("fails closed when a canonical claim is linked to another record or customer hash", async () => {
    for (const fields of [
      { "Campaign Claim": [OTHER_CLAIM_RECORD_ID] },
      { verified_customer_ref_hash: "b".repeat(64) },
    ]) {
      globalThis.fetch = async () => Response.json({ records: [wishRecord({ fields })] });
      await assert.rejects(
        getBirthdayWishStore(env()).createOrLoadBirthdayWish(input()),
        (error) => error?.code === (fields["Campaign Claim"]
          ? "BIRTHDAY_WISH_CLAIM_CONFLICT"
          : "BIRTHDAY_WISH_IDENTITY_CONFLICT"),
      );
    }
  });

  it("fails closed on duplicate or malformed Airtable records", async () => {
    globalThis.fetch = async () => Response.json({ records: [wishRecord(), wishRecord({ id: `rec${"D".repeat(14)}` })] });
    await assert.rejects(
      getBirthdayWishStore(env()).getBirthdayWishByClaim({ claimId: CLAIM_ID }),
      (error) => error?.code === "BIRTHDAY_WISH_CONFLICT",
    );

    globalThis.fetch = async () => Response.json({ records: [wishRecord({ fields: { wish_status: "paid" } })] });
    await assert.rejects(
      getBirthdayWishStore(env()).getBirthdayWishByClaim({ claimId: CLAIM_ID }),
      (error) => error?.code === "BIRTHDAY_WISH_STORAGE_MALFORMED",
    );
  });

  it("rejects invalid identity, link, idempotency, and content before Airtable", async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; return Response.json({ records: [] }); };
    const store = getBirthdayWishStore(env());
    for (const bad of [
      { claimRecordId: "rec-browser" },
      { verifiedCustomerRefHash: "raw-line-user-id" },
      { idempotencyKey: "short" },
      { wishText: "", wishOption: "" },
    ]) {
      await assert.rejects(store.createBirthdayWish(input(bad)), BirthdayWishStorageError);
    }
    assert.equal(calls, 0);
  });

  it("controls Airtable 401, 403, 4xx, and 5xx responses", async () => {
    for (const status of [401, 403, 422, 500]) {
      globalThis.fetch = async () => Response.json({ error: "private-airtable-body" }, { status });
      await assert.rejects(
        getBirthdayWishStore(env()).getBirthdayWishByClaim({ claimId: CLAIM_ID }),
        (error) => error?.code === (status === 401 || status === 403 ? "BIRTHDAY_WISH_STORAGE_FORBIDDEN" : "BIRTHDAY_WISH_STORAGE_UNAVAILABLE"),
      );
    }
  });

  it("aborts a stalled Airtable request and returns a controlled timeout", async () => {
    globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    });
    await assert.rejects(
      getBirthdayWishStore(env()).getBirthdayWishByClaim({ claimId: CLAIM_ID }),
      (error) => error?.code === "BIRTHDAY_WISH_STORAGE_UNAVAILABLE",
    );
  });
});
