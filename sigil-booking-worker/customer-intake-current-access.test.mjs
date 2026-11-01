import { createHash } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import runtimeWorker from "./src/runtime-index.js";
import { sanitizeModelForBooking } from "./src/index.js";
import { resolveMemberEntitlements } from "../auth-worker/src/member-entitlement-resolver.js";

const excluded = ["rec13E9zF71wnDotX", "rec687cy5e8sx6yLI"];
const memberRecordId = "recMemberFixture01";
const member = { id: memberRecordId, fields: { member_id: "fixture-business-member", status: "active" } };
const digest = value => createHash("sha256").update("mmd-discovery-member-v1:" + value).digest("hex");
const env = { AIRTABLE_API_KEY: "fixture-only", AIRTABLE_BASE_ID: "appFixture", AIRTABLE_TABLE_BOOKING_REQUESTS_ID: "Bookings", AIRTABLE_TABLE_ENTITLEMENTS_ID: "Entitlements", AIRTABLE_TABLE_MODELS_ID: "Models", AIRTABLE_TABLE_MEMBERS_ID: "Members", AUTH_SERVICE_SIGIL_BOOKING_TO_MEMBER_PAGES: "fixture-service-secret-at-least-32-characters" };
const snapshot = resolveMemberEntitlements([{ fields: { capability: "private_premium", member_status: "active", access_status: "active" } }]);
const model = { id: "recEligible0000001", fields: { working_name: "Eligible", status: "active", can_work_public: true, can_work_private: true, private_tier: "premium", orientation: "straight", private_work_format: "pn" } };
const stored = { id: "recBookingFixture", fields: { booking_ref: "fixture-booking", client_contact: "stored@example.invalid", resolver_payload_json: JSON.stringify({ entitlement_snapshot: snapshot, access: { member_record_id: memberRecordId } }) } };
const request = (body) => new Request("https://sigil.mmdbkk.com/sigil/api/booking/intake", { method: "POST", headers: { "content-type": "application/json", cookie: "__Secure-mmd_discovery_session=fixture" }, body: JSON.stringify({ booking_ref: "fixture-booking", lane: "private", suppress_telegram_notify: true, ...body }) });

async function withFixture({ entitlements = [], booking = stored, selected = model, lookupFails = false, viewerRef = digest(member.fields.member_id), memberRow = member, entitlementPages } = {}, run) {
  const fixturePages = (entitlementPages || [{ records: entitlements }]).map((page, pageIndex) => ({ ...page, records: page.records.map((row, rowIndex) => ({ ...row, id: row.id || `recEntitlement${String(pageIndex * 100 + rowIndex).padStart(4, "0")}` })) }));
  const linkedIds = fixturePages.flatMap(page => page.records).filter(row => !row.fields?.member || row.fields.member.includes(memberRecordId)).map(row => row.id);
  const original = globalThis.fetch;
  const previousBinding = env.MEMBER_PAGES_WORKER;
  env.MEMBER_PAGES_WORKER = { fetch: async () => viewerRef ? Response.json({ ok: true, memberRef: viewerRef }) : Response.json({ ok: false }, { status: 401 }) };
  const writes = [];
  const reads = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = init.method || "GET";
    if (method !== "GET") {
      const fields = JSON.parse(init.body).fields;
      writes.push(fields);
      return Response.json({ id: "recBookingFixture", fields });
    }
    reads.push(url);
    const table = url.pathname.split("/")[3];
    if (table === "Bookings") return Response.json({ records: booking ? [booking] : [] });
    if (table === "Members") return Response.json({ ...memberRow, fields: { "MMD — Member Entitlements": linkedIds, ...memberRow.fields } });
    if (table === "Entitlements") {
      if (lookupFails) return new Response("unavailable", { status: 503 });
      const page = fixturePages[Number(url.searchParams.get("offset") || 0)];
      const allowedFields = new Set(url.searchParams.getAll("fields[]"));
      const formula = url.searchParams.get("filterByFormula") || "";
      const requestedIds = new Set([...formula.matchAll(/RECORD_ID\(\)="([^"]+)"/g)].map(match => match[1]));
      assert.ok(requestedIds.size > 0, "entitlement reads use exact RECORD_ID batch filters");
      return Response.json({ ...page, records: page.records.filter(row => requestedIds.has(row.id)).map(row => {
        const fields = { member: [memberRecordId], member_lifecycle_status: row.fields?.member_status, ...row.fields };
        return { ...row, fields: Object.fromEntries(Object.entries(fields).filter(([key]) => !allowedFields.size || allowedFields.has(key))) };
      }) });
    }
    if (table === "Models") return Response.json({ records: Array.isArray(selected) ? selected : selected ? [selected] : [] });
    if (table === "MMD — Model Offer Rules") return Response.json({ records: [] });
    throw new Error("unexpected fixture read");
  };
  try { await run({ writes, reads }); } finally { globalThis.fetch = original; env.MEMBER_PAGES_WORKER = previousBinding; }
}
const active = [{ fields: { capability: "private_premium", member_status: "active", access_status: "active" } }];

