import test from "node:test";
import assert from "node:assert/strict";
import { handleOwnerPrivateJobGrantCreate, isOwnerPrivateJobGrantCreateRequest } from "./src/owner-private-job-grant-create.js";

const BASE = "appTest0000000000";
const API_KEY = "test-airtable-key";

function payload() {
  return {
    job_visibility: "private",
    client_id: "rec6zsmzrVDkoza1y",
    model: { model_id: "recbNm4VPokw33xqD", selected_orientation: "straight" },
    job_date: "2026-10-02",
    start_time: "19:00",
    end_time: "20:30",
    private_access: { selected_private_folder: "exclusive", selected_orientation: "straight" },
    work: { job_type: "pn", model_folder: "exclusive" },
    amount_thb: 25000,
    pay_model_thb: 17500,
    owner_grant_reason_code: "AUTHORITATIVE_MEMBER_NOT_FOUND",
  };
}

function request(body = payload()) {
  return new Request("https://mmdbkk.com/v1/admin/job/owner-grant", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function envFixture(existing = []) {
  const calls = [];
  const env = {
    AIRTABLE_API_KEY: API_KEY,
    AIRTABLE_BASE_ID: BASE,
    AIRTABLE_TABLE_ACCESS_LOG: "System — Access Log",
    AIRTABLE_HTTP: {
      async fetch(input, init = {}) {
        const url = new URL(String(input));
        calls.push({ url: url.toString(), method: init.method || "GET", body: init.body || "" });
        if ((init.method || "GET") === "GET") {
          return Response.json({ records: existing });
        }
        const parsed = JSON.parse(init.body || "{}");
        assert.equal(parsed.records?.length, 1);
        return Response.json({ records: [{ id: "recGrantCreated01", fields: parsed.records[0].fields }] }, { status: 201 });
      },
    },
  };
  return { env, calls };
}

test("route matcher is exact POST", () => {
  assert.equal(isOwnerPrivateJobGrantCreateRequest("/v1/admin/job/owner-grant", "POST"), true);
  assert.equal(isOwnerPrivateJobGrantCreateRequest("/v1/admin/job/owner-grant/", "POST"), true);
  assert.equal(isOwnerPrivateJobGrantCreateRequest("/v1/admin/job/owner-grant", "GET"), false);
  assert.equal(isOwnerPrivateJobGrantCreateRequest("/v1/admin/job/create", "POST"), false);
});

test("owner can create an exact single-job grant without mutating membership", async () => {
  const { env, calls } = envFixture();
  const actor = { id: "per", role: "admin", auth_method: "credential" };
  const response = await handleOwnerPrivateJobGrantCreate(request(), env, actor);
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.grant_status, "pending");
  assert.equal(body.membership_mutation, false);
  assert.equal(body.entitlement_mutation, false);
  assert.equal(calls.length, 2);

  const write = JSON.parse(calls[1].body);
  const fields = write.records[0].fields;
  assert.equal(fields.Action, "owner_private_job_grant");
  assert.equal(fields.Result, "success");
  assert.equal(fields.Reason, "owner_approved_single_job_unconsumed");
  assert.match(fields.Target, /^jobgrant:v1:rec6zsmzrVDkoza1y:recbNm4VPokw33xqD:2026-10-02:19:00:20:30:exclusive:straight:pn:25000:17500$/);
  assert.equal(fields.Actor, "Boss Per");
  assert.equal(fields["Identity Ref"], "client:rec6zsmzrVDkoza1y");
});

test("same pending grant is idempotent", async () => {
  const target = "jobgrant:v1:rec6zsmzrVDkoza1y:recbNm4VPokw33xqD:2026-10-02:19:00:20:30:exclusive:straight:pn:25000:17500";
  const { env, calls } = envFixture([{ id: "recExistingGrant01", fields: { Target: target, Reason: "owner_approved_single_job_unconsumed" } }]);
  const response = await handleOwnerPrivateJobGrantCreate(request(), env, { id: "per", role: "owner", auth_method: "credential" });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.idempotent, true);
  assert.equal(body.grant_record_id, "recExistingGrant01");
  assert.equal(calls.length, 1);
});

test("used grant cannot be recreated for the same exact job", async () => {
  const target = "jobgrant:v1:rec6zsmzrVDkoza1y:recbNm4VPokw33xqD:2026-10-02:19:00:20:30:exclusive:straight:pn:25000:17500";
  const { env } = envFixture([{ id: "recUsedGrant0001", fields: { Target: target, Reason: "owner_approved_single_job_consumed" } }]);
  const response = await handleOwnerPrivateJobGrantCreate(request(), env, { id: "per", role: "owner", auth_method: "credential" });
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.error, "owner_job_grant_already_used");
});

test("non-owner admin is denied", async () => {
  const { env } = envFixture();
  const response = await handleOwnerPrivateJobGrantCreate(request(), env, { id: "ops-1", role: "admin", auth_method: "credential" });
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.error, "owner_required");
});
