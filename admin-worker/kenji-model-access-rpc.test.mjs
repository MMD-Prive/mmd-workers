import assert from "node:assert/strict";
import test from "node:test";

import adminWorker from "./src/admin-login-hero-worker.js";
import {
  classifyKenjiModelPackage,
  handleKenjiModelAccessRpc,
  KENJI_MODEL_ACCESS_POLICY_VERSION,
  projectKenjiSafeModel,
  resolveKenjiModelAccess,
} from "./src/kenji-model-access-rpc.js";

const LINE_USER_ID = "U1234567890abcdef1234567890abcdef";
const ENV = {
  INTERNAL_TOKEN: "internal-token",
  AIRTABLE_API_KEY: "airtable-token",
  AIRTABLE_BASE_ID: "app-test",
  AIRTABLE_TABLE_MEMBERS: "members",
  AIRTABLE_TABLE_MEMBER_PACKAGES: "member_packages",
  AIRTABLE_TABLE_MODELS: "models",
  AIRTABLE_TABLE_KENJI_MODEL_ACCESS_APPROVALS: "approvals",
};

function record(id, fields) {
  return { id, fields };
}

function activePackage(code, overrides = {}) {
  return record(`rec-package-${code}`, {
    member_email: "member@example.com",
    status: "active",
    end_date: "2099-12-31T23:59:59.000Z",
    package_code: code,
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
  return privateModel(code, "standard", {
    booking_visibility: "public",
    access_folder: "",
    ...overrides,
  });
}

function baseData(packageRecord = activePackage("Black Card"), models = [privateModel()]) {
  return {
    members: [record("rec-member-1", {
      line_user_id: LINE_USER_ID,
      member_id: "M-001",
      "Contact Email": "member@example.com",
    })],
    member_packages: packageRecord ? [packageRecord] : [],
    models,
    approvals: [],
  };
}

const SCHEMAS = {
  members: new Set(["line_user_id", "LINE User ID", "line_id", "LINE ID", "Contact Email", "member_email", "email", "Gmail", "Google Drive Email"]),
  member_packages: new Set(["member_email", "Member Email", "email", "Contact Email", "member_id", "Member ID"]),
  models: new Set(["model_code", "model_lookup_key", "unique_key", "working_name", "Working Name", "display_name", "Display Name"]),
  approvals: new Set(["member_record_id", "member_id", "member_email", "line_user_id"]),
};

function airtableFetch(data, { fail = false } = {}) {
  return async (input) => {
    if (fail) return new Response("source private error", { status: 503 });
    const url = new URL(String(input));
    const table = decodeURIComponent(url.pathname.split("/").pop());
    const formula = url.searchParams.get("filterByFormula") || "";
    const match = formula.match(/^LOWER\(\{(.+)}&""\)="(.*)"$/);
    if (!match || !SCHEMAS[table]?.has(match[1])) return new Response(JSON.stringify({ error: "unknown field" }), { status: 422 });
    const field = match[1];
    const value = match[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\").toLowerCase();
    const records = (data[table] || []).filter((item) => String(item.fields?.[field] ?? "").trim().toLowerCase() === value);
    return new Response(JSON.stringify({ records }), { status: 200, headers: { "content-type": "application/json" } });
  };
}

test("KENJI_MODEL_ACCESS_V1 package policy never derives access from GWs/EMs labels or legacy SVIP", () => {
  assert.deepEqual(classifyKenjiModelPackage("Guest Pass"), { cohort: "guest_trial", mode: "website_only", folders: [] });
  assert.deepEqual(classifyKenjiModelPackage("Trial"), { cohort: "guest_trial", mode: "website_only", folders: [] });
  assert.equal(classifyKenjiModelPackage("Membership").mode, "public_models");
  assert.equal(classifyKenjiModelPackage("Red Card").mode, "public_models");
  assert.deepEqual(classifyKenjiModelPackage("Standard"), { cohort: "standard", mode: "package", folders: ["standard"] });
  assert.deepEqual(classifyKenjiModelPackage("Premium"), { cohort: "premium", mode: "package", folders: ["standard", "premium"] });
  assert.equal(classifyKenjiModelPackage("VIP").mode, "curated");
  assert.deepEqual(classifyKenjiModelPackage("SVIP"), { cohort: "svip", mode: "curated", folders: [] });
  assert.equal(classifyKenjiModelPackage("Black Card").cohort, "black_card");
  assert.equal(classifyKenjiModelPackage("BlackCard").mode, "blocked");
  assert.equal(classifyKenjiModelPackage("Exclusive Black Card").mode, "blocked");
  assert.equal(classifyKenjiModelPackage("GWs").mode, "signal");
  assert.equal(classifyKenjiModelPackage("EMs").mode, "signal");
});

test("safe model projection excludes legal identity, contacts, availability, notes, IDs, and operations", () => {
  const projected = projectKenjiSafeModel(privateModel());
  assert.deepEqual(projected, {
    model_code: "MX17",
    working_name: "น้องซิน",
    summary: "ข้อมูลแนะนำตัวที่อนุมัติแล้ว",
    image_url: "https://images.example.test/model.webp",
  });
  const serialized = JSON.stringify(projected);
  assert.doesNotMatch(serialized, /legal|phone|telegram|available|admin|record|rec-model/i);
});

test("unsafe content inside an approved-summary field is omitted instead of trusted by field name", () => {
  const projected = projectKenjiSafeModel(privateModel("MX17", "standard", {
    customer_safe_summary: "ว่างคืนนี้ ติดต่อ LINE ID private-contact หรือโทร 0800000000",
  }));
  assert.deepEqual(projected, {
    model_code: "MX17",
    working_name: "น้องซิน",
    image_url: "https://images.example.test/model.webp",
  });
});

test("active Standard member receives an exact authorized Standard model match", async () => {
  const result = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "MX17" }, { fetchImpl: airtableFetch(baseData(activePackage("Standard"))) });
  assert.equal(result.status, "match");
  assert.equal(result.model.model_code, "MX17");
  assert.equal(result.model.working_name, "น้องซิน");
  assert.doesNotMatch(JSON.stringify(result), /0800000000|private_contact|private note|availability/i);
});

test("working-name lookup is exact and returns the verified code only inside the authorized folder", async () => {
  const result = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "น้องซิน" }, { fetchImpl: airtableFetch(baseData()) });
  assert.equal(result.status, "match");
  assert.equal(result.model.model_code, "MX17");
});

