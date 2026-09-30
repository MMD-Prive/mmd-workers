// HYPE_JOB_DAILY pure builder: collected data in, ranked digest items out.
// No I/O, no mutation of inputs. Anything that cannot be stated with confidence becomes review_required.
import { parsePerRenameDateSuffix } from "../per-rename-date-suffix.js";
import { addDays, clean, formatThb, ictDate, ictMinutes, maskRef, parseStartMinutes, token } from "./util.js";

export const SECTION_ORDER = Object.freeze([
  ["p0", "P0 NEEDS PER"],
  ["jobs_today", "JOBS TODAY"],
  ["upcoming", "UPCOMING 72H"],
  ["payment", "PAYMENT WATCH"],
  ["model", "MODEL WATCH"],
  ["customer", "CUSTOMER WATCH"],
  ["system", "SYSTEM WATCH"],
  ["summary", "HYPE SUMMARY"],
]);

export const P0_CAP = 3;
const HOURS_72_MS = 72 * 3600 * 1000;

const MODEL_READY = new Set(["confirmed", "accepted", "ready", "en_route", "travel", "on_the_way", "arrived", "working", "live"]);
const MODEL_PENDING = new Set(["pending", "new", "awaiting_model", "waiting", "requested", "awaiting_confirmation", "awaiting_confirm", "reconfirm_pending"]);
const MODEL_DECLINED = new Set(["declined", "rejected", "unavailable", "model_declined"]);
const JOB_HOLD = new Set(["hold", "paused", "blocked"]);
const JOB_DONE = new Set(["completed", "finished", "done", "closed"]);
const JOB_CANCELLED = new Set(["cancelled", "canceled"]);

const PAY_STATUS_SETTLED = new Set(["paid", "deposit_paid"]);
const PAY_STATUS_KNOWN = new Set(["pending", "paid", "deposit_paid", "tips_paid"]);
const VERIFY_KNOWN = new Set(["pending", "verified", "rejected"]);

export function classifyJobState(session) {
  const raw = session.state || session.status;
  const value = token(raw);
  if (!value) return { kind: "unknown", raw: "", reason: "session status missing" };
  if (JOB_CANCELLED.has(value)) return { kind: "cancelled", raw: value };
  if (JOB_DONE.has(value)) return { kind: "completed", raw: value };
  if (MODEL_DECLINED.has(value)) return { kind: "model_declined", raw: value };
  if (MODEL_PENDING.has(value)) return { kind: "model_pending", raw: value };
  if (JOB_HOLD.has(value)) return { kind: "hold", raw: value };
  if (MODEL_READY.has(value)) return { kind: "ready", raw: value };
  return { kind: "unknown", raw: value, reason: `unknown session status '${clean(value, 40)}'` };
}

export function classifyPaymentRecord(record) {
  const status = token(record.payment_status);
  const verification = token(record.verification_status);
  if (!status) return { state: "review_required", reason: "payment status missing" };
  if (!PAY_STATUS_KNOWN.has(status)) return { state: "review_required", reason: `unknown payment status '${clean(status, 40)}'` };
  if (status === "tips_paid") return { state: "tips" };
  if (verification && !VERIFY_KNOWN.has(verification)) return { state: "review_required", reason: `unknown verification status '${clean(verification, 40)}'` };
  if (verification === "rejected") return { state: "rejected" };
  if (PAY_STATUS_SETTLED.has(status)) return verification === "verified" ? { state: "verified" } : { state: "awaiting_verification" };
  return { state: "pending" };
}

