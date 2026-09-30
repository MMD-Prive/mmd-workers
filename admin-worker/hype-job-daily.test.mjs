import test from "node:test";
import assert from "node:assert/strict";

import { buildDigest, SECTION_ORDER } from "./src/hype-job-daily/builder.js";
import { formatDigest, renderSections } from "./src/hype-job-daily/formatter.js";
import { collectPayments, collectSessions, paymentFieldMap } from "./src/hype-job-daily/sources.js";
import { collectAll } from "./src/hype-job-daily/default-sources.js";
import {
  HypeJobDailyRunState, claimRun, finalizeMissed, markRun,
} from "./src/hype-job-daily/run-state-do.js";
import {
  MAX_ATTEMPTS, resolveDestination, runHypeJobDaily, runHypeJobDailyScheduled, sendTelegramInternal,
} from "./src/hype-job-daily/runner.js";
import { parsePerRenameDateSuffix } from "./src/per-rename-date-suffix.js";

// Any code path that reaches real network (Telegram or otherwise) fails loudly.
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => { throw new Error(`REAL_NETWORK_CALL_BLOCKED ${String(url?.url || url)}`); };

const T = (iso) => Date.parse(iso);
const NOW = T("2026-09-30T08:50:00+07:00"); // Wed, after 08:45 ICT
const TOKEN = "svc-secret-token-do-not-log";
const CHAT = "-100999";

function sess(id, o = {}) {
  return {
    session_id: id, record_id: `rec${id}`,
    job_date: o.date ?? "2026-09-30", start_time: o.time ?? "19:00",
    state: o.state ?? "confirmed", status: o.status ?? "", model_name: o.model ?? "Book EI",
    client_name: o.client === undefined ? "คุณเอ็ม" : o.client,
  };
}
const pay = (sid, o = {}) => ({ record_id: "recP", payment_ref: o.ref ?? "pay_abc123xyz", session_id: sid, payment_status: o.status ?? "deposit_paid", verification_status: o.ver ?? "verified", deposit_status: "", amount_thb: o.amount ?? 5000 });
const ok = (extra) => ({ ok: true, ...extra });
function input(o = {}) {
  return {
    sessions: o.sessions ?? ok({ records: [], truncated: false }),
    payments: o.payments ?? ok({ records: [] }),
    review: o.review ?? ok({ items: [] }),
    recovery: o.recovery ?? ok({ items: [] }),
  };
}
const text = (digest) => formatDigest(digest).join("\n");
const sectionText = (digest, key) => renderSections(digest).find((s) => s.key === key).blocks.join("\n");

function memoryStore() {
  const records = new Map();
  const calls = [];
  return {
    records, calls,
    async claim(key, opts) {
      calls.push(["claim", key]);
      const r = claimRun(records.get(key) || null, { now: opts.now, key, claimTimeoutMs: opts.claim_timeout_ms, maxAttempts: opts.max_attempts });
      records.set(key, r.record);
      return { ok: true, decision: r.decision, attempt: r.record.attempts, parts_sent: r.record.parts_sent || 0, status: r.record.status };
    },
    async mark(key, opts) {
      calls.push(["mark", key, opts.status]);
      const r = markRun(records.get(key) || null, { status: opts.status, now: opts.now, error: opts.error, partsSent: opts.parts_sent });
      if (r.ok) records.set(key, r.record);
      return r;
    },
    async finalizeMissed(key, opts) {
      calls.push(["finalize", key]);
      const r = finalizeMissed(records.get(key) || null, { now: opts.now });
      if (r.changed) records.set(key, r.record);
      return { ok: true, changed: r.changed };
    },
  };
}
const env = (o = {}) => ({ HYPE_JOB_DAILY_ENABLED: "true", HYPE_JOB_DAILY_CHAT_ID: CHAT, HYPE_JOB_DAILY_THREAD_ID: "77", ...o });
const sources = (i = input()) => ({
  sessions: async () => i.sessions, payments: async () => i.payments, review: async () => i.review, recovery: async () => i.recovery,
});
function captureConsole() {
  const lines = [];
  const orig = { log: console.log, error: console.error };
  console.log = (...a) => lines.push(JSON.stringify(a));
  console.error = (...a) => lines.push(JSON.stringify(a));
  return { lines, restore() { console.log = orig.log; console.error = orig.error; } };
}

