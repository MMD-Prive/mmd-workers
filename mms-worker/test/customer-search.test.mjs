import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { maybeHandleCustomerSearch } from "../src/customer-search-runtime.mjs";
import { handleMyMmsCustomerApi } from "../../member-dashboard-chat-worker/src/my-mms-customer-app-front-gate.js";

const member = "mmsmem_" + "a".repeat(32);
const env = {
  AIRTABLE_API_TOKEN: "test-only",
  AIRTABLE_BASE_ID: "appTest",
  AIRTABLE_SERVICE_ZONES_TABLE_ID: "tblZones",
  AIRTABLE_THERAPISTS_TABLE_ID: "tblTherapists",
};
const zone = {
  id: "recZone",
  fields: {
    Active: true,
    "Zone Code": "BKK-SUKHUMVIT",
    "Zone Name TH": "สุขุมวิท",
    "Province TH": "กรุงเทพมหานคร",
  },
};
const therapist = (fields = {}, id = "recTherapist") => ({
  id,
  fields: {
    "Therapist ID": "mms_th_test",
    "Display Name": "ชื่อสาธารณะจาก fixture",
    Status: "Active",
    "Therapist Auth Status": "Active",
    "LINE Subject Hash": "test-subject-hash",
    "MY MMS Access": "Approved",
    "Matching Enabled": true,
    "Verified Skills": ["Aroma Therapy Oil Massage"],
    "Customer Gender Scope": "ผู้ชาย",
    "Availability Status": "Available",
    "Base Service Zone": ["recZone"],
    "Private Phone": "must-never-leak",
    ...fields,
  },
});
const criteria = new URLSearchParams({
  service: "aroma_therapy_oil",
  zone: "BKK-SUKHUMVIT",
  availability: "Available",
  recipient: "ผู้ชาย",
});
const internal = (params = criteria, init = {}) =>
  new Request(`https://mms.internal/internal/mms/customer-search?${params}`, {
    headers: { "x-mms-customer-member-ref": member },
    ...init,
  });
function fixture(t, records = [therapist()], options = {}) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const parsed = new URL(url);
    calls.push({ url: parsed, init });
    assert.equal(init.method, "GET", "search must never write");
    assert.equal(parsed.hostname, "api.airtable.com");
    assert.ok(init.signal instanceof AbortSignal);
    if (options.respond) return options.respond(parsed, init);
    return Response.json({
      records: parsed.pathname.endsWith("tblZones") ? [zone] : records,
    });
  });
  return calls;
}

test("search is mounted in the current production entrypoint without config changes", () => {
  const entry = readFileSync(
    new URL("../src/runtime-index-with-dispatch.js", import.meta.url),
    "utf8",
  );
  assert.match(entry, /maybeHandleCustomerSearch\(request, env\)/);
});
test("catalog uses backend courses and live canonical zones, never legacy guessed areas", async (t) => {
  const calls = fixture(t);
  const response = await maybeHandleCustomerSearch(
    new Request("https://mms.internal/internal/mms/customer-search/catalog", {
      headers: { "x-mms-customer-member-ref": member },
    }),
    env,
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.services[0].code, "aroma_therapy_oil");
  assert.deepEqual(body.data.zones, [
    { code: "BKK-SUKHUMVIT", label: "สุขุมวิท", province: "กรุงเทพมหานคร" },
  ]);
  assert.deepEqual(
    body.data.availability.map((x) => x.code),
    ["Available", "Unavailable", "Paused"],
  );
  assert.equal(calls.length, 1);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});
