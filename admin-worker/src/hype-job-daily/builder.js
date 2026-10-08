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
export const PAYMENT_WATCH_CAP = 8;
export const PAYMENT_REVIEW_MAX_AGE_DAYS = 3;
export const REFUND_PACK_MAX_AGE_DAYS = 3;
export const REFUND_PACK_CAP = 3;
export const RATE_CHECK_CEILING_THB = 20000;
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

// Rate context rule. The digest never prints a rate or quote; it only flags what Per must confirm.
// `rateContext` is supplied by a source ({ rate_thb, prior_quote_thb }). No canonical rate/quote source exists in the
// repo yet, so default sources supply none and this stays silent until one does (see HYPE_JOB_DAILY report).
// - rate over 20,000 THB: not covered by the single-model-name rule, so no flag from here.
// - rate not over 20,000 THB and no reliable prior quote: rate_review_required.
// - rate above what Per already quoted: rate_review_required (never quote higher than the earlier quote).
export function evaluateRateContext(rateContext) {
  if (!rateContext || typeof rateContext !== "object") return null;
  const rate = Number(rateContext.rate_thb);
  if (!Number.isFinite(rate) || rate <= 0 || rate > RATE_CHECK_CEILING_THB) return null;
  const prior = Number(rateContext.prior_quote_thb);
  if (!Number.isFinite(prior) || prior <= 0) return { reason: "no reliable prior quote" };
  if (rate > prior) return { reason: "rate is above the earlier quote" };
  return null;
}