// ---------- 1-3: jobs today, model, payment ----------
test("1: job today with model confirmation pending -> JOBS TODAY + MODEL WATCH, P0, owner action", () => {
  const d = buildDigest(input({ sessions: ok({ records: [sess("J1", { state: "pending" })] }), payments: ok({ records: [pay("J1")] }) }), NOW);
  assert.match(sectionText(d, "jobs_today"), /J1/);
  assert.match(sectionText(d, "model"), /confirmation pending/);
  assert.match(sectionText(d, "model"), /Next: confirm with the model/);
  assert.equal(d.sections.p0.length, 1);
  assert.equal(d.sections.p0[0].p0Class, 2);
});

test("2: job today with unpaid deposit -> JOBS TODAY + PAYMENT WATCH, P0 class 1", () => {
  const d = buildDigest(input({ sessions: ok({ records: [sess("J2")] }), payments: ok({ records: [pay("J2", { status: "pending", ver: "pending", amount: null })] }) }), NOW);
  assert.match(sectionText(d, "jobs_today"), /payment pending \(unpaid\)/);
  assert.match(sectionText(d, "payment"), /J2/);
  assert.equal(d.sections.p0[0].p0Class, 1);
});

test("2b: no payment record is reported as no record, never inferred as unpaid", () => {
  const d = buildDigest(input({ sessions: ok({ records: [sess("J2b")] }) }), NOW);
  assert.match(sectionText(d, "jobs_today"), /no payment record/);
  assert.doesNotMatch(sectionText(d, "jobs_today"), /unpaid/);
});

test("3: proof uploaded but not reviewed is an owner action and never counted as paid", () => {
  const review = ok({ items: [{ proof_id: "pf1", payment_ref: "pay_zzz999", session_id: "J3", customer_name: "คุณก้อง", evidence_amount_thb: 3000 }] });
  const d = buildDigest(input({ sessions: ok({ records: [sess("J3")] }), payments: ok({ records: [] }), review }), NOW);
  const payment = sectionText(d, "payment");
  assert.match(payment, /proof awaiting review \(not paid\)/);
  assert.match(payment, /slip 3,000 THB \(unverified\)/);
  assert.match(payment, /Next: review the payment proof/);
  assert.match(sectionText(d, "jobs_today"), /proof\/payment awaiting review \(not paid\)/);
  assert.doesNotMatch(sectionText(d, "jobs_today"), /money verified/);
});

test("3b: payment marked paid but verification pending is awaiting verification, not paid", () => {
  const d = buildDigest(input({ sessions: ok({ records: [sess("J3b")] }), payments: ok({ records: [pay("J3b", { status: "paid", ver: "pending" })] }) }), NOW);
  assert.match(sectionText(d, "jobs_today"), /awaiting review \(not paid\)/);
});

test("3c: verified paid money is shown as verified with the amount exactly as read", () => {
  const d = buildDigest(input({ sessions: ok({ records: [sess("J3c")] }), payments: ok({ records: [pay("J3c", { amount: 5000 })] }) }), NOW);
  assert.match(sectionText(d, "jobs_today"), /money verified/);
  assert.match(sectionText(d, "jobs_today"), /5,000 THB/);
  assert.equal(d.sections.p0.length, 0);
});

