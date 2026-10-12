import assert from "node:assert/strict";
import test from "node:test";
import { searchCreateSessionModels } from "./src/index.js";

const MODELS = [
  { id: "recBrew00000000001", fields: { working_name: "Brew TN", nickname: "Brew TN", status: "active", sales_layer: "private", model_tier: "standard", orientation_label: "straight" } },
  { id: "recDirect0000000001", fields: { working_name: "Boy PK", status: "active", sales_layer: "private", model_tier: "standard", orientation_label: "straight" } },
];
const REFERRALS = [
  { id: "recRef1", fields: { "Partner": ["recKendo000000001"], "Model": ["recBrew00000000001"], "Ownership Status": "active" } },
  { id: "recRef2", fields: { "Partner": ["recKendo000000001"], "Model": ["recDirect0000000001"], "Ownership Status": "revoked" } },
];

function install({ failReferrals = false } = {}) {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const res = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    if (url.pathname.endsWith("/models")) return res({ records: MODELS });
    if (url.pathname.endsWith("/model_referrals")) return failReferrals ? res({ error: "x" }, 500) : res({ records: REFERRALS });
    if (url.pathname.includes("/model_partners/recKendo000000001")) {
      return res({ id: "recKendo000000001", fields: { "Partner ID": "partner_kendo", "Partner Name": "Kendo" } });
    }
    return res({ records: [] });
  };
  return () => { globalThis.fetch = original; };
}

const env = {
  AIRTABLE_API_KEY: "t", AIRTABLE_BASE_ID: "appTest",
  AIRTABLE_TABLE_MODELS: "models", AIRTABLE_TABLE_MODEL_REFERRALS: "model_referrals", AIRTABLE_TABLE_MODEL_PARTNERS: "model_partners",
};
const base = "https://worker/v1/admin/models/search?work_type=private&booking_visibility=private&customer_lane=straight&selected_access_folder=standard&inventory_only=1";

test("search labels Partner (with name) and Direct; revoked referral is Direct", async () => {
  const restore = install();
  try {
    const out = await searchCreateSessionModels(env, new URL(base));
    const byName = Object.fromEntries(out.items.map((i) => [i.model_name, i]));
    assert.equal(byName["Brew TN"].source_kind, "partner");
    assert.equal(byName["Brew TN"].partner_name, "Kendo");
    assert.equal(byName["Brew TN"].partner_record_id, "recKendo000000001");
    assert.equal(byName["Boy PK"].partner_record_id, undefined);
    assert.equal(byName["Boy PK"].source_kind, "direct");
    assert.equal(out.source_lookup_ok, true);
  } finally { restore(); }
});

test("source filter keeps only the requested kind", async () => {
  const restore = install();
  try {
    const partner = await searchCreateSessionModels(env, new URL(base + "&source=partner"));
    assert.deepEqual(partner.items.map((i) => i.model_name), ["Brew TN"]);
    const direct = await searchCreateSessionModels(env, new URL(base + "&source=direct"));
    assert.deepEqual(direct.items.map((i) => i.model_name), ["Boy PK"]);
  } finally { restore(); }
});

test("failed referral lookup reports unknown, never Direct", async () => {
  const restore = install({ failReferrals: true });
  try {
    const out = await searchCreateSessionModels(env, new URL(base));
    assert.equal(out.source_lookup_ok, false);
    assert.ok(out.items.every((i) => i.source_kind === null));
    const filtered = await searchCreateSessionModels(env, new URL(base + "&source=direct"));
    assert.equal(filtered.items.length, 0);
  } finally { restore(); }
});

test("job options never hide models whose ability is unknown or unset", async () => {
  const restore = install();
  try {
    const baseline = await searchCreateSessionModels(env, new URL(base));
    for (const options of ["&mk=1", "&burn=true", "&live=yes", "&mk=1&burn=1&live=1"]) {
      const result = await searchCreateSessionModels(env, new URL(base + options));
      assert.deepEqual(result.items.map(item => item.model_id), baseline.items.map(item => item.model_id));
      assert.equal(result.items.find(item => item.model_name === "Brew TN").partner_record_id, "recKendo000000001");
    }
  } finally { restore(); }
});
