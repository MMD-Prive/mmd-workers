import test from "node:test";
import assert from "node:assert/strict";
import { handlePhaseAExchange, handlePhaseADurableRequest, normalizePhaseAForm, safePhaseAForm } from "./src/model-onboarding-phase-a.js";
import { handlePublicModelApplicationReviewRequest } from "./src/public-model-application-review.js";

const SUBJECT = `U${"a".repeat(32)}`;
const ORIGIN = "https://mmdbkk.com";
const APPLICATION_ID_FIELD = "fldE5jq01JlYtvSP7";
const PAYLOAD_FIELD = "fldJ9ldETtMF2Qbqf";
const FORM_VERSION = "mmd-app-phase-a-no-media-v1";

function futureBangkokTime() {
  const date = new Date(Date.now() + 2 * 86400000);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (key) => parts.find((part) => part.type === key).value;
  return `${get("year")}-${get("month")}-${get("day")}T10:30`;
}

function application(overrides = {}) {
  return {
    nickname: "Tee", initials: "TT", self_description: "ชอบพบปะผู้คน",
    public_client_gender: "all", private_opt_in: true, private_client_gender: "men",
    has_prior_work: true, per_only_remark: "ผลงานส่วนตัวสำหรับพี่เปอร์",
    age: 25, height_cm: 178, weight_kg: 72, province: "Bangkok",
    languages: ["thai", "english"], video_call_preference: "comfortable",
    preferred_at_bangkok: futureBangkokTime(), ...overrides,
  };
}