// Refund completed pack -> one PAYMENT WATCH item. URLs arrive already validated by the collector and are shown
// exactly as read; a missing URL is shown as "unavailable" and makes the pack review_required (never rebuilt here).
export function buildRefundItem(pack, timeMs = Infinity) {
  const customer = customerDisplay(pack.customer_name) || "customer_review_required";
  const linked = Boolean(pack.session_id || pack.job_id);
  const expected = ["customer_confirmation_url", "admin_job_url", ...(linked ? ["customer_job_confirm_url", "model_job_app_url"] : [])];
  const missing = expected.filter((key) => !pack.urls?.[key]);
  const amount = pack.refund_amount_thb ? ` · ${formatThb(pack.refund_amount_thb)}` : "";
  const head = `refund completed · ${customer}${amount}${pack.session_id ? ` · ${pack.session_id}` : ""}${pack.inbox_ref ? ` · ${maskRef(pack.inbox_ref)}` : ""}`;
  const flag = missing.length ? ` · review_required (refund pack incomplete: ${missing.join(", ")})` : "";
  const lines = expected.map((key) => `\n    ${key}: ${pack.urls?.[key] || "unavailable"}`).join("");
  const next = missing.length
    ? "open Refund Ops and re-check the pack links before sending anything"
    : linked ? "send customer_job_confirm_url to the customer and model_job_app_url to the model manually (HYPE never auto-sends)"
    : "check the pack in Refund Ops (no job links to forward)";
  return item({
    kind: "refund", ref: pack.inbox_ref, timeMs, p0Class: missing.length ? 3 : null,
    text: `${head}${flag}${lines}`, next,
    summaryTh: missing.length ? `ตรวจ refund pack ${maskRef(pack.inbox_ref)} — ลิงก์ไม่ครบ` : "",
  });
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

// Payment review queue -> digest-safe list.
// - drops 0 THB slips (no evidence of money)
// - drops backlog: proofs that are neither tied to a job in the digest windows nor created recently
// - dedupes by payment ref (or proof id), keeping the newest and counting duplicates
// Counts of what was left out are returned so the digest can say so instead of silently hiding them.
export function prepareReviewItems(review, nowMs, windowSessionIds = new Set()) {
  if (!review?.ok) return { ok: false, items: [], stats: { zero: 0, old: 0, duplicates: 0 } };
  const cutoff = nowMs - PAYMENT_REVIEW_MAX_AGE_DAYS * 86400000;
  const stats = { zero: 0, old: 0, duplicates: 0 };
  const byKey = new Map();
  for (const r of review.items || []) {
    const amt = r.evidence_amount_thb;
    if (amt !== null && amt !== undefined && amt !== "" && Number(amt) === 0) { stats.zero += 1; continue; } // unknown (null) is kept; only a real 0 is dropped
    const linked = Boolean(r.session_id && windowSessionIds.has(r.session_id));
    const created = Date.parse(r.created_at || "");
    if (!linked && !(Number.isFinite(created) && created >= cutoff)) { stats.old += 1; continue; }
    const key = r.payment_ref || r.proof_id || `${r.customer_name}|${r.evidence_amount_thb}|${r.session_id}`;
    const prev = byKey.get(key);
    if (!prev) { byKey.set(key, { ...r, linked, count: 1, createdMs: Number.isFinite(created) ? created : 0 }); continue; }
    stats.duplicates += 1;
    prev.count += 1;
    if ((Number.isFinite(created) ? created : 0) > prev.createdMs) Object.assign(prev, { ...r, linked: prev.linked || linked, count: prev.count, createdMs: Number.isFinite(created) ? created : 0 });
  }
  return { ok: true, items: [...byKey.values()].sort((a, b) => b.createdMs - a.createdMs), stats };
}

export function buildDigest(input = {}, nowMs = Date.now()) {
  const { sessions, payments, review, recovery, models, refunds } = input;
  const today = ictDate(nowMs);
  const sec = { jobs_today: [], upcoming: [], payment: [], model: [], customer: [], system: [] };
  const failed = { sessions: !sessions?.ok, payments: !payments?.ok, review: !review?.ok, recovery: !recovery?.ok };
  const allFailed = Object.values(failed).every(Boolean);
  // Optional sources: undefined means "not collected" (not a failure, not a clean bill of health).
  failed.models = models !== undefined && !models?.ok;
  failed.refunds = refunds !== undefined && !refunds?.ok;

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
  if (failed.models && !failed.sessions) sysFail("model connection source unreachable", "model LINE connection cannot be checked", models?.error);
  if (failed.refunds) sysFail("refund pack source unreachable", "refund completed packs may be missing", refunds?.error);

  const counts = { jobs_today: 0, upcoming: 0 };
  const windowIds = new Set();
  const jobTimeById = new Map();
  if (sessions?.ok) {
    for (const s of sessions.records || []) {
      const k = classifyJobState(s).kind;
      if (k === "cancelled" || k === "completed" || !s.session_id) continue;
      const w = windowFor(s, nowMs).window;
      if (w === "today" || w === "upcoming" || w === "unparseable_time") windowIds.add(s.session_id);
    }
  }
  const prepared = prepareReviewItems(review, nowMs, windowIds);
  const reviewForMoney = prepared.ok ? { ok: true, items: prepared.items } : review;
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
      // Assigned Model link + canonical connection state (read-only). Never picks one of several links.
      let modelConn = "unchecked";
      const mref = session.model_ref;
      if (mref && mref.status === "multiple") reviewReasons.push("assigned model ambiguous (multiple links)");
      else if (mref && mref.status === "invalid") reviewReasons.push("assigned model link invalid");
      else if (mref && mref.status === "none" && !session.model_name) reviewReasons.push("assigned model missing");
      else if (mref && mref.status === "one" && models?.ok) {
        const found = models.records?.[mref.id];
        if (!found) { reviewReasons.push("assigned model record unreadable"); modelConn = "unreadable"; }
        else modelConn = found.connected ? "connected" : "not_connected";
      }
      const modelNotConnected = modelConn === "not_connected";
      // model_job_app_url is only ever taken verbatim from a refund pack for this same session. Never built here.
      const packModelUrl = refunds?.ok && session.session_id
        ? ((refunds.items || []).find((pack) => pack.session_id === session.session_id && pack.urls?.model_job_app_url)?.urls.model_job_app_url || "")
        : "";
      if (win.window === "unparseable") { sec.system.push(item({ kind: "system", p0Class: 6, timeMs: Infinity, text: `${ref} — review_required (job date unparseable)`, next: "verify the job date in admin", summaryTh: `${ref} — ตรวจวันที่งาน` })); continue; }
      if (win.window === "unparseable_time") reviewReasons.push("start time missing near the 72h boundary");
      if (win.window === "today" && minutes === null) reviewReasons.push("start time missing");

      const customer = customerDisplay(session.client_name);
      const money = moneyForSession(session.session_id, payments, reviewForMoney);
      const isToday = win.window === "today";
      const home = isToday ? "jobs_today" : "upcoming";
      counts[home] += 1;

      const parts = [ref, customer || "customer_review_required", session.model_name || "model not assigned", `${fmtTime(minutes)}${isToday ? "" : ` ${session.job_date}`}`];
      const moneyText = money.state === "review_required" ? `review_required (${money.reason})` : MONEY_LABEL[money.state];
      const jobLine = [...parts, isToday ? `${moneyText}${money.lines?.length ? ` [${money.lines.join("; ")}]` : ""}` : "", reviewReasons.length ? `review_required (${reviewReasons.map((r) => clean(r, 60)).join("; ")})` : "", `status ${state.raw || "unknown"}`].filter(Boolean).join(" · ");
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
      } else if (isToday && (state.kind === "model_pending" || state.kind === "model_declined" || modelNotConnected)) {
        next = state.kind === "model_declined" ? "decide on the declined model"
          : modelNotConnected ? (packModelUrl ? "send model_job_app_url to the model manually and confirm" : "issue a LINE activation link for the model (Calendar) and confirm")
          : "confirm with the model";
        p0Class = 2; summaryTh = modelNotConnected && state.kind !== "model_pending" ? `${ref} — โมเดลยังไม่เชื่อมต่อ LINE` : `${ref} — ยืนยันโมเดล`;
      } else if (state.kind === "hold") next = "review why the job is on hold";
      else if (!customer) { next = "confirm customer identity"; if (isToday) { p0Class = 6; summaryTh = `${ref} — ยืนยันตัวตนลูกค้า`; } }
      if (session.session_id) jobTimeById.set(session.session_id, timeMs);
      const jobItem = item({ kind: "job", ref, timeMs, p0Class, text: jobLine, next, summaryTh, review_required });
      sec[home].push(jobItem);

      if (!customer) sec.customer.push(item({ kind: "customer", ref, timeMs, text: `${ref} — customer_review_required (${clean(Array.isArray(session.client_name) ? "multiple customer matches" : "customer name missing", 60)})`, next: "confirm customer identity" }));
      if (state.kind === "model_pending" || state.kind === "model_declined" || modelNotConnected) {
        const issues = [state.kind === "model_declined" ? "declined/unavailable" : state.kind === "model_pending" ? "confirmation pending" : "", modelNotConnected ? "not connected (no LINE link)" : ""].filter(Boolean).join("; ");
        const urlLine = modelNotConnected ? `\n    model_job_app_url: ${packModelUrl || "unavailable"}` : "";
        const modelNext = state.kind === "model_declined" ? "decide on the declined model (owner decision)"
          : modelNotConnected ? (packModelUrl ? "send model_job_app_url to the model manually (owner action)" : "issue a LINE activation link for this model (Calendar: สร้าง LINE link), then send it manually")
          : "confirm with the model";
        sec.model.push(item({ kind: "model", ref, timeMs, text: `${session.model_name || "model not assigned"} — ${issues} (${ref})${urlLine}`, next: modelNext }));
      }
      const rate = evaluateRateContext(session.rate_context);
      if (rate) sec.customer.push(item({ kind: "rate", ref, timeMs, text: `${ref} — rate_review_required (${rate.reason})`, next: "confirm the base rate with Per before replying to the customer (HYPE never sends rates)" }));
      const payProblem = isToday ? ["no_record", "pending", "rejected", "review_required"].includes(money.state) : ["rejected", "review_required"].includes(money.state);
      const proofNoQueue = money.state === "proof_review" && !(money.reviewItems || []).length;
      if (payProblem || proofNoQueue) {
        sec.payment.push(item({ kind: "payment", ref, timeMs, text: `${ref} — ${money.state === "review_required" ? `review_required (${money.reason})` : MONEY_LABEL[money.state]}${money.lines?.length ? ` [${money.lines.join("; ")}]` : ""}`, next: money.state === "review_required" ? "verify the payment in admin" : money.state === "proof_review" ? "review the payment proof" : "check the payment for this job" }));
      }
    }
  }

  if (prepared.ok) {
    for (const r of prepared.items) {
      const amount = r.evidence_amount_thb === null ? "amount unknown" : `slip ${formatThb(r.evidence_amount_thb)} (unverified)`;
      const dup = r.count > 1 ? ` · ×${r.count} proofs` : "";
      sec.payment.push(item({ kind: "payment", ref: r.payment_ref, timeMs: jobTimeById.get(r.session_id) ?? Infinity, text: `proof awaiting review (not paid) · ${clean(r.customer_name, 60) || "customer_review_required"} · ${amount}${dup}${r.payment_ref ? ` · ${maskRef(r.payment_ref)}` : ""}${r.session_id ? ` · ${r.session_id}` : ""}`, next: "review the payment proof" }));
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

  const refundItems = [];
  const refundStats = { old: 0, overflow: 0 };
  if (refunds?.ok) {
    const cutoff = nowMs - REFUND_PACK_MAX_AGE_DAYS * 86400000;
    const recent = [];
    for (const pack of refunds.items || []) {
      const linked = Boolean(pack.session_id && windowIds.has(pack.session_id));
      const at = Date.parse(pack.receipt_uploaded_at || "");
      if (!linked && !(Number.isFinite(at) && at >= cutoff)) { refundStats.old += 1; continue; }
      recent.push({ pack, at: Number.isFinite(at) ? at : 0 });
    }
    recent.sort((a, b) => b.at - a.at);
    refundStats.overflow = Math.max(0, recent.length - REFUND_PACK_CAP);
    for (const { pack } of recent.slice(0, REFUND_PACK_CAP)) refundItems.push(buildRefundItem(pack, jobTimeById.get(pack.session_id) ?? Infinity));
  }

  for (const key of Object.keys(sec)) sec[key].sort((a, b) => a.timeMs - b.timeMs);

  // PAYMENT WATCH stays short: cap the list, then say plainly what was left out.
  const paymentOverflow = Math.max(0, sec.payment.length - PAYMENT_WATCH_CAP);
  sec.payment = sec.payment.slice(0, PAYMENT_WATCH_CAP);
  sec.payment.push(...refundItems);
  if (paymentOverflow > 0) sec.payment.push(item({ kind: "payment_more", text: `+${paymentOverflow} more payment items not listed`, next: "open the payment review queue in admin" }));
  const left = prepared.ok ? prepared.stats : { zero: 0, old: 0, duplicates: 0 };
  if (left.old > 0 || left.zero > 0 || refundStats.old > 0 || refundStats.overflow > 0) {
    const bits = [
      left.old > 0 ? `${left.old} older/undated unreviewed proofs` : "",
      left.zero > 0 ? `${left.zero} zero-amount slips` : "",
      refundStats.old > 0 ? `${refundStats.old} older refund packs` : "",
      refundStats.overflow > 0 ? `${refundStats.overflow} more refund packs` : "",
    ].filter(Boolean);
    sec.payment.push(item({ kind: "payment_backlog", text: `not listed: ${bits.join(" and ")}`, next: "clear the payment review queue in admin when convenient" }));
  }

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
    payment_stats: { ...(prepared.ok ? prepared.stats : {}), overflow: paymentOverflow, refund_old: refundStats.old, refund_overflow: refundStats.overflow },
    summary,
  };
}
