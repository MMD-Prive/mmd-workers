import test from "node:test";
import assert from "node:assert/strict";

import {
  FOLLOWUP_OWNER_ACTION, GUARD_ACTIONS, buildOwnerFallbackText, classifyModelRef, decideReconfirmAction,
  isGuardV2Enabled, nextIctDate, parseSendFailures, resolveOwnerDestination,
} from "./src/model-reconfirm-guard.js";
import { runModelReconfirmSweep } from "./src/model-reconfirm-runtime.js";

// Real network is blocked for the whole file: Airtable, LINE and Telegram are all faked below.
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => { throw new Error(`REAL_NETWORK_CALL_BLOCKED ${String(url?.url || url)}`); };
test.after(() => { globalThis.fetch = realFetch; });

const NOW = Date.parse("2026-09-30T16:05:00+07:00"); // D-1 16:05 for a 2026-10-01 job
const LINE_ID = `U${"a".repeat(32)}`;
const M1 = "recMODELAAAAAAAAAA";
const M2 = "recMODELBBBBBBBBBB";
const OWNER_CHAT = "-5500000009"; // synthetic; never a real destination

// ---------- pure decision tests ----------
const base = (o = {}) => ({ lifecycleState: "confirmed", jobDate: "2026-10-01", now: NOW, modelRef: [M1], model: { line_user_id: LINE_ID }, lineTransportReady: true, ...o });

test("G1 next ICT date only: past, today and later dates are skipped", () => {
  assert.equal(nextIctDate(NOW), "2026-10-01");
  assert.equal(decideReconfirmAction(base()).action, GUARD_ACTIONS.SEND);
  assert.equal(decideReconfirmAction(base({ jobDate: "2026-09-29" })).reason, "job_date_not_upcoming");
  assert.equal(decideReconfirmAction(base({ jobDate: "2026-09-30" })).reason, "job_date_not_upcoming");
  assert.equal(decideReconfirmAction(base({ jobDate: "2026-10-02" })).reason, "job_date_not_next_day");
  assert.equal(decideReconfirmAction(base({ jobDate: "garbage" })).action, GUARD_ACTIONS.REVIEW_REQUIRED);
});

test("G1b ICT boundary: 23:30 ICT (16:30Z) still targets the next ICT day, not the UTC day", () => {
  const late = Date.parse("2026-09-30T23:30:00+07:00");
  assert.equal(nextIctDate(late), "2026-10-01");
  assert.equal(nextIctDate(Date.parse("2026-10-01T00:10:00+07:00")), "2026-10-02");
});

test("G2 only confirmed/accepted jobs; cancelled, completed and other states are skipped", () => {
  for (const state of ["cancelled", "completed", "separated", "draft", "", "en_route"]) {
    assert.equal(decideReconfirmAction(base({ lifecycleState: state })).action, GUARD_ACTIONS.SKIP, state);
  }
  assert.equal(decideReconfirmAction(base({ lifecycleState: "accepted" })).action, GUARD_ACTIONS.SEND);
});

test("G3 model matching never guesses: none / multiple / malformed link -> review_required", () => {
  assert.equal(decideReconfirmAction(base({ modelRef: [] })).reason, "assigned_model_missing");
  assert.equal(decideReconfirmAction(base({ modelRef: undefined })).reason, "assigned_model_missing");
  assert.equal(decideReconfirmAction(base({ modelRef: [M1, M2] })).reason, "assigned_model_ambiguous");
  assert.equal(decideReconfirmAction(base({ modelRef: ["not-a-record"] })).reason, "assigned_model_invalid");
  assert.equal(decideReconfirmAction(base({ modelRef: [M1, M1] })).action, GUARD_ACTIONS.SEND, "the same record twice is not ambiguous");
  assert.equal(decideReconfirmAction(base({ model: null })).reason, "assigned_model_unreadable");
  assert.deepEqual(classifyModelRef([{ id: M1 }]), { status: "one", id: M1 });
});

test("G4 unconnected or no channel -> owner_action, connected -> send", () => {
  assert.equal(decideReconfirmAction(base({ model: { line_user_id: "" } })).reason, "model_not_connected");
  assert.equal(decideReconfirmAction(base({ model: { line_user_id: "not-a-line-id" } })).action, GUARD_ACTIONS.OWNER_ACTION);
  assert.equal(decideReconfirmAction(base({ lineTransportReady: false })).reason, "model_channel_unavailable");
});

