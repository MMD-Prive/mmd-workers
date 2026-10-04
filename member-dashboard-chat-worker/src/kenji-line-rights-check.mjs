import { getLineOwnerTakeoverState, requestKenjiRuntimeStatus } from "./index.js";
import { resolveKenjiLineContinuity, writeKenjiLineMatrixTurn } from "./kenji-line-continuity-runtime.mjs";
import { recordDeliveredKenjiLineReply } from "./kenji-line-conversation-history.mjs";
import { isPrivateInterestCommand, renderPrivateInterest } from "./kenji-private-interest.mjs";

const AUTHORITY = "my_mmd_entitlement_resolver_v1";
const POINTS_AUTHORITY = "canonical_paid_points_source_guard_v1";
const clean = value => String(value ?? "").trim();
const enabled = value => /^(true|1|yes|on)$/i.test(clean(value));
const LEVELS = { private_standard: "Standard", private_premium: "Premium", vip: "VIP", svip: "SVIP", black_card: "Black Card" };

export function isRightsCommand(message = "") {
  // LINE text can carry invisible paste separators (observed U+200B after
  // เช็กสิทธิ์). Normalize only for command matching; preserve intake text.
  const value = clean(message).normalize("NFKC").replace(/[\u200B\uFEFF]/g, "").trim();
  return /^(?:ขอ)?(?:เช็ก|เช็ค)\s*สิท(?:ธิ์|ธ์)(?:สมาชิก)?(?:ของ(?:ผม|ฉัน|หนู))?(?:หน่อย|ให้หน่อย)?(?:ครับ|ค่ะ|คะ|นะ)?[.!?]*$/.test(value);
}

export function isLineRightsCheck(event = {}) {
  if (event.source?.type !== "user" || event.type !== "message" || event.message?.type !== "text") return false;
  const value = clean(event.message.text).normalize("NFKC");
  return isRightsCommand(value)
    || /^(?:ขอ)?ต่ออายุ(?:สมาชิก)?(?:ครับ|ค่ะ|คะ|นะ)?$/.test(value);
}