function moneyForSession(sessionId, payments, review) {
  if (!payments?.ok) return { state: "review_required", reason: "payment source unreachable", lines: [] };
  const own = (payments.records || []).filter((p) => p.session_id === sessionId);
  const reviewItems = review?.ok
    ? (review.items || []).filter((r) => (r.session_id && r.session_id === sessionId) || (r.payment_ref && own.some((p) => p.payment_ref === r.payment_ref)))
    : [];
  const classified = own.map((record) => ({ record, ...classifyPaymentRecord(record) })).filter((c) => c.state !== "tips");
  const lines = classified.map((c) => {
    const amount = c.record.amount_thb === null ? "" : ` ${formatThb(c.record.amount_thb)}`;
    return `${maskRef(c.record.payment_ref) || "no-ref"} ${token(c.record.payment_status) || "?"}/${token(c.record.verification_status) || "no-verification"}${amount}`;
  });
  const has = (state) => classified.some((c) => c.state === state);
  if (has("verified")) return { state: "verified", lines, reviewItems };
  const bad = classified.find((c) => c.state === "review_required");
  if (bad) return { state: "review_required", reason: bad.reason, lines, reviewItems };
  if (has("rejected")) return { state: "rejected", lines, reviewItems };
  if (has("awaiting_verification") || reviewItems.length) return { state: "proof_review", lines, reviewItems };
  if (has("pending")) return { state: "pending", lines, reviewItems };
  return { state: "no_record", lines, reviewItems };
}

const MONEY_LABEL = {
  verified: "money verified",
  pending: "payment pending (unpaid)",
  proof_review: "proof/payment awaiting review (not paid)",
  rejected: "payment rejected",
  no_record: "no payment record",
};

function customerDisplay(name) {
  if (Array.isArray(name)) return name.length === 1 ? customerDisplay(name[0]) : null;
  const text = clean(name, 120);
  if (!text) return null;
  const parsed = parsePerRenameDateSuffix(text);
  return parsed?.matched && parsed.base_name && parsed.date_label ? `${parsed.base_name} ${parsed.date_label}` : text;
}