test("exact withheld records remain absent across scopes and renamed identities; namesakes stay eligible", () => {
  for (const scope of ["public", "private", "booking"]) {
    const options = { scope, privateAllowed: true, allowedFolders: ["premium"], env: {} };
    for (const id of excluded) assert.equal(sanitizeModelForBooking({ ...model, id, fields: { ...model.fields, working_name: "Renamed" } }, options), null);
    for (const name of ["Kenji", "TEST SIGIL MODEL"]) assert.equal(sanitizeModelForBooking({ ...model, fields: { ...model.fields, working_name: name } }, options).model_id, model.id);
  }
});

test("stale selections of either withheld record cannot create Public or Private drafts", async () => {
  for (const lane of ["public", "private"]) for (const id of excluded) {
    await withFixture({ entitlements: active, selected: { ...model, id } }, async ({ writes }) => {
      const response = await runtimeWorker.fetch(request({ lane, selected_model_id: id }), env);
      assert.equal(response.status, 422);
      assert.equal((await response.json()).error, "selected_model_unavailable");
      assert.equal(writes.length, 0);
    });
  }
});

test("Private intake refuses stale active snapshots after expiry, block, grace or failed current lookup", async () => {
  for (const state of ["expired", "blocked", "grace", "missing", "failed"]) {
    const entitlements = state === "missing" ? [] : [{ fields: { capability: "private_premium", member_status: state, access_status: state } }];
    await withFixture({ entitlements, lookupFails: state === "failed" }, async ({ writes }) => {
      const response = await runtimeWorker.fetch(request({ lane: " PRIVATE! ", client_contact: "forged@example.invalid" }), env);
      assert.equal(response.status, 403, state);
      assert.equal((await response.json()).error, "private_requires_current_entitlement");
      assert.equal(writes.length, 0);
    });
  }
});

test("Private intake requires stored context and cannot grant from incoming identity", async () => {
  await withFixture({ booking: null, entitlements: active }, async ({ writes, reads }) => {
    const response = await runtimeWorker.fetch(request({ client_contact: "incoming@example.invalid" }), env);
    assert.equal(response.status, 403);
    assert.equal(writes.length, 0);
    assert.equal(reads.some(url => url.pathname.endsWith("/Entitlements")), false);
  });
});

test("Private current model gate refuses removed, hidden, protected, wrong-folder and work-ineligible selections", async () => {
  for (const selected of [null, { ...model, fields: { ...model.fields, status: "hidden" } }, { ...model, fields: { ...model.fields, private_tier: "exclusive" } }, { ...model, fields: { ...model.fields, working_name: "EMs11" } }, { ...model, fields: { ...model.fields, can_work_private: false, private_tier: "", private_work_format: "" } }]) {
    await withFixture({ entitlements: active, selected }, async ({ writes }) => {
      const response = await runtimeWorker.fetch(request({ selected_model_id: model.id }), env);
      assert.equal(response.status, 422);
      assert.equal(writes.length, 0);
    });
  }
});