async function hash(value) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map(x => x.toString(16).padStart(2, "0")).join("");
}
async function claim(env, key) {
  if (!env.KENJI_MODEL_DEDUPE?.idFromName || !env.KENJI_MODEL_DEDUPE?.get) return null;
  const stub = env.KENJI_MODEL_DEDUPE.get(env.KENJI_MODEL_DEDUPE.idFromName("kenji-line-rights-check-v1"));
  const send = async body => {
    const response = await stub.fetch("https://kenji-model-dedupe.internal/campaign-lead/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key, ...body }), signal: AbortSignal.timeout(2000) });
    return response.ok ? response.json() : null;
  };
  const result = await send({ action: "claim" });
  if (result?.ok !== true || result.claimed !== true) return null;
  // Reserve for 24h before side effects. An ambiguous LINE delivery is never
  // retried; the next distinct customer message may request a fresh check.
  const committed = await send({ action: "commit", claim_token: result.claim_token });
  return committed?.committed === true ? { key } : null;
}

function date(value) {
  const raw = clean(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(Date.parse(raw)) || new Date(raw).toISOString().slice(0, 10) !== raw) return "";
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" }).format(new Date(`${raw}T12:00:00Z`));
}

export function renderLineRightsCheck(truth = {}) {
  const missing = [];
  const verified = truth.ok === true && truth.authority === AUTHORITY && truth.identity_status === "resolved";
  const m = truth.former_private_membership || truth.membership || {};
  const lines = [];
  const status = { active: "ใช้งานได้", expiring_soon: "ใช้งานได้", grace: "อยู่ในช่วง Grace", expired: "หมดอายุแล้ว", blocked: "ระงับการใช้งาน", revoked: "ยกเลิกสิทธิ์แล้ว" }[m.lifecycle];
  if (verified && LEVELS[m.level] && status) {
    lines.push(`สมาชิก ${LEVELS[m.level]} · ${truth.membership?.member_blocked ? "ระงับการใช้งาน" : status}`);
    const expiry = date(m.expire_at);
    if (expiry) lines.push(`รอบสิทธิ์ใช้ถึง ${expiry}`);
    else { missing.push("canonical_expiry"); lines.push("วันหมดอายุยังรอตรวจครับ"); }
  } else { missing.push("canonical_identity_membership"); lines.push("สถานะสมาชิกยังตรวจยืนยันไม่ครบครับ"); }
  if (verified && !truth.membership?.member_blocked && ["active", "expiring_soon"].includes(truth.membership?.lifecycle)) {
    if (truth.membership.public_service_access === true) lines.push("สิทธิ์ Public Service: ใช้งานได้");
    const envelope = { standard: "Standard", premium: "Premium", vip: "VIP", svip: "SVIP", black_card: "Black Card" }[truth.membership.private_visibility_envelope];
    if (envelope) lines.push(`สิทธิ์ดู Private: ${envelope}`);
  }
  const coupon = truth.coupon || {};
  if (verified && !truth.membership?.member_blocked && coupon.authority === "canonical_care_back_wallet_v1") {
    if (coupon.status === "ready" && date(coupon.expires_at) && Date.parse(coupon.expires_at) > Date.now()) {
      const rate = Number(coupon.approved_discount_percent);
      lines.push(`คูปอง CARE BACK: พร้อมใช้ 1 ครั้ง · ใช้ถึง ${date(coupon.expires_at)}${rate > 0 && rate <= 10 ? ` · ส่วนลดที่อนุมัติ ${rate}%` : " · อัตราส่วนลดยังรอเปอร์ตรวจตามงาน"}`);
    } else if (["used", "expired", "revoked", "invalid"].includes(coupon.status)) {
      lines.push(`คูปอง CARE BACK: ${{ used: "ใช้แล้ว", expired: "หมดอายุแล้ว", revoked: "ยกเลิกแล้ว", invalid: "ยังใช้ไม่ได้" }[coupon.status]}`);
    } else lines.push("คูปอง CARE BACK ยังรอตรวจคำอวยพรและสิทธิ์ครับ");
  } else lines.push("คูปอง CARE BACK ยังรอเปอร์ตรวจครับ");
  const promotion = truth.promotion || {};
  const currentPackage = { private_standard: "standard", private_premium: "premium" }[m.level];
  if (verified && !truth.membership?.member_blocked && ["active", "expiring_soon", "grace", "expired"].includes(m.lifecycle) && promotion.authority === "owner_approved_october_renewal_2026_v1" && promotion.status === "conditional_eligible" && promotion.package_code === currentPackage && promotion.requires_verified_payment === true && Date.parse(promotion.ends_before) > Date.now()) {
    if (promotion.total_years === 2 && promotion.base_years === 1 && promotion.promotion_years === 1) {
      const start = promotion.starts_from === "existing_expiry" ? "นับต่อจากวันหมดอายุเดิม" : "นับจากวันต่ออายุที่ตรวจชำระแล้ว";
      lines.push(`โปรต่ออายุ ${promotion.package_code === "premium" ? "Premium" : "Standard"}: รวม 2 ปี (สิทธิ์หลัก 1 ปี + โปร 1 ปี) · ${start} เมื่อชำระตามเงื่อนไขก่อน ${date(promotion.ends_before)} และผ่านการตรวจชำระครับ ยังไม่เพิ่มสิทธิ์จากการเช็กนี้`);
      if (promotion.checkout_status !== "ready") lines.push("ให้เปอร์ตรวจยอดและรายการชำระให้ตรงโปรนี้ก่อนโอนครับ");
    }
    else lines.push("โปรต่ออายุยังรอเปอร์ตรวจเงื่อนไขครับ");
  } else if (verified && promotion.authority === "owner_approved_october_renewal_2026_v1" && promotion.status === "not_applicable") {
    lines.push("โปรต่ออายุ Standard/Premium รอบนี้ไม่เข้าเงื่อนไขบัญชีนี้ครับ สิทธิ์เดิมคงเดิม");
  } else lines.push("โปรที่ใช้ได้กับบัญชีนี้ยังรอเปอร์ตรวจครับ");
  const points = truth.points;
  if (verified && points?.status === "verified" && points.authority === POINTS_AUTHORITY && Number.isSafeInteger(points.active_points) && points.active_points >= 0) {
    lines.push(`แต้มที่ยืนยันและใช้ได้: ${points.active_points.toLocaleString("th-TH")} Points`);
  } else { missing.push("canonical_paid_points"); lines.push("แต้มที่ใช้ได้ยังรอตรวจครับ"); }
  const quote = truth.renewal || {};
  const protectedTier = ["vip", "svip", "black_card"].includes(m.level);
  if (verified && date(m.expire_at) && ["active", "expiring_soon", "expired", "grace"].includes(m.lifecycle) && !truth.membership?.member_blocked && !protectedTier && quote.status === "ready" && quote.history_status === "verified" && quote.discount_verified === true &&
    quote.package_code === ({ private_standard: "standard", private_premium: "premium" }[m.level]) && Number.isFinite(quote.amount_thb) && quote.amount_thb > 0 && [1, 2, 3].includes(quote.membership_years)) {
    lines.push(`ต่ออายุ ${quote.package_code === "premium" ? "Premium" : "Standard"} ${quote.membership_years} ปี: ${quote.amount_thb.toLocaleString("th-TH")} บาท`);
    lines.push("แจ้งเปอร์ว่าต้องการต่ออายุในแชตนี้ เพื่อผูกรายการชำระกับสมาชิกและยืนยันยอดก่อนโอนครับ หลังโอนแนบสลิปในรายการเดิม รอเปอร์ตรวจ ก่อนอัปเดตสิทธิ์และแต้ม");
  } else {
    missing.push(protectedTier ? "protected_tier_owner_review" : clean(quote.reason) || "canonical_renewal_quote");
    lines.push(quote.classification === "new_signup" ? "หมดอายุเกินหนึ่งปี ต้องตรวจเป็นการสมัครใหม่ครับ" : "ราคาและเงื่อนไขต่ออายุยังรอเปอร์ตรวจครับ");
  }
  return { text: lines.join("\n"), missing, intent: "membership_status", reply_source: "line_rights_check_v1", truth_authority: AUTHORITY,
    truth_status: missing.length ? "partial" : "verified", handoff_required: missing.length > 0,
    handoff_reason: missing.length ? `rights_check:missing:${missing.join(",")}` : "", conversation_stage: missing.length ? "awaiting_review" : "status_checked" };
}

async function readTruth(env, userId, intent = "rights_check") {
  if (!env.MEMBER_PAGES_WORKER?.fetch) return {};
  const response = await env.MEMBER_PAGES_WORKER.fetch(new Request("https://member-pages-worker.internal/__internal/kenji/member-truth", {
    method: "POST", headers: { "content-type": "application/json", "x-mmd-internal-call": "true", "x-mmd-service-binding": "member-dashboard-chat-worker" },
    body: JSON.stringify({ line_user_id: userId, intent }), signal: AbortSignal.timeout(10000),
  }));
  return response.ok ? response.json() : {};
}
async function deliver(env, event, answer) {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN) return false;
  const response = await fetch("https://api.line.me/v2/bot/message/reply", { method: "POST", headers: { authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ replyToken: event.replyToken, messages: [{ type: "text", text: answer.slice(0, 1600) }] }), signal: AbortSignal.timeout(3000) });
  return response.ok;
}
const defaults = { continuity: resolveKenjiLineContinuity, takeover: getLineOwnerTakeoverState, runtime: requestKenjiRuntimeStatus, truth: readTruth, matrix: writeKenjiLineMatrixTurn, deliver,
  history: recordDeliveredKenjiLineReply };