// ---------- 4-5: links must never be fabricated ----------
test("4/5: no URL is ever fabricated (refund pack / model_job_app_url / admin_job_url unavailable in source)", () => {
  const d = buildDigest(input({ sessions: ok({ records: [sess("J4", { state: "pending" })] }), payments: ok({ records: [pay("J4")] }) }), NOW);
  const all = text(d);
  assert.doesNotMatch(all, /https?:\/\//);
  assert.doesNotMatch(all, /model_job_app_url|admin_job_url|customer_confirmation_url/);
});

// ---------- 6: customer identity ----------
test("6: ambiguous or missing customer -> customer_review_required, no guessed name", () => {
  const d = buildDigest(input({ sessions: ok({ records: [sess("J6", { client: ["คุณเอ", "คุณบี"] }), sess("J6b", { client: "" })] }), payments: ok({ records: [pay("J6"), pay("J6b")] }) }), NOW);
  assert.match(sectionText(d, "customer"), /J6 — customer_review_required \(multiple customer matches\)/);
  assert.match(sectionText(d, "customer"), /J6b — customer_review_required \(customer name missing\)/);
  assert.doesNotMatch(sectionText(d, "jobs_today"), /คุณเอ|คุณบี/);
  assert.match(sectionText(d, "customer"), /Next: confirm customer identity/);
});

test("6b: Per Rename display comes from the existing helper (date after name)", () => {
  const raw = "คุณเอ็ม 12/09/2026";
  const parsed = parsePerRenameDateSuffix(raw);
  assert.equal(parsed.matched, true);
  const d = buildDigest(input({ sessions: ok({ records: [sess("J6c", { client: raw })] }), payments: ok({ records: [pay("J6c")] }) }), NOW);
  assert.ok(sectionText(d, "jobs_today").includes(`${parsed.base_name} ${parsed.date_label}`));
});

// ---------- 7: recovery ----------
test("7: recovery case keeps its case reference and Next is an owner decision (no new candidate)", () => {
  const recovery = ok({ items: [{ case_ref: "RC-2026-0042", client_name: "คุณโจ", domain: "booking", state: "open", sla_status: "overdue", picker_state: "waiting_reselection" }] });
  const d = buildDigest(input({ recovery }), NOW);
  const c = sectionText(d, "customer");
  assert.match(c, /case RC-2026-0042/);
  assert.match(c, /Next: review recovery case RC-2026-0042 and decide/);
  assert.doesNotMatch(c, /candidate/i);
  assert.equal(d.sections.p0[0].p0Class, 4);
});

test("7b: recovery source failure -> review_required in SYSTEM WATCH, no pre-refresh cases shown", () => {
  const d = buildDigest(input({ recovery: { ok: false, error: "recovery_read_failed" } }), NOW);
  assert.match(sectionText(d, "system"), /review_required \(recovery queue unreachable/);
  assert.match(sectionText(d, "customer"), /unknown \(source unreachable\)/);
});

// ---------- 8: empty ----------
test("8: no active jobs -> all 8 headers, 'no P0 today', explicit none + Next, still sent", async () => {
  const store = memoryStore();
  const sent = [];
  const result = await runHypeJobDaily(env(), { now: NOW, deps: { store, sources: sources(), send: async (p) => { sent.push(p); return { ok: true }; } } });
  assert.equal(result.status, "sent");
  const body = sent.map((p) => p.text).join("\n");
  for (const [, title] of SECTION_ORDER) assert.ok(body.includes(title), title);
  assert.match(body, /no P0 today/);
  assert.match(body, /• none\n {2}Next: no action/);
  assert.match(body, /ไม่มี P0 วันนี้/);
});

// ---------- 9: idempotency / retry ----------
test("9: second run for the same ICT date does not send again", async () => {
  const store = memoryStore(); let count = 0;
  const deps = { store, sources: sources(), send: async () => { count += 1; return { ok: true }; } };
  assert.equal((await runHypeJobDaily(env(), { now: NOW, deps })).status, "sent");
  assert.equal((await runHypeJobDaily(env(), { now: NOW + 5 * 60000, deps })).status, "already_sent");
  assert.equal(count, 1);
  assert.equal(store.records.get("HYPE_JOB_DAILY:2026-09-30").status, "sent");
});

test("9b: failed send is retried on the next trigger and results in one successful send", async () => {
  const store = memoryStore(); const results = [];
  const deps = { store, sources: sources(), send: async () => { const r = results.length === 0 ? { ok: false, error: "telegram_http_502", status: 502, retryable: true } : { ok: true }; results.push(r); return r; } };
  const cap = captureConsole();
  try {
    assert.equal((await runHypeJobDaily(env(), { now: NOW, deps })).status, "failed");
    assert.equal(store.records.get("HYPE_JOB_DAILY:2026-09-30").status, "failed");
    assert.equal((await runHypeJobDaily(env(), { now: NOW + 300000, deps })).status, "sent");
  } finally { cap.restore(); }
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(store.records.get("HYPE_JOB_DAILY:2026-09-30").attempts, 2);
});

test("9b2: retries stop at the attempt cap", async () => {
  const store = memoryStore(); let count = 0;
  const deps = { store, sources: sources(), send: async () => { count += 1; return { ok: false, error: "telegram_http_500", status: 500 }; } };
  const cap = captureConsole();
  try {
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) await runHypeJobDaily(env(), { now: NOW + i * 300000, deps });
    const last = await runHypeJobDaily(env(), { now: NOW + 9 * 300000, deps });
    assert.equal(last.status, "max_attempts");
  } finally { cap.restore(); }
  assert.equal(count, MAX_ATTEMPTS);
});

test("9c: ICT date boundary — before 08:45 not due; date key follows ICT, not UTC", async () => {
  const store = memoryStore(); let count = 0;
  const deps = { store, sources: sources(), send: async () => { count += 1; return { ok: true }; } };
  // 2026-09-30 00:10 ICT = 2026-09-29 17:10 UTC
  assert.equal((await runHypeJobDaily(env(), { now: T("2026-09-29T17:10:00Z"), deps })).status, "not_due");
  assert.equal(count, 0);
  // 08:50 ICT = 01:50 UTC same UTC date; key is the ICT date
  await runHypeJobDaily(env(), { now: T("2026-09-30T01:50:00Z"), deps });
  assert.ok(store.records.has("HYPE_JOB_DAILY:2026-09-30"));
  // 23:59 ICT still the 30th -> already sent
  assert.equal((await runHypeJobDaily(env(), { now: T("2026-09-30T16:59:00Z"), deps })).status, "already_sent");
  // 08:50 ICT the next day = new key, sends again
  assert.equal((await runHypeJobDaily(env(), { now: T("2026-10-01T01:50:00Z"), deps })).status, "sent");
  assert.equal(count, 2);
});

test("9d: stale claim is retryable; fresh claim is not", () => {
  const key = "HYPE_JOB_DAILY:2026-09-30";
  const base = { key, status: "claimed", attempts: 1, claimed_at: NOW - 31 * 60000, parts_sent: 0 };
  assert.equal(claimRun(base, { now: NOW, key, claimTimeoutMs: 30 * 60000, maxAttempts: 3 }).decision, "proceed");
  assert.equal(claimRun({ ...base, claimed_at: NOW - 5 * 60000 }, { now: NOW, key, claimTimeoutMs: 30 * 60000, maxAttempts: 3 }).decision, "in_progress");
  assert.equal(claimRun({ ...base, attempts: 3 }, { now: NOW, key, claimTimeoutMs: 30 * 60000, maxAttempts: 3 }).decision, "max_attempts");
});

test("9e: late retry after midnight is late_missed and yesterday's digest is never sent", async () => {
  const store = memoryStore(); let count = 0;
  store.records.set("HYPE_JOB_DAILY:2026-09-30", { key: "HYPE_JOB_DAILY:2026-09-30", status: "failed", attempts: 2, updated_at: NOW });
  const deps = { store, sources: sources(), send: async () => { count += 1; return { ok: true }; } };
  const cap = captureConsole();
  try {
    const result = await runHypeJobDaily(env(), { now: T("2026-10-01T00:05:00+07:00"), deps });
    assert.equal(result.status, "not_due");
  } finally { cap.restore(); }
  assert.equal(store.records.get("HYPE_JOB_DAILY:2026-09-30").status, "late_missed");
  assert.equal(count, 0);
  assert.equal(claimRun(store.records.get("HYPE_JOB_DAILY:2026-09-30"), { now: NOW, key: "k", claimTimeoutMs: 1, maxAttempts: 3 }).decision, "late_missed");
});

test("9f: multi-part send resumes from the last sent part instead of duplicating", async () => {
  const store = memoryStore(); const seen = []; let failNext = true;
  const many = Array.from({ length: 60 }, (_, i) => sess(`JOB-${String(i).padStart(3, "0")}`, { time: "19:00" }));
  const src = sources(input({ sessions: ok({ records: many }), payments: ok({ records: many.map((s) => pay(s.session_id, { ref: `pay_${s.session_id}` })) }) }));
  const deps = { store, sources: src, send: async (p) => { if (failNext && seen.length === 1) { failNext = false; return { ok: false, error: "telegram_http_500", status: 500 }; } seen.push(p.text); return { ok: true }; } };
  const cap = captureConsole();
  try {
    assert.equal((await runHypeJobDaily(env(), { now: NOW, deps })).status, "failed");
    assert.equal((await runHypeJobDaily(env(), { now: NOW + 300000, deps })).status, "sent");
  } finally { cap.restore(); }
  assert.ok(seen.length >= 2);
  assert.equal(new Set(seen).size, seen.length, "no part sent twice");
});

// ---------- 10-11: send safety ----------
test("10: send failure is caught, run marked failed, log has no token/body/PII", async () => {
  const store = memoryStore();
  const i = input({ sessions: ok({ records: [sess("J10", { client: "คุณลับ" })] }), payments: ok({ records: [pay("J10")] }) });
  const cap = captureConsole();
  let result;
  try {
    result = await runHypeJobDaily(env({ AUTH_SERVICE_STUDIO_TO_TELEGRAM: TOKEN }), { now: NOW, deps: { store, sources: sources(i), send: async () => ({ ok: false, error: "telegram_http_500", status: 500 }) } });
  } finally { cap.restore(); }
  assert.equal(result.status, "failed");
  assert.equal(store.records.get("HYPE_JOB_DAILY:2026-09-30").status, "failed");
  const log = cap.lines.join("\n");
  assert.match(log, /hype_job_daily_failed/);
  assert.match(log, /2026-09-30/);
  assert.match(log, /"stage":"send"|\\"stage\\":\\"send\\"|stage/);
  assert.ok(!log.includes(TOKEN));
  assert.ok(!log.includes("คุณลับ"));
  assert.ok(!log.includes("J10"));
});

test("10b: a throwing send and a throwing scheduled entry never propagate", async () => {
  const store = memoryStore();
  const cap = captureConsole();
  try {
    const r = await runHypeJobDaily(env(), { now: NOW, deps: { store, sources: sources(), send: async () => { throw new Error("boom"); } } });
    assert.equal(r.status, "failed");
    const scheduled = await runHypeJobDailyScheduled({ HYPE_JOB_DAILY_ENABLED: "true", HYPE_JOB_DAILY_CHAT_ID: CHAT }, { scheduledTime: NOW });
    assert.equal(scheduled.status, "not_configured");
  } finally { cap.restore(); }
});

test("11: Telegram is mocked — destination comes from config, real network is blocked", async () => {
  const store = memoryStore(); const sent = [];
  await runHypeJobDaily(env(), { now: NOW, deps: { store, sources: sources(), send: async (p) => { sent.push(p); return { ok: true }; } } });
  assert.equal(sent[0].chat_id, CHAT);
  assert.equal(sent[0].message_thread_id, "77");
  assert.equal(sent[0].parse_mode, "HTML");
  assert.equal(sent[0].intent, "hype_job_daily");
  await assert.rejects(() => globalThis.fetch("https://api.telegram.org/x"), /REAL_NETWORK_CALL_BLOCKED/);
});

test("11b: sendTelegramInternal uses the internal-send contract (stubbed fetch only)", async () => {
  const calls = [];
  const saved = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ ok: true, telegram: { ok: true } }), { status: 200 }); };
  try {
    const e = { TELEGRAM_INTERNAL_SEND_URL: "https://telegram.test/telegram/internal/send", AUTH_SERVICE_STUDIO_TO_TELEGRAM: TOKEN };
    assert.equal((await sendTelegramInternal(e, { chat_id: CHAT, text: "x" })).ok, true);
    assert.equal(calls[0].url, "https://telegram.test/telegram/internal/send");
    assert.equal(calls[0].init.headers["x-internal-token"], TOKEN);
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, telegram: { ok: false } }), { status: 200 });
    assert.equal((await sendTelegramInternal(e, { chat_id: CHAT, text: "x" })).ok, false);
    assert.equal((await sendTelegramInternal({}, { chat_id: CHAT, text: "x" })).error, "telegram_send_not_configured");
  } finally { globalThis.fetch = saved; }
});