function fmtTime(minutes) {
  if (minutes === null || minutes === undefined) return "time unknown";
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function jobMs(date, minutes) {
  return Date.parse(`${date}T${fmtTime(minutes ?? 0)}:00+07:00`);
}

function item(fields) {
  return { p0Class: null, timeMs: Infinity, summaryTh: "", ...fields };
}

function windowFor(session, now) {
  const today = ictDate(now);
  const date = session.job_date;
  if (!date) return { window: "unparseable" };
  if (date === today) return { window: "today" };
  if (date < today) return { window: "past" };
  const minutes = parseStartMinutes(session.start_time);
  const boundaryDate = addDays(today, 3);
  if (date < boundaryDate) return { window: "upcoming", minutes };
  if (date > boundaryDate) return { window: "outside" };
  if (minutes === null) return { window: "unparseable_time" };
  return jobMs(date, minutes) <= now + HOURS_72_MS ? { window: "upcoming", minutes } : { window: "outside" };
}

export function buildDigest(input = {}, nowMs = Date.now()) {
  const { sessions, payments, review, recovery } = input;
  const today = ictDate(nowMs);
  const sec = { jobs_today: [], upcoming: [], payment: [], model: [], customer: [], system: [] };
  const failed = { sessions: !sessions?.ok, payments: !payments?.ok, review: !review?.ok, recovery: !recovery?.ok };
  const allFailed = Object.values(failed).every(Boolean);

  const sysFail = (label, source, detail) => sec.system.push(item({
    kind: "system", p0Class: 5,
    text: `review_required (${label}${detail ? `: ${clean(detail, 60)}` : ""}) — job impact: ${source}`,
    next: "check the source in admin and re-run once it is reachable",
    summaryTh: `ตรวจ ${label}`,
  }));
  if (failed.sessions) sysFail("job/session source unreachable", "jobs today/upcoming cannot be listed", sessions?.error);
  else if (sessions.truncated) sysFail("session list truncated", "some jobs may be missing", "page limit reached");
  if (failed.payments && !failed.sessions) sysFail("payment source unreachable", "job money state cannot be stated", payments?.error);
  if (failed.review) sysFail("payment review queue unreachable", "unreviewed proofs may be missing", review?.error);
  if (failed.recovery) sysFail("recovery queue unreachable", "recovery cases may be missing", recovery?.error);

  const counts = { jobs_today: 0, upcoming: 0 };
  const matchedReviewIds = new Set();
  if (sessions?.ok) {
    const seenIds = new Map();
    for (const s of sessions.records || []) seenIds.set(s.session_id, (seenIds.get(s.session_id) || 0) + 1);
    for (const session of sessions.records || []) {
      const ref = session.session_id || session.record_id || "unknown-job";
      const state = classifyJobState(session);
      if (state.kind === "cancelled" || state.kind === "completed") continue;
      const win = windowFor(session, nowMs);
      if (win.window === "past" || win.window === "outside") continue;
      const minutes = win.window === "today" ? parseStartMinutes(session.start_time) : win.minutes ?? null;
      const timeMs = session.job_date ? jobMs(session.job_date, minutes ?? 0) : Infinity;
      const reviewReasons = [];
      if (!session.session_id) reviewReasons.push("job reference missing");
      else if (seenIds.get(session.session_id) > 1) reviewReasons.push("duplicate job records");
      if (state.kind === "unknown") reviewReasons.push(state.reason);
      if (win.window === "unparseable") { sec.system.push(item({ kind: "system", p0Class: 6, timeMs: Infinity, text: `${ref} — review_required (job date unparseable)`, next: "verify the job date in admin", summaryTh: `${ref} — ตรวจวันที่งาน` })); continue; }
      if (win.window === "unparseable_time") reviewReasons.push("start time missing near the 72h boundary");
      if (win.window === "today" && minutes === null) reviewReasons.push("start time missing");

      const customer = customerDisplay(session.client_name);
      const money = moneyForSession(session.session_id, payments, review);
      for (const r of money.reviewItems || []) matchedReviewIds.add(r.proof_id || r.payment_ref);
      const isToday = win.window === "today";
      const home = isToday ? "jobs_today" : "upcoming";
      counts[home] += 1;

      const parts = [ref, customer || "customer_review_required", session.model_name || "model not assigned", `${fmtTime(minutes)}${isToday ? "" : ` ${session.job_date}`}`];
      const moneyText = money.state === "review_required" ? `review_required (${money.reason})` : MONEY_LABEL[money.state];
      const jobLine = [...parts, isToday ? `${moneyText}${money.lines?.length ? ` [${money.lines.join("; ")}]` : ""}` : "", `status ${state.raw || "unknown"}`].filter(Boolean).join(" · ");
      const review_required = reviewReasons.length > 0 || money.state === "review_required" || !customer;
      let next = "no action";
      let p0Class = null;
      let summaryTh = "";
      if (reviewReasons.length || (isToday && money.state === "review_required")) {
        next = "verify the job data in admin";
        if (isToday) { p0Class = 6; summaryTh = `${ref} — ตรวจข้อมูลที่ไม่ชัดเจน`; }
      } else if (isToday && ["no_record", "pending", "proof_review", "rejected"].includes(money.state)) {
        next = money.state === "proof_review" ? "review the payment proof" : money.state === "rejected" ? "decide on the rejected payment" : "check the payment for this job";
        p0Class = 1; summaryTh = `${ref} — ตรวจสถานะเงิน`;
      } else if (isToday && (state.kind === "model_pending" || state.kind === "model_declined")) {
        next = state.kind === "model_declined" ? "decide on the declined model" : "confirm with the model";
        p0Class = 2; summaryTh = `${ref} — ยืนยันโมเดล`;
      } else if (state.kind === "hold") next = "review why the job is on hold";
      else if (!customer) { next = "confirm customer identity"; if (isToday) { p0Class = 6; summaryTh = `${ref} — ยืนยันตัวตนลูกค้า`; } }
      const jobItem = item({ kind: "job", ref, timeMs, p0Class, text: jobLine, next, summaryTh, review_required });
      sec[home].push(jobItem);

      if (!customer) sec.customer.push(item({ kind: "customer", ref, timeMs, text: `${ref} — customer_review_required (${clean(Array.isArray(session.client_name) ? "multiple customer matches" : "customer name missing", 60)})`, next: "confirm customer identity" }));
      if (state.kind === "model_pending" || state.kind === "model_declined") {
        sec.model.push(item({ kind: "model", ref, timeMs, text: `${session.model_name || "model not assigned"} — ${state.kind === "model_declined" ? "declined/unavailable" : "confirmation pending"} (${ref})`, next: state.kind === "model_declined" ? "decide on the declined model (owner decision)" : "confirm with the model" }));
      }
      const payProblem = isToday ? ["no_record", "pending", "rejected", "review_required"].includes(money.state) : ["rejected", "review_required"].includes(money.state);
      const proofNoQueue = money.state === "proof_review" && !(money.reviewItems || []).length;
      if (payProblem || proofNoQueue) {
        sec.payment.push(item({ kind: "payment", ref, timeMs, text: `${ref} — ${money.state === "review_required" ? `review_required (${money.reason})` : MONEY_LABEL[money.state]}${money.lines?.length ? ` [${money.lines.join("; ")}]` : ""}`, next: money.state === "review_required" ? "verify the payment in admin" : money.state === "proof_review" ? "review the payment proof" : "check the payment for this job" }));
      }
    }
  }

  if (review?.ok) {
    for (const r of review.items || []) {
      const amount = r.evidence_amount_thb === null ? "amount unknown" : `slip ${formatThb(r.evidence_amount_thb)} (unverified)`;
      sec.payment.push(item({ kind: "payment", ref: r.payment_ref, text: `proof awaiting review (not paid) · ${clean(r.customer_name, 60) || "customer_review_required"} · ${amount}${r.payment_ref ? ` · ${maskRef(r.payment_ref)}` : ""}${r.session_id ? ` · ${r.session_id}` : ""}`, next: "review the payment proof" }));
    }
  }

  if (recovery?.ok) {
    for (const c of recovery.items || []) {
      const overdue = token(c.sla_status) === "overdue";
      const pickerAttention = ["authority_unavailable", "no_candidates", "waiting_reselection"].includes(token(c.picker_state));
      const parts = [`case ${c.case_ref}`, c.client_name || "customer_review_required", c.domain, c.state && `state ${c.state}`, c.picker_state && c.picker_state !== "other" ? `picker ${c.picker_state}` : "", c.sla_status && `sla ${c.sla_status}`].filter(Boolean);
      sec.customer.push(item({ kind: "recovery", ref: c.case_ref, p0Class: overdue || pickerAttention ? 4 : null, text: parts.join(" · "), next: `review recovery case ${c.case_ref} and decide`, summaryTh: `เคส ${c.case_ref} — ตัดสินใจเคส recovery` }));
    }
  }

  for (const key of Object.keys(sec)) sec[key].sort((a, b) => a.timeMs - b.timeMs);

  const all = [...sec.jobs_today, ...sec.upcoming, ...sec.payment, ...sec.model, ...sec.customer, ...sec.system];
  const p0Pool = all.filter((i) => i.p0Class).sort((a, b) => a.timeMs - b.timeMs || a.p0Class - b.p0Class);
  const p0 = p0Pool.slice(0, P0_CAP);
  const overflow = Math.max(0, p0Pool.length - p0.length);
  const summary = p0.filter((i) => i.summaryTh).map((i) => i.summaryTh).slice(0, 3);

  return {
    date_ict: today,
    generated_minutes_ict: ictMinutes(nowMs),
    all_sources_failed: allFailed,
    failed,
    counts,
    sections: { p0, ...sec },
    p0_overflow: overflow,
    summary,
  };
}
