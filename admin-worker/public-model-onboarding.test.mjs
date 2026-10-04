import test from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { handlePublicModelApplicationReviewRequest as handle, PUBLIC_MODEL_REVIEW_FIELDS as F, PUBLIC_MODEL_ASSET_FIELDS as A } from "./src/public-model-application-review.js";
import { syncPrivateModelHandoffAfterActivation } from "./src/private-model-application-handoff.js";
import { ModelActivationCoordinator } from "./src/model-first-time-activation.js";

const ID = "pma_20261003_XYfCyTV4Y9pV";
const MODEL = "rec1234567890abcde";
const APP = "recabcdefgh1234567";
const owner = { id: "per", role: "owner", auth_method: "credential" };
const request = (origin = "https://mmdbkk.com") => new Request("https://mmdbkk.com/v1/admin/model-applications/" + ID + "/onboarding", {
  method: "POST", headers: { Origin: origin, "content-type": "application/json" },
  body: JSON.stringify({ model_record_id: "recMalicious123456" }),
});

function fixture({ accepted = true, media = true, conflict = false, signing = true, linked = false, ambiguous = false } = {}) {
  let app = { id: APP, fields: {
    [F.applicationId]: ID, [F.applicationType]: "public_model", [F.nickname]: "Big",
    [F.reviewStatus]: accepted ? "accepted" : "pending_review", [F.intakeStatus]: accepted ? "approved" : "private_review_pending",
  } };
  if (ambiguous) app.fields[F.canonicalModel] = [MODEL, "recothermodel12345"];
  let models = conflict ? [{ id: "recExisting1234567", fields: { working_name: "Big" } }] : [];
  let creates = 0, queue = Promise.resolve();
  const assets = media ? [{ id: "recphotoasset12345", fields: {
    [A.assetId]: "pmua_abcdefgh1234", [A.applicationId]: ID, [A.kind]: "photo",
    [A.uploadStatus]: "attached", [A.contentType]: "image/jpeg",
  } }] : [];
  const fetcher = async (url, init = {}) => {
    const u = new URL(typeof url === "string" ? url : url.url || url.toString()), method = init.method || "GET";
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (u.pathname.includes("tblwUa8ySWln8OfaJ")) {
      if (method === "PATCH") { Object.assign(app.fields, JSON.parse(init.body).fields); return json(app); }
      return json({ records: [app] });
    }
    if (u.pathname.includes("tblEhg3dsFzPERpNQ")) return json({ records: assets });
    if (u.pathname.endsWith("/Models")) {
      if (method === "POST") {
        creates++;
        const fields = JSON.parse(init.body).records[0].fields;
        const model = { id: MODEL, fields: { ...fields, working_name: fields.fldShiT60bmCxFxRu, model_record_id: fields.fldVWbT0gsSe0hn7Q } };
        if (linked) model.fields.line_user_id = "U" + "a".repeat(32);
        models.push(model);
        return json({ records: [model] }, 201);
      }
      const formula = u.searchParams.get("filterByFormula");
      return json({ records: formula ? models.filter(m => formula.includes(m.fields.model_record_id)) : models });
    }
    if (u.pathname.endsWith("/Models/" + MODEL)) return json(models.find(m => m.id === MODEL));
    throw new Error("unexpected request " + method + " " + u);
  };
  const env = { AIRTABLE_API_KEY: "test", AIRTABLE_BASE_ID: "appsV1ILPRfIjkaYg", AIRTABLE_FETCH: fetcher,
    ...(signing ? { LINK_SIGNING_SECRET: "test-signing-secret-for-public-onboarding" } : {}),
  };
  const state = { blockConcurrencyWhile(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; } };
  const coordinator = new ModelActivationCoordinator(state, env);
  env.MODEL_ACTIVATION_COORDINATOR = {
    idFromName: name => { assert.match(name, /^public-model-create:mdl_pub_app_/); return name; },
    get: () => ({ fetch: (url, init) => coordinator.fetch(new Request(url, init)) }),
  };
  return { env, fetcher, get creates() { return creates; }, get app() { return app; }, get models() { return models; } };
}

