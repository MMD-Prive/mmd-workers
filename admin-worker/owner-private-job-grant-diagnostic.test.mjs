import test from "node:test";
import assert from "node:assert/strict";
import {
  augmentOwnerJobGrantCreateError,
  ownerGrantSubmittedFingerprint,
  parseOwnerGrantTarget,
} from "./src/owner-private-job-grant-diagnostic.js";

const TARGET =
  "jobgrant:v1:rec6zsmzrVDkoza1y:recbNm4VPokw33xqD:2026-09-18:20:00:22:00:standard:straight:vip:15000:9000";

function body(overrides = {}) {
  return {
    client_lineage: { client_id: "rec6zsmzrVDkoza1y" },
    model: {
      model_id: "recbNm4VPokw33xqD",
      selected_orientation: overrides.orientation ?? "straight",
    },
    job_date: overrides.jobDate ?? "2026-09-18",
    start_time: overrides.startTime ?? "20:00",
    end_time: overrides.endTime ?? "22:00",
    amount_thb: overrides.amount ?? 15000,
    model_payout_thb: overrides.payout ?? 9000,
    work: {
      job_visibility: "private",
      model_folder: overrides.folder ?? "standard",
      job_type: overrides.privateWork ?? "vip",
    },
    private_access: {
      selected_private_folder: overrides.folder ?? "standard",
      selected_orientation: overrides.orientation ?? "straight",
    },
  };
}

function coreError(code = "AUTHORITATIVE_MEMBER_NOT_FOUND") {
  return Response.json({
    ok: false,
    error: { code, message: "blocked" },
  }, { status: 404 });
}

function env(records = [{ id: "recGrant", fields: { Target: TARGET } }]) {
  return {
    AIRTABLE_API_KEY: "pat-test",
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_TABLE_ACCESS_LOG: "System — Access Log",
    AIRTABLE_HTTP: {
      async fetch(request) {
        const url = new URL(String(request));
        assert.equal(decodeURIComponent(url.pathname.split("/").at(-1)), "System — Access Log");
        const formula = url.searchParams.get("filterByFormula") || "";
        assert.match(formula, /owner_private_job_grant/);
        assert.match(formula, /owner_approved_single_job_unconsumed/);
        assert.match(formula, /rec6zsmzrVDkoza1y/);
        assert.match(formula, /recbNm4VPokw33xqD/);
        return Response.json({ records });
      },
    },
  };
}

function request(payload) {
  return new Request("https://mmdbkk.com/v1/admin/job/create", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://mmdbkk.com" },
    body: JSON.stringify(payload),
  });
}

test("parses the exact production owner one-job grant fingerprint", () => {
  assert.deepEqual(parseOwnerGrantTarget(TARGET), {
    client_id: "rec6zsmzrVDkoza1y",
    model_id: "recbNm4VPokw33xqD",
    job_date: "2026-09-18",
    start_time: "20:00",
    end_time: "22:00",
    folder: "standard",
    orientation: "straight",
    private_work: "vip",
    amount_thb: "15000",
    model_payout_thb: "9000",
    target: TARGET,
  });
  assert.equal(ownerGrantSubmittedFingerprint(body()).target, TARGET);
});

test("reports private work mismatch instead of misleading member-not-found", async () => {
  const response = await augmentOwnerJobGrantCreateError(
    request(body({ privateWork: "pn" })),
    coreError(),
    env(),
  );
  assert.equal(response.status, 409);
  const data = await response.json();
  assert.equal(data.error.code, "OWNER_JOB_GRANT_MISMATCH");
  assert.deepEqual(data.error.details.mismatched_fields, ["private_work"]);
  assert.equal(data.error.details.expected.private_work, "vip");
  assert.equal(data.error.details.received.private_work, "pn");
});

test("reports duration/end-time mismatch from a silent 90-minute default", async () => {
  const response = await augmentOwnerJobGrantCreateError(
    request(body({ endTime: "21:30" })),
    coreError(),
    env(),
  );
  assert.equal(response.status, 409);
  const data = await response.json();
  assert.equal(data.error.code, "OWNER_JOB_GRANT_MISMATCH");
  assert.deepEqual(data.error.details.mismatched_fields, ["end_time"]);
  assert.equal(data.error.details.expected.end_time, "22:00");
  assert.equal(data.error.details.received.end_time, "21:30");
});

test("flags an inconsistent lookup when submitted fingerprint exactly matches pending grant", async () => {
  const response = await augmentOwnerJobGrantCreateError(
    request(body()),
    coreError(),
    env(),
  );
  assert.equal(response.status, 503);
  const data = await response.json();
  assert.equal(data.error.code, "OWNER_JOB_GRANT_LOOKUP_INCONSISTENT");
  assert.equal(response.headers.get("x-mmd-owner-job-grant-diagnostic"), "v1");
});

test("leaves unrelated errors and ambiguous grant sets untouched", async () => {
  const unrelated = coreError("private_model_lane_mismatch");
  const untouched = await augmentOwnerJobGrantCreateError(request(body()), unrelated, env());
  assert.equal(untouched, unrelated);

  const original = coreError();
  const ambiguous = await augmentOwnerJobGrantCreateError(
    request(body({ privateWork: "pn" })),
    original,
    env([
      { id: "recGrant1", fields: { Target: TARGET } },
      { id: "recGrant2", fields: { Target: TARGET.replace(":vip:", ":pn:") } },
    ]),
  );
  assert.equal(ambiguous, original);
});
