import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyKenjiModelPackage,
  handleKenjiModelAccessRpc,
  isKenjiModelAccessRpcRequest,
  KENJI_MODEL_ACCESS_POLICY_VERSION,
  KENJI_MODEL_ACCESS_RPC_PATH,
  projectKenjiSafeModel,
  resolveKenjiModelAccess,
} from "./src/kenji-model-access-rpc.js";

const LINE_USER_ID = "U1234567890abcdef1234567890abcdef";
const ENV = {
  INTERNAL_TOKEN: "internal-token",
  AIRTABLE_API_KEY: "airtable-token",
  AIRTABLE_BASE_ID: "app-test",
  AIRTABLE_TABLE_MEMBER_ENTITLEMENTS: "entitlements",
  AIRTABLE_ENTITLEMENT_LINE_USER_ID_FIELD: "line_user_id",
  AIRTABLE_TABLE_MODELS: "models",
  AIRTABLE_TABLE_MODEL_KEYWORD_PROFILES: "profiles",
  AIRTABLE_TABLE_KENJI_MODEL_ACCESS_APPROVALS: "approvals",
  AIRTABLE_TABLE_MODEL_OFFER_RULES: "rules",
};

function record(id, fields) { return { id, fields }; }

function entitlement(capability, lifecycle = "active", overrides = {}) {
  const expireAt = lifecycle === "expired" ? "2020-01-01T00:00:00.000Z" : "2099-12-31T23:59:59.000Z";
  return record(`rec-ent-${capability}-${lifecycle}`, {
    line_user_id: LINE_USER_ID,
    capability,
    member_lifecycle_status: lifecycle,
    access_status: lifecycle,
    expire_at: expireAt,
    ...overrides,
  });
}

function privateModel(code = "MX17", folder = "standard", overrides = {}) {
  return record(`rec-model-${code}`, {
    model_code: code,
    working_name: "น้องซิน",
    booking_visibility: "private",
    access_folder: folder,
    status: "active",
    customer_safe_summary: "ข้อมูลแนะนำตัวที่อนุมัติแล้ว",
    customer_safe_image_url: "https://images.example.test/model.webp",
    legal_name: "Must Never Leave Admin",
    phone: "0800000000",
    telegram_username: "private_contact",
    availability_status: "available",
    admin_note: "private note",
    ...overrides,
  });
}

function publicModel(code = "PUB17", overrides = {}) {
  return privateModel(code, "standard", { booking_visibility: "public", access_folder: "", ...overrides });
}

function approval(cohort, folders, overrides = {}) {
  return record(`rec-approval-${cohort}`, {
    line_user_id: LINE_USER_ID,
    status: "approved",
    policy_version: KENJI_MODEL_ACCESS_POLICY_VERSION,
    cohort,
    expires_at: "2099-12-31T23:59:59.000Z",
    allowed_folders: folders,
    ...overrides,
  });
}

function baseData(entitlements = [entitlement("private_standard")], models = [privateModel()], approvals = [], rules = [], profiles = []) {
  return { entitlements, models, approvals, rules, profiles };
}

function keywordProfile(alias, model = privateModel(), overrides = {}) {
  return record("rec-profile-" + alias, {
    Model: [model.id],
    model_key: model.fields.model_code,
    working_name: model.fields.working_name,
    search_aliases: alias,
    status: "Active",
    ...overrides,
  });
}

const SCHEMAS = {
  entitlements: new Set(["line_user_id"]),
  models: new Set(["model_code", "model_lookup_key", "unique_key", "working_name", "Working Name", "display_name", "Display Name", "folder_name"]),
  approvals: new Set(["line_user_id"]),
  profiles: new Set([]),
};

