import assert from "node:assert/strict";
import worker, {
  CreateSessionAccessError,
  enforcePrivateCreateAccess,
  resolveAuthoritativeMemberAccess,
  searchCreateSessionModels,
} from "./src/index.js";

const env = {
  AIRTABLE_API_KEY: "test",
  AIRTABLE_BASE_ID: "appTest",
  ADMIN_BEARER: "admin-test",
  AIRTABLE_TABLE_MEMBERS: "members",
  AIRTABLE_TABLE_MEMBER_PACKAGES: "member_packages",
  AIRTABLE_TABLE_MODELS: "models",
};

const future = "2099-01-01";
const past = "2000-01-01";

const tables = {
  members: [
    member("recMemStandard0001", "client_standard", "mem_standard", "standard@example.test"),
    member("recMemPremium0001", "client_premium", "mem_premium", "premium@example.test"),
    member("recMemVip00000001", "client_vip", "mem_vip", "vip@example.test"),
    member("recMemBlack000001", "client_black", "mem_black", "black@example.test"),
    member("recMemSvip0000001", "client_svip", "mem_svip", "svip@example.test"),
    member("recMemExpired0001", "client_expired", "mem_expired", "expired@example.test"),
    member("recMemInactive01", "client_inactive", "mem_inactive", "inactive@example.test"),
    member("recMemGuest00001", "client_guest", "mem_guest", "guest@example.test"),
  ],
  member_packages: [
    pkg("recPkgStandard001", "standard@example.test", "Standard", future),
    pkg("recPkgPremium001", "premium@example.test", "Premium", future),
    pkg("recPkgVip0000001", "vip@example.test", "VIP", future),
    pkg("recPkgBlack00001", "black@example.test", "Black Card", future),
    pkg("recPkgSvip000001", "svip@example.test", "SVIP", future),
    pkg("recPkgExpired001", "expired@example.test", "Black Card", past),
    pkg("recPkgInactive01", "inactive@example.test", "Black Card", future, "inactive"),
    pkg("recPkgGuest0001", "guest@example.test", "Guest", future),
  ],
  models: [
    model("recStandardModel01", "Standard Straight", "standard", "straight"),
    model("recPremiumModel001", "Premium Both", "premium", "both"),
    model("recVipModel000001", "VIP Gay", "vip", "gay"),
    model("recExclusiveModel1", "Exclusive Both", "exclusive", "both"),
    {
      id: "recPublicTravel001",
      fields: {
        display_name: "Public Travel",
        booking_visibility: "public",
        service_layer: "Travel",
        customer_lane: "both",
        status: "active",
        availability_status: "available",
        available_now: true,
      },
    },
  ],
};

function member(id, clientId, memberId, email) {
  return {
    id,
    fields: {
      client_id: clientId,
      member_id: memberId,
      email,
      "Contact Email": email,
      line_record_id: `${clientId}_line_record`,
      line_user_id: `${clientId}_line_user`,
    },
  };
}

function pkg(id, email, packageCode, endDate, status = "active") {
  return {
    id,
    fields: {
      member_email: email,
      package_code: packageCode,
      status,
      end_date: endDate,
    },
  };
}