test("11c: flag off, missing destination, or missing DO binding never send or claim", async () => {
  const store = memoryStore(); let count = 0;
  const deps = { store, sources: sources(), send: async () => { count += 1; return { ok: true }; } };
  assert.equal((await runHypeJobDaily({ HYPE_JOB_DAILY_ENABLED: "false", HYPE_JOB_DAILY_CHAT_ID: CHAT }, { now: NOW, deps })).status, "disabled");
  assert.equal((await runHypeJobDaily({}, { now: NOW, deps })).status, "disabled");
  const cap = captureConsole();
  try {
    assert.equal((await runHypeJobDaily({ HYPE_JOB_DAILY_ENABLED: "true" }, { now: NOW, deps })).reason, "destination_not_configured");
    assert.equal((await runHypeJobDaily(env(), { now: NOW, deps: { sources: sources(), send: deps.send } })).reason, "run_state_binding_missing");
  } finally { cap.restore(); }
  assert.equal(count, 0);
  assert.equal(store.calls.filter((c) => c[0] === "claim").length, 0);
  assert.equal(resolveDestination({}), null);
});

// ---------- 12: no mutation ----------
test("12: collectors only GET, read only whitelisted Payments fields, and never write", async () => {
  const calls = [];
  const e = {
    AIRTABLE_API_KEY: "key", AIRTABLE_BASE_ID: "appTEST",
    AIRTABLE_HTTP: { fetch: async (req) => { calls.push({ method: req.method, url: req.url }); return new Response(JSON.stringify({ records: [] }), { status: 200 }); } },
  };
  await collectSessions(e, NOW);
  await collectPayments(e, ["J1", "J2"]);
  assert.ok(calls.length >= 2);
  assert.ok(calls.every((c) => c.method === "GET"));
  const payUrl = new URL(calls.find((c) => c.url.includes("tblWGGJJOx5eBvBZJ")).url);
  const requested = payUrl.searchParams.getAll("fields[]").sort();
  assert.deepEqual(requested, Object.values(paymentFieldMap(e)).sort());
  assert.equal(payUrl.searchParams.get("returnFieldsByFieldId"), "true");
  const sessUrl = new URL(calls[0].url);
  const formula = sessUrl.searchParams.get("filterByFormula");
  for (const d of ["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"]) assert.ok(formula.includes(d));
});

