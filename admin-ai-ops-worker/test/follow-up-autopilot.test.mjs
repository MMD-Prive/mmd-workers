import assert from "node:assert/strict";
import test from "node:test";
import {
  FollowUpAutopilot,
  FOLLOW_UP_THRESHOLDS,
  deriveFollowUpCandidates,
} from "../src/follow-up-autopilot.js";

class FakeStorage {
  constructor() {
    this.map = new Map();
    this.alarm = null;
  }
  async get(key) { return this.map.get(key); }
  async put(key, value) { this.map.set(key, structuredClone(value)); }
  async setAlarm(value) { this.alarm = value; }
  async deleteAlarm() { this.alarm = null; }
}

function makeObject(env = {}) {
  const storage = new FakeStorage();
  const state = { storage };
  return { object: new FollowUpAutopilot(state, env), storage };
}

function req(path, method = "GET", body = null) {
  return new Request(`https://follow-up-autopilot.internal${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

test("derives only stable, verified follow-up candidates with due rules", () => {
  const checkedAt = "2026-09-07T12:00:00.000Z";
  const dashboard = {
    money: [
      { id: "pay-1", status: "pending review", created_at: "2026-09-07T08:00:00Z", title: "Slip A" },
      { status: "pending", created_at: "2026-09-07T08:00:00Z", title: "Missing id" },
    ],
    jobs: [
      { job_id: "job-9", status: "waiting confirm", waiting_since: "2026-09-07T06:00:00Z" },
    ],
    members: [
      { member_id: "mem-2", expiry_date: "2026-09-20T00:00:00Z", title: "Member 2" },
    ],
    todos: [
      { client_id: "cli-3", title: "Customer follow-up", due_at: "2026-09-07T13:00:00Z" },
    ],
  };

  const result = deriveFollowUpCandidates(dashboard, checkedAt);
  assert.equal(result.candidates.length, 4);
  assert.equal(result.skipped.some((item) => item.reason === "stable_object_id_missing"), true);

  const payment = result.candidates.find((item) => item.id === "payment_waiting:pay-1");
  assert.equal(payment.due_rule.threshold_ms, FOLLOW_UP_THRESHOLDS.payment_waiting_ms);
  assert.equal(payment.due_at, "2026-09-07T10:00:00.000Z");

  const member = result.candidates.find((item) => item.id === "membership_renewal:mem-2");
  assert.equal(member.due_rule.mode, "renewal_window");
  assert.equal(result.coverage.model_readiness, "waiting_for_verified_one-missing-item_source");
});

test("durable object keeps watch, snooze, close, revalidation and audit state", async () => {
  const { object, storage } = makeObject();
  const candidate = {
    id: "payment_waiting:pay-1",
    object_id: "pay-1",
    kind: "payment_waiting",
    title: "Slip A",
    summary: "pending review",
    href: "/internal/admin/payments",
    source: "/v1/admin/dashboard",
    verified_condition: { matched: true, evidence: "pending review" },
    due_rule: { mode: "source_due", source_field: "due_at" },
    due_at: "2026-09-07T10:00:00.000Z",
    last_checked_at: "2026-09-07T12:00:00.000Z",
  };

  let response = await object.fetch(req("/__internal/follow-ups/sync", "POST", {
    candidates: [candidate],
    checked_at: "2026-09-07T12:00:00.000Z",
  }));
  let body = await response.json();
  assert.equal(body.autopilot_active, true);
  assert.equal(body.counts.due, 1);
  assert.equal(body.notification_channel, "command_center_only");
  assert.equal(body.watches[0].notification_status, "command_center_only");
  assert.equal(storage.alarm, null);

  response = await object.fetch(req("/__internal/follow-ups/action", "POST", {
    id: candidate.id,
    action: "snooze",
    snooze_minutes: 60,
  }));
  body = await response.json();
  assert.equal(body.counts.snoozed, 1);
  assert.ok(storage.alarm instanceof Date || typeof storage.alarm === "number" || typeof storage.alarm === "string");

  response = await object.fetch(req("/__internal/follow-ups/action", "POST", {
    id: candidate.id,
    action: "close",
  }));
  body = await response.json();
  assert.equal(body.counts.closed, 1);
  assert.equal(body.watches.length, 0);

  response = await object.fetch(req("/__internal/follow-ups/action", "POST", {
    id: candidate.id,
    action: "reopen",
  }));
  body = await response.json();
  assert.equal(body.counts.due, 1);

  response = await object.fetch(req("/__internal/follow-ups/sync", "POST", {
    candidates: [],
    checked_at: "2026-09-07T12:30:00.000Z",
  }));
  body = await response.json();
  assert.equal(body.counts.resolved, 1);
  assert.equal(body.watches.length, 0);
  assert.equal(body.recent_audit.some((event) => event.type === "resolved_by_revalidation"), true);
});

test("Telegram notification remains reminder-only and never messages customers", async () => {
  const original = globalThis.fetch;
  let requestBody = null;
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const { object } = makeObject({
      PER_FOLLOWUP_TELEGRAM_BOT_TOKEN: "test-token",
      PER_FOLLOWUP_TELEGRAM_CHAT_ID: "12345",
    });
    const response = await object.fetch(req("/__internal/follow-ups/sync", "POST", {
      candidates: [{
        id: "job_confirmation:job-1",
        object_id: "job-1",
        kind: "job_confirmation",
        title: "Job waiting",
        summary: "waiting confirm",
        href: "/internal/admin/jobs/create-job",
        due_at: "2026-09-07T10:00:00.000Z",
        last_checked_at: "2026-09-07T12:00:00.000Z",
        verified_condition: { matched: true, evidence: "waiting confirm" },
        due_rule: { mode: "source_due" },
      }],
      checked_at: "2026-09-07T12:00:00.000Z",
    }));
    const body = await response.json();
    assert.equal(body.notification_channel, "telegram_and_command_center");
    assert.equal(body.watches[0].last_notified_at !== null, true);
    assert.equal(requestBody.chat_id, "12345");
    assert.match(requestBody.text, /Reminder only/);
    assert.doesNotMatch(requestBody.text, /customer message sent/i);
  } finally {
    globalThis.fetch = original;
  }
});
