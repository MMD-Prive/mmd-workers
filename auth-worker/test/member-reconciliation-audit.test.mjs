import test from "node:test";
import assert from "node:assert/strict";
import { buildReconciliationAuditPreview, writeReconciliationAudit } from "../src/member-reconciliation-audit.js";

const SNAPSHOT = {
  schema_version: "my_mmd_entitlement_resolver_v1",
  source_status: "verified",
  evaluated_at: "2026-09-03T00:00:00.000Z",
  member_blocked: false,
  capability_state: {
    active: ["private_premium"],
    expiring_soon: [],
    grace: [],
    inactive: [],
  },
  access: {
    private_visibility_envelope: "premium",
    new_drive_grants_allowed: true,
    new_telegram_grants_allowed: true,
    new_protected_grants_allowed: true,
    secret_should_not_escape: "nope",
  },
  raw_airtable_rows: [{ token: "do-not-log" }],
};

const PLAN = {
  reason: "resolver_authoritative",
  desired: { drive_layers: ["standard", "premium"], telegram_rooms: [] },
  drive: { grant: ["premium"], retain: ["standard"], revoke: [] },
  telegram: { grant: [], retain: [], revoke: ["vip"] },
};

const OBSERVATIONS = {
  drive: { ok: true, payload: { drive_layers: ["standard"], raw_provider_token: "nope" } },
  telegram: { ok: true, payload: { telegram_rooms: ["vip"], invite_link: "nope" } },
};

test("audit preview contains canonical before/after trace without raw provider payloads", () => {
  const preview = buildReconciliationAuditPreview({
    member_email: "Member@Example.com",
    snapshot: SNAPSHOT,
    plan: PLAN,
    observations: OBSERVATIONS,
    applied: {
      drive: { ok: true, http_status: 200, payload: { ok: true, permission_id: "secret-ish" } },
      telegram: { ok: true, http_status: 200, payload: { ok: true, invite_link: "secret-ish" } },
    },
  });

  assert.equal(preview.identity_ref, "email:member@example.com");
  assert.deepEqual(preview.before, { drive_layers: ["standard"], telegram_rooms: ["vip"] });
  assert.deepEqual(preview.after.actions.drive, { grant: ["premium"], retain: ["standard"], revoke: [] });
  assert.deepEqual(preview.after.actions.telegram, { grant: [], retain: [], revoke: ["vip"] });
  assert.equal(preview.after.applied.drive.ok, true);
  assert.equal(preview.after.applied.telegram.ok, true);
  assert.equal("payload" in preview.after.applied.drive, false);
  assert.equal(preview.snapshot.schema_version, "my_mmd_entitlement_resolver_v1");
  assert.equal("raw_airtable_rows" in preview.snapshot, false);
  assert.equal("secret_should_not_escape" in preview.snapshot.access, false);
});

test("audit writer appends a bounded System — Access Log record", async () => {
  let written;
  const env = {
    AIRTABLE_API_KEY: "synthetic-test-key",
    AIRTABLE_BASE_ID: "app00000000000000",
    AIRTABLE_TABLE_ACCESS_LOG: "System — Access Log",
    AIRTABLE_HTTP: {
      async fetch(request) {
        assert.equal(request.method, "POST");
        written = await request.json();
        return new Response(JSON.stringify({ records: [{ id: "rec00000000000000" }] }), { status: 200, headers: { "content-type": "application/json" } });
      },
    },
  };

  const result = await writeReconciliationAudit(env, {
    member_email: "Member@Example.com",
    snapshot: SNAPSHOT,
    plan: PLAN,
    observations: OBSERVATIONS,
    applied: {
      drive: { ok: true, http_status: 200, payload: { ok: true, access_token: "never-log" } },
      telegram: { ok: false, http_status: 409, error: "telegram_revoke_failed", payload: { bot_token: "never-log" } },
    },
    ok: false,
    actor: "lifecycle_cron",
    source_ref: "lifecycle:2026-09-03T00:07:00.000Z",
    error_code: "telegram_revoke_failed",
  });

  assert.equal(result.ok, true);
  const fields = written.records[0].fields;
  assert.equal(fields["Member Email"], "member@example.com");
  assert.equal(fields["Identity Ref"], "email:member@example.com");
  assert.equal(fields.Action, "member_access_reconcile");
  assert.equal(fields.Target, "drive,telegram");
  assert.equal(fields.Result, "fail");
  assert.equal(fields.Actor, "lifecycle_cron");
  assert.equal(fields["Source Ref"], "lifecycle:2026-09-03T00:07:00.000Z");
  assert.equal(fields.Reason, "resolver_authoritative");
  assert.equal(fields["Error Code"], "telegram_revoke_failed");
  assert.match(fields["Event ID"], /^mmdar_/);
  assert.doesNotMatch(fields["After JSON"], /never-log/);
  assert.doesNotMatch(fields["Snapshot JSON"], /do-not-log|nope/);
  assert.deepEqual(JSON.parse(fields["Before JSON"]), { drive_layers: ["standard"], telegram_rooms: ["vip"] });
});

test("audit writer fails visibly when access log write fails", async () => {
  const env = {
    AIRTABLE_API_KEY: "synthetic-test-key",
    AIRTABLE_BASE_ID: "app00000000000000",
    AIRTABLE_HTTP: { async fetch() { return new Response("{}", { status: 503 }); } },
  };
  await assert.rejects(() => writeReconciliationAudit(env, { member_email: "member@example.com", ok: true }), /reconciliation_audit_airtable_503/);
});
