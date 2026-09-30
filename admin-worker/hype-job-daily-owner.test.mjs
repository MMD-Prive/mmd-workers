import test from "node:test";
import assert from "node:assert/strict";

import {
  HYPE_JOB_DAILY_OWNER_BASE, SMOKE_CONFIRM, buildStatus, handleHypeJobDailyOwnerRequest, inferChatKind, isHypeJobDailyOwnerRequest, maskId,
} from "./src/hype-job-daily/owner.js";
import entry from "./src/admin-login-hero-worker.js";

// Real network is blocked for the whole file: Telegram/Airtable/anything else must be mocked.
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => { throw new Error(`REAL_NETWORK_CALL_BLOCKED ${String(url?.url || url)}`); };
test.after(() => { globalThis.fetch = realFetch; });

const NOW = Date.parse("2026-09-30T08:50:00+07:00");
const CHAT = "-5500000001"; // synthetic id; the real destination is never used in tests
const BASE = `https://mmdbkk.com${HYPE_JOB_DAILY_OWNER_BASE}`;
const owner = async () => ({ id: "per", role: "owner" });
const admin = async () => ({ id: "staff", role: "admin" });
const nobody = async () => null;
const env = (o = {}) => ({ HYPE_JOB_DAILY_ENABLED: "false", HYPE_JOB_DAILY_CHAT_ID: CHAT, TELEGRAM_INTERNAL_SEND_URL: "https://telegram.test/send", AUTH_SERVICE_STUDIO_TO_TELEGRAM: "tok", ...o });
const call = (action, method, envv, deps, body) => handleHypeJobDailyOwnerRequest(new Request(`${BASE}/${action}`, { method, body: body ? JSON.stringify(body) : undefined }), envv, { now: NOW, ...deps });
const store = (record = null) => ({ calls: [], async state() { this.calls.push("state"); return record; }, async claim() { this.calls.push("claim"); }, async mark() { this.calls.push("mark"); } });

test("route matcher only accepts the three owner paths", () => {
  for (const a of ["status", "preview", "smoke"]) assert.equal(isHypeJobDailyOwnerRequest(`${HYPE_JOB_DAILY_OWNER_BASE}/${a}`), true);
  assert.equal(isHypeJobDailyOwnerRequest(`${HYPE_JOB_DAILY_OWNER_BASE}/run`), false);
  assert.equal(isHypeJobDailyOwnerRequest("/internal/admin/payments"), false);
});

test("auth: no session -> 401, admin (non-owner) -> 403, wrong method -> 405", async () => {
  for (const [action, method] of [["status", "GET"], ["preview", "GET"], ["smoke", "POST"]]) {
    assert.equal((await call(action, method, env(), { readActor: nobody })).status, 401, `${action} unauth`);
    assert.equal((await call(action, method, env(), { readActor: admin })).status, 403, `${action} admin`);
  }
  assert.equal((await call("status", "POST", env(), { readActor: owner })).status, 405);
  assert.equal((await call("smoke", "GET", env(), { readActor: owner })).status, 405);
});

test("the real entry worker routes the path and rejects an unauthenticated caller (no fall-through)", async () => {
  const res = await entry.fetch(new Request(`${BASE}/status`), env(), { waitUntil() {} });
  assert.equal(res.status, 401);
});

test("status: read-only, masks ids, reports flag/destination/binding, warns about group destinations", async () => {
  const s = store({ status: "sent", attempts: 1, parts_sent: 1, last_error: "" });
  const res = await call("status", "GET", env({ HYPE_JOB_DAILY_ENABLED: "false" }), { readActor: owner, store: s });
  assert.equal(res.status, 200);
  const raw = await res.text();
  const body = JSON.parse(raw);
  assert.equal(body.flag_enabled, false);
  assert.equal(body.destination.configured, true);
  assert.equal(body.destination.chat_id_masked, "…0001");
  assert.equal(body.destination.thread_configured, false);
  assert.equal(body.destination.chat_kind_by_id_format, "basic_group");
  assert.ok(!raw.includes(CHAT), "full chat id must never be returned");
  assert.equal(body.run_state_binding, true);
  assert.equal(body.today.status, "sent");
  assert.equal(body.schedule.send_at_ict, "08:45");
  assert.equal(body.schedule.run_key, "HYPE_JOB_DAILY:2026-09-30");
  assert.ok(body.warnings.some((w) => /group\/channel/.test(w)));
  assert.deepEqual(s.calls, ["state"]);
  assert.equal(body.read_only, true);
});

test("status: missing destination / binding / send config are surfaced as warnings", async () => {
  const body = await buildStatus({ HYPE_JOB_DAILY_ENABLED: "true" }, NOW, {});
  assert.equal(body.destination.configured, false);
  assert.equal(body.run_state_binding, false);
  assert.equal(body.telegram_send_configured, false);
  const w = body.warnings.join(" | ");
  assert.match(w, /HYPE_JOB_DAILY_CHAT_ID is not set/);
  assert.match(w, /Durable Object binding is missing/);
  assert.match(w, /flag is ON but configuration is incomplete/);
});

