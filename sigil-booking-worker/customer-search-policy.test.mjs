import test from "node:test";
import assert from "node:assert/strict";
import {
  SIGIL_CUSTOMER_SEARCH_POLICY_VERSION,
  allowedCustomerModelFolders,
  customerLaneMatches,
  defaultDurationOptions,
  inferCustomerModelFolder,
  isProtectedCampaignModel,
  normalizeBudget,
  safeSearchIntent,
  sanitizeTelegramReference,
} from "./src/customer-search-policy.js";

test("customer search policy has a pinned version", () => {
  assert.equal(SIGIL_CUSTOMER_SEARCH_POLICY_VERSION, "sigil-customer-search-v1");
});

test("Standard and Premium get only their canonical non-protected folders", () => {
  const snapshot = (envelope) => ({
    schema_version: "my_mmd_entitlement_resolver_v1",
    member_blocked: false,
    access: { private_visibility_envelope: envelope, new_model_reveals_allowed: true },
  });
  assert.deepEqual(allowedCustomerModelFolders(snapshot("standard")), ["standard"]);
  assert.deepEqual(allowedCustomerModelFolders(snapshot("premium")), ["standard", "premium"]);
  assert.deepEqual(allowedCustomerModelFolders(snapshot("vip")), []);
  assert.deepEqual(allowedCustomerModelFolders(snapshot("svip")), []);
  assert.deepEqual(allowedCustomerModelFolders(snapshot("black_card")), []);
  assert.deepEqual(allowedCustomerModelFolders({ ...snapshot("premium"), member_blocked: true }), []);
  assert.deepEqual(allowedCustomerModelFolders({ ...snapshot("premium"), access: { private_visibility_envelope: "premium", new_model_reveals_allowed: false } }), []);
});

test("GWs and EMs are protected before any customer projection", () => {
  assert.equal(isProtectedCampaignModel({ unique_key: "EMs11" }), true);
  assert.equal(isProtectedCampaignModel({ working_name: "GWs19 Name" }), true);
  assert.equal(isProtectedCampaignModel({ recognition_class: "gws" }), true);
  assert.equal(isProtectedCampaignModel({ working_name: "Jasper" }), false);
});

test("folder inference is bounded to canonical customer folders", () => {
  assert.equal(inferCustomerModelFolder({ private_tier: "Premium" }), "premium");
  assert.equal(inferCustomerModelFolder({ source_folder: "Private Models / Standard Package / MMD Variety / Model A" }), "standard");
  assert.equal(inferCustomerModelFolder({ source_folder: "MMD Exclusive Models / Exclusive PN / EMs16" }), "exclusive");
  assert.equal(inferCustomerModelFolder({ source_folder: "random folder" }), "");
});

test("Straight, Gay and Both matching never guesses unknown model orientation", () => {
  assert.equal(customerLaneMatches({ orientation: "Straight" }, "straight"), true);
  assert.equal(customerLaneMatches({ orientation: "Gay" }, "straight"), false);
  assert.equal(customerLaneMatches({ orientation: "Both" }, "gay"), true);
  assert.equal(customerLaneMatches({}, "gay"), false);
  assert.equal(customerLaneMatches({ orientation: "Straight" }, "both"), true);
});

test("duration defaults match owner policy", () => {
  assert.deepEqual(defaultDurationOptions("premium", {}), [90]);
  assert.deepEqual(defaultDurationOptions("standard", {}), [90, 120]);
  assert.deepEqual(defaultDurationOptions("premium", { duration_options: "120, 180" }), [120, 180]);
});

test("SIGIL Search requires a real budget and accepts spec/name/Telegram reference", () => {
  const missing = safeSearchIntent({ search_mode: "search", customer_lane: "both", work_lane: "pn" });
  assert.deepEqual(missing.errors, ["budget_required"]);

  const intent = safeSearchIntent({
    search_mode: "search",
    customer_lane: "both",
    work_lane: "pn",
    budget_thb: "15000",
    spec: "สูง คุยอังกฤษได้",
    preferred_model_name: "Jasper",
    telegram_post_url: "https://t.me/c/1668261779/1234",
    fallback_allowed: true,
  });
  assert.deepEqual(intent.errors, []);
  assert.equal(intent.customer_lane, "both");
  assert.equal(intent.work_lane, "pn");
  assert.equal(intent.budget.max_thb, 15000);
  assert.equal(intent.spec, "สูง คุยอังกฤษได้");
  assert.equal(intent.preferred_model_name, "Jasper");
  assert.equal(intent.telegram_reference, "https://t.me/c/1668261779/1234");
  assert.equal(intent.fallback_allowed, true);
});

test("Telegram customer reference accepts only Telegram HTTPS links", () => {
  assert.equal(sanitizeTelegramReference("https://t.me/c/1668261779/1234"), "https://t.me/c/1668261779/1234");
  assert.equal(sanitizeTelegramReference("http://t.me/c/1/2"), "");
  assert.equal(sanitizeTelegramReference("https://example.com/c/1/2"), "");
});

test("budget bands become bounded numeric search context", () => {
  assert.deepEqual(normalizeBudget({ budget_band: "10000_20000" }), { provided: true, min_thb: 10000, max_thb: 20000, label: "10000_20000" });
  assert.deepEqual(normalizeBudget({ budget_band: "30000_plus" }), { provided: true, min_thb: 30000, max_thb: null, label: "30000_plus" });
});
