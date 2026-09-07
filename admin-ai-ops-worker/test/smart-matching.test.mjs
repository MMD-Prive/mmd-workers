import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCanonicalModelSearchRoute,
  normalizeSmartMatchInput,
  rankSmartMatches,
} from "../src/smart-matching.js";

test("private matching requires canonical client identity, folder and lane", () => {
  const missing = normalizeSmartMatchInput({ work_type: "private", folder: "premium" });
  assert.equal(missing.ok, false);
  assert.equal(missing.errors.includes("private_orientation_required"), true);
  assert.equal(missing.errors.includes("private_client_identity_required"), true);

  const ok = normalizeSmartMatchInput({
    work_type: "private",
    folder: "premium",
    orientation: "gay",
    client_id: "recClient1",
    mk: true,
    kiss: true,
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.requested_capabilities.mk, true);
  assert.equal(ok.requested_capabilities.kiss, true);
});

test("canonical search route forwards only supported explicit capability filters", () => {
  const input = normalizeSmartMatchInput({
    work_type: "private",
    folder: "vip",
    orientation: "straight",
    client_id: "recClient1",
    mk: true,
    burn: true,
    live: true,
    kiss: true,
  });
  const route = new URL(buildCanonicalModelSearchRoute(input), "https://mmdbkk.com");
  assert.equal(route.pathname, "/v1/admin/models/search");
  assert.equal(route.searchParams.get("client_id"), "recClient1");
  assert.equal(route.searchParams.get("folder"), "vip");
  assert.equal(route.searchParams.get("customer_lane"), "straight");
  assert.equal(route.searchParams.get("mk"), "1");
  assert.equal(route.searchParams.get("burn"), "1");
  assert.equal(route.searchParams.get("live"), "1");
  assert.equal(route.searchParams.has("kiss"), false);
});

test("ranking explains verified signals and leaves final selection to Per", () => {
  const input = normalizeSmartMatchInput({
    work_type: "private",
    folder: "premium",
    orientation: "gay",
    client_id: "recClient1",
    mk: true,
    kiss: true,
  });
  const output = rankSmartMatches({
    private_access: { private_access_level: "premium", allowed_private_folders: ["standard", "premium"] },
    items: [
      {
        model_id: "m1",
        model_name: "Alpha",
        model_lookup_key: "MMD-A",
        folders: ["premium"],
        orientation: "gay",
        status: "available",
        available: true,
        telegram_status: "verified",
        operational: { mk: true, burn: false, live: false },
      },
      {
        model_id: "m2",
        model_name: "Beta",
        model_lookup_key: "MMD-B",
        folders: ["premium"],
        orientation: "both",
        status: "active",
        available: false,
        telegram_status: "missing",
        operational: { mk: true, burn: false, live: false },
      },
    ],
  }, input);

  assert.equal(output.ok, true);
  assert.equal(output.mode, "preview_only");
  assert.equal(output.assignment_authority, "Per");
  assert.equal(output.per_confirmation_required, true);
  assert.equal(output.matches[0].model_id, "m1");
  assert.equal(output.matches[0].rank, 1);
  assert.equal(output.matches[0].reasons.some((reason) => reason.code === "available_now"), true);
  assert.equal(output.matches[0].reasons.some((reason) => reason.code === "mk_verified"), true);
  assert.equal(output.matches[1].missing_evidence.includes("model_telegram_not_verified"), true);
  assert.equal(output.warnings.some((warning) => warning.code === "kiss_capability_not_exposed"), true);
  assert.equal(output.signals_not_available.some((value) => value.includes("Drive-folder")), true);
});

test("public matching never requires membership identity", () => {
  const input = normalizeSmartMatchInput({
    work_type: "public",
    folder: "travel",
    orientation: "straight",
  });
  assert.equal(input.ok, true);
  const route = new URL(buildCanonicalModelSearchRoute(input), "https://mmdbkk.com");
  assert.equal(route.searchParams.has("client_id"), false);
  assert.equal(route.searchParams.get("work_type"), "public");
});