test("G5 already acknowledged or owner already told -> skip (idempotent)", () => {
  assert.equal(decideReconfirmAction(base({ reconfirm: { acknowledged_at: "2026-09-30T10:00:00Z" } })).reason, "already_acknowledged");
  assert.equal(decideReconfirmAction(base({ followupStatus: FOLLOWUP_OWNER_ACTION, model: { line_user_id: "" } })).reason, "owner_already_notified");
  assert.equal(decideReconfirmAction(base({ followupStatus: "review_required", modelRef: [] })).reason, "owner_already_notified");
});

test("G6 owner destination: own var, then HYPE_JOB_DAILY_CHAT_ID, and NEVER booking/admin/generic chat", () => {
  assert.equal(resolveOwnerDestination({ MODEL_RECONFIRM_OWNER_CHAT_ID: OWNER_CHAT, HYPE_JOB_DAILY_CHAT_ID: "-1" }).chat_id, OWNER_CHAT);
  assert.equal(resolveOwnerDestination({ HYPE_JOB_DAILY_CHAT_ID: "-2", HYPE_JOB_DAILY_THREAD_ID: "7" }).source, "HYPE_JOB_DAILY_CHAT_ID");
  assert.equal(resolveOwnerDestination({ TELEGRAM_CHAT_ID: "-3", TELEGRAM_BOOKING_CHAT_ID: "-4", TELEGRAM_ADMIN_CHAT_ID: "-5" }), null);
  assert.equal(resolveOwnerDestination({}), null);
});

test("G7 owner message: exactly one Next line, no customer/payment/pricing data, HTML-escaped", () => {
  for (const [kind, reason] of [["owner_action", "model_not_connected"], ["review_required", "assigned_model_ambiguous"], ["review_required", "send_failed_repeatedly"]]) {
    const text = buildOwnerFallbackText({ kind, reason, sessionId: "S-1", jobDate: "2026-10-01", modelName: "A <b>x</b>" });
    assert.equal(text.split("\n").filter((l) => l.startsWith("Next:")).length, 1, reason);
    assert.doesNotMatch(text, /THB|฿|payment|invoice|price|@|https?:/i);
    assert.ok(!text.includes("<b>x</b>"));
  }
});

test("G8 flag parsing and send-failure counter", () => {
  assert.equal(isGuardV2Enabled({}), false);
  assert.equal(isGuardV2Enabled({ MODEL_RECONFIRM_GUARD_V2: "false" }), false);
  assert.equal(isGuardV2Enabled({ MODEL_RECONFIRM_GUARD_V2: "TRUE" }), true);
  assert.equal(parseSendFailures("send_failed_2"), 2);
  assert.equal(parseSendFailures("reminded"), 0);
});

// ---------- sweep tests with fake Airtable / LINE / Telegram ----------
function harness(sessions, models = { [M1]: { line_user_id: LINE_ID } }, { lineOk = true } = {}) {
  const store = new Map(sessions.map((s) => [s.id, { id: s.id, fields: { ...s.fields } }]));
  const log = { line: [], telegram: [], patches: [], listFormulas: [] };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input?.url || input));
    const method = String(init.method || "GET").toUpperCase();
    if (url.hostname === "api.airtable.com") {
      const parts = url.pathname.split("/").filter(Boolean); // v0, base, table, [id]
      const table = decodeURIComponent(parts[2]);
      const id = parts[3] ? decodeURIComponent(parts[3]) : "";
      if (table === "sessions" && !id && method === "GET") {
        const formula = url.searchParams.get("filterByFormula") || "";
        log.listFormulas.push(formula);
        const date = formula.match(/="(\d{4}-\d{2}-\d{2})"/)?.[1];
        const sid = formula.match(/\{session_id\}="([^"]+)"/)?.[1];
        const records = [...store.values()].filter((r) => (!date || String(r.fields.job_date).slice(0, 10) === date) && (!sid || r.fields.session_id === sid));
        return Response.json({ records });
      }
      if (table === "tblhQGfJc4GgiteZr") return Response.json({ records: [] });
      if (table === "sessions" && id && method === "PATCH") {
        const body = JSON.parse(init.body);
        log.patches.push(body.fields);
        Object.assign(store.get(id).fields, body.fields);
        return Response.json({ id, fields: store.get(id).fields });
      }
      if (table === "models" && id && method === "GET") {
        return models[id] ? Response.json({ id, fields: models[id] }) : Response.json({ error: "NOT_FOUND" }, { status: 404 });
      }
    }
    if (url.hostname === "api.line.me") { log.line.push(JSON.parse(init.body)); return lineOk ? Response.json({}) : Response.json({}, { status: 500 }); }
    if (url.hostname === "telegram.test") { log.telegram.push(JSON.parse(init.body)); return Response.json({ ok: true, telegram: { ok: true } }); }
    throw new Error(`UNEXPECTED_FETCH ${method} ${url}`);
  };
  return { store, log };
}
const env = (o = {}) => ({
  MODEL_RECONFIRM_ENABLED: "true", AIRTABLE_BASE_ID: "appTEST", AIRTABLE_API_KEY: "k", AIRTABLE_TABLE_SESSIONS: "sessions", AIRTABLE_TABLE_MODELS: "models",
  MODEL_LINE_CHANNEL_ACCESS_TOKEN: "line-token", TELEGRAM_INTERNAL_SEND_URL: "https://telegram.test/send", AUTH_SERVICE_EVENTS_TO_TELEGRAM: "svc",
  MODEL_RECONFIRM_OWNER_CHAT_ID: OWNER_CHAT, ...o,
});
const session = (id, fields = {}) => ({ id, fields: { session_id: id.toUpperCase(), session_state: "confirmed", job_date: "2026-10-01", start_time: "2026-10-01T09:00:00Z", end_time: "2026-10-01T10:30:00Z", "Assigned Model": [M1], model_name: "Test Model", ...fields } });
const RECONFIRM_KEYS = new Set(["reconfirm_status", "reconfirm_required_at", "reconfirm_reminder_at", "reconfirm_overdue_at", "reconfirm_notified_at", "reconfirm_reminder_notified_at", "reconfirm_acknowledged_at", "reconfirm_followup_status", "reconfirm_risk_level", "reconfirm_backup_required", "reconfirm_ops_alerted_at"]);