test("approved Public onboarding creates one model and issues a Published LINE link, including retries and concurrent calls", async () => {
  const f = fixture(), prior = globalThis.fetch; globalThis.fetch = f.fetcher;
  try {
    const responses = await Promise.all([handle(request(), f.env, owner), handle(request(), f.env, owner)]);
    for (const response of responses) {
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.match(body.activation_url, /^https:\/\/miniapp.line.me\/2010864854-N34SgCqq\//);
      assert.equal(body.publishes_model, false);
      assert.equal(body.next_step, "send_activation_link");
    }
    assert.equal(f.creates, 1);
    assert.deepEqual(f.app.fields[F.canonicalModel], [MODEL]);
    const retry = await handle(request(), f.env, owner);
    assert.equal(retry.status, 200); assert.equal(f.creates, 1);
    assert.equal(f.app.fields[F.publicProfileApproved], undefined);
    assert.equal(f.app.fields[F.approvedRoles], undefined);
  } finally { globalThis.fetch = prior; }
});

test("onboarding enforces owner, origin, prior approval, media, name conflicts and canonical ambiguity", async () => {
  for (const [options, actor, origin, error] of [
    [{}, null, "https://mmdbkk.com", "owner_required"],
    [{}, owner, "https://evil.example", "forbidden_origin"],
    [{ accepted: false }, owner, "https://mmdbkk.com", "application_approval_required"],
    [{ media: false }, owner, "https://mmdbkk.com", "application_media_required_for_onboarding"],
    [{ conflict: true }, owner, "https://mmdbkk.com", "working_name_conflict"],
    [{ ambiguous: true }, owner, "https://mmdbkk.com", "canonical_model_ambiguous"],
  ]) {
    const f = fixture(options);
    const response = await handle(request(origin), f.env, actor);
    assert.equal((await response.json()).error, error); assert.equal(f.creates, 0);
  }
});

test("activation failure preserves the canonical model for retry", async () => {
  const f = fixture({ signing: false }), prior = globalThis.fetch; globalThis.fetch = f.fetcher;
  try {
    const failed = await handle(request(), f.env, owner);
    assert.equal((await failed.json()).error, "activation_issue_failed");
    assert.deepEqual(f.app.fields[F.canonicalModel], [MODEL]);
    f.env.LINK_SIGNING_SECRET = "test-signing-secret-for-public-onboarding";
    const retry = await handle(request(), f.env, owner);
    assert.equal(retry.status, 200); assert.equal(f.creates, 1);
  } finally { globalThis.fetch = prior; }
});

test("already verified LINE returns model_ready without an activation link", async () => {
  const f = fixture({ linked: true }), prior = globalThis.fetch; globalThis.fetch = f.fetcher;
  try {
    const response = await handle(request(), f.env, owner), body = await response.json();
    assert.equal(body.next_step, "model_ready"); assert.equal(body.activation_url, undefined);
    assert.equal(f.app.fields[F.handoffStatus], "linked");
  } finally { globalThis.fetch = prior; }
});

test("review HTML remains executable and includes the post-approval MY MODEL action", async () => {
  const response = await handle(new Request("https://mmdbkk.com/internal/admin/model-applications"));
  const html = await response.text();
  new Script(html.split("<script>")[1].split("</script>")[0]);
  assert.match(html, /prepareOnboarding/); assert.match(html, /คัดลอกลิงก์ให้ Model/);
});

test("successful LINE activation marks the accepted Public application linked", async () => {
  const f = fixture();
  f.app.fields[F.canonicalModel] = [MODEL];
  const response = await syncPrivateModelHandoffAfterActivation(
    new Request("https://mmdbkk.com/v1/model/liff/activate", { method: "POST" }),
    new Response(JSON.stringify({ ok: true, model: { id: MODEL } }), { headers: { "content-type": "application/json" } }),
    f.env,
  );
  assert.equal(response.status, 200);
  assert.equal(f.app.fields[F.handoffStatus], "linked");
});

test("Public coordinator rejects a Private application key", async () => {
  const coordinator = new ModelActivationCoordinator({ blockConcurrencyWhile: fn => fn() }, {});
  const response = await coordinator.fetch(new Request("https://model-activation.internal/resolve-public-model", {
    method: "POST", body: JSON.stringify({ model_key: "mdl_pri_app_20261003_abcdefgh", working_name: "Big" }),
  }));
  assert.equal(response.status, 400);
});