for (const [label, packageRecord] of [
  ["missing", null],
  ["guest", activePackage("Guest Pass")],
  ["trial", activePackage("Trial")],
  ["non-canonical BlackCard alias", activePackage("BlackCard")],
  ["signal-only GWs", activePackage("GWs")],
]) {
  test(`${label} membership fails closed`, async () => {
    const result = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "MX17" }, { fetchImpl: airtableFetch(baseData(packageRecord)) });
    assert.equal(result.status, "silent");
  });
}

for (const [label, packageRecord] of [
  ["inactive", activePackage("Standard", { status: "inactive" })],
  ["expired", activePackage("Standard", { end_date: "2020-01-01T00:00:00.000Z" })],
  ["invalid expiry", activePackage("Standard", { end_date: "not-a-date" })],
]) {
  test(`${label} membership returns renewal guidance without model data`, async () => {
    const result = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "MX17" }, { fetchImpl: airtableFetch(baseData(packageRecord)) });
    assert.deepEqual(result, { status: "renewal" });
  });
}

test("Membership 690 and Red Card 14,999 see Public Models only", async () => {
  for (const packageCode of ["Membership", "Red Card"]) {
    const data = baseData(activePackage(packageCode), [publicModel(), privateModel("MX17", "standard")]);
    const publicResult = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "PUB17" }, { fetchImpl: airtableFetch(data) });
    const privateResult = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "MX17" }, { fetchImpl: airtableFetch(data) });
    assert.equal(publicResult.status, "match", packageCode);
    assert.equal(privateResult.status, "silent", packageCode);
  }
});