test("S1 guard OFF: inconsistent canonical date/time fails closed", async () => {
  const h = harness([session("recS1AAAAAAAAAAAAA", { job_date: "2026-09-29" })]);
  const result = await runModelReconfirmSweep(env(), { now: NOW });
  assert.equal(result.guard_v2, undefined);
  assert.equal(h.log.line.length, 0);
  assert.equal(result.reviews[0].reason, "canonical_schedule_invalid");
  assert.equal(h.log.listFormulas[0], "", "legacy lists unfiltered");
});

test("S2 guard ON: past-dated job is never messaged, and the list is filtered to the next ICT date", async () => {
  const h = harness([session("recS2AAAAAAAAAAAAA", { job_date: "2026-09-29" }), session("recS2BBBBBBBBBBBBB", { job_date: "2026-10-05" })]);
  const result = await runModelReconfirmSweep(env({ MODEL_RECONFIRM_GUARD_V2: "true" }), { now: NOW });
  assert.equal(result.ok, true);
  assert.equal(h.log.line.length, 0);
  assert.equal(h.log.telegram.length, 0);
  assert.equal(h.log.patches.length, 0);
  assert.match(h.log.listFormulas[0], /2026-10-01/);
});

test("S3 guard ON: connected model gets ONE LINE reminder; a rerun does not resend", async () => {
  const h = harness([session("recS3AAAAAAAAAAAAA")]);
  const e = env({ MODEL_RECONFIRM_GUARD_V2: "true" });
  const first = await runModelReconfirmSweep(e, { now: NOW });
  assert.equal(first.notified, 1);
  assert.equal(h.log.line.length, 1);
  assert.equal(h.log.line[0].to, LINE_ID);
  assert.doesNotMatch(JSON.stringify(h.log.line[0]), /THB|฿|payment|price|invoice/i);
  await runModelReconfirmSweep(e, { now: NOW + 60_000 });
  assert.equal(h.log.line.length, 1);
  assert.equal(h.log.telegram.length, 0);
});

test("S4 guard ON: not connected -> owner-only Telegram action once, no LINE, no guess", async () => {
  const h = harness([session("recS4AAAAAAAAAAAAA")], { [M1]: { line_user_id: "" } });
  const e = env({ MODEL_RECONFIRM_GUARD_V2: "true" });
  const first = await runModelReconfirmSweep(e, { now: NOW });
  assert.equal(first.owner_actions, 1);
  assert.equal(h.log.line.length, 0);
  assert.equal(h.log.telegram.length, 1);
  assert.equal(h.log.telegram[0].chat_id, OWNER_CHAT);
  assert.equal(h.log.telegram[0].intent, "model_reconfirm_owner_action");
  assert.equal(h.log.telegram[0].text.split("\n").filter((l) => l.startsWith("Next:")).length, 1);
  await runModelReconfirmSweep(e, { now: NOW + 900_000 });
  assert.equal(h.log.telegram.length, 1, "owner is told once");
});