function harness({ bound = false, candidate = false, claim = false, invalidToken = false } = {}) {
  const storage = new Map();
  const applications = new Map();
  const calls = { line: 0, applicationWrites: 0, draftCalls: 0 };
  let gate = Promise.resolve();
  const state = {
    storage: {
      get: async (key) => storage.get(key),
      put: async (key, value) => { storage.set(key, structuredClone(value)); },
    },
    blockConcurrencyWhile(fn) {
      const next = gate.then(fn, fn);
      gate = next.catch(() => {});
      return next;
    },
  };
  const env = {
    AIRTABLE_API_KEY: "test-key", AIRTABLE_BASE_ID: "test-model-base",
    ALLOWED_ORIGINS: ORIGIN,
    MODEL_ACTIVATION_COORDINATOR: {
      idFromName: (name) => name,
      get: () => ({ fetch: async (_, init) => {
        calls.draftCalls++;
        return handlePhaseADurableRequest(state, env, new Request("https://model-activation.internal/phase-a", init));
      } }),
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (request, init = {}) => {
    const url = new URL(request instanceof URL || typeof request === "string" ? request : request.url);
    if (url.hostname === "api.line.me") {
      calls.line++;
      return Response.json(invalidToken ? { aud: "wrong", sub: SUBJECT } : { aud: "2010864854", sub: SUBJECT, name: "Never Existing" }, { status: invalidToken ? 401 : 200 });
    }
    if (url.hostname !== "api.airtable.com") throw new Error(`unexpected ${url.hostname}`);
    if (init.method === "PATCH") {
      calls.applicationWrites++;
      const input = JSON.parse(init.body);
      const fields = input.records[0].fields;
      applications.set(fields[APPLICATION_ID_FIELD], { id: "recTestApplication", fields });
      return Response.json({ records: [{ id: "recTestApplication", fields }] });
    }
    const formula = url.searchParams.get("filterByFormula") || "";
    if (url.pathname.includes("tblwUa8ySWln8OfaJ")) {
      const id = [...applications.keys()].find((key) => formula.includes(key));
      return Response.json({ records: id ? [applications.get(id)] : [] });
    }
    if (url.pathname.includes("tbluoZ5JiRcoUP6WT")) return Response.json({ records: claim ? [{ id: "recClaim", fields: {} }] : [] });
    if (formula.includes("LOWER(")) return Response.json({ records: candidate ? [{ id: "recOldModel", fields: {} }] : [] });
    if (formula.includes(SUBJECT)) return Response.json({ records: bound ? [{ id: "recBoundModel", fields: {} }] : [] });
    return Response.json({ records: [] });
  };
  const restore = () => { globalThis.fetch = originalFetch; };
  const post = async (action, form, extras = {}) => {
    const body = { flow: "phase_a_no_media", action, idToken: "valid-token", environment: "published", ...(form ? { application: form } : {}), ...extras };
    const request = new Request(`${ORIGIN}/v1/model/liff/exchange`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify(body) });
    const response = await handlePhaseAExchange(request, env, body);
    return { response, data: await response.json() };
  };
  return { env, post, calls, storage, applications, restore };
}

test("Phase A form keeps self description separate, clears Private on opt out, and rejects media fields", () => {
  const normalized = normalizePhaseAForm(application({ private_opt_in: false, private_client_gender: "men" }), { complete: true });
  assert.equal(normalized.ok, true);
  assert.equal(normalized.form.private_opt_in, false);
  assert.equal(normalized.form.private_client_gender, "");
  assert.equal(normalized.form.self_description, "ชอบพบปะผู้คน");
  assert.equal(safePhaseAForm(normalized.form).per_only_remark, undefined);
  assert.deepEqual(normalizePhaseAForm(application({ media: ["unsafe"] }), { complete: true }), { ok: false, error: "unsupported_field" });
  assert.equal(normalizePhaseAForm(application({ preferred_at_bangkok: futureBangkokTime().replace(":30", ":15") }), { complete: true }).error, "preferred_at_invalid");
});

test("LINE subject is verified for every action; spoofed IDs and origins cannot write", async () => {
  const h = harness({ invalidToken: true });
  try {
    const bad = await h.post("submit", application());
    assert.equal(bad.response.status, 401);
    assert.equal(h.calls.applicationWrites, 0);
    const spoof = await h.post("submit", application(), { line_user_id: SUBJECT });
    assert.equal(spoof.response.status, 400);
    assert.equal(h.calls.applicationWrites, 0);
    const wrongOriginBody = { flow: "phase_a_no_media", action: "submit", idToken: "valid-token", application: application() };
    const wrongOrigin = await handlePhaseAExchange(new Request(`${ORIGIN}/v1/model/liff/exchange`, { method: "POST", headers: { origin: "https://attacker.example" }, body: JSON.stringify(wrongOriginBody) }), h.env, wrongOriginBody);
    assert.equal(wrongOrigin.status, 403);
    assert.equal(h.calls.applicationWrites, 0);
  } finally { h.restore(); }
});

test("existing binding and identity ambiguity never create a new applicant draft", async () => {
  for (const [config, expected] of [[{ bound: true }, "existing_bound"], [{ candidate: true }, "identity_review_required"], [{ claim: true }, "identity_review_required"]]) {
    const h = harness(config);
    try {
      const result = await h.post("inspect");
      assert.equal(result.data.state, expected);
      assert.equal(h.calls.draftCalls, 0);
      assert.equal(h.calls.applicationWrites, 0);
    } finally { h.restore(); }
  }
});

test("verified new applicant saves a private draft and submits once, including concurrent retry", async () => {
  const h = harness();
  try {
    const first = await h.post("inspect");
    assert.equal(first.data.state, "verified_new");
    const saved = await h.post("save_draft", application());
    assert.equal(saved.data.status, "draft");
    assert.equal(JSON.stringify(saved.data).includes("ผลงานส่วนตัว"), false);
    assert.equal(h.calls.applicationWrites, 0);
    const [a, b] = await Promise.all([h.post("submit", application()), h.post("submit", application())]);
    assert.equal(a.data.state, "pending_review");
    assert.equal(b.data.state, "pending_review");
    assert.equal(a.data.application_id, b.data.application_id);
    assert.equal(h.calls.applicationWrites, 1);
    const record = [...h.applications.values()][0];
    const payload = JSON.parse(record.fields[PAYLOAD_FIELD]);
    assert.equal(payload.form_version, FORM_VERSION);
    assert.equal(payload.per_only_remark, undefined);
    assert.equal(payload.private_opt_in, true);
    assert.equal(record.fields.fldoEssk98FpMqsxo, 0);
    const again = await h.post("inspect");
    assert.equal(again.data.state, "pending_review");
    assert.equal(JSON.stringify(again.data).includes("ผลงานส่วนตัว"), false);
  } finally { h.restore(); }
});

test("Per-only remark is omitted from non-owner admin projection", async () => {
  const h = harness();
  try {
    await h.post("submit", application());
    const id = [...h.applications.keys()][0];
    const request = new Request(`${ORIGIN}/v1/admin/model-applications/${id}`);
    const staff = await handlePublicModelApplicationReviewRequest(request, h.env, { id: "staff", role: "admin", auth_method: "credential" });
    const staffText = await staff.text();
    assert.equal(staffText.includes("per_only_remark"), false);
    assert.equal(staffText.includes("ผลงานส่วนตัว"), false);
    const owner = await handlePublicModelApplicationReviewRequest(request, h.env, { id: "per", role: "owner", auth_method: "credential" });
    const ownerBody = await owner.json();
    assert.equal(ownerBody.application.per_only_remark, "ผลงานส่วนตัวสำหรับพี่เปอร์");
  } finally { h.restore(); }
});