test("12b: builder and formatter do not mutate their input", () => {
  const i = input({ sessions: ok({ records: [sess("J12", { state: "pending" })] }), payments: ok({ records: [pay("J12")] }), review: ok({ items: [{ proof_id: "p", payment_ref: "r", session_id: "J12", customer_name: "x", evidence_amount_thb: 1 }] }), recovery: ok({ items: [{ case_ref: "RC-1", client_name: "y", domain: "d", state: "open", sla_status: "overdue", picker_state: "other" }] }) });
  const before = JSON.stringify(i);
  formatDigest(buildDigest(i, NOW));
  assert.equal(JSON.stringify(i), before);
});

test("12c: run-state DO keeps only bookkeeping (no digest body or PII)", async () => {
  const data = new Map();
  const state = { storage: { get: async (k) => data.get(k), put: async (k, v) => { data.set(k, structuredClone(v)); } } };
  const durable = new HypeJobDailyRunState(state, {});
  const call = (path, body) => durable.fetch(new Request(`https://x.internal${path}`, { method: "POST", body: JSON.stringify(body) })).then((r) => r.json());
  const key = "HYPE_JOB_DAILY:2026-09-30";
  assert.equal((await call("/claim", { key, now: NOW })).decision, "proceed");
  assert.equal((await call("/claim", { key, now: NOW + 1000 })).decision, "in_progress");
  await call("/mark", { key, status: "failed", now: NOW + 2000, error: "send:telegram_http_500 <token>" });
  assert.equal((await call("/claim", { key, now: NOW + 3000 })).attempt, 2);
  await call("/mark", { key, status: "sent", now: NOW + 4000, parts_sent: 1 });
  assert.equal((await call("/claim", { key, now: NOW + 5000 })).decision, "already_sent");
  const record = data.get("run");
  assert.deepEqual(Object.keys(record).sort(), ["attempts", "claimed_at", "key", "last_error", "parts_sent", "sent_at", "status", "updated_at"]);
  assert.equal((await new HypeJobDailyRunState(state, {}).fetch(new Request("https://x.internal/claim", { method: "GET" }))).status, 405);
});

