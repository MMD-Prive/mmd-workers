import test from "node:test";
import assert from "node:assert/strict";

import { buildDigest, evaluateRateContext, PAYMENT_WATCH_CAP, SECTION_ORDER } from "./src/hype-job-daily/builder.js";
import { formatDigest, renderSections } from "./src/hype-job-daily/formatter.js";
import { collectModels, collectPayments, collectRefundPacks, collectSessions, normalizeRefundPack, paymentFieldMap, safeOwnerUrl } from "./src/hype-job-daily/sources.js";
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
test("4/5 base: with no refund pack and no model link in the sources, no URL is ever fabricated", () => {
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

test("rate: with no rate context in the sources, the digest never shows a model rate or quote", () => {
  const d = buildDigest(input({ sessions: ok({ records: [sess("J-amt")] }), payments: ok({ records: [pay("J-amt", { amount: 5000 })] }) }), NOW);
  assert.doesNotMatch(text(d), /\brate\b|quote/i);
});


// ---------- PAYMENT WATCH: cap / dedupe / zero slips / no old backlog ----------
const DAY = 86400000;
const proof = (id, o = {}) => ({ proof_id: `pf_${id}`, payment_ref: o.ref === undefined ? `pay_ref_${id}` : o.ref, session_id: o.session ?? "", customer_name: o.name ?? `ลูกค้า ${id}`, evidence_amount_thb: o.amount === undefined ? 1000 : o.amount, created_at: o.created ?? new Date(NOW - 1 * DAY).toISOString() });
const paymentBlocks = (d) => sectionText(d, "payment");
const bullets = (t) => (t.match(/^• /gm) || []).length;

test("PW1: slips of 0 THB are not listed and are counted in one backlog line", () => {
  const review = ok({ items: [proof("z1", { amount: 0 }), proof("z2", { amount: 0 }), proof("real", { amount: 1500 })] });
  const t = paymentBlocks(buildDigest(input({ review }), NOW));
  assert.match(t, /1,500 THB/);
  assert.doesNotMatch(t, /pay_ref_z|…z1|…z2|slip 0 THB/);
  assert.match(t, /not listed: 2 zero-amount slips/);
});

test("PW1b: an unknown slip amount (null) is kept, only a real 0 is dropped", () => {
  const t = paymentBlocks(buildDigest(input({ review: ok({ items: [proof("n1", { amount: null })] }) }), NOW));
  assert.match(t, /amount unknown/);
  assert.doesNotMatch(t, /not listed/);
});

test("PW2: old backlog is not dragged in (older than 3 days and not tied to a job in the window)", () => {
  const old = new Date(NOW - 10 * DAY).toISOString();
  const review = ok({ items: [proof("o1", { created: old }), proof("o2", { created: old }), proof("undated", { created: "" }), proof("fresh", { created: new Date(NOW - 2 * DAY).toISOString() })] });
  const d = buildDigest(input({ review }), NOW);
  const t = paymentBlocks(d);
  assert.match(t, /ลูกค้า fresh/);
  assert.doesNotMatch(t, /ลูกค้า o1|ลูกค้า o2|ลูกค้า undated/);
  assert.match(t, /not listed: 3 older\/undated unreviewed proofs/);
  assert.equal(d.payment_stats.old, 3);
});

test("PW2b: an old proof tied to a job in today's window is still listed", () => {
  const old = new Date(NOW - 20 * DAY).toISOString();
  const review = ok({ items: [proof("linked", { created: old, session: "JLINK" })] });
  const d = buildDigest(input({ sessions: ok({ records: [sess("JLINK")] }), payments: ok({ records: [] }), review }), NOW);
  assert.match(paymentBlocks(d), /ลูกค้า linked/);
  assert.match(sectionText(d, "jobs_today"), /awaiting review \(not paid\)/);
});

test("PW3: duplicate proofs for the same payment ref collapse into one item with a count", () => {
  const review = ok({ items: [
    proof("a", { ref: "pay_same_9999", created: new Date(NOW - 3 * 3600000).toISOString() }),
    proof("b", { ref: "pay_same_9999", created: new Date(NOW - 2 * 3600000).toISOString() }),
    proof("c", { ref: "pay_same_9999", created: new Date(NOW - 1 * 3600000).toISOString() }),
    proof("d", { ref: "pay_other_1111" }),
  ] });
  const t = paymentBlocks(buildDigest(input({ review }), NOW));
  assert.equal(bullets(t), 2);
  assert.match(t, /×3 proofs/);
  assert.equal((t.match(/…9999/g) || []).length, 1);
});

test("PW3b: duplicates without a payment ref dedupe on proof id", () => {
  const same = proof("dup", { ref: "" });
  const t = paymentBlocks(buildDigest(input({ review: ok({ items: [same, { ...same }] }) }), NOW));
  assert.equal(bullets(t), 1);
  assert.match(t, /×2 proofs/);
});

test("PW4: PAYMENT WATCH is capped, with an explicit '+N more' pointer and one Next per line", () => {
  const items = Array.from({ length: 20 }, (_, i) => proof(`c${String(i).padStart(2, "0")}`, { created: new Date(NOW - (i + 1) * 60000).toISOString() }));
  const d = buildDigest(input({ review: ok({ items }) }), NOW);
  const t = paymentBlocks(d);
  assert.equal(d.sections.payment.filter((i) => i.kind === "payment").length, PAYMENT_WATCH_CAP);
  assert.match(t, /\+12 more payment items not listed/);
  assert.match(t, /Next: open the payment review queue in admin/);
  assert.equal(bullets(t), (t.match(/^ {2}Next: /gm) || []).length);
  assert.ok(bullets(t) <= PAYMENT_WATCH_CAP + 2);
  assert.equal(d.payment_stats.overflow, 12);
});

test("PW4b: unpaid problems on today's jobs outrank unlinked proofs and survive the cap", () => {
  const items = Array.from({ length: 15 }, (_, i) => proof(`x${i}`));
  const d = buildDigest(input({ sessions: ok({ records: [sess("J-KEEP")] }), payments: ok({ records: [pay("J-KEEP", { status: "pending", ver: "pending" })] }), review: ok({ items }) }), NOW);
  assert.match(paymentBlocks(d), /J-KEEP — payment pending/);
  assert.match(paymentBlocks(d).split("\n")[0], /J-KEEP/);
});

test("PW5: a clean queue produces no backlog line and no overflow line", () => {
  const t = paymentBlocks(buildDigest(input({ review: ok({ items: [proof("solo")] }) }), NOW));
  assert.doesNotMatch(t, /not listed|more payment items/);
});

test("PW6: filtered proofs never affect a job's money state (0 THB slip does not make a job 'awaiting review')", () => {
  const review = ok({ items: [proof("zj", { session: "JZ", amount: 0 })] });
  const d = buildDigest(input({ sessions: ok({ records: [sess("JZ")] }), payments: ok({ records: [] }), review }), NOW);
  assert.match(sectionText(d, "jobs_today"), /no payment record/);
  assert.doesNotMatch(sectionText(d, "jobs_today"), /awaiting review/);
});


// ---------- 4: refund completed pack ----------
const esc = (u) => String(u).replace(/&/g, "&amp;");
const URL_OK = {
  customer_confirmation_url: "https://www.mmdbkk.com/refund-receipt/media?id=abc&sig=def",
  customer_job_confirm_url: "https://www.mmdbkk.com/sigil/confirm/job?t=cust-token",
  admin_job_url: "https://www.mmdbkk.com/internal/admin/jobs/J4R",
  model_job_app_url: "https://miniapp.line.me/2010864854-N34SgCqq/?intent=job_board&job_id=J4R",
};
const pack = (o = {}) => ({
  inbox_ref: o.inbox ?? "inbox_refund_0001", customer_name: o.name ?? "คุณเอ็ม", session_id: o.session ?? "J4R", job_id: o.job ?? "",
  receipt_uploaded: true, receipt_uploaded_at: o.at ?? new Date(NOW - 3600000).toISOString(), refund_amount_thb: o.amount === undefined ? 1500 : o.amount,
  urls: { ...URL_OK, ...(o.urls || {}) },
});

test("4: refund completed pack lists customer_confirmation_url, admin_job_url and model_job_app_url exactly as read", () => {
  const d = buildDigest({ ...input({ sessions: ok({ records: [sess("J4R")] }), payments: ok({ records: [pay("J4R")] }) }), refunds: ok({ items: [pack()] }) }, NOW);
  const t = sectionText(d, "payment");
  assert.match(t, /refund completed · คุณเอ็ม · 1,500 THB · J4R/);
  for (const [key, url] of Object.entries(URL_OK)) assert.ok(t.includes(`${key}: ${url}`) || t.includes(`${key}: ${esc(url)}`), key);
  assert.match(t, /send customer_job_confirm_url to the customer and model_job_app_url to the model manually \(HYPE never auto-sends\)/);
  assert.doesNotMatch(t, /review_required/);
  assert.equal(d.sections.p0.length, 0);
});

test("4b: incomplete refund pack -> unavailable + review_required, P0, and no URL is rebuilt", () => {
  const d = buildDigest({ ...input(), refunds: ok({ items: [pack({ urls: { model_job_app_url: "", customer_job_confirm_url: "" } })] }) }, NOW);
  const t = sectionText(d, "payment");
  assert.match(t, /review_required \(refund pack incomplete: customer_job_confirm_url, model_job_app_url\)/);
  assert.match(t, /model_job_app_url: unavailable/);
  assert.match(t, /customer_job_confirm_url: unavailable/);
  assert.match(t, /open Refund Ops and re-check the pack links/);
  assert.equal(d.sections.p0.length, 1);
  assert.ok((t.match(/https:\/\//g) || []).length === 2, "only the two URLs that were read are shown");
});

test("4c: a pack with no linked job does not expect job or model links", () => {
  const d = buildDigest({ ...input(), refunds: ok({ items: [pack({ session: "", job: "", urls: { customer_job_confirm_url: "", model_job_app_url: "" } })] }) }, NOW);
  const t = sectionText(d, "payment");
  assert.doesNotMatch(t, /model_job_app_url|customer_job_confirm_url|review_required/);
  assert.match(t, /check the pack in Refund Ops \(no job links to forward\)/);
});

test("4d: old packs are counted not listed, unless tied to a job in today's window; list is capped", () => {
  const old = new Date(NOW - 10 * 86400000).toISOString();
  const d1 = buildDigest({ ...input(), refunds: ok({ items: [pack({ at: old, session: "JX" })] }) }, NOW);
  assert.doesNotMatch(sectionText(d1, "payment"), /refund completed/);
  assert.match(sectionText(d1, "payment"), /1 older refund packs/);
  const d2 = buildDigest({ ...input({ sessions: ok({ records: [sess("JX")] }), payments: ok({ records: [pay("JX")] }) }), refunds: ok({ items: [pack({ at: old, session: "JX" })] }) }, NOW);
  assert.match(sectionText(d2, "payment"), /refund completed/);
  const many = [1, 2, 3, 4, 5].map((n) => pack({ inbox: `inbox_${n}_abcd`, session: `JR${n}` }));
  const d3 = buildDigest({ ...input(), refunds: ok({ items: many }) }, NOW);
  assert.equal((sectionText(d3, "payment").match(/refund completed/g) || []).length, 3);
  assert.match(sectionText(d3, "payment"), /2 more refund packs/);
});

test("4e: pack customer follows the same display rule (missing -> customer_review_required)", () => {
  const d = buildDigest({ ...input(), refunds: ok({ items: [pack({ name: "" })] }) }, NOW);
  assert.match(sectionText(d, "payment"), /refund completed · customer_review_required/);
});

test("4f: refund source failure -> SYSTEM WATCH review_required; source not collected -> no failure line", () => {
  const failed = buildDigest({ ...input(), refunds: { ok: false, error: "refund_read_failed" } }, NOW);
  assert.match(sectionText(failed, "system"), /refund pack source unreachable/);
  const notCollected = buildDigest(input(), NOW);
  assert.doesNotMatch(sectionText(notCollected, "system"), /refund pack|model connection/);
});

test("4g: safeOwnerUrl accepts only https project hosts and never repairs a bad URL", () => {
  assert.equal(safeOwnerUrl("https://www.mmdbkk.com/x?t=1"), "https://www.mmdbkk.com/x?t=1");
  assert.ok(safeOwnerUrl("https://miniapp.line.me/2010864854-N34SgCqq/?a=b"));
  for (const bad of ["http://www.mmdbkk.com/x", "https://evil.example/x", "https://mmdbkk.com.evil.example/x", "https://u:p@www.mmdbkk.com/x", "javascript:alert(1)", "www.mmdbkk.com/x", ""]) {
    assert.equal(safeOwnerUrl(bad), "", bad);
  }
});

test("4h: normalizeRefundPack never copies bank details or the private receipt key out of the payload", () => {
  const record = { fields: { inbox_id: "inbox_9", member_name: "คุณเอ็ม", payload_json: JSON.stringify({
    session_id: "J9", bank_name: "SECRET BANK", account_number: "1234567890", account_name_masked: "SECRET NAME", account_number_masked: "xxx7890",
    receipt_r2_key: "private/key/receipt.jpg", receipt_uploaded_at: "2026-09-30T08:00:00+07:00", owner_refund_amount: "2,000", owner_refund_currency: "THB",
    customer_receipt_url: URL_OK.customer_confirmation_url, admin_job_url: URL_OK.admin_job_url,
  }) } };
  const out = normalizeRefundPack(record);
  const dump = JSON.stringify(out);
  for (const secret of ["SECRET BANK", "1234567890", "SECRET NAME", "xxx7890", "private/key"]) assert.ok(!dump.includes(secret), secret);
  assert.equal(out.refund_amount_thb, 2000);
  assert.equal(out.receipt_uploaded, true);
  assert.equal(out.urls.admin_job_url, URL_OK.admin_job_url);
});

// ---------- 5: model not connected ----------
const mref = (id) => ({ status: "one", id });
const MODEL_ID = "recABCDEFGHIJKLMN1";
const withModel = (id, o = {}) => ({ ...sess(id, o), model_ref: o.ref ?? mref(MODEL_ID) });
const modelsOk = (connected) => ok({ records: { [MODEL_ID]: { connected } } });

test("5: model not connected + model_job_app_url available -> MODEL WATCH shows that URL, P0, owner action", () => {
  const d = buildDigest({ ...input({ sessions: ok({ records: [withModel("J5")] }), payments: ok({ records: [pay("J5")] }) }), models: modelsOk(false), refunds: ok({ items: [pack({ session: "J5" })] }) }, NOW);
  const t = sectionText(d, "model");
  assert.match(t, /Book EI — not connected \(no LINE link\) \(J5\)/);
  assert.ok(t.includes(`model_job_app_url: ${esc(URL_OK.model_job_app_url)}`) || t.includes(`model_job_app_url: ${URL_OK.model_job_app_url}`));
  assert.match(t, /send model_job_app_url to the model manually \(owner action\)/);
  assert.equal(d.sections.p0.length, 1);
  assert.match(d.sections.p0[0].text, /J5/);
});

test("5b: model not connected and no URL available -> 'unavailable', owner issues the LINE link, nothing fabricated", () => {
  const d = buildDigest({ ...input({ sessions: ok({ records: [withModel("J5b")] }), payments: ok({ records: [pay("J5b")] }) }), models: modelsOk(false) }, NOW);
  const t = sectionText(d, "model");
  assert.match(t, /model_job_app_url: unavailable/);
  assert.match(t, /issue a LINE activation link for this model/);
  assert.doesNotMatch(t, /https?:\/\//);
  assert.doesNotMatch(text(d), /https?:\/\//);
});

test("5c: a connected model adds no MODEL WATCH item; pending + not connected shows both facts in one item", () => {
  const conn = buildDigest({ ...input({ sessions: ok({ records: [withModel("J5c")] }), payments: ok({ records: [pay("J5c")] }) }), models: modelsOk(true) }, NOW);
  assert.equal(conn.sections.model.length, 0);
  const both = buildDigest({ ...input({ sessions: ok({ records: [withModel("J5d", { state: "pending" })] }), payments: ok({ records: [pay("J5d")] }) }), models: modelsOk(false) }, NOW);
  assert.equal(both.sections.model.length, 1);
  assert.match(both.sections.model[0].text, /confirmation pending; not connected/);
});

test("5d: ambiguous / invalid / unreadable assigned model -> review_required, never 'not connected'", () => {
  const cases = [
    [withModel("J5m", { ref: { status: "multiple", id: "" } }), modelsOk(false), /assigned model ambiguous/],
    [withModel("J5i", { ref: { status: "invalid", id: "" } }), modelsOk(false), /assigned model link invalid/],
    [withModel("J5u"), ok({ records: {} }), /assigned model record unreadable/],
  ];
  for (const [session, models, pattern] of cases) {
    const d = buildDigest({ ...input({ sessions: ok({ records: [session] }), payments: ok({ records: [pay(session.session_id)] }) }), models }, NOW);
    assert.match(sectionText(d, "jobs_today"), pattern);
    assert.equal(d.sections.model.length, 0);
    assert.equal(d.sections.p0.length, 1);
  }
});

test("5e: models source failure -> SYSTEM WATCH, and no connection claim is made either way", () => {
  const d = buildDigest({ ...input({ sessions: ok({ records: [withModel("J5f")] }), payments: ok({ records: [pay("J5f")] }) }), models: { ok: false, error: "models_read_failed" } }, NOW);
  assert.match(sectionText(d, "system"), /model connection source unreachable/);
  assert.equal(d.sections.model.length, 0);
  assert.doesNotMatch(sectionText(d, "jobs_today"), /not connected/);
});

// ---------- rate context ----------
test("rate: evaluateRateContext flags missing/higher quotes and stays silent otherwise", () => {
  assert.equal(evaluateRateContext(undefined), null);
  assert.equal(evaluateRateContext({}), null);
  assert.equal(evaluateRateContext({ rate_thb: 25000 }), null);
  assert.deepEqual(evaluateRateContext({ rate_thb: 8000 }), { reason: "no reliable prior quote" });
  assert.deepEqual(evaluateRateContext({ rate_thb: 8000, prior_quote_thb: 0 }), { reason: "no reliable prior quote" });
  assert.deepEqual(evaluateRateContext({ rate_thb: 9000, prior_quote_thb: 8000 }), { reason: "rate is above the earlier quote" });
  assert.equal(evaluateRateContext({ rate_thb: 8000, prior_quote_thb: 8000 }), null);
  assert.equal(evaluateRateContext({ rate_thb: 7000, prior_quote_thb: 8000 }), null);
});

test("rate: rate_review_required is an owner action in CUSTOMER WATCH and never prints a rate or sends anything", () => {
  const session = { ...sess("J-RATE"), rate_context: { rate_thb: 8000, prior_quote_thb: null } };
  const d = buildDigest(input({ sessions: ok({ records: [session] }), payments: ok({ records: [pay("J-RATE")] }) }), NOW);
  const t = sectionText(d, "customer");
  assert.match(t, /J-RATE — rate_review_required \(no reliable prior quote\)/);
  assert.match(t, /confirm the base rate with Per before replying to the customer \(HYPE never sends rates\)/);
  assert.doesNotMatch(text(d), /8,?000/);
});

// ---------- new collectors: read-only ----------
function fakeAirtable(body) {
  const calls = [];
  return {
    calls,
    env: {
      AIRTABLE_API_KEY: "key", AIRTABLE_BASE_ID: "appTEST",
      AIRTABLE_HTTP: { fetch: async (req) => { calls.push({ method: req.method, url: req.url }); return new Response(JSON.stringify(body), { status: 200 }); } },
    },
  };
}

test("12d: collectModels only GETs, asks for the LINE field only, and returns a boolean never the LINE id", async () => {
  const LINE = "U" + "a".repeat(32);
  const fake = fakeAirtable({ records: [{ id: MODEL_ID, fields: { line_user_id: LINE } }, { id: "recZZZZZZZZZZZZZZ2", fields: { line_user_id: "not-a-line-id" } }] });
  const out = await collectModels(fake.env, [MODEL_ID, "recZZZZZZZZZZZZZZ2", "bad id", MODEL_ID]);
  assert.ok(fake.calls.length === 1 && fake.calls.every((c) => c.method === "GET"));
  const url = new URL(fake.calls[0].url);
  assert.deepEqual(url.searchParams.getAll("fields[]"), ["line_user_id"]);
  assert.deepEqual(out.records, { [MODEL_ID]: { connected: true }, recZZZZZZZZZZZZZZ2: { connected: false } });
  assert.ok(!JSON.stringify(out).includes(LINE));
  assert.deepEqual(await collectModels(fake.env, []), { ok: true, records: {} });
  assert.equal((await collectModels({}, [MODEL_ID])).ok, false);
});

test("12e: collectRefundPacks only GETs the whitelisted inbox fields and keeps only completed packs", async () => {
  const done = { fields: { inbox_id: "i1", member_name: "คุณเอ็ม", payload_json: JSON.stringify({ receipt_r2_key: "k", session_id: "J1", account_number: "999", admin_job_url: URL_OK.admin_job_url }) } };
  const open = { fields: { inbox_id: "i2", payload_json: JSON.stringify({ session_id: "J2" }) } };
  const fake = fakeAirtable({ records: [done, open] });
  const out = await collectRefundPacks(fake.env);
  assert.ok(fake.calls.length === 1 && fake.calls[0].method === "GET");
  const url = new URL(fake.calls[0].url);
  assert.deepEqual(url.searchParams.getAll("fields[]").sort(), ["created_at", "inbox_id", "member_name", "payload_json"]);
  assert.match(url.searchParams.get("filterByFormula"), /refund_bank_detail/);
  assert.deepEqual(out.items.map((i) => i.inbox_ref), ["i1"]);
  assert.ok(!JSON.stringify(out).includes("999"));
  const failing = await collectRefundPacks({ ...fake.env, AIRTABLE_HTTP: { fetch: async () => new Response("{}", { status: 500 }) } });
  assert.deepEqual([failing.ok, failing.error], [false, "refund_read_failed"]);
});

test("12f: collectAll runs models after sessions, skips them when sessions fail, and leaves absent sources undefined", async () => {
  const seen = {};
  const base = { sessions: async () => ok({ records: [withModel("JA"), { ...sess("JB"), model_ref: { status: "multiple", id: "" } }] }), payments: async () => ok({ records: [] }), review: async () => ok({ items: [] }), recovery: async () => ok({ items: [] }) };
  const full = await collectAll({}, NOW, { ...base, models: async (_e, ids) => { seen.ids = ids; return modelsOk(true); }, refunds: async () => ok({ items: [] }) });
  assert.deepEqual(seen.ids, [MODEL_ID]);
  assert.equal(full.models.ok, true);
  assert.equal(full.refunds.ok, true);
  const bare = await collectAll({}, NOW, base);
  assert.equal(bare.models, undefined);
  assert.equal(bare.refunds, undefined);
  const down = await collectAll({}, NOW, { ...base, sessions: async () => ({ ok: false, error: "x" }), models: async () => { throw new Error("must not run"); }, refunds: async () => ok({ items: [] }) });
  assert.equal(down.models.ok, false);
  assert.equal(down.models.error, "models_skipped_sessions_unavailable");
});

test("12g: building a digest with refund packs, models and rate context does not mutate the input", () => {
  const i = { ...input({ sessions: ok({ records: [{ ...withModel("J12g"), rate_context: { rate_thb: 8000 } }] }), payments: ok({ records: [pay("J12g")] }) }), models: modelsOk(false), refunds: ok({ items: [pack({ session: "J12g" })] }) };
  const before = JSON.stringify(i);
  formatDigest(buildDigest(i, NOW));
  assert.equal(JSON.stringify(i), before);
});

test("17d: with the new items, sections stay in order and every bullet still has exactly one Next:", () => {
  const i = { ...input({ sessions: ok({ records: [withModel("J17n"), { ...sess("J17r"), rate_context: { rate_thb: 8000 } }] }), payments: ok({ records: [pay("J17n"), pay("J17r")] }) }), models: modelsOk(false), refunds: ok({ items: [pack({ session: "J17n", urls: { model_job_app_url: "" } })] }) };
  const out = text(buildDigest(i, NOW));
  const positions = SECTION_ORDER.map(([, title]) => out.indexOf(title));
  assert.ok(positions.every((p) => p >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  const body = out.split("HYPE SUMMARY")[0];
  assert.equal((body.match(/^• /gm) || []).length, (body.match(/^ {2}Next: /gm) || []).length);
});

test.after(() => { globalThis.fetch = realFetch; });