test("search projects only verified service / exact linked area / operational access", async (t) => {
  const calls = fixture(t);
  const response = await maybeHandleCustomerSearch(internal(), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.results.length, 1);
  assert.equal(body.data.results[0].canReceiveWork, true);
  assert.deepEqual(body.data.results[0].areaTags, ["สุขุมวิท"]);
  assert.deepEqual(
    Object.keys(body.data.results[0]).sort(),
    [
      "id",
      "publicName",
      "serviceTags",
      "areaTags",
      "availability",
      "canReceiveWork",
    ].sort(),
  );
  assert.doesNotMatch(
    JSON.stringify(body),
    /test-subject|must-never-leak|recTherapist|match_score|payment|payout/,
  );
  assert.equal(calls.length, 2);
});
test("all availability states remain distinct and Offline / Paused never claim ready", async (t) => {
  const records = ["Available", "Unavailable", "Paused"].map((status, i) =>
    therapist({
      "Therapist ID": `mms_status_${i}`,
      "Availability Status": status,
    }),
  );
  fixture(t, records);
  for (const status of ["Available", "Unavailable", "Paused"]) {
    const params = new URLSearchParams(criteria);
    params.set("availability", status);
    const body = await (
      await maybeHandleCustomerSearch(internal(params), env)
    ).json();
    assert.equal(body.data.results.length, 1);
    assert.equal(body.data.results[0].availability, status);
    assert.equal(body.data.results[0].canReceiveWork, status === "Available");
  }
});
test("access, identity, matching, verified course, recipient and canonical zone each fail closed", async (t) => {
  fixture(t, [
    ...[
      { Status: "Suspended" },
      { "Therapist Auth Status": "Revoked" },
      { "LINE Subject Hash": "" },
      { "MY MMS Access": "Locked" },
      { "MY MMS Access": "Revoked" },
      { "Matching Enabled": false },
      { "Matching Enabled": "true" },
      { "Manual Review Only": true },
      { "Verified Skills": [] },
      { "Verified Skills": ["Thai Massage"] },
      { "Customer Gender Scope": "ผู้หญิง" },
      {
        "Base Service Zone": [],
        "Coverage Service Zones": [],
        "Base Zone": "Sukhumvit",
      },
      { "Availability Status": "Paused" },
      { "Availability Status": "Unavailable" },
    ].map((f, i) => therapist({ ...f, "Therapist ID": `mms_rejected_${i}` })),
    therapist({
      "Therapist ID": "mms_covered",
      "Base Service Zone": [],
      "Coverage Service Zones": ["recZone"],
    }),
  ]);
  const body = await (await maybeHandleCustomerSearch(internal(), env)).json();
  assert.deepEqual(
    body.data.results.map((x) => x.id),
    ["mms_covered"],
  );
});
test("successful complete empty read is the only empty success", async (t) => {
  fixture(t, []);
  const response = await maybeHandleCustomerSearch(internal(), env);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data.results, []);
});
test("unknown, duplicate and legacy filters are rejected before reading records", async (t) => {
  const calls = fixture(t);
  for (const change of [
    (p) => p.set("zone", "sukhumvit"),
    (p) => p.set("service", "made_up"),
    (p) => p.set("availability", "Online"),
    (p) => p.append("service", "thai_massage"),
    (p) => p.set("member_ref", member),
  ]) {
    const params = new URLSearchParams(criteria);
    change(params);
    assert.equal(
      (await maybeHandleCustomerSearch(internal(params), env)).status,
      400,
    );
  }
  const params = new URLSearchParams(criteria);
  params.set("recipient", "");
  assert.equal(
    (await maybeHandleCustomerSearch(internal(params), env)).status,
    409,
  );
  assert.equal(calls.length, 0);
});
test("public and unauthenticated internal requests fail closed; only GET accepted", async (t) => {
  const calls = fixture(t);
  assert.equal(
    (
      await maybeHandleCustomerSearch(
        new Request("https://public.example/internal/mms/customer-search"),
        env,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await maybeHandleCustomerSearch(
        new Request("https://mms.internal/internal/mms/customer-search"),
        env,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await maybeHandleCustomerSearch(
        internal(criteria, { method: "POST" }),
        env,
      )
    ).status,
    405,
  );
  assert.equal(
    await maybeHandleCustomerSearch(
      new Request("https://mms.internal/unrelated"),
      env,
    ),
    null,
  );
  assert.equal(calls.length, 0);
});
test("upstream failure / invalid response / missing config never become empty results", async (t) => {
  for (const payload of [null, {}, { records: [null] }]) {
    fixture(t, [], { respond: () => Response.json(payload) });
    const response = await maybeHandleCustomerSearch(internal(), env);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).ok, false);
  }
  fixture(t, [], { respond: () => new Response("{}", { status: 503 }) });
  assert.equal((await maybeHandleCustomerSearch(internal(), env)).status, 503);
  assert.equal((await maybeHandleCustomerSearch(internal(), {})).status, 503);
});
test("pagination reads every page and refuses a truncated catalog", async (t) => {
  const calls = fixture(t, [], {
    respond: (parsed) =>
      parsed.pathname.endsWith("tblZones")
        ? Response.json({ records: [zone] })
        : Response.json(
            parsed.searchParams.has("offset")
              ? { records: [therapist()] }
              : { records: [], offset: "next" },
          ),
  });
  assert.equal(
    (await (await maybeHandleCustomerSearch(internal(), env)).json()).data
      .results.length,
    1,
  );
  assert.equal(calls.length, 3);
  fixture(t, [], {
    respond: () => Response.json({ records: [], offset: "still-more" }),
  });
  const response = await maybeHandleCustomerSearch(internal(), env);
  assert.equal(response.status, 503);
  assert.equal(
    (await response.json()).error.code,
    "MMS_SEARCH_SOURCE_INCOMPLETE",
  );
});
test("duplicate operational identity is unavailable, never silently chooses one", async (t) => {
  fixture(t, [therapist(), therapist({}, "recOther")]);
  const response = await maybeHandleCustomerSearch(internal(), env);
  assert.equal(response.status, 503);
  assert.equal(
    (await response.json()).error.code,
    "MMS_SEARCH_IDENTITY_AMBIGUOUS",
  );
});
test("aborted source read returns unavailable, no success fallback", async (t) => {
  fixture(t, [], {
    respond: (_url, init) => {
      init.signal.throwIfAborted();
      return Response.json({ records: [zone] });
    },
  });
  const controller = new AbortController();
  controller.abort();
  assert.equal(
    (
      await maybeHandleCustomerSearch(
        internal(criteria, { signal: controller.signal }),
        env,
      )
    ).status,
    503,
  );
});
test("BFF resolves customer session then calls search without forwarding cookie or caller identity", async (t) => {
  fixture(t);
  const calls = [];
  const bff = {
    MMS_MEMBER_WORKER: {
      fetch: async () =>
        Response.json({
          ok: true,
          data: { registered: true, profile: { member_id: member } },
        }),
    },
    MMS_WORKER: {
      fetch: (request) => {
        calls.push(request);
        return maybeHandleCustomerSearch(request, env);
      },
    },
  };
  const response = await handleMyMmsCustomerApi(
    new Request(
      `https://www.mmdbkk.com/api/mms/app/therapists/search?${criteria}`,
      {
        headers: {
          cookie: "private-session",
          authorization: "never-forward",
          "x-mms-customer-member-ref": "spoofed",
        },
      },
    ),
    bff,
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.results.length, 1);
  assert.equal(calls[0].headers.get("x-mms-customer-member-ref"), member);
  assert.equal(calls[0].headers.has("cookie"), false);
  assert.equal(calls[0].headers.has("authorization"), false);
});
test("BFF session failure never calls matching and old backend 404 is checking", async () => {
  let calls = 0;
  const bff = {
    MMS_MEMBER_WORKER: {
      fetch: async () => Response.json({ ok: false }, { status: 401 }),
    },
    MMS_WORKER: {
      fetch: async () => {
        calls++;
        return new Response("{}", { status: 404 });
      },
    },
  };
  const request = new Request(
    "https://www.mmdbkk.com/api/mms/app/therapists/search/catalog",
  );
  assert.equal((await handleMyMmsCustomerApi(request, bff)).status, 401);
  assert.equal(calls, 0);
  bff.MMS_MEMBER_WORKER.fetch = async () =>
    Response.json({
      ok: true,
      data: { registered: true, profile: { member_id: member } },
    });
  assert.equal((await handleMyMmsCustomerApi(request, bff)).status, 503);
  assert.equal(
    (
      await handleMyMmsCustomerApi(
        new Request(request, { method: "POST" }),
        bff,
      )
    ).status,
    405,
  );
});

test("source deadline aborts the pending read and produces an unavailable error", async (t) => {
  const controller = new AbortController();
  t.mock.method(AbortSignal, "timeout", (milliseconds) => {
    assert.equal(milliseconds, 6500);
    return controller.signal;
  });
  t.mock.method(
    globalThis,
    "fetch",
    (_url, init) =>
      new Promise((_resolve, reject) =>
        init.signal.addEventListener(
          "abort",
          () => reject(new DOMException("Deadline", "AbortError")),
          { once: true },
        ),
      ),
  );
  const pending = maybeHandleCustomerSearch(internal(), env);
  controller.abort();
  const response = await pending;
  assert.equal(response.status, 503);
  assert.equal((await response.json()).ok, false);
});
test("BFF preserves denied member access and never queries discovery", async () => {
  const bff = {
    MMS_MEMBER_WORKER: {
      fetch: async () => new Response("{}", { status: 403 }),
    },
    MMS_WORKER: {
      fetch: () => {
        throw Error("not allowed");
      },
    },
  };
  const response = await handleMyMmsCustomerApi(
    new Request("https://www.mmdbkk.com/api/mms/app/therapists/search/catalog"),
    bff,
  );
  assert.equal(response.status, 403);
});