// ---------- 15-16: failures and conflicts ----------
test("15: one failing source -> digest still built, items review_required, SYSTEM WATCH entry, no throw", async () => {
  const good = input({ sessions: ok({ records: [sess("J15")] }) });
  const src = { ...sources(good), payments: async () => { throw new Error("payments exploded"); } };
  const collected = await collectAll({}, NOW, src);
  assert.equal(collected.payments.ok, false);
  const d = buildDigest(collected, NOW);
  assert.match(sectionText(d, "jobs_today"), /review_required \(payment source unreachable\)/);
  assert.match(sectionText(d, "system"), /payment source unreachable/);
  assert.ok(d.sections.p0.some((i) => i.p0Class === 6 || i.p0Class === 5));
});

test("15b: all sources failed -> minimal digest that says unknown, never a silent 'none'", () => {
  const bad = (error) => ({ ok: false, error });
  const d = buildDigest({ sessions: bad("s"), payments: bad("p"), review: bad("r"), recovery: bad("c") }, NOW);
  assert.equal(d.all_sources_failed, true);
  assert.doesNotMatch(sectionText(d, "jobs_today"), /• none/);
  assert.match(sectionText(d, "jobs_today"), /unknown \(source unreachable\)/);
  assert.ok(d.sections.system.length >= 3);
});

