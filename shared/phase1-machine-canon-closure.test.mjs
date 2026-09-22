import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const canon = JSON.parse(await readFile(new URL("../docs/architecture/route-canonical-owner-lock.json", import.meta.url), "utf8"));

function route(id) {
  const row = canon.route_records.find((item) => item.route_id === id);
  assert.ok(row, `missing route record ${id}`);
  return row;
}

test("Phase 1 machine canon is explicitly closed", () => {
  assert.equal(canon.metadata.status, "PHASE_1_CLOSED");
  assert.equal(canon.phase1_closure.closed, true);
  assert.equal(canon.phase1_closure.status, "CLOSED");
  assert.equal(canon.phase1_closure.blocking_unresolved_count, 0);
  assert.equal(canon.phase1_closure.mmd_redirect_worker_production_routes, 0);
  assert.equal(canon.phase1_closure.control_room_v2_gate, "OPEN");
  assert.equal(canon.quality_gates.phase1_machine_closed, true);
  assert.equal(canon.quality_gates.blocking_unresolved_zero, true);
});

test("accepted production routes no longer carry stale unresolved decisions", () => {
  for (const id of [
    "01_public_home",
    "03_profiles",
    "06_public_access",
    "13_booking_apis",
    "14_member_login",
    "15_member_dashboard",
    "30_private_model_apply_page",
    "31_private_model_apply_api",
  ]) {
    const row = route(id);
    assert.equal(row.status, "LIVE_CONNECTED", `${id} status`);
    assert.match(row.owner_decision, /^LOCKED/);
    assert.notEqual(row.production_verified, "unverified");
  }
});

test("realtime and SIGIL API namespace owners are production locked", () => {
  const realtime = canon.api_namespaces.find((item) => item.namespace === "/v1/rt/*");
  assert.equal(realtime.canonical_owner, "realtime-worker");
  assert.equal(realtime.owner_decision, "LOCKED");

  const sigil = canon.api_namespaces.find((item) => item.namespace === "/sigil/api/*");
  assert.equal(sigil.owner_decision, "LOCKED_WITH_EXCEPTIONS");
  const booking = sigil.route_partitions.find((item) => item.partition === "booking_api_handlers");
  const privateModel = sigil.route_partitions.find((item) => item.partition === "private_model_apply");
  assert.equal(booking.production_route_owner, "sigil-booking-worker");
  assert.equal(booking.owner_decision, "LOCKED");
  assert.equal(privateModel.canonical_owner, "sigil-worker");
  assert.equal(privateModel.owner_decision, "LOCKED");
});

test("retired front gate cannot reappear as current owner in machine classifications", () => {
  assert.equal(canon.worker_classifications["mmd-redirect-worker"].production_routes, 0);
  assert.match(canon.worker_classifications["mmd-redirect-worker"].classification, /retired/i);
  for (const row of canon.route_records) {
    assert.notEqual(row.current_owner, "mmd-redirect-worker");
    assert.notEqual(row.current_front_gate, "mmd-redirect-worker");
  }
});

test("stale Phase 1 blockers are removed from unresolved queue", () => {
  const keys = new Set(canon.unresolved_decisions.map((item) => item.route_or_namespace_key));
  for (const stale of [
    "/sigil/pay/renewal and /pay/renewal",
    "/sigil/apply and /sigil/api/private-model/apply",
    "/sigil/api/* booking partition",
    "/v1/rt/*",
    "/v1/partner/request",
    "/member/login",
    "/member/dashboard, /v1/member/dashboard, /api/member/dashboard",
  ]) {
    assert.equal(keys.has(stale), false, stale);
  }
  for (const item of canon.unresolved_decisions) {
    assert.notMatch(String(item.production_ownership_status || ""), /^UNRESOLVED/);
  }
});