const commandEnabled = env => clean(env.KENJI_LINE_RIGHTS_CHECK_MODE) === "command" && enabled(env.KENJI_LINE_RIGHTS_COMMAND_ENABLED);
const killed = (runtime, command = false) => runtime?.ok !== true || runtime.controls?.all_kenji_mutations === true || (!command && runtime.controls?.line_oa_auto_reply === true);

// Called only inside the verified MMD LINE webhook, after canonical intake.
// The public body cannot supply services or provider identity. Pilot scope or
// the separately owner-authorized exact command; missing/off stays unchanged.
export async function handleLineRightsCheck({ env = {}, event = {}, runtime = {}, services = defaults } = {}) {
  const command = commandEnabled(env);
  const interest = command && enabled(env.KENJI_LINE_PRIVATE_INTEREST_ENABLED) && isPrivateInterestCommand(event);
  if ((!isLineRightsCheck(event) && !interest) || (!command && clean(env.KENJI_LINE_RIGHTS_CHECK_MODE) !== "pilot")) return null;
  // The owner's exception is solely this command, never renewal/general chat.
  if (command && !isRightsCommand(event.message.text) && !interest) return null;
  const silent = reason => ({ ok: true, rights_check: true, replied: false, reason });
  const userId = clean(event.source?.userId);
  const hashes = clean(env.KENJI_LINE_RIGHTS_CHECK_PILOT_HASHES).toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (!/^U[a-f0-9]{32}$/i.test(userId) || (!command && (!hashes.length || hashes.some(x => !/^[a-f0-9]{64}$/.test(x))))) return silent("pilot_identity_unavailable");
  if (!command && !hashes.includes(await hash(userId))) return silent("outside_owner_pilot");
  if ((!command && (!enabled(env.LINE_AUTO_REPLY_ENABLED) || !enabled(env.LINE_KENJI_AI_ENABLED))) || killed(runtime, command)) return silent("runtime_line_kill");
  if (event.mode === "standby" || event.deliveryContext?.isRedelivery === true || !event.replyToken) return silent("event_not_eligible");
  const age = Date.now() - Number(event.timestamp);
  if (!Number.isFinite(age) || age < -60000 || age > 300000) return silent("stale_or_missing_event_timestamp");
  const eventId = clean(event.webhookEventId || event.message?.id);
  if (!eventId) return silent("stable_event_id_missing");
  try {
    const continuity = await services.continuity({ env, event, currentIntent: "membership_status" });
    const takeover = await services.takeover(env, userId, continuity, { signal: AbortSignal.timeout(1500) });
    if (takeover.ok !== true || takeover.active) return silent("owner_takeover_or_unavailable");
    if (!await claim(env, await hash(`rights-event:${userId}:${eventId}`))) return silent("duplicate_or_claim_unavailable");
    const truth = await services.truth(env, userId, interest ? "private_interest" : "rights_check").catch(() => ({}));
    const decision = interest ? renderPrivateInterest(truth) : renderLineRightsCheck(truth);
    let caseSaved = false;
    if (decision.missing.length) {
      // One actionable Conversation Matrix case per customer/day, regardless
      // of distinct message IDs. No parallel ledger or entitlement write.
      const caseKey = await hash(`rights-case:${userId}:${new Date().toISOString().slice(0, 10)}`);
      if (continuity.matrix?.handoff_required === true && clean(continuity.matrix?.handoff_reason).startsWith("rights_check:missing:")) {
        caseSaved = true;
      } else if (await claim(env, caseKey)) {
        const receipt = await services.matrix({ env, continuity, decision, delivered: false, attempted: false, lastEventId: eventId });
        caseSaved = Boolean(receipt?.id);
      } else {
        caseSaved = continuity.matrix?.handoff_required === true && clean(continuity.matrix?.handoff_reason).startsWith("rights_check:missing:");
      }
      decision.text += caseSaved ? "\nส่งเรื่องให้เปอร์ตรวจแล้วครับ ไม่ต้องส่งสลิปซ้ำระหว่างรอตรวจ" : "\nตอนนี้ยังส่งเรื่องเข้าคิวตรวจไม่สำเร็จ รบกวนติดต่อเปอร์ในแชตนี้ครับ";
    }
    // Re-read controls and owner state after slow truth/case operations.
    const fresh = await services.continuity({ env, event, currentIntent: "membership_status" });
    const [currentRuntime, currentOwner] = await Promise.all([services.runtime(env), services.takeover(env, userId, fresh, { signal: AbortSignal.timeout(1500) })]);
    if (killed(currentRuntime, command) || currentOwner.ok !== true || currentOwner.active) return silent("pre_delivery_control_or_owner_blocked");
    const replied = await services.deliver(env, event, decision.text);
    if (replied) await services.history({ env, event, replyText: decision.text }).catch(() => null);
    return { ok: true, rights_check: true, replied, case_saved: caseSaved, review_required: decision.missing.length > 0, reason: replied ? "" : "delivery_failed_no_retry" };
  } catch { return silent("rights_check_failed_closed"); }
}
