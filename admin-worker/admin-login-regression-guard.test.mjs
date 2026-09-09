import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import coreWorker from "./src/index.js";
import {
  MEMBERSHIP_ACTION_NOTE_MARKER,
  canonicalizeSigilJobBody,
  prepareSigilJobCreateRequest,
} from "./src/sigil-jobs-membership-action.js";
import { canonicalizePendingClientLinkBody } from "./src/sigil-jobs-pending-client-link.js";

const APPROVED_PAGE_ID = "admin-login-approved-hero";
const LEGACY_MARKERS = [
  "Internal access.",
  "sigil-internal-login",
  "MMD Admin Sign In",
  "Internal Admin Chang Ewvon",
];

test("admin deploy actions use Node24 runtimes without changing the application Node version", async () => {
  const workflow = await readFile(new URL("../.github/workflows/deploy-admin-worker.yml", import.meta.url), "utf8");
  assert.match(workflow, /uses: actions\/checkout@v5/);
  assert.match(workflow, /uses: actions\/setup-node@v5/);
  assert.match(workflow, /node-version: "22"/);
  assert.doesNotMatch(workflow, /actions\/(?:checkout|setup-node)@v4/);
  assert.doesNotMatch(workflow, /ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION/);
});

test("dashboard deploy smoke distinguishes allowed production ingress from a blocked direct host", async () => {
  const workflow = await readFile(new URL("../.github/workflows/deploy-admin-worker.yml", import.meta.url), "utf8");
  assert.match(workflow, /ADMIN_DASHBOARD_PRODUCTION_URL: https:\/\/mmdbkk\.com\/v1\/admin\/dashboard/);
  const smoke = workflow.split("- name: Verify production dashboard route")[1].split("- name: Report deploy stage diagnosis")[0];
  assert.match(smoke, /for origin in https:\/\/mmdbkk\.com https:\/\/www\.mmdbkk\.com; do/);
  assert.match(smoke, /"\$origin\/v1\/admin\/dashboard"\)"\s+test "\$http_code" = "401"\s+grep -q '\"error\":\"unauthorized\"'/);
  assert.match(smoke, /"https:\/\/admin-worker\.malemodel-bkk\.workers\.dev\/v1\/admin\/dashboard"\)"\s+test "\$http_code" = "403"\s+grep -q '\"error\":\"dashboard_host_not_allowed\"'/);
  // A redirect, unexpected 200 or arbitrary 403 is not a passing auth check.
  assert.doesNotMatch(smoke, /continue-on-error|\|\| true|curl[^\n]*--location/);
});

test("admin-worker production entrypoint is permanently pinned to the approved login wrapper", async () => {
  const wrangler = await readFile(new URL("./wrangler.toml", import.meta.url), "utf8");
  assert.match(wrangler, /^main\s*=\s*"src\/admin-login-hero-worker\.js"$/m);
});

test("core fallback renders the same approved login page", async () => {
  const response = await coreWorker.fetch(
    new Request("https://mmdbkk.com/internal/admin/login?next=%2Finternal%2Fadmin%2Fcontrol-room"),
    {}
  );
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-page"), APPROVED_PAGE_ID);
  assert.equal(response.headers.get("x-mmd-route-owner"), "admin-worker");
  assert.match(html, new RegExp(`data-mmd-page="${APPROVED_PAGE_ID}"`));
  assert.match(html, /MMD SIGIL Internal Admin/);
  assert.doesNotMatch(html, /Internal Admin Chang Ewvon/);
  assert.match(html, /data-mmd-page="admin-login-approved-hero"/);
  assert.match(html, /rel="icon" type="image\/webp"/);
  for (const marker of LEGACY_MARKERS) assert.equal(html.includes(marker), false, marker);
});

test("legacy login shell markers cannot remain in either runtime entrypoint", async () => {
  const paths = [
    "./src/admin-login-hero-worker.js",
    "./src/admin-login-page.js",
    "./src/index.js",
  ];
  const sources = await Promise.all(
    paths.map((path) => readFile(new URL(path, import.meta.url), "utf8"))
  );

  for (const marker of LEGACY_MARKERS) {
    for (let index = 0; index < sources.length; index += 1) {
      assert.equal(sources[index].includes(marker), false, `${paths[index]} contains ${marker}`);
    }
  }
});

test("SIGIL Jobs canonical membership_action keeps renewal outside service spend and rewards", () => {
  const out = canonicalizeSigilJobBody({
    client_name: "Test Member",
    amount_thb: 8000,
    membership_action: {
      type: "renew",
      include_in_payment: true,
      renewal_amount_thb: 2500,
      tier_hint: "premium",
    },
  });

  assert.equal(out.body.service_amount_thb, 8000);
  assert.equal(out.body.amount_thb, 10500);
  assert.equal(out.membership_action.type, "renew");
  assert.equal(out.membership_action.renewal_amount_thb, 2500);
  assert.equal(out.membership_action.state, "pending_official_verify");
  assert.equal(out.membership_action.materialization_policy, "official_verify_required");
  assert.equal(out.membership_action.entitlement_mutation_allowed, false);
  assert.equal(out.membership_action.points_eligible, false);
  assert.equal(out.membership_action.service_spend_eligible, false);
  assert.equal(out.membership_action.referral_reward_eligible, false);
  assert.equal(out.pricing_breakdown.customer_total_thb, 10500);
  assert.equal(out.pricing_breakdown.membership_fee_counts_as_service_spend, false);
  assert.equal(out.pricing_breakdown.membership_fee_points_eligible, false);
  assert.equal(out.pricing_breakdown.membership_fee_referral_reward_eligible, false);
  assert.ok(out.body.note.includes(MEMBERSHIP_ACTION_NOTE_MARKER));
});