test("16: unknown / conflicting vocabulary -> review_required with a reason, no silent resolution", () => {
  const records = [sess("J16a", { state: "weird_state" }), sess("J16b")];
  const d = buildDigest(input({ sessions: ok({ records }), payments: ok({ records: [pay("J16b", { status: "paid", ver: "??" })] }) }), NOW);
  const t = sectionText(d, "jobs_today");
  assert.match(t, /J16a.*status weird_state/);
  assert.match(sectionText(d, "jobs_today"), /Next: verify the job data in admin/);
  assert.match(t, /review_required \(unknown verification status/);
  const dup = buildDigest(input({ sessions: ok({ records: [sess("DUP"), sess("DUP")] }), payments: ok({ records: [pay("DUP")] }) }), NOW);
  assert.ok(dup.sections.jobs_today.every((i) => i.review_required));
});

// ---------- windows ----------
test("windows: today vs upcoming, midnight ICT, exact 72h edge, cancelled/completed excluded", () => {
  const records = [
    sess("W-today-late", { time: "23:30" }),
    sess("W-tomorrow-early", { date: "2026-10-01", time: "00:30" }),
    sess("W-edge-in", { date: "2026-10-03", time: "08:50" }),
    sess("W-edge-out", { date: "2026-10-03", time: "08:51" }),
    sess("W-edge-notime", { date: "2026-10-03", time: "" }),
    sess("W-far", { date: "2026-10-04" }),
    sess("W-cancelled", { state: "cancelled" }),
    sess("W-done", { state: "completed" }),
  ];
  const d = buildDigest(input({ sessions: ok({ records }), payments: ok({ records: records.map((r) => pay(r.session_id, { ref: `p_${r.session_id}` })) }) }), NOW);
  const today = sectionText(d, "jobs_today"); const up = sectionText(d, "upcoming");
  assert.match(today, /W-today-late/);
  assert.doesNotMatch(today, /W-tomorrow-early/);
  assert.match(up, /W-tomorrow-early/);
  assert.match(up, /W-edge-in/);
  assert.doesNotMatch(up, /W-edge-out/);
  assert.doesNotMatch(up, /W-far/);
  assert.match(up, /W-edge-notime.*review_required|W-edge-notime/);
  assert.ok(d.sections.upcoming.find((i) => i.ref === "W-edge-notime").review_required);
  for (const gone of ["W-cancelled", "W-done"]) assert.doesNotMatch(today + up, new RegExp(gone));
});

test("windows: job today without a start time is review_required and P0-eligible", () => {
  const d = buildDigest(input({ sessions: ok({ records: [sess("J-notime", { time: "" })] }), payments: ok({ records: [pay("J-notime")] }) }), NOW);
  assert.equal(d.sections.jobs_today[0].review_required, true);
  assert.equal(d.sections.p0[0].p0Class, 6);
});

test("job dates: datetime with offset is converted to ICT, never sliced as UTC", async () => {
  const e = { AIRTABLE_API_KEY: "k", AIRTABLE_BASE_ID: "b", AIRTABLE_HTTP: { fetch: async () => new Response(JSON.stringify({ records: [{ id: "r1", fields: { session_id: "S1", job_date: "2026-09-29T18:00:00.000Z", start_at: "2026-09-29T18:00:00.000Z" } }] }), { status: 200 }) } };
  const r = await collectSessions(e, NOW);
  assert.equal(r.records[0].job_date, "2026-09-30"); // 01:00 ICT on the 30th
});

// ---------- 17-19: format ----------
test("17: sections in required order and exactly one Next: per item", () => {
  const i = input({
    sessions: ok({ records: [sess("J17", { state: "pending" }), sess("J17u", { date: "2026-10-01" })] }),
    payments: ok({ records: [pay("J17", { status: "pending", ver: "pending" })] }),
    review: ok({ items: [{ proof_id: "p", payment_ref: "pay_r", session_id: "", customer_name: "คุณซี", evidence_amount_thb: 900 }] }),
    recovery: ok({ items: [{ case_ref: "RC-9", client_name: "คุณดี", domain: "booking", state: "open", sla_status: "overdue", picker_state: "no_candidates" }] }),
  });
  const out = text(buildDigest(i, NOW));
  const positions = SECTION_ORDER.map(([, title]) => out.indexOf(title));
  assert.ok(positions.every((p) => p >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  const withoutSummary = out.split("HYPE SUMMARY")[0];
  const bullets = (withoutSummary.match(/^• /gm) || []).length;
  const nexts = (withoutSummary.match(/^ {2}Next: /gm) || []).length;
  assert.equal(bullets, nexts);
  for (const line of withoutSummary.split("\n")) if (line.startsWith("• ")) assert.ok(!/Next:/.test(line));
});

test("17b: P0 is capped at 3 with an overflow count and items stay in their home sections", () => {
  const records = Array.from({ length: 5 }, (_, n) => sess(`P0-${n}`, { time: `1${n}:00` }));
  const d = buildDigest(input({ sessions: ok({ records }), payments: ok({ records: [] }) }), NOW);
  assert.equal(d.sections.p0.length, 3);
  assert.equal(d.p0_overflow, 2);
  assert.match(text(d), /\+2 more in sections below/);
  assert.equal(d.sections.jobs_today.length, 5);
  assert.ok(d.summary.length <= 3);
});

test("17c: HYPE SUMMARY only restates P0 facts", () => {
  const d = buildDigest(input({ sessions: ok({ records: [sess("J-sum")] }), payments: ok({ records: [] }) }), NOW);
  assert.deepEqual(d.summary, ["J-sum — ตรวจสถานะเงิน"]);
  assert.match(text(d), /วันนี้ควรเคลียร์ก่อน:\n1\) J-sum/);
});

test("18: long digest splits only at item boundaries, header on the first part only", () => {
  const records = Array.from({ length: 90 }, (_, n) => sess(`LONG-${String(n).padStart(3, "0")}`, { time: "10:00" }));
  const d = buildDigest(input({ sessions: ok({ records }), payments: ok({ records: records.map((r) => pay(r.session_id, { ref: `pay_${r.session_id}` })) }) }), NOW);
  const parts = formatDigest(d, 1500);
  assert.ok(parts.length > 1);
  assert.ok(parts[0].startsWith("🧾 <b>HYPE JOB DAILY — 2026-09-30</b>"));
  assert.equal(parts.filter((p) => p.includes("HYPE JOB DAILY")).length, 1);
  for (const part of parts) {
    assert.ok(part.length <= 1500, `part length ${part.length}`);
    assert.equal((part.match(/^• /gm) || []).length, (part.match(/^ {2}Next: /gm) || []).length, "no item split across parts");
  }
});

test("19: names with markup characters are escaped for HTML parse mode", () => {
  const d = buildDigest(input({ sessions: ok({ records: [sess("J19", { client: "คุณ <b>&Ad", model: "M<i>x" })] }), payments: ok({ records: [pay("J19")] }) }), NOW);
  const out = text(d);
  assert.ok(out.includes("คุณ &lt;b&gt;&amp;Ad"));
  assert.ok(out.includes("M&lt;i&gt;x"));
  assert.doesNotMatch(out, /<b>&Ad|<i>x/);
});

test("payment refs are masked in the digest", () => {
  const d = buildDigest(input({ sessions: ok({ records: [sess("J-mask")] }), payments: ok({ records: [pay("J-mask", { ref: "pay_secretref_1234567", status: "pending", ver: "pending" })] }) }), NOW);
  assert.doesNotMatch(text(d), /pay_secretref_1234567/);
  assert.match(text(d), /…4567/);
});

test("rate: digest never shows a model rate or quote (flag-only in v1, no quote source exists)", () => {
  const d = buildDigest(input({ sessions: ok({ records: [sess("J-amt")] }), payments: ok({ records: [pay("J-amt", { amount: 5000 })] }) }), NOW);
  assert.doesNotMatch(text(d), /\brate\b|quote/i);
});

test.after(() => { globalThis.fetch = realFetch; });
