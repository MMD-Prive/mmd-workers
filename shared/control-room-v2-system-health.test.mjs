import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildControlRoomV2SystemHealth, CONTROL_ROOM_V2_SYSTEM_HEALTH_SCHEMA } from "./control-room-v2-system-health.mjs";

const canon = JSON.parse(await readFile(new URL("../docs/architecture/route-canonical-owner-lock.json", import.meta.url), "utf8"));

test("Control Room V2 static receipts are backed by closed machine canon", () => {
  const health = buildControlRoomV2SystemHealth({
    dashboardStatus: { admin: "พร้อม", payments: "พร้อม", telegram: "พร้อม", data: "พร้อม", reconfirm: "พร้อม" },
    telegramRouterHealth: { status: "configured", summary: "router configured" },
  });
  assert.equal(health.schema, CONTROL_ROOM_V2_SYSTEM_HEALTH_SCHEMA);
  assert.equal(canon.phase1_closure.status, "CLOSED");
  assert.equal(canon.phase1_closure.blocking_unresolved_count, 0);
  assert.equal(canon.phase1_closure.mmd_redirect_worker_production_routes, 0);
  assert.equal(health.phase1.status, "CLOSED");
  assert.equal(health.phase1.blocking_unresolved_count, 0);
  assert.equal(health.phase1.mmd_redirect_worker_production_routes, 0);
  assert.equal(health.phase0.authority_workers, 6);
  assert.equal(health.phase0.accepted_workers, 6);
  assert.equal(health.overall_status, "ok");
});

test("Control Room V2 distinguishes live health from production acceptance", () => {
  const health = buildControlRoomV2SystemHealth({
    dashboardStatus: { admin: "พร้อม", payments: "พร้อม", telegram: "พร้อม", data: "พร้อม", reconfirm: "พร้อม" },
    telegramRouterHealth: { status: "configured", summary: "router configured" },
  });
  const byKey = Object.fromEntries(health.systems.map((item) => [item.key, item]));
  assert.equal(byKey.website.evidence_type, "production_acceptance");
  assert.equal(byKey.workers.evidence_type, "live");
  assert.equal(byKey.deploy.evidence_type, "production_acceptance");
  assert.equal(byKey.routes.evidence_type, "production_acceptance");
  assert.equal(byKey.analytics.evidence_type, "production_acceptance");
  assert.equal(byKey.line.evidence_type, "production_acceptance");
  assert.equal(byKey.payments.evidence_type, "live");
  assert.equal(byKey.telegram.evidence_type, "live");
  assert.equal(byKey.data.evidence_type, "live");
  assert.equal(health.operational_watch.load_mode, "on_demand");
  assert.equal(health.operational_watch.duplicate_dashboard_fetch, false);
  assert.equal(health.authority.read_only, true);
  assert.equal(health.authority.business_truth_mutated, false);
});

test("Control Room V2 escalates degraded and action-needed live sources", () => {
  const degraded = buildControlRoomV2SystemHealth({
    dashboardStatus: { admin: "พร้อม", payments: "พร้อม", data: "บางส่วน", reconfirm: "พร้อม" },
    telegramRouterHealth: { status: "partial", summary: "one destination missing" },
  });
  assert.equal(degraded.overall_status, "degraded");

  const action = buildControlRoomV2SystemHealth({
    dashboardStatus: { admin: "พร้อม", payments: "มีปัญหา", data: "พร้อม", reconfirm: "พร้อม" },
    telegramRouterHealth: { status: "configured" },
  });
  assert.equal(action.overall_status, "action_needed");
  assert.equal(action.systems.find((item) => item.key === "payments")?.status, "action_needed");
});
