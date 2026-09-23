import assert from "node:assert/strict";
import {
  CreateSessionAccessError,
  enforcePrivateCreateAccess,
  resolveAuthoritativeMemberAccess,
} from "./src/index.js";

const env = {
  AIRTABLE_API_KEY: "test",
  AIRTABLE_BASE_ID: "appTest",
  AIRTABLE_TABLE_MEMBERS: "members",
  AIRTABLE_TABLE_MEMBER_PACKAGES: "member_packages",
  AIRTABLE_TABLE_MEMBER_ENTITLEMENTS: "member_entitlements",
  AIRTABLE_TABLE_CLIENTS: "clients",
  AIRTABLE_TABLE_MODELS: "models",
  AIRTABLE_TABLE_ACCESS_LOG: "access_log",
  AIRTABLE_FAST_TRUST_LINE_OFC_STAGING_TABLE: "fast_trust_staging",
};

const tables = {
  clients: [
    {
      id: "recClientFastSvip01",
      fields: {
        "Client Name": "PM",
        line_user_id: "U61cd65864c63533673f67a6e6e6ed407",
      },
    },
    {
      id: "recClientFastMismatch01",
      fields: {
        "Client Name": "Mismatch",
        line_user_id: "Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    },
  ],
  fast_trust_staging: [
    {
      id: "recFastTrustPee001",
      fields: {
        "LINE User ID": "U61cd65864c63533673f67a6e6e6ed407",
        "Current LINE Rename": "พี - SVIP -",
        "Canonical Client": ["recClientFastSvip01"],
      },
    },
    {
      id: "recFastTrustMismatch",
      fields: {
        "LINE User ID": "Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "Current LINE Rename": "Mismatch - SVIP -",
        "Canonical Client": ["recSomeOtherClient01"],
      },
    },
  ],
  members: [],
  member_entitlements: [],
  member_packages: [],
  access_log: [],
  models: [
    {
      id: "recPremiumModel001",
      fields: {
        display_name: "Jasper OP",
        model_lookup_key: "recPremiumModel001",
        booking_visibility: "private",
        access_folder: "premium",
        customer_lane: "straight",
        status: "active",
        availability_status: "available",
        available_now: true,
      },
    },
  ],
};

globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  const parts = url.pathname.split("/").filter(Boolean);
  const table = decodeURIComponent(parts[2] || "");
  const id = parts[3] ? decodeURIComponent(parts[3]) : "";
  const records = tables[table] || [];

  if (id) {
    const record = records.find((item) => item.id === id);
    return json(record || { error: "not_found" }, record ? 200 : 404);
  }

  const formula = url.searchParams.get("filterByFormula") || "";
  const filtered = formula ? records.filter((record) => formulaMatches(record.fields, formula)) : records;
  return json({ records: filtered.slice(0, Number(url.searchParams.get("pageSize") || 100)) });
};

function formulaMatches(fields, formula) {
  const exact = [
    ...formula.matchAll(/\\{([^}]+)\\}\\s*=\\s*"([^"]*)"/g),
    ...formula.matchAll(/\\{([^}]+)\\}\\s*=\\s*'([^']*)'/g),
  ];
  if (exact.length) {
    return exact.every(([, field, value]) => String(fields[field] ?? "") === value);
  }

  const lower = formula.match(/LOWER\\(\\{([^}]+)\\}\\)\\s*=\\s*"([^"]*)"/i)
    || formula.match(/LOWER\\(\\{([^}]+)\\}\\)\\s*=\\s*'([^']*)'/i);
  if (lower) return String(fields[lower[1]] ?? "").toLowerCase() === String(lower[2] || "").toLowerCase();

  return true;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function privateBody(clientId) {
  return {
    job_date: "2026-09-24",
    start_time: "18:00",
    end_time: "19:30",
    amount_thb: 20000,
    service_amount_thb: 20000,
    model_payout_thb: 12000,
    client_lineage: { client_id: clientId },
    line_identity: {},
    work: {
      job_visibility: "private",
      model_folder: "premium",
      job_type: "pn",
      selected_orientation: "straight",
    },
    private_access: {
      eligibility_checked: true,
      eligibility_result: "backend_recheck",
      selected_private_folder: "premium",
      selected_orientation: "straight",
    },
    model: {
      model_id: "recPremiumModel001",
      selected_orientation: "straight",
    },
    telegram_gate: {
      customer_telegram_status: "missing",
      model_telegram_status: "missing",
    },
  };
}

const access = await resolveAuthoritativeMemberAccess(env, {
  client_id: "recClientFastSvip01",
});
assert.equal(access.resolved, true);
assert.equal(access.tier, "black_card");
assert.equal(access.package_code, "svip");
assert.equal(access.fast_trust, true);
assert.equal(access.entitlement_authority, "my_mmd_entitlement_resolver_v1");
assert.equal(access.entitlement_recovery_source, "line_oa_renamed_name_fast_trust");
assert.equal(access.canonical_client_record_id, "recClientFastSvip01");
assert.deepEqual(access.allowed_folders, ["standard", "premium", "vip", "exclusive"]);

const create = await enforcePrivateCreateAccess(env, privateBody("recClientFastSvip01"));
assert.equal(create.memberAccess.fast_trust, true);
assert.equal(create.memberAccess.package_code, "svip");
assert.equal(create.selectedFolder, "premium");
assert.equal(create.selectedOrientation, "straight");
assert.equal(create.ownerJobGrant, null);

await assert.rejects(
  enforcePrivateCreateAccess(env, privateBody("recClientFastMismatch01")),
  (error) => error instanceof CreateSessionAccessError && error.code === "AUTHORITATIVE_MEMBER_NOT_FOUND",
);

console.log("Create Job canonical LINE Fast Trust access regression passed");