function airtableFetch(data, { failTables = [] } = {}) {
  return async (input) => {
    const url = new URL(String(input));
    const table = decodeURIComponent(url.pathname.split("/").pop());
    if (failTables.includes(table)) return new Response("source private error", { status: 503 });
    const formula = url.searchParams.get("filterByFormula") || "";
    if ((table === "rules" || table === "profiles" || table === "models") && !formula) {
      return new Response(JSON.stringify({ records: data[table] || [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    const match = formula.match(/^LOWER\(\{(.+)}&""\)="(.*)"$/);
    if (!match || !SCHEMAS[table]?.has(match[1])) return new Response(JSON.stringify({ error: "unknown field" }), { status: 422 });
    const field = match[1];
    const value = match[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\").toLowerCase();
    const records = (data[table] || []).filter((item) => String(item.fields?.[field] ?? "").trim().toLowerCase() === value);
    return new Response(JSON.stringify({ records }), { status: 200, headers: { "content-type": "application/json" } });
  };
}

function rpcRequest(body, overrides = {}) {
  const method = overrides.method || "POST";
  return new Request("https://admin-worker.local/v1/internal/kenji/model-access", {
    method,
    headers: {
      authorization: "Bearer internal-token",
      "content-type": "application/json",
      "x-mmd-internal-call": "true",
      "x-mmd-service-binding": "member-dashboard-chat-worker",
      ...(overrides.headers || {}),
    },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

test("compatibility package classifier remains non-authoritative", () => {
  assert.deepEqual(classifyKenjiModelPackage("Standard"), { cohort: "standard", mode: "package", folders: ["standard"] });
  assert.equal(classifyKenjiModelPackage("VIP").mode, "curated");
  assert.equal(classifyKenjiModelPackage("GWs").mode, "signal");
});

test("safe model projection excludes identity, contacts, availability, notes and internal IDs", () => {
  const projected = projectKenjiSafeModel(privateModel());
  assert.deepEqual(projected, {
    model_code: "MX17",
    working_name: "น้องซิน",
    summary: "ข้อมูลแนะนำตัวที่อนุมัติแล้ว",
    image_url: "https://images.example.test/model.webp",
  });
  assert.doesNotMatch(JSON.stringify(projected), /legal|phone|telegram|available|admin|record|rec-model/i);
});

test("active canonical Standard entitlement sees Standard private model", async () => {
  const result = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "MX17" }, { fetchImpl: airtableFetch(baseData()) });
  assert.equal(result.status, "match");
  assert.equal(result.model.model_code, "MX17");
});

test("published exact Keyword Profile alias resolves an Ad / Rich Menu trigger without widening access", async () => {
  const model = privateModel("MX17", "standard", { working_name: "Jaspal OP" });
  const data = baseData([entitlement("private_standard")], [model], [], [], [keywordProfile("JASPAL", model)]);
  const result = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "JASPAL" }, { fetchImpl: airtableFetch(data) });
  assert.equal(result.status, "match");
  assert.equal(result.model.model_code, "MX17");
  assert.equal(result.model.working_name, "Jaspal OP");

  const guestData = baseData([entitlement("guest_pass")], [model], [], [], [keywordProfile("JASPAL", model)]);
  const guest = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "JASPAL" }, { fetchImpl: airtableFetch(guestData) });
  assert.equal(guest.status, "silent");
});

test("exact folder name resolves only through canonical member access", async () => {
  const model = privateModel("NANO7", "standard", { folder_name: "Nano", working_name: "นายแบบนาโน" });
  const active = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "Nano" }, { fetchImpl: airtableFetch(baseData([entitlement("private_standard")], [model])) });
  assert.equal(active.status, "match");
  assert.equal(active.model.model_code, "NANO7");
  const expired = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "Nano" }, { fetchImpl: airtableFetch(baseData([entitlement("private_standard", "expired")], [model])) });
  assert.equal(expired.status, "renewal");
});

test("Premium canonical envelope includes Standard and Premium while Standard cannot see Premium", async () => {
  const models = [privateModel("PR22", "premium")];
  const standard = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "PR22" }, { fetchImpl: airtableFetch(baseData([entitlement("private_standard")], models)) });
  const premium = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "PR22" }, { fetchImpl: airtableFetch(baseData([entitlement("private_premium")], models)) });
  assert.equal(standard.status, "silent");
  assert.equal(premium.status, "match");
});

test("Public Member sees Public model only", async () => {
  const data = baseData([entitlement("public_member")], [publicModel(), privateModel()]);
  const pub = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "PUB17" }, { fetchImpl: airtableFetch(data) });
  const priv = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "MX17" }, { fetchImpl: airtableFetch(data) });
  assert.equal(pub.status, "match");
  assert.equal(priv.status, "silent");
});