test("Premium includes Standard and Premium folders while Standard cannot see Premium", async () => {
  const premiumModel = [privateModel("PR22", "premium")];
  const standardResult = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "PR22" }, { fetchImpl: airtableFetch(baseData(activePackage("Standard"), premiumModel)) });
  const premiumResult = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "PR22" }, { fetchImpl: airtableFetch(baseData(activePackage("Premium"), premiumModel)) });
  assert.equal(standardResult.status, "silent");
  assert.equal(premiumResult.status, "match");
});

test("verified GWs or EMs signals neither grant access nor block a valid package entitlement", async () => {
  for (const signal of ["GWs", "EMs"]) {
    const data = baseData(activePackage("Standard"));
    data.member_packages.push(activePackage(signal, { member_email: "member@example.com" }));
    const result = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "MX17" }, { fetchImpl: airtableFetch(data) });
    assert.equal(result.status, "match", signal);
  }
});

test("model records without exact active status fail closed", async () => {
  const models = [privateModel("MX17", "standard", { status: "published" })];
  const result = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "MX17" }, { fetchImpl: airtableFetch(baseData(activePackage("Standard"), models)) });
  assert.equal(result.status, "silent");
});

test("unlinked LINE owner asks for one verification email and exact Contact Email can continue", async () => {
  const data = baseData(activePackage("Standard"));
  data.members[0].fields.line_user_id = "Uother1234567890abcdef1234567890ab";
  const initial = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "MX17" }, { fetchImpl: airtableFetch(data) });
  const verified = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "MX17", verification_email: "member@example.com" }, { fetchImpl: airtableFetch(data) });
  const wrong = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "MX17", verification_email: "wrong@example.com" }, { fetchImpl: airtableFetch(data) });
  assert.deepEqual(initial, { status: "verification_required" });
  assert.equal(verified.status, "match");
  assert.equal(wrong.status, "silent");
});

test("conflicting active package tiers fail closed instead of selecting the highest tier", async () => {
  const data = baseData();
  data.member_packages.push(activePackage("VIP", { member_email: "member@example.com" }));
  const result = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "MX17" }, { fetchImpl: airtableFetch(data) });
  assert.equal(result.status, "silent");
});

test("VIP and SVIP fail closed without one explicit unexpired V1 approval", async () => {
  for (const cohort of ["VIP", "SVIP"]) {
    const result = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "MX17" }, { fetchImpl: airtableFetch(baseData(activePackage(cohort))) });
    assert.equal(result.status, "silent", cohort);
  }
});

test("VIP curated access requires an exact V1 approval record and explicit folders", async () => {
  const data = baseData(activePackage("VIP"));
  data.approvals.push(record("rec-approval-1", {
    member_email: "member@example.com",
    status: "approved",
    policy_version: KENJI_MODEL_ACCESS_POLICY_VERSION,
    cohort: "vip",
    expires_at: "2099-12-31T23:59:59.000Z",
    allowed_folders: "standard,premium,vip",
  }));
  const result = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "MX17" }, { fetchImpl: airtableFetch(data) });
  assert.equal(result.status, "match");
});

test("active exact Black Card grants exclusive while Premium cannot see the same model", async () => {
  const exclusive = [privateModel("ZX41", "exclusive")];
  const blackResult = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "ZX41" }, { fetchImpl: airtableFetch(baseData(activePackage("Black Card"), exclusive)) });
  const premiumResult = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "ZX41" }, { fetchImpl: airtableFetch(baseData(activePackage("Premium"), exclusive)) });
  assert.equal(blackResult.status, "match");
  assert.equal(premiumResult.status, "silent");
});

