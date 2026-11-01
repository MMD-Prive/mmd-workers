import assert from "node:assert/strict";
import test from "node:test";

import {
  customerModelExcluded,
  projectPublicSearchModel,
  resolvePublicStartingPrice,
  sanitizeModelForBooking,
} from "./src/index.js";
import {
  modelProfileMatches,
  priceFitsBudget,
  safeSearchIntent,
} from "./src/customer-search-policy.js";

const MODEL = {
  model_id: "recPUBLICMODEL01",
  model_key: "public-one",
  display_name: "Public One",
  height_cm: 180,
  weight_kg: 72,
  body_type: "athletic",
  skin_tone: "medium",
};

function publicRule(overrides = {}) {
  return {
    id: "recPUBLICRULE01",
    fields: {
      Model: [MODEL.model_id],
      model_key: MODEL.model_key,
      status: "active",
      audience_scope: ["public_member"],
      sales_visibility: "on",
      price_visibility: "public",
      customer_sell_rate_thb: 12000,
      effective_from_at: "2020-01-01T00:00:00.000Z",
      ...overrides,
    },
  };
}

test("Public height filters are inclusive at both boundaries", () => {
  const intent = safeSearchIntent({ min_height_cm: "180", max_height_cm: "180" });
  assert.deepEqual(intent.errors, []);
  assert.equal(modelProfileMatches({ height_cm: 180 }, intent.profile_filters), true);
  assert.equal(modelProfileMatches({ height_cm: 179 }, intent.profile_filters), false);
  assert.equal(modelProfileMatches({ height_cm: 181 }, intent.profile_filters), false);
});

test("Public weight filters are inclusive at both boundaries", () => {
  const intent = safeSearchIntent({ min_weight_kg: "72", max_weight_kg: "72" });
  assert.deepEqual(intent.errors, []);
  assert.equal(modelProfileMatches({ weight_kg: 72 }, intent.profile_filters), true);
  assert.equal(modelProfileMatches({ weight_kg: 71 }, intent.profile_filters), false);
  assert.equal(modelProfileMatches({ weight_kg: 73 }, intent.profile_filters), false);
});

test("Public body type and skin tone filters use canonical values", () => {
  const intent = safeSearchIntent({ body_type: "athletic", skin_tone: "medium" });
  assert.deepEqual(intent.errors, []);
  assert.equal(modelProfileMatches(MODEL, intent.profile_filters), true);
  assert.equal(modelProfileMatches({ ...MODEL, body_type: "soft" }, intent.profile_filters), false);
  assert.equal(modelProfileMatches({ ...MODEL, skin_tone: "tan" }, intent.profile_filters), false);
});

test("Combined profile filters require every requested field", () => {
  const intent = safeSearchIntent({ min_height_cm: 175, max_height_cm: 185, min_weight_kg: 70, max_weight_kg: 75, body_type: "athletic", skin_tone: "medium" });
  assert.deepEqual(intent.errors, []);
  assert.equal(modelProfileMatches(MODEL, intent.profile_filters), true);
  assert.equal(modelProfileMatches({ ...MODEL, weight_kg: 76 }, intent.profile_filters), false);
});

test("No Public profile filter preserves a valid model", () => {
  const intent = safeSearchIntent({});
  assert.deepEqual(intent.errors, []);
  assert.equal(modelProfileMatches(MODEL, intent.profile_filters), true);
});

test("Invalid Public profile filters fail closed before model reads", () => {
  const intent = safeSearchIntent({ min_height_cm: "not-a-number", body_type: "unknown" });
  assert.deepEqual(intent.errors, ["min_height_cm_invalid", "body_type_invalid"]);
});

test("Missing profile values do not match an active filter", () => {
  const intent = safeSearchIntent({ min_height_cm: 170, body_type: "athletic" });
  assert.equal(modelProfileMatches({ body_type: "athletic" }, intent.profile_filters), false);
});

test("Public budget filtering uses the canonical public starting price", () => {
  assert.equal(resolvePublicStartingPrice(MODEL, [publicRule()], "2026-10-29T00:00:00.000Z"), 12000);
  assert.equal(priceFitsBudget(12000, { provided: true, max_thb: 12000 }), true);
  assert.equal(priceFitsBudget(12001, { provided: true, max_thb: 12000 }), false);
});

test("Private or customer-specific pricing never becomes a Public starting price", () => {
  const privateRule = publicRule({
    audience_scope: ["premium"],
    customer_sell_rate_thb: 9000,
    customer_specific_rate_thb: 7000,
  });
  assert.equal(resolvePublicStartingPrice(MODEL, [privateRule], "2026-10-29T00:00:00.000Z"), null);
});

test("Public projection exposes only the approved profile fields and public price", () => {
  const projected = projectPublicSearchModel({
    ...MODEL,
    model_record_id: "recINTERNAL01",
    unique_key: "private-unique-key",
    working_name: "Internal Working Name",
    nickname: "Internal Nickname",
    legal_name: "Private Legal Name",
    public_image_url: "https://drive.example/private.webp",
  }, [publicRule()], "2026-10-29T00:00:00.000Z");
  assert.equal(projected.sales_control.public_starting_price_thb, 12000);
  assert.equal(Object.hasOwn(projected, "model_record_id"), false);
  assert.equal(Object.hasOwn(projected, "working_name"), false);
  assert.equal(Object.hasOwn(projected, "unique_key"), false);
  assert.equal(Object.hasOwn(projected, "nickname"), false);
  assert.equal(Object.hasOwn(projected, "legal_name"), false);
  assert.equal(Object.hasOwn(projected, "public_image_url"), false);
  assert.deepEqual(
    Object.keys(projected).sort(),
    ["body_type", "display_name", "height_cm", "model_id", "model_key", "sales_control", "skin_tone", "weight_kg"].sort(),
  );
});

test("Known test model is excluded from customer discovery", () => {
  assert.equal(customerModelExcluded("rec88tNFcOJwgrQVE"), true);
  assert.equal(sanitizeModelForBooking({
    id: "rec88tNFcOJwgrQVE",
    fields: { working_name: "TEST SIGIL MODEL", can_work_public: true, status: "active" },
  }, { scope: "public", privateAllowed: false, env: {} }), null);
});

test("Customer projection omits legal names and storage URLs", () => {
  const projected = sanitizeModelForBooking({
    id: "recPUBLICMODEL01",
    fields: {
      working_name: "Public One",
      can_work_public: true,
      status: "active",
      height_cm: 180,
      weight_kg: 72,
      body_type: "athletic",
      skin_tone: "medium",
      legal_name: "Private Legal Name",
      public_image_url: "https://drive.example/private.webp",
      r2_prefix: "private/secret",
      drive_folder_id: "drive-secret",
    },
  }, { scope: "public", privateAllowed: false, env: {} });
  assert.equal(projected.display_name, "Public One");
  assert.equal(Object.hasOwn(projected, "legal_name"), false);
  assert.equal(Object.hasOwn(projected, "public_image_url"), false);
  assert.equal(Object.hasOwn(projected, "r2_prefix"), false);
  assert.equal(Object.hasOwn(projected, "drive_folder_id"), false);
});
