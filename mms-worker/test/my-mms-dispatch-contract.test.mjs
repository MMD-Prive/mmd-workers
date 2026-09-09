import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runtimeUrl = new URL("../src/my-mms-dispatch-runtime.mjs", import.meta.url);
const accessUrl = new URL("../src/my-mms-access-runtime.mjs", import.meta.url);
const wrapperUrl = new URL("../src/runtime-index-with-therapist-invite.js", import.meta.url);
const entryUrl = new URL("../src/runtime-index-with-dispatch.js", import.meta.url);
const wranglerUrl = new URL("../wrangler.jsonc", import.meta.url);

async function source(url) {
  return readFile(url, "utf8");
}

test("MY MMS dispatch owns the confirmed Therapist offer/job API surface", async () => {
  const src = await source(runtimeUrl);
  for (const route of [
    'offers: `${APP_API}/offers`',
    'jobs: `${APP_API}/jobs`',
    "api\\/app\\/offers\\/(mmsjob_[a-f0-9]{24})",
    "api\\/app\\/offers\\/(mmsjob_[a-f0-9]{24})\\/accept",
    "api\\/app\\/offers\\/(mmsjob_[a-f0-9]{24})\\/decline",
    "api\\/app\\/jobs\\/(mmsjob_[a-f0-9]{24})",
    "api\\/app\\/jobs\\/(mmsjob_[a-f0-9]{24})\\/start",
    "api\\/app\\/jobs\\/(mmsjob_[a-f0-9]{24})\\/complete",
  ]) {
    assert.ok(src.includes(route), `missing dispatch route contract: ${route}`);
  }
  assert.match(src, /requireMyMmsApprovedTherapist\(request, env\)/);
});

test("Therapist dispatch access is the existing fail-closed MY MMS approved gate", async () => {
  const access = await source(accessUrl);
  assert.match(access, /export async function requireMyMmsApprovedTherapist/);
  assert.match(access, /normalizeAccess\(therapist\.fields\?\.\["MY MMS Access"\]\) !== "Approved"/);
  assert.match(access, /MY_MMS_ACCESS_REQUIRED/);
});

test("dispatch matching uses the existing canonical matcher, Available Therapists, and approved MY MMS access", async () => {
  const src = await source(runtimeUrl);
  assert.match(src, /matchTherapists\(therapists, \{ recipient_gender: recipientGender, zone, skills \}\)/);
  assert.match(src, /availability_status === "Available"/);
  assert.match(src, /accessById\.get\(item\.therapist_id\) === "Approved"/);
  assert.match(src, /requires_manual_coordination/);
});

test("pre-accept offer projection cannot serialize private customer/address fields", async () => {
  const src = await source(runtimeUrl);
  const start = src.indexOf("function offerProjection(");
  const end = src.indexOf("function jobProjection(", start);
  assert.ok(start >= 0 && end > start, "offerProjection block missing");
  const offerProjection = src.slice(start, end);
  for (const forbidden of [
    "Exact Address Private",
    "Customer Display Private",
    "Customer Contact Private",
    "Map URL Private",
    "Internal Payload JSON",
    "member_ref",
    "line_user_id",
  ]) {
    assert.equal(offerProjection.includes(forbidden), false, `pre-accept leak risk: ${forbidden}`);
  }
  assert.match(offerProjection, /Safe Payload JSON/);
  assert.match(offerProjection, /Safe Area Label/);
  assert.match(offerProjection, /Payout THB/);
});

test("accepted job projection unlocks private disclosure only for the accepted owner", async () => {
  const src = await source(runtimeUrl);
  assert.match(src, /findOwnedJob\(env, jobId, therapistId\)/);
  assert.match(src, /Accepted Therapist ID/);
  assert.match(src, /locationUnlocked: accepted/);
  assert.match(src, /accepted \? clean\(fields\["Exact Address Private"\]/);
  assert.match(src, /accepted \? clean\(fields\["Customer Contact Private"\]/);
});

test("first accept wins in a per-job Durable Object and preserves expiry/idempotency", async () => {
  const src = await source(runtimeUrl);
  assert.match(src, /class MmsDispatchCoordinator extends DurableObject/);
  assert.match(src, /winner_therapist_id IS NULL/);
  assert.match(src, /THEN 'ACCEPTED' ELSE 'TAKEN'/);
  assert.match(src, /Number\(offer\.expires_at\) <= now/);
  assert.match(src, /dispatch_requests/);
  assert.match(src, /request_key TEXT PRIMARY KEY/);
  assert.match(src, /state === "TAKEN" \? 409/);
  assert.match(src, /state === "EXPIRED" \? 410/);
});

test("mms-worker uses dedicated MMS dispatch tables and coordinator, never the generic MMD Jobs table", async () => {
  const config = JSON.parse(await source(wranglerUrl));
  assert.equal(config.main, "src/runtime-index-with-dispatch.js");
  assert.equal(config.vars.AIRTABLE_JOBS_TABLE_ID, "tbl0p7UdOH9BjzmFX");
  assert.equal(config.vars.AIRTABLE_OFFERS_TABLE_ID, "tblrSS5OegYNnGiEU");
  assert.notEqual(config.vars.AIRTABLE_JOBS_TABLE_ID, "tbl0jxIjN8QYwGABX");
  assert.ok(config.durable_objects.bindings.some((item) => item.name === "MMS_DISPATCH_COORDINATOR" && item.class_name === "MmsDispatchCoordinator"));
  assert.ok(config.migrations.some((item) => item.tag === "v2-my-mms-dispatch" && item.new_sqlite_classes?.includes("MmsDispatchCoordinator")));
});

test("runtime chain routes dispatch before legacy invite/runtime and entrypoint exports its Durable Object", async () => {
  const wrapper = await source(wrapperUrl);
  const entry = await source(entryUrl);
  assert.match(wrapper, /maybeHandleMyMmsDispatch\(request, env\)/);
  assert.ok(wrapper.indexOf("maybeHandleMyMmsDispatch(request, env)") < wrapper.indexOf("maybeHandleTherapistAccessInvite(request, env)"));
  assert.match(entry, /export \{ MmsDispatchCoordinator \}/);
  assert.match(entry, /dispatch_coordinator: Boolean\(env\.MMS_DISPATCH_COORDINATOR\)/);
});

test("synced canonical prebookings automatically enter real dispatch without fabricating failed bookings", async () => {
  const entry = await source(entryUrl);
  assert.match(entry, /const PREBOOKING_PATH = "\/mms\/api\/prebookings"/);
  assert.match(entry, /maybeHandleMyMmsDispatch\(dispatchRequest, env\)/);
  assert.match(entry, /\/internal\/mms\/dispatch\/prebookings\/\$\{encodeURIComponent\(prebookingId\)\}\/match/);
  assert.match(entry, /request_key: `auto:\$\{prebookingId\}`/);
  assert.match(entry, /response\.status === 202/);
  assert.match(entry, /PREBOOKING_STORAGE_PENDING/);
  assert.match(entry, /PENDING_COORDINATION/);
  assert.match(entry, /status: response\.status/);
  assert.doesNotMatch(entry, /matched_therapist_ids.*payload\.dispatch/);
});