test("S5 guard ON: two assigned models -> review_required to owner only, model never messaged", async () => {
  const h = harness([session("recS5AAAAAAAAAAAAA", { "Assigned Model": [M1, M2] })], { [M1]: { line_user_id: LINE_ID }, [M2]: { line_user_id: LINE_ID } });
  const result = await runModelReconfirmSweep(env({ MODEL_RECONFIRM_GUARD_V2: "true" }), { now: NOW });
  assert.equal(result.review_required, 1);
  assert.equal(h.log.line.length, 0);
  assert.equal(h.log.telegram[0].intent, "model_reconfirm_review_required");
  assert.match(h.log.telegram[0].text, /assigned_model_ambiguous/);
});

test("S6 guard ON: no owner destination -> nothing is sent anywhere and no fallback to generic/booking chats", async () => {
  const h = harness([session("recS6AAAAAAAAAAAAA")], { [M1]: { line_user_id: "" } });
  const e = env({ MODEL_RECONFIRM_GUARD_V2: "true", MODEL_RECONFIRM_OWNER_CHAT_ID: "", TELEGRAM_CHAT_ID: "-111", TELEGRAM_BOOKING_CHAT_ID: "-222", TELEGRAM_ADMIN_CHAT_ID: "-333" });
  const result = await runModelReconfirmSweep(e, { now: NOW });
  assert.equal(result.owner_destination_missing, 1);
  assert.equal(h.log.telegram.length, 0);
  assert.equal(h.log.line.length, 0);
  assert.equal(h.log.patches.filter((p) => "reconfirm_followup_status" in p && p.reconfirm_followup_status === FOLLOWUP_OWNER_ACTION).length, 0, "not marked as notified when nothing was sent");
});

test("S7 guard ON: LINE keeps failing -> bounded at 3 attempts, then owner review_required, then stops", async () => {
  const h = harness([session("recS7AAAAAAAAAAAAA")], { [M1]: { line_user_id: LINE_ID } }, { lineOk: false });
  const e = env({ MODEL_RECONFIRM_GUARD_V2: "true" });
  await runModelReconfirmSweep(e, { now: NOW });
  await runModelReconfirmSweep(e, { now: NOW + 900_000 });
  assert.equal(h.log.telegram.length, 0);
  await runModelReconfirmSweep(e, { now: NOW + 1_800_000 });
  assert.equal(h.log.line.length, 3);
  assert.equal(h.log.telegram.length, 1);
  assert.match(h.log.telegram[0].text, /send_failed_repeatedly/);
  await runModelReconfirmSweep(e, { now: NOW + 2_700_000 });
  assert.equal(h.log.line.length, 3, "no further LINE attempts");
  assert.equal(h.log.telegram.length, 1, "no further owner messages");
});

test("S8 guard ON: writes touch only reconfirm metadata fields", async () => {
  const h = harness([session("recS8AAAAAAAAAAAAA"), session("recS8BBBBBBBBBBBBB", { "Assigned Model": [] })]);
  await runModelReconfirmSweep(env({ MODEL_RECONFIRM_GUARD_V2: "true" }), { now: NOW });
  assert.ok(h.log.patches.length > 0);
  for (const patch of h.log.patches) for (const key of Object.keys(patch)) assert.ok(RECONFIRM_KEYS.has(key), `unexpected write to ${key}`);
});

test("S9 guard ON: cancelled and completed jobs are skipped even for the target date", async () => {
  const h = harness([session("recS9AAAAAAAAAAAAA", { session_state: "cancelled" }), session("recS9BBBBBBBBBBBBB", { session_state: "completed" })]);
  const result = await runModelReconfirmSweep(env({ MODEL_RECONFIRM_GUARD_V2: "true" }), { now: NOW });
  assert.equal(result.processed, 0);
  assert.equal(h.log.line.length + h.log.telegram.length, 0);
});

test("S10 guard ON: nothing is sent before D-1 16:00 ICT", async () => {
  const h = harness([session("recS10AAAAAAAAAAAA")]);
  await runModelReconfirmSweep(env({ MODEL_RECONFIRM_GUARD_V2: "true" }), { now: Date.parse("2026-09-30T15:45:00+07:00") });
  assert.equal(h.log.line.length + h.log.telegram.length, 0);
});
