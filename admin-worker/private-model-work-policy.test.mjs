import assert from "node:assert/strict";

import {
  PRIVATE_MODEL_WORK_POLICY_VERSION,
  derivePrivateServiceLevel,
  enforcePrivateModelSearchPolicy,
  guardPrivateJobCreateWork,
  inferAccessFolder,
  isPrivateModelSearchRequest,
  privateWorkAllowed,
  privateWorkCapabilities,
} from "./src/private-model-work-policy.js";

assert.equal(PRIVATE_MODEL_WORK_POLICY_VERSION, "private-model-work-policy-v1");

assert.deepEqual(derivePrivateServiceLevel({ private_service_level: "VIP" }), {
  level: "vip",
  source: "private_service_level",
});
assert.deepEqual(privateWorkCapabilities("VIP"), ["vip", "pn"]);
assert.equal(privateWorkAllowed("VIP", "VIP"), true);
assert.equal(privateWorkAllowed("VIP", "PN"), true);
assert.deepEqual(privateWorkCapabilities("PN"), ["pn"]);
assert.equal(privateWorkAllowed("PN", "PN"), true);
assert.equal(privateWorkAllowed("PN", "VIP"), false);
assert.equal(privateWorkAllowed("none", "PN"), false);
assert.equal(privateWorkAllowed("none", "VIP"), false);

assert.deepEqual(derivePrivateServiceLevel({ private_work_format: "VIP + PN" }), {
  level: "vip",
  source: "private_work_format",
});
assert.deepEqual(derivePrivateServiceLevel({ private_work_format: "PN" }), {
  level: "pn",
  source: "private_work_format",
});
assert.deepEqual(
  derivePrivateServiceLevel({ source_folder: "Exclusive VIP/Active/EMs20 - Rossi" }),
  { level: "", source: "unclassified" },
  "Drive/folder path must not become create-time authority",
);
assert.deepEqual(
  derivePrivateServiceLevel(
    { source_folder: "Exclusive VIP/Active/EMs20 - Rossi" },
    { allowPathFallback: true },
  ),
  { level: "vip", source: "source_folder_migration_fallback" },
  "Drive/folder path may recover owner discovery during migration",
);

assert.equal(isPrivateModelSearchRequest(new Request(
  "https://mmdbkk.com/v1/admin/models/search?booking_visibility=private&private_work=pn",
)), true);
assert.equal(isPrivateModelSearchRequest(new Request(
  "https://mmdbkk.com/v1/admin/models/search?booking_visibility=public",
)), false);

const driveCandidate = {
  source: "drive",
  materialized: false,
  lane: "exclusive",
  lanes: ["exclusive", "private"],
  drive_folder_id: "19Gt19oczQj7qc0omY4XNeGAJ_yEtS5wH",
  folder_name: "EMs21 J Dye",
  drive_folder_url: "https://drive.google.com/drive/folders/19Gt19oczQj7qc0omY4XNeGAJ_yEtS5wH",
  folder_path: "MMD Exclusive Models / Exclusive VIP / Active / EMs21 J Dye",
  folder_scope_key: "exclusive:drive:19Gt19oczQj7qc0omY4XNeGAJ_yEtS5wH",
};