function model(id, name, accessFolder, lane) {
  return {
    id,
    fields: {
      display_name: name,
      model_lookup_key: id,
      booking_visibility: "private",
      access_folder: accessFolder,
      customer_lane: lane,
      status: "active",
      availability_status: "available",
      available_now: true,
      telegram_username: `@${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    },
  };
}

function installAirtableMock() {
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    const parts = url.pathname.split("/").filter(Boolean);
    const table = decodeURIComponent(parts[2] || "");
    const id = parts[3] ? decodeURIComponent(parts[3]) : "";
    const records = tables[table] || [];

    if (id) {
      const record = records.find((item) => item.id === id);
      return jsonResponse(record || { error: "not_found" }, record ? 200 : 404);
    }

    const formula = url.searchParams.get("filterByFormula") || "";
    const filtered = formula ? records.filter((record) => formulaMatches(record.fields, formula)) : records;
    return jsonResponse({ records: filtered.slice(0, Number(url.searchParams.get("pageSize") || 100)) });
  };
  return calls;
}

function formulaMatches(fields, formula) {
  const value = (formula.match(/=\s*"([^"]*)"/) || [])[1] || "";
  const field = (formula.match(/\{([^}]+)\}/) || [])[1] || "";
  if (!field) return true;
  const actual = String(fields[field] ?? "");
  return /^LOWER\(/.test(formula) ? actual.toLowerCase() === value.toLowerCase() : actual === value;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function privateBody(clientId, folder, modelId, overrides = {}) {
  return {
    client_lineage: {
      client_id: clientId,
      membership_status: overrides.forgedMembershipStatus || "expired",
      normalized_membership_tier: overrides.forgedTier || "blackcard",
    },
    line_identity: {},
    work: {
      job_visibility: "private",
      model_folder: folder,
    },
    private_access: {
      eligibility_checked: true,
      eligibility_result: "allowed",
      private_access_level: overrides.forgedAccessLevel || "black_card",
      allowed_private_folders: overrides.forgedFolders || ["standard", "premium", "vip", "exclusive"],
      selected_orientation: overrides.orientation || "straight",
      selected_private_folder: folder,
    },
    model: {
      model_id: modelId,
      selected_orientation: overrides.orientation || "straight",
    },
    telegram_gate: {
      customer_telegram_status: overrides.customerTelegram || "linked",
      model_telegram_status: overrides.modelTelegram || "verified",
    },
  };
}

async function rejectsWithCode(promise, code) {
  await assert.rejects(
    promise,
    (error) => error instanceof CreateSessionAccessError && error.code === code,
  );
}

installAirtableMock();

assert.deepEqual((await resolveAuthoritativeMemberAccess(env, { client_id: "client_standard" })).allowed_folders, ["standard"]);
assert.deepEqual((await resolveAuthoritativeMemberAccess(env, { client_id: "client_premium" })).allowed_folders, ["standard", "premium"]);
assert.deepEqual((await resolveAuthoritativeMemberAccess(env, { client_id: "client_vip" })).allowed_folders, ["standard", "premium", "vip"]);
assert.deepEqual((await resolveAuthoritativeMemberAccess(env, { client_id: "client_black" })).allowed_folders, ["standard", "premium", "vip", "exclusive"]);
const svip = await resolveAuthoritativeMemberAccess(env, { client_id: "client_svip" });
assert.equal(svip.tier, "black_card");
assert.deepEqual(svip.allowed_folders, ["standard", "premium", "vip", "exclusive"]);

await rejectsWithCode(
  enforcePrivateCreateAccess(env, privateBody("client_standard", "premium", "recPremiumModel001", { forgedAccessLevel: "black_card" })),
  "private_folder_not_allowed",
);
await rejectsWithCode(
  enforcePrivateCreateAccess(env, privateBody("client_expired", "standard", "recStandardModel01", { forgedMembershipStatus: "active" })),
  "private_eligibility_blocked",
);
await rejectsWithCode(
  enforcePrivateCreateAccess(env, privateBody("client_standard", "exclusive", "recExclusiveModel1", { forgedTier: "blackcard" })),
  "private_folder_not_allowed",
);
await rejectsWithCode(
  enforcePrivateCreateAccess(env, privateBody("client_standard", "exclusive", "recExclusiveModel1", { forgedFolders: ["exclusive"] })),
  "private_folder_not_allowed",
);
await rejectsWithCode(
  enforcePrivateCreateAccess(env, privateBody("client_vip", "vip", "recExclusiveModel1")),
  "private_model_folder_denied",
);

const standardSearch = await searchCreateSessionModels(env, new URL("https://worker/v1/admin/models/search?work_type=private&booking_visibility=private&customer_lane=straight&selected_access_folder=standard&client_id=client_standard"));
assert.deepEqual(standardSearch.items.map((item) => item.model_name), ["Standard Straight"]);

const premiumSearch = await searchCreateSessionModels(env, new URL("https://worker/v1/admin/models/search?work_type=private&booking_visibility=private&customer_lane=straight&selected_access_folder=premium&client_id=client_premium"));
assert.deepEqual(premiumSearch.items.map((item) => item.model_name), ["Premium Both"]);

const straightSearch = await searchCreateSessionModels(env, new URL("https://worker/v1/admin/models/search?work_type=private&booking_visibility=private&customer_lane=straight&selected_access_folder=premium&client_id=client_black"));
assert.deepEqual(straightSearch.items.map((item) => item.model_name), ["Premium Both"]);

const gaySearch = await searchCreateSessionModels(env, new URL("https://worker/v1/admin/models/search?work_type=private&booking_visibility=private&customer_lane=gay&selected_access_folder=vip&client_id=client_black"));
assert.deepEqual(gaySearch.items.map((item) => item.model_name), ["VIP Gay"]);

const expiredSearch = await searchCreateSessionModels(env, new URL("https://worker/v1/admin/models/search?work_type=private&booking_visibility=private&customer_lane=straight&selected_access_folder=exclusive&client_id=client_expired&allowed_model_folders=exclusive&normalized_membership_tier=blackcard"));
assert.deepEqual(expiredSearch.items, []);

const inactiveSearch = await searchCreateSessionModels(env, new URL("https://worker/v1/admin/models/search?work_type=private&booking_visibility=private&customer_lane=straight&selected_access_folder=exclusive&client_id=client_inactive&allowed_model_folders=exclusive&normalized_membership_tier=blackcard"));
assert.deepEqual(inactiveSearch.items, []);

const guestSearch = await searchCreateSessionModels(env, new URL("https://worker/v1/admin/models/search?work_type=private&booking_visibility=private&customer_lane=straight&selected_access_folder=standard&client_id=client_guest&allowed_model_folders=standard&normalized_membership_tier=standard"));
assert.deepEqual(guestSearch.items, []);

await rejectsWithCode(
  searchCreateSessionModels(env, new URL("https://worker/v1/admin/models/search?work_type=private&booking_visibility=private&customer_lane=straight&selected_access_folder=standard&client_id=client_missing")),
  "AUTHORITATIVE_MEMBER_NOT_FOUND",
);

const routeRes = await worker.fetch(
  new Request("https://worker/v1/admin/models/search?work_type=private&booking_visibility=private&customer_lane=straight&selected_access_folder=standard&client_id=client_standard", {
    headers: { Authorization: "Bearer admin-test" },
  }),
  env,
);
assert.equal(routeRes.status, 200);
assert.equal((await routeRes.json()).ok, true);

const publicSearch = await searchCreateSessionModels(env, new URL("https://worker/v1/admin/models/search?work_type=public&selected_access_folder=travel"));
assert.deepEqual(publicSearch.items.map((item) => item.model_name), ["Public Travel"]);

await rejectsWithCode(
  enforcePrivateCreateAccess(env, privateBody("client_black", "exclusive", "recExclusiveModel1", { modelTelegram: "missing" })),
  "private_telegram_gate_required",
);

assert.match(await import("node:fs/promises").then((fs) => fs.readFile(new URL("../../assets/sigil/create-session.js", import.meta.url), "utf8")), /saveDraft\(\)/);

console.log("admin create-session access tests passed");