test("EMs model-code namespace never grants access; authorization still comes from package and folder", async () => {
  const exclusive = [privateModel("EMs04", "exclusive")];
  const signalOnlyResult = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "EMs04" }, { fetchImpl: airtableFetch(baseData(activePackage("EMs"), exclusive)) });
  const blackCardResult = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "EMs04" }, { fetchImpl: airtableFetch(baseData(activePackage("Black Card"), exclusive)) });
  assert.equal(signalOnlyResult.status, "silent");
  assert.equal(blackCardResult.status, "match");
  assert.equal(blackCardResult.model.model_code, "EMs04");
});

test("ambiguous exact authorized model matches request clarification without listing models", async () => {
  const second = privateModel("MX17", "standard", { working_name: "อีกชื่อ", unique_key: "OTHER" });
  second.id = "rec-model-MX17-duplicate";
  const models = [privateModel("MX17"), second];
  const result = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "MX17" }, { fetchImpl: airtableFetch(baseData(activePackage("Black Card"), models)) });
  assert.deepEqual(result, { status: "clarification" });
});

test("an inaccessible duplicate never causes clarification or leaks the higher folder", async () => {
  const overTier = privateModel("MX17", "exclusive", { working_name: "ชื่อที่ห้ามเปิด" });
  overTier.id = "rec-model-MX17-exclusive";
  const data = baseData(activePackage("VIP"), [privateModel("MX17"), overTier]);
  data.approvals.push(record("rec-approval-standard-only", {
    member_email: "member@example.com",
    status: "approved",
    policy_version: KENJI_MODEL_ACCESS_POLICY_VERSION,
    cohort: "vip",
    expires_at: "2099-12-31T23:59:59.000Z",
    allowed_folders: "standard",
  }));
  const result = await resolveKenjiModelAccess(ENV, { line_user_id: LINE_USER_ID, query: "MX17" }, { fetchImpl: airtableFetch(data) });
  assert.equal(result.status, "match");
  assert.equal(result.model.working_name, "น้องซิน");
  assert.doesNotMatch(JSON.stringify(result), /ชื่อที่ห้ามเปิด|exclusive/);
});

test("RPC is service-binding-only and source failures expose no upstream body", async () => {
  const publicRequest = new Request("https://admin-worker.example/v1/internal/kenji/model-access", {
    method: "POST",
    headers: { authorization: "Bearer internal-token", "content-type": "application/json", "x-mmd-internal-call": "true", "x-mmd-service-binding": "member-dashboard-chat-worker" },
    body: JSON.stringify({ line_user_id: LINE_USER_ID, query: "MX17" }),
  });
  assert.equal((await handleKenjiModelAccessRpc(publicRequest, ENV)).status, 401);

  const localRequest = new Request("https://admin-worker.local/v1/internal/kenji/model-access", {
    method: "POST",
    headers: { authorization: "Bearer internal-token", "content-type": "application/json", "x-mmd-internal-call": "true", "x-mmd-service-binding": "member-dashboard-chat-worker" },
    body: JSON.stringify({ line_user_id: LINE_USER_ID, query: "MX17" }),
  });
  const response = await handleKenjiModelAccessRpc(localRequest, ENV, { fetchImpl: airtableFetch({}, { fail: true }) });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, error: "model_access_unavailable" });
});

test("active admin-worker entrypoint exposes only the protected named RPC", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = airtableFetch(baseData());
  try {
    const request = new Request("https://admin-worker.local/v1/internal/kenji/model-access", {
      method: "POST",
      headers: { authorization: "Bearer internal-token", "content-type": "application/json", "x-mmd-internal-call": "true", "x-mmd-service-binding": "member-dashboard-chat-worker" },
      body: JSON.stringify({ line_user_id: LINE_USER_ID, query: "MX17" }),
    });
    const response = await adminWorker.fetch(request, ENV);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.status, "match");
    assert.deepEqual(payload.model, {
      model_code: "MX17",
      working_name: "น้องซิน",
      summary: "ข้อมูลแนะนำตัวที่อนุมัติแล้ว",
      image_url: "https://images.example.test/model.webp",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