const env = {
  AIRTABLE_API_KEY: "test-key",
  AIRTABLE_BASE_ID: "appTest1234567890",
  AIRTABLE_TABLE_MODELS: "Models",
  MODEL_DRIVE_DIRECTORY: {
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/__internal/model-drive/search") {
        return new Response(JSON.stringify({ ok: true, count: 1, items: [driveCandidate] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (request.method === "POST" && url.pathname === "/__internal/model-drive/resolve") {
        return new Response(JSON.stringify({ ok: true, item: driveCandidate }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: false, error: "not_found" }), { status: 404 });
    },
  },
};

const vipRecord = {
  id: "recVipModel001",
  fields: {
    working_name: "VIP Model",
    status: "Active",
    sales_layer: "private",
    model_tier: "Exclusive Models",
    private_service_level: "VIP",
  },
};
const pnRecord = {
  id: "recPnModel001",
  fields: {
    working_name: "PN Model",
    status: "Active",
    sales_layer: "private",
    model_tier: "Exclusive Models",
    private_service_level: "PN",
  },
};
const driveMaterializedRecord = {
  id: "recEms21JDye001",
  fields: {
    working_name: "EMs21 J Dye",
    status: "Active",
    sales_layer: "private",
    visibility: "private",
    model_tier: "Exclusive Models",
    private_tier: "Exclusive Models",
    private_service_level: "VIP",
    private_work_format: "VIP + PN",
    approved_for_private_sales: true,
    can_work_private: true,
    drive_folder_id: driveCandidate.drive_folder_id,
    drive_folder_url: driveCandidate.drive_folder_url,
    source_folder: driveCandidate.folder_path,
    folder_scope_key: driveCandidate.folder_scope_key,
  },
};

const rossiRecord = {
  id: "recRossi001",
  fields: {
    working_name: "EMs20 - Rossi",
    status: "Active",
    sales_layer: "private",
    model_tier: "Exclusive Models",
    private_service_level: "VIP",
    private_work_format: "VIP + PN",
    pn_ability: "Yes",
    source_folder: "Exclusive VIP/Active/EMs20 - Rossi",
  },
};

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (url.pathname.endsWith("/recVipModel001")) {
      return new Response(JSON.stringify(vipRecord), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname.endsWith("/recPnModel001")) {
      return new Response(JSON.stringify(pnRecord), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname.endsWith("/recEms21JDye001")) {
      return new Response(JSON.stringify(driveMaterializedRecord), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (method === "POST" && url.pathname.endsWith("/Models")) {
      const rawBody = typeof init?.body === "string" ? init.body : (input instanceof Request ? await input.clone().text() : "{}");
      const body = JSON.parse(rawBody || "{}");
      return new Response(JSON.stringify({
        id: driveMaterializedRecord.id,
        fields: { ...driveMaterializedRecord.fields, ...(body.fields || {}) },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.searchParams.has("filterByFormula")) {
      const formula = String(url.searchParams.get("filterByFormula") || "");
      if (formula.includes("RECORD_ID()")) {
        return new Response(JSON.stringify({ records: [vipRecord, pnRecord] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (formula.toLowerCase().includes("ems21") || formula.includes(driveCandidate.drive_folder_id) || formula.includes(driveCandidate.folder_scope_key)) {
        return new Response(JSON.stringify({ records: [] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ records: [vipRecord, pnRecord] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ records: [rossiRecord] }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const baseCore = new Response(JSON.stringify({
    ok: true,
    items: [
      { model_id: vipRecord.id, model_name: "VIP Model" },
      { model_id: pnRecord.id, model_name: "PN Model" },
    ],
  }), { status: 200, headers: { "content-type": "application/json" } });

  const pnSearch = new Request(
    "https://mmdbkk.com/v1/admin/models/search?booking_visibility=private&private_work=pn&client_id=recClient001&q=Model",
  );
  const pnFiltered = await enforcePrivateModelSearchPolicy(pnSearch, baseCore.clone(), env);
  const pnPayload = await pnFiltered.json();
  assert.equal(pnPayload.items.length, 2, "PN search must include PN and VIP models");
  assert.deepEqual(pnPayload.items.map((item) => item.private_service_level).sort(), ["pn", "vip"]);

  const vipSearch = new Request(
    "https://mmdbkk.com/v1/admin/models/search?booking_visibility=private&private_work=vip&client_id=recClient001&q=Model",
  );
  const vipFiltered = await enforcePrivateModelSearchPolicy(vipSearch, baseCore.clone(), env);
  const vipPayload = await vipFiltered.json();
  assert.equal(vipPayload.items.length, 1, "VIP search must exclude PN-only models");
  assert.equal(vipPayload.items[0].model_id, vipRecord.id);

  const memberMissing = new Response(JSON.stringify({
    ok: false,
    error: { code: "AUTHORITATIVE_MEMBER_NOT_FOUND", message: "missing member" },
  }), { status: 409, headers: { "content-type": "application/json" } });
  const rossiSearch = new Request(
    "https://mmdbkk.com/v1/admin/models/search?booking_visibility=private&private_work=pn&client_id=recClient001&selected_access_folder=exclusive&q=Rossi",
  );
  const rossiRecovered = await enforcePrivateModelSearchPolicy(rossiSearch, memberMissing, env);
  const rossiPayload = await rossiRecovered.json();
  assert.equal(rossiRecovered.status, 200);
  assert.equal(rossiPayload.owner_discovery, true);
  assert.equal(rossiPayload.items.length, 1);
  assert.equal(rossiPayload.items[0].model_name, "EMs20 - Rossi");
  assert.deepEqual(rossiPayload.items[0].private_work_capabilities, ["vip", "pn"]);

  const driveOnlySearch = new Request(
    "https://mmdbkk.com/v1/admin/models/search?booking_visibility=private&private_work=pn&selected_access_folder=exclusive&q=EMs21",
  );
  const driveOnlyRecovered = await enforcePrivateModelSearchPolicy(driveOnlySearch, memberMissing.clone(), env);
  const driveOnlyPayload = await driveOnlyRecovered.json();
  assert.equal(driveOnlyRecovered.status, 200, "owner search must not be blocked by missing Member");
  assert.equal(driveOnlyPayload.owner_discovery, true);
  assert.equal(driveOnlyPayload.items.length, 1);
  assert.equal(driveOnlyPayload.items[0].model_id, driveMaterializedRecord.id);
  assert.equal(driveOnlyPayload.items[0].model_name, "EMs21 J Dye");
  assert.equal(driveOnlyPayload.items[0].drive_materialized, true);
  assert.deepEqual(driveOnlyPayload.items[0].private_work_capabilities, ["vip", "pn"]);

  const pnJob = new Request("https://mmdbkk.com/v1/admin/job/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      job_type: "pn",
      work: { job_visibility: "private", job_type: "pn" },
      model: { model_id: pnRecord.id },
    }),
  });
  assert.equal(await guardPrivateJobCreateWork(pnJob, env), null);

  const vipWithPnOnly = new Request("https://mmdbkk.com/v1/admin/job/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      job_type: "vip",
      work: { job_visibility: "private", job_type: "vip" },
      model: { model_id: pnRecord.id },
    }),
  });
  const blocked = await guardPrivateJobCreateWork(vipWithPnOnly, env);
  assert.equal(blocked.status, 409);
  const blockedPayload = await blocked.json();
  assert.equal(blockedPayload.error.code, "private_model_work_not_allowed");

  const pnWithVip = new Request("https://mmdbkk.com/v1/admin/job/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      job_type: "pn",
      work: { job_visibility: "private", job_type: "pn" },
      model: { model_id: vipRecord.id },
    }),
  });
  assert.equal(await guardPrivateJobCreateWork(pnWithVip, env), null, "VIP model must be valid for PN job");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("Private Model work policy tests passed: VIP => VIP+PN; PN => PN only.");

assert.equal(
  inferAccessFolder({ source_folder: "Private Models / Standard Package / MMD Variety / MMD Farang / VIP / Simba" }),
  "standard",
  "Standard Package controls access while nested VIP is work capability",
);
assert.equal(
  inferAccessFolder({ source_folder: "Private Models / Premium Package / Straight / VIP / Example" }),
  "premium",
  "Premium Package controls access even when model is VIP-capable",
);