test("current Private entitlement permits eligible model and Per-help drafts while persisting fresh access", async () => {
  for (const selected_model_id of [model.id, undefined]) {
    await withFixture({ entitlements: active }, async ({ writes, reads }) => {
      const response = await runtimeWorker.fetch(request({ selected_model_id, service_options: ["mk", "burn"], client_contact: "forged@example.invalid" }), env);
      assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
      assert.equal(writes.length, 1);
      assert.equal(writes[0]["Private Allowed"], true);
      assert.equal(writes[0].client_contact, "stored@example.invalid");
      const saved = JSON.parse(writes[0].resolver_payload_json);
      assert.equal(saved.entitlement_snapshot.access.private_visibility_envelope, "premium");
      assert.deepEqual(saved.customer_search.service_options, ["mk", "burn"]);
      const lookup = reads.find(url => url.pathname.endsWith("/Entitlements"));
      assert.match(lookup.searchParams.get("filterByFormula"), /RECORD_ID\(\)/);
      assert.doesNotMatch(lookup.searchParams.get("filterByFormula"), /FIND|ARRAYJOIN/);
      assert.ok(lookup.searchParams.getAll("fields[]").includes("member"));
      assert.equal(lookup.searchParams.getAll("fields[]").some(field => /email|line_user|contact/.test(field)), false);
    });
  }
});


test("Private intake applies current work, lane and selected-folder limits", async () => {
  for (const override of [{ work_lane: "vip" }, { customer_lane: "gay" }, { selected_access_folder: "exclusive" }, { min_height_cm: 175 }]) {
    await withFixture({ entitlements: active }, async ({ writes }) => {
      const response = await runtimeWorker.fetch(request({ selected_model_id: model.id, ...override }), env);
      assert.equal(response.status, 422);
      assert.equal(writes.length, 0);
    });
  }
});

test("current Standard access replaces stale Premium snapshot and refuses stale Premium selection", async () => {
  const standard = [{ fields: { capability: "private_standard", member_status: "active", access_status: "active" } }];
  await withFixture({ entitlements: standard }, async ({ writes }) => {
    const refused = await runtimeWorker.fetch(request({ selected_model_id: model.id }), env);
    assert.equal(refused.status, 422);
    assert.equal(writes.length, 0);
    const help = await runtimeWorker.fetch(request({}), env);
    assert.equal(help.status, 200);
    assert.equal(JSON.parse(writes[0].resolver_payload_json).entitlement_snapshot.access.private_visibility_envelope, "standard");
  });
});

test("ordinary Public intake and Per-help requests preserve existing draft collection", async () => {
  for (const selected_model_id of [model.id, undefined]) {
    await withFixture({ booking: null }, async ({ writes, reads }) => {
      const response = await runtimeWorker.fetch(request({ lane: "public", selected_model_id }), env);
      assert.equal(response.status, 200);
      assert.equal(writes.length, 1);
      assert.equal(writes[0]["Request Status"], "draft");
      assert.equal(reads.some(url => url.pathname.endsWith("/Entitlements")), false);
    });
  }
});


test("valid booking handles cannot grant Private intake without the matching verified viewer", async () => {
  for (const viewerRef of ["", digest("other-member")]) {
    await withFixture({ entitlements: active, viewerRef }, async ({ writes }) => {
      const response = await runtimeWorker.fetch(request({ selected_model_id: model.id }), env);
      assert.equal(response.status, 403);
      assert.equal(writes.length, 0);
    });
  }
});

test("verified owner binding supports the existing legacy business-ID fallback and checks current member state", async () => {
  await withFixture({ entitlements: active, memberRow: { ...member, fields: { status: "active" } }, viewerRef: digest("mmd_rec_" + memberRecordId) }, async ({ writes }) => {
    const response = await runtimeWorker.fetch(request({}), env);
    assert.equal(response.status, 200);
    assert.equal(writes.length, 1);
  });
  for (const status of ["blocked", "suspended", "revoked", "pending_review"]) {
    await withFixture({ entitlements: active, memberRow: { ...member, fields: { ...member.fields, status } } }, async ({ writes }) => {
      const response = await runtimeWorker.fetch(request({}), env);
      assert.equal(response.status, 403);
      assert.equal(writes.length, 0);
    });
  }
});

test("Private and mixed Booking searches bind the verified owner and use current linked rights", async () => {
  for (const viewerRef of ["", digest("other-member"), digest(member.fields.member_id)]) {
    await withFixture({ entitlements: active, viewerRef, selected: { ...model, fields: { ...model.fields, can_work_public: false } } }, async () => {
      for (const scope of ["private", "booking"]) {
        const response = await runtimeWorker.fetch(new Request(`https://sigil.mmdbkk.com/sigil/api/models/search?scope=${scope}&booking_ref=fixture-booking`, { headers: { cookie: "__Secure-mmd_discovery_session=fixture" } }), env);
        const payload = await response.json();
        if (viewerRef !== digest(member.fields.member_id)) {
          if (scope === "private") assert.equal(payload.blocked, true);
          assert.ok((payload.items || []).every(item => item.scope !== "private"));
          assert.equal(payload.access_scope, "public_only");
        } else {
          assert.equal(payload.access_scope, "public_private");
          assert.equal(payload.items[0].model_id, model.id);
        }
      }
    });
  }
});


