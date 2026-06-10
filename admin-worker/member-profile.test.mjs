import assert from "node:assert/strict";
import test from "node:test";

import { handleMemberDashboardRequest } from "./src/memberDashboard.js";

const TOKEN = "stub.payload.sig";
const BASE_ENV = {
  AIRTABLE_API_KEY: "test_airtable_key",
  AIRTABLE_BASE_ID: "appTest",
  AIRTABLE_TABLE_MEMBERS: "Members",
  AIRTABLE_TABLE_CLIENTS: "Clients",
  AIRTABLE_TABLE_SESSIONS: "Sessions",
  AIRTABLE_TABLE_PAYMENTS: "Payments",
  AIRTABLE_TABLE_POINTS_LEDGER: "points_ledger",
};

function envFor(payload) {
  return {
    ...BASE_ENV,
    PAY_SESSIONS_KV: {
      async get(key) {
        assert.equal(key, "tok:sig");
        return JSON.stringify({
          exp: Math.floor(Date.now() / 1000) + 3600,
          email: "member@example.com",
          ...payload,
        });
      },
    },
  };
}

function installAirtableMock({ points = 0, payments = [], duplicateMemberId = false } = {}) {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const table = decodeURIComponent(url.pathname.split("/").pop() || "");
    const formula = url.searchParams.get("filterByFormula") || "";
    const method = String(init.method || "GET").toUpperCase();

    if (method === "PATCH") {
      return jsonResponse({ id: "recWritable", fields: {} });
    }

    if ((table === "Members" || table === "Clients") && duplicateMemberId && /username_key|username_display|member_username|Member ID/.test(formula)) {
      return jsonResponse({ records: [{ id: "recDuplicate", fields: { username_key: "jayju", email: "other@example.com" } }] });
    }

    if (table === "Members" || table === "Clients" || table === "Sessions") {
      return jsonResponse({ records: [] });
    }

    if (table === "Payments") {
      return jsonResponse({
        records: payments.map((payment, index) => ({
          id: `recPayment${index}`,
          fields: {
            payment_ref: `pay_${index}`,
            amount_thb: payment.amount_thb || 1000,
            payment_status: payment.payment_status || "verified",
            verification_status: payment.verification_status || "verified",
          },
        })),
      });
    }

    if (table === "points_ledger") {
      return jsonResponse({
        records: points
          ? [{ id: "recPoints", fields: { points, expires_at: "2099-01-01" } }]
          : [],
      });
    }

    return jsonResponse({ records: [] });
  };

  return () => {
    globalThis.fetch = previousFetch;
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function profileFor(payload, mockOptions) {
  const restore = installAirtableMock(mockOptions);
  try {
    const response = await handleMemberDashboardRequest(
      new Request(`https://mmdbkk.com/api/member/profile?t=${TOKEN}`),
      envFor(payload),
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    return body.profile;
  } finally {
    restore();
  }
}

async function memberIdCheck(query, mockOptions) {
  const restore = installAirtableMock(mockOptions);
  try {
    const response = await handleMemberDashboardRequest(
      new Request(`https://mmdbkk.com/api/member/profile/member-id/check?t=${TOKEN}&${query}`),
      envFor({ membership_status: "active", tier: "premium" }),
    );
    assert.equal(response.status, 200);
    return response.json();
  } finally {
    restore();
  }
}

function assertStableProfileKeys(profile) {
  for (const key of [
    "client_id",
    "client_name",
    "username_display",
    "username_key",
    "nickname_part",
    "id_code_part",
    "access_layer",
    "status",
    "tier",
    "previous_tier",
    "package_type",
    "member_since",
    "expires_at",
    "onboarding_assistant",
    "points",
    "telegram_access",
    "model_access",
    "upgrade_window",
    "primary_cta",
  ]) {
    assert(Object.hasOwn(profile, key), `missing profile key: ${key}`);
  }
}

test("guest profile snapshot returns stable pending/public state", async () => {
  const profile = await profileFor({
    membership_status: "guest",
    tier: "",
    onboarding_assistant: "hito",
  });

  assertStableProfileKeys(profile);
  assert.equal(profile.access_layer, "MMD PRIVÉ");
  assert.equal(profile.status, "Guest");
  assert.equal(profile.tier, null);
  assert.equal(profile.points.total, 0);
  assert.equal(profile.points.status, "pending_review");
  assert.equal(profile.model_access.scope, "public_models_only");
  assert.equal(profile.telegram_access.standard_group, "inactive");
  assert.equal(profile.telegram_access.premium_group, "inactive");
});

test("expired profile keeps verified points but public model access", async () => {
  const profile = await profileFor({
    membership_status: "expired",
    tier: "premium",
    points_status: "verified",
  }, { points: 120 });

  assertStableProfileKeys(profile);
  assert.equal(profile.status, "Expired");
  assert.equal(profile.access_layer, "MMD PRIVÉ");
  assert.equal(profile.points.total, 120);
  assert.equal(profile.points.status, "verified");
  assert.equal(profile.model_access.scope, "public_models_only");
  assert.equal(profile.telegram_access.premium_group, "removed");
});

test("7 Days active profile has premium Telegram status and separate upgrade window", async () => {
  const profile = await profileFor({
    membership_status: "active",
    tier: "7_days",
    seven_days_expires_at: "2026-06-15",
    upgrade_offer_expires_at: "2026-06-12",
    points_status: "verified",
  }, { payments: [{ payment_status: "verified" }] });

  assert.equal(profile.access_layer, "SĪGIL");
  assert.equal(profile.status, "Active");
  assert.equal(profile.tier, "7 Days");
  assert.equal(profile.telegram_access.standard_group, "active");
  assert.equal(profile.telegram_access.premium_group, "active");
  assert.equal(profile.model_access.scope, "private_models_enabled");
  assert.equal(profile.upgrade_window.seven_days_expires_at, "2026-06-15");
  assert.equal(profile.upgrade_window.upgrade_offer_expires_at, "2026-06-12");
});

test("standard active profile excludes premium Telegram group", async () => {
  const profile = await profileFor({
    membership_status: "active",
    tier: "standard",
  }, { payments: [{ payment_status: "verified" }] });

  assert.equal(profile.tier, "Standard");
  assert.equal(profile.telegram_access.standard_group, "active");
  assert.equal(profile.telegram_access.premium_group, "not_included");
  assert.equal(profile.model_access.scope, "private_models_enabled");
});

test("premium active profile includes premium Telegram group", async () => {
  const profile = await profileFor({
    membership_status: "active",
    tier: "premium",
  }, { payments: [{ payment_status: "verified" }] });

  assert.equal(profile.tier, "Premium");
  assert.equal(profile.telegram_access.standard_group, "active");
  assert.equal(profile.telegram_access.premium_group, "active");
});

test("svip active profile is above black card and includes premium Telegram group", async () => {
  const profile = await profileFor({
    membership_status: "active",
    tier: "svip",
  }, { payments: [{ payment_status: "verified" }] });

  assert.equal(profile.tier, "SVIP");
  assert.equal(profile.telegram_access.standard_group, "active");
  assert.equal(profile.telegram_access.premium_group, "active");
  assert.equal(profile.model_access.scope, "private_models_enabled");
});

test("invalid member ID rejects numbers server-side", async () => {
  const body = await memberIdCheck("nickname_part=max&id_code_part=24");

  assert.equal(body.ok, false);
  assert.equal(body.available, false);
  assert.equal(body.error, "id_code_part_invalid");
});

test("duplicate member ID checks member/client identity fields", async () => {
  const body = await memberIdCheck("nickname_part=jay&id_code_part=ju", { duplicateMemberId: true });

  assert.equal(body.ok, true);
  assert.equal(body.available, false);
  assert.equal(body.username_key, "jayju");
});

test("invalid onboarding assistant is not selected", async () => {
  const profile = await profileFor({
    membership_status: "active",
    tier: "premium",
    onboarding_assistant: "kenji",
  }, { payments: [{ payment_status: "verified" }] });

  assert.equal(profile.onboarding_assistant.selected, false);
  assert.equal(profile.onboarding_assistant.character_key, "");
  assert.equal(profile.onboarding_assistant.status, "not_selected");
});