test("Guest Pass remains teaser-only and never opens model lookup", async () => {
  const data = baseData([entitlement("guest_pass")], [publicModel()]);
  const result = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "PUB17" }, { fetchImpl: airtableFetch(data) });
  assert.equal(result.status, "silent");
});

test("expiring-soon private entitlement remains currently valid for model visibility", async () => {
  const data = baseData([entitlement("private_standard", "expiring_soon")]);
  const result = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "MX17" }, { fetchImpl: airtableFetch(data) });
  assert.equal(result.status, "match");
});

for (const lifecycle of ["grace", "expired"]) {
  test(`${lifecycle} private entitlement returns renewal only for a private-model request`, async () => {
    const data = baseData([entitlement("private_standard", lifecycle)], [privateModel()]);
    const result = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "MX17" }, { fetchImpl: airtableFetch(data) });
    assert.deepEqual(result, { status: "renewal" });
  });
}

test("blocked canonical entitlement fails closed without renewal or model data", async () => {
  const data = baseData([entitlement("private_premium", "blocked")]);
  const result = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "MX17" }, { fetchImpl: airtableFetch(data) });
  assert.equal(result.status, "silent");
});

test("missing canonical LINE entitlement stays silent even when verification_email is supplied", async () => {
  const data = baseData([], [privateModel()]);
  const plain = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "MX17" }, { fetchImpl: airtableFetch(data) });
  const emailAttempt = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "MX17", verification_email: "member@example.com" }, { fetchImpl: airtableFetch(data) });
  assert.equal(plain.status, "silent");
  assert.equal(emailAttempt.status, "silent");
});

for (const capability of ["vip", "svip", "black_card"]) {
  test(`${capability} requires explicit current approval before protected Private reveal`, async () => {
    const folder = capability === "black_card" ? "exclusive" : "vip";
    const models = [privateModel("PX99", folder)];
    const noApproval = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "PX99" }, { fetchImpl: airtableFetch(baseData([entitlement(capability)], models, [])) });
    const approved = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "PX99" }, { fetchImpl: airtableFetch(baseData([entitlement(capability)], models, [approval(capability, folder)])) });
    assert.equal(noApproval.status, "silent");
    assert.equal(approved.status, "match");
  });
}

test("expired protected approval fails closed", async () => {
  const data = baseData([entitlement("black_card")], [privateModel("ZX41", "exclusive")], [approval("black_card", "exclusive", { expires_at: "2020-01-01T00:00:00.000Z" })]);
  const result = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "ZX41" }, { fetchImpl: airtableFetch(data) });
  assert.equal(result.status, "silent");
});

test("unsafe approved-summary content is omitted", async () => {
  const data = baseData([entitlement("private_standard")], [privateModel("MX17", "standard", { customer_safe_summary: "ว่างคืนนี้ ติดต่อ LINE ID private-contact หรือโทร 0800000000" })]);
  const result = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "MX17" }, { fetchImpl: airtableFetch(data) });
  assert.equal(result.status, "match");
  assert.equal("summary" in result.model, false);
});

test("canonical entitlement source failure fails closed as 503", async () => {
  const response = await handleKenjiModelAccessRpc(rpcRequest({ line_user_id: LINE_USER_ID, query: "MX17" }), ENV, { fetchImpl: airtableFetch(baseData(), { failTables: ["entitlements"] }) });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, error: "model_access_unavailable" });
});

test("RPC remains service-binding only and method constrained", async () => {
  assert.equal(isKenjiModelAccessRpcRequest(KENJI_MODEL_ACCESS_RPC_PATH, "POST"), true);
  const unauthorized = await handleKenjiModelAccessRpc(new Request("https://admin-worker.local/v1/internal/kenji/model-access", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), ENV);
  assert.equal(unauthorized.status, 401);
  const wrongMethod = await handleKenjiModelAccessRpc(rpcRequest({}, { method: "GET" }), ENV);
  assert.equal(wrongMethod.status, 405);
});