test("SIGIL Jobs legacy Webflow assisted-renewal note upgrades into membership_action_v1", () => {
  const out = canonicalizeSigilJobBody({
    amount_thb: 8000,
    note: "Existing operator note\n[ASSISTED_RENEWAL_V1] type=renew; source=sigil_jobs; include_in_payment=true; renewal_amount_thb=2500; tier=premium; materialize=after_official_verify",
  });

  assert.equal(out.membership_action.type, "renew");
  assert.equal(out.membership_action.renewal_amount_thb, 2500);
  assert.equal(out.membership_action.tier_hint, "premium");
  assert.equal(out.body.amount_thb, 10500);
  assert.doesNotMatch(out.body.note, /ASSISTED_RENEWAL_V1/);
  assert.match(out.body.note, /MMD_MEMBERSHIP_ACTION_V1/);
});

test("SIGIL Jobs renewal cannot be created without an explicit positive renewal amount", async () => {
  const request = new Request("https://mmdbkk.com/v1/admin/job/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount_thb: 8000,
      membership_action: { type: "renew", include_in_payment: true },
    }),
  });
  const prepared = await prepareSigilJobCreateRequest(request);
  assert.ok(prepared.response);
  assert.equal(prepared.response.status, 400);
  assert.match((await prepared.response.json()).error, /renewal_amount_thb_invalid/);
});

test("SIGIL Jobs renewal rejects positive input that rounds to zero THB", () => {
  assert.throws(() => canonicalizeSigilJobBody({
    amount_thb: 8000,
    membership_action: {
      type: "renew",
      include_in_payment: true,
      renewal_amount_thb: 0.001,
    },
  }), /membership_action\.renewal_amount_thb_invalid/);
});

test("SIGIL Jobs separate renewal payment never inflates service job amount", () => {
  const out = canonicalizeSigilJobBody({
    amount_thb: 8000,
    membership_action: {
      type: "renew",
      include_in_payment: false,
      renewal_amount_thb: 2500,
    },
  });
  assert.equal(out.body.amount_thb, 8000);
  assert.equal(out.membership_action.payment_component_status, "separate_payment_required");
  assert.equal(out.pricing_breakdown.membership_renewal_amount_thb, 2500);
});

test("SIGIL Jobs durable membership marker survives a near-limit operator note", () => {
  const out = canonicalizeSigilJobBody({
    amount_thb: 8000,
    note: "x".repeat(3995),
    membership_action: {
      type: "renew",
      include_in_payment: true,
      renewal_amount_thb: 2500,
      tier_hint: "premium",
    },
  });
  assert.ok(out.body.note.startsWith(`${MEMBERSHIP_ACTION_NOTE_MARKER} `));
  assert.ok(out.body.note.length <= 4000);
  const markerLine = out.body.note.split("\n", 1)[0];
  const parsed = JSON.parse(markerLine.slice(MEMBERSHIP_ACTION_NOTE_MARKER.length).trim());
  assert.equal(parsed.renewal_amount_thb, 2500);
  assert.equal(parsed.service_amount_thb, 8000);
  assert.equal(parsed.customer_total_thb, 10500);
  assert.equal(parsed.entitlement_mutation_allowed, false);
});

test("SIGIL Jobs empty top-level note falls back to structured operation note", () => {
  const out = canonicalizeSigilJobBody({
    amount_thb: 8000,
    note: "",
    notes: {
      operation_note: "Keep this note\n[ASSISTED_RENEWAL_V1] type=renew; source=sigil_jobs; include_in_payment=true; renewal_amount_thb=2500; tier=premium; materialize=after_official_verify",
    },
  });
  assert.equal(out.membership_action.type, "renew");
  assert.equal(out.membership_action.renewal_amount_thb, 2500);
  assert.equal(out.body.amount_thb, 10500);
  assert.match(out.body.note, /Keep this note/);
  assert.ok(out.body.note.startsWith(`${MEMBERSHIP_ACTION_NOTE_MARKER} `));
});

test("pending-client-link private jobs preserve canonical assisted renewal before core create", () => {
  const out = canonicalizePendingClientLinkBody({
    operational_create_mode: "pending_client_link",
    visibility: "private",
    amount_thb: 8000,
    client_name: "Pending Member",
    model_name: "Test Model",
    membership_action: {
      type: "renew",
      include_in_payment: true,
      renewal_amount_thb: 2500,
      tier_hint: "premium",
    },
  });

  assert.equal(out.forwarded_body.visibility, "pending_private");
  assert.equal(out.forwarded_body.amount_thb, 10500);
  assert.equal(out.forwarded_body.service_amount_thb, 8000);
  assert.equal(out.forwarded_body.membership_action.state, "pending_official_verify");
  assert.equal(out.forwarded_body.membership_action.entitlement_mutation_allowed, false);
  assert.ok(out.forwarded_body.note.includes(MEMBERSHIP_ACTION_NOTE_MARKER));
  assert.match(out.forwarded_body.note, /PENDING CLIENT LINK/);
  assert.equal(out.pricing_breakdown.customer_total_thb, 10500);
});