test("status: thread id set on a basic group is flagged; ids are masked", async () => {
  const body = await buildStatus(env({ HYPE_JOB_DAILY_THREAD_ID: "77" }), NOW, { store: store() });
  assert.equal(body.destination.thread_id_masked, "…77");
  assert.ok(body.warnings.some((w) => /basic group has no threads/.test(w)));
  assert.equal(maskId("-1001234567890"), "…7890");
  assert.equal(inferChatKind("-1001234567890"), "supergroup_or_channel");
  assert.equal(inferChatKind("12345"), "private_chat");
  assert.equal(inferChatKind("abc"), "unknown");
});

test("preview: builds the digest for the owner, sends nothing, writes no run-state", async () => {
  const ok = (x) => ({ ok: true, ...x });
  const sources = {
    sessions: async () => ok({ records: [{ session_id: "JP1", record_id: "r", job_date: "2026-09-30", start_time: "19:00", state: "confirmed", status: "", model_name: "M", client_name: "คุณเอ" }] }),
    payments: async () => ok({ records: [] }), review: async () => ok({ items: [] }), recovery: async () => ok({ items: [] }),
  };
  const s = store();
  let sent = 0;
  const res = await call("preview", "GET", env(), { readActor: owner, sources, store: s, send: async () => { sent += 1; return { ok: true }; } });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.sends_nothing, true);
  assert.equal(body.counts.jobs_today, 1);
  assert.match(body.parts.join("\n"), /HYPE JOB DAILY — 2026-09-30/);
  assert.match(body.parts.join("\n"), /JP1/);
  assert.equal(sent, 0);
  assert.deepEqual(s.calls, []);
});

test("smoke: needs the explicit confirm string", async () => {
  let sent = 0;
  const res = await call("smoke", "POST", env(), { readActor: owner, send: async () => { sent += 1; return { ok: true }; } }, {});
  assert.equal(res.status, 400);
  assert.equal((await res.json()).required, SMOKE_CONFIRM);
  assert.equal(sent, 0);
});

test("smoke: sends exactly one short test line to the configured destination, with no business data, and does not touch run-state", async () => {
  const s = store();
  const sent = [];
  const res = await call("smoke", "POST", env({ HYPE_JOB_DAILY_THREAD_ID: "" }), { readActor: owner, store: s, send: async (p) => { sent.push(p); return { ok: true, status: 200 }; } }, { confirm: SMOKE_CONFIRM });
  const raw = await res.text();
  assert.equal(res.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].chat_id, CHAT);
  assert.equal(sent[0].intent, "hype_job_daily_smoke");
  assert.match(sent[0].text, /destination smoke test/);
  assert.doesNotMatch(sent[0].text, /THB|session|payment ref|คุณ/i);
  assert.equal("message_thread_id" in sent[0], false);
  assert.ok(!raw.includes(CHAT));
  assert.equal(JSON.parse(raw).destination.chat_id_masked, "…0001");
  assert.deepEqual(s.calls, [], "smoke must not claim, mark, or read the daily run-state");
});

test("smoke works while the flag is off (that is its purpose) and includes the thread when configured", async () => {
  const sent = [];
  await call("smoke", "POST", env({ HYPE_JOB_DAILY_ENABLED: "false", HYPE_JOB_DAILY_THREAD_ID: "42" }), { readActor: owner, send: async (p) => { sent.push(p); return { ok: true }; } }, { confirm: SMOKE_CONFIRM });
  assert.equal(sent[0].message_thread_id, "42");
});

test("smoke: no destination -> 409 and nothing sent; Telegram failure -> 502 without leaking ids", async () => {
  let sent = 0;
  const noDest = await call("smoke", "POST", { HYPE_JOB_DAILY_ENABLED: "false" }, { readActor: owner, send: async () => { sent += 1; return { ok: true }; } }, { confirm: SMOKE_CONFIRM });
  assert.equal(noDest.status, 409);
  assert.equal(sent, 0);
  const failed = await call("smoke", "POST", env(), { readActor: owner, send: async () => ({ ok: false, error: "telegram_http_400", status: 400 }) }, { confirm: SMOKE_CONFIRM });
  const raw = await failed.text();
  assert.equal(failed.status, 502);
  assert.equal(JSON.parse(raw).sent, false);
  assert.ok(!raw.includes(CHAT));
});

test("smoke: a throwing sender is contained", async () => {
  const res = await call("smoke", "POST", env(), { readActor: owner, send: async () => { throw new Error("boom"); } }, { confirm: SMOKE_CONFIRM });
  assert.equal(res.status, 502);
});

test("real network stays blocked in this file", async () => {
  await assert.rejects(() => globalThis.fetch("https://api.telegram.org/x"), /REAL_NETWORK_CALL_BLOCKED/);
});