test("RPC match returns only safe model projection and policy version", async () => {
  const response = await handleKenjiModelAccessRpc(rpcRequest({ line_user_id: LINE_USER_ID, query: "MX17" }), ENV, { fetchImpl: airtableFetch(baseData()) });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, "match");
  assert.equal(payload.policy_version, KENJI_MODEL_ACCESS_POLICY_VERSION);
  assert.equal(payload.model.model_code, "MX17");
  assert.doesNotMatch(JSON.stringify(payload), /0800000000|private_contact|availability|admin_note/i);
});


test("canonical Sales Control projects the customer-safe matched offer after entitlement resolution", async () => {
  const model = privateModel("MX17", "standard");
  const rules = [record("rec-offer-active", {
    Model: [model.id],
    model_key: "MX17",
    status: "Active",
    sales_visibility: "on",
    audience_scope: ["Standard"],
    customer_sell_rate_thb: 25000,
    price_visibility: "visible",
    priority: 10,
    version: 2,
  })];
  const result = await resolveKenjiModelAccess(
    ENV,
    { line_user_id: LINE_USER_ID, query: "MX17", requested_at: "2026-09-21T19:00:00+07:00" },
    { fetchImpl: airtableFetch(baseData([entitlement("private_standard")], [model], [], rules)) },
  );
  assert.equal(result.status, "match");
  assert.equal(result.model.sales.sellable, true);
  assert.equal(result.model.sales.customer_rate_thb, 25000);
  assert.equal(result.model.sales.price_visible, true);
  assert.equal(result.model.sales.matched_rule_key, null);
  assert.equal(result.model.sales.rule_version, 2);
});

test("Draft Model Offer Rules remain fail-closed in the Kenji consumer", async () => {
  const model = privateModel("MX17", "standard");
  const rules = [record("rec-offer-draft", {
    Model: [model.id],
    model_key: "MX17",
    status: "Draft",
    sales_visibility: "on",
    audience_scope: ["Standard"],
    customer_sell_rate_thb: 25000,
    price_visibility: "visible",
    version: 1,
  })];
  const result = await resolveKenjiModelAccess(
    ENV,
    { line_user_id: LINE_USER_ID, query: "MX17", requested_at: "2026-09-21T19:00:00+07:00" },
    { fetchImpl: airtableFetch(baseData([entitlement("private_standard")], [model], [], rules)) },
  );
  assert.equal(result.status, "match");
  assert.equal(result.model.sales.sellable, false);
  assert.equal(result.model.sales.customer_rate_thb, null);
  assert.equal(result.model.sales.reason_code, "no_matching_active_rule");
});


test("production-shaped private model may derive Premium access folder from canonical model_tier", async () => {
  const model = privateModel("PRCANON", "", {
    access_folder: undefined,
    model_tier: { name: "premium" },
    booking_visibility: "private",
    visibility: "private",
    status: "active",
  });
  const result = await resolveKenjiModelAccess(
    ENV,
    { line_user_id: LINE_USER_ID, query: "PRCANON" },
    { fetchImpl: airtableFetch(baseData([entitlement("private_premium")], [model])) },
  );
  assert.equal(result.status, "match");
  assert.equal(result.model.model_code, "PRCANON");
});

test("canonical Premium model_tier does not widen Standard member access", async () => {
  const model = privateModel("PRCANON2", "", {
    access_folder: undefined,
    model_tier: { name: "premium" },
    booking_visibility: "private",
    visibility: "private",
    status: "active",
  });
  const result = await resolveKenjiModelAccess(
    ENV,
    { line_user_id: LINE_USER_ID, query: "PRCANON2" },
    { fetchImpl: airtableFetch(baseData([entitlement("private_standard")], [model])) },
  );
  assert.equal(result.status, "silent");
});

test("canonical folder inference never rescues an inactive or review-only model", async () => {
  const model = privateModel("PRCANON3", "", {
    access_folder: undefined,
    model_tier: { name: "premium" },
    booking_visibility: "private",
    visibility: "private",
    status: "inactive",
  });
  const result = await resolveKenjiModelAccess(
    ENV,
    { line_user_id: LINE_USER_ID, query: "PRCANON3" },
    { fetchImpl: airtableFetch(baseData([entitlement("private_premium")], [model])) },
  );
  assert.equal(result.status, "silent");
});