test("mixed Booking preserves Public results while stale rights cannot reveal Private models", async () => {
  const inventory = [
    { ...model, fields: { ...model.fields, can_work_public: false } },
    { id: "recPublicFixture01", fields: { working_name: "Public", status: "active", can_work_public: true } },
  ];
  for (const entitlements of [[], [{ fields: { capability: "private_premium", member_status: "blocked", access_status: "active" } }]]) {
    await withFixture({ entitlements, selected: inventory }, async () => {
      const response = await runtimeWorker.fetch(new Request("https://sigil.mmdbkk.com/sigil/api/models/search?scope=booking&booking_ref=fixture-booking&t=untrusted", { headers: { cookie: "__Secure-mmd_discovery_session=fixture" } }), env);
      const payload = await response.json();
      assert.equal(payload.access_scope, "public_only");
      assert.deepEqual(payload.items.map(item => item.model_id), ["recPublicFixture01"]);
    });
  }
});


test("exact inverse-linked entitlement lookup ignores unrelated display labels and blocked rows", async () => {
  const unrelated = { fields: { member: ["recUnrelated000001"], capability: "private_premium", member_lifecycle_status: "blocked", access_status: "active", member_display: memberRecordId } };
  const owned = { fields: { member: [memberRecordId], capability: "private_premium", member_lifecycle_status: "active", access_status: "active" } };
  await withFixture({ entitlementPages: [{ records: [unrelated], offset: "1" }, { records: [owned] }] }, async ({ writes, reads }) => {
    const response = await runtimeWorker.fetch(request({}), env);
    assert.equal(response.status, 200);
    assert.equal(writes.length, 1);
    const pages = reads.filter(url => url.pathname.endsWith("/Entitlements"));
    assert.equal(pages.length, 2);
    assert.ok(pages.every(url => /RECORD_ID\(\)/.test(url.searchParams.get("filterByFormula"))));
  });
  await withFixture({ entitlementPages: [{ records: [{ fields: { ...unrelated.fields, member_lifecycle_status: "active" } }] }] }, async ({ writes }) => {
    const response = await runtimeWorker.fetch(request({}), env);
    assert.equal(response.status, 403);
    assert.equal(writes.length, 0);
  });
});

test("incomplete or looping exact entitlement batches cannot grant even when an early page contains active access", async () => {
  const owned = { fields: { member: [memberRecordId], capability: "private_premium", access_status: "active" } };
  const capped = Array.from({ length: 5 }, (_, i) => ({ records: i === 0 ? [owned] : [], offset: String(i + 1) }));
  for (const entitlementPages of [capped, [{ records: [owned], offset: "1" }, { records: [], offset: "1" }]]) {
    await withFixture({ entitlementPages }, async ({ writes }) => {
      const response = await runtimeWorker.fetch(request({}), env);
      assert.equal(response.status, 403);
      assert.equal(writes.length, 0);
    });
  }
});


test("missing inverse links, missing exact records, mismatched raw links and excessive per-member inventories fail closed", async () => {
  const cases = [
    { entitlements: active, memberRow: { ...member, fields: { ...member.fields, "MMD — Member Entitlements": [] } } },
    { entitlements: active, memberRow: { ...member, fields: { ...member.fields, "MMD — Member Entitlements": ["recMissingEntitle1"] } } },
    { entitlements: [{ id: "recWrongEntitle001", fields: { member: ["recUnrelated000001"], capability: "private_premium", access_status: "active" } }], memberRow: { ...member, fields: { ...member.fields, "MMD — Member Entitlements": ["recWrongEntitle001"] } } },
    { entitlements: active, memberRow: { ...member, fields: { ...member.fields, "MMD — Member Entitlements": Array.from({ length: 501 }, (_, i) => `recEntitlement${String(i).padStart(4, "0")}`) } } },
  ];
  for (const fixture of cases) await withFixture(fixture, async ({ writes }) => {
    const response = await runtimeWorker.fetch(request({}), env);
    assert.equal(response.status, 403);
    assert.equal(writes.length, 0);
  });
});
