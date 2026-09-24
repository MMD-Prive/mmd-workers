import { decideKenjiLineFirstContact } from "./kenji-line-first-contact.mjs";
import { resolveKenjiLineLiveTruth, KENJI_LIVE_TRUTH_AUTHORITY } from "./kenji-line-live-truth.mjs";

const MEMBERSHIP_INTENTS = new Set([
  "membership_status", "membership", "membership_signup",
  "private_membership_signup", "membership_renewal",
]);
const ACTIVE = new Set(["active", "expiring_soon"]);
const RENEWAL = new Set(["expired", "grace"]);
const MEMBERSHIP_URL = "https://mmdbkk.com/member/membership";

function dateLabel(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== match[0]) return "";
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).format(date);
}

function ownerReview(base, reason) {
  return {
    ...base,
    text: "ขอตรวจสถานะสมาชิกจากบัญชี LINE นี้ก่อนนะครับ เดี๋ยวเปอร์ดูให้ครับ",
    reply_source: "first_contact_member_review",
    handoff_required: true,
    handoff_reason: reason,
    guard_blocked: false,
    guard_reason: reason,
    truth_status: "unavailable",
    live_truth_used: false,
  };
}

// Only a current canonical entitlement can become a customer-facing claim.
// A campaign click, remembered tier, LINE rename, and conversation summary do
// not grant a membership or authorize a renewal/payment claim.
export async function decideKenjiFirstContactMembership(event = {}, intent = "", continuity = {}, env = {}, options = {}) {
  const base = decideKenjiLineFirstContact(event, intent, continuity);
  if (!MEMBERSHIP_INTENTS.has(intent)) return base;
  const raw = String(event?.message?.text || "").trim();
  if (event?.type !== "message" || event?.message?.type !== "text" || event?.source?.type !== "user" || !raw || raw.length > 600) return base;
  if (continuity?.handoff_required === true || continuity?.matrix?.human_takeover === true ||
      /^(human_takeover|handoff_per|handoff_required|paused|awaiting_human)$/.test(String(continuity?.decision || "")) ||
      /^(human_takeover|awaiting_human|handoff_per)$/.test(String(continuity?.conversation_stage || continuity?.matrix?.conversation_stage || ""))) {
    return { ...base, text: "", handoff_required: true, handoff_reason: "membership:human_takeover", guard_blocked: true };
  }
  // Payment proof, disputes and other protected requests keep their existing
  // owner handoff even if they also contain a membership keyword.
  if (/(สลิป|ชำระ|โอน(?:เงิน)?|จ่าย(?:เงิน)?|คืนเงิน|refund|payment|paid|ร้องเรียน|ข้อมูลส่วนตัว|คิว|จอง)/i.test(raw)) return base;

  const statusQuestion = intent === "membership_status" ||
    (intent !== "membership_renewal" && !/(?:ต่ออายุ|สมัคร|upgrade|อัปเกรด|อัพเกรด)/i.test(raw) &&
      /(?:สถานะ|หมดอายุ(?:หรือยัง|ไหม|ยัง)?|สมาชิกอะไร|สมาชิกแบบไหน)/i.test(raw));
  const readTruth = options.readTruth || resolveKenjiLineLiveTruth;
  const truth = await readTruth({ env, event, intent: "membership_status" }).catch(() => null);
  if (truth?.ok !== true || truth?.identity_status !== "resolved" || truth?.authority !== KENJI_LIVE_TRUTH_AUTHORITY) {
    return ownerReview(base, "membership:current_truth_unavailable");
  }
  const member = truth.membership || {};
  const lifecycle = String(member.lifecycle || "");
  if (member.member_blocked === true || !ACTIVE.has(lifecycle) && !RENEWAL.has(lifecycle) ||
      member.level === "none" || !member.label) {
    return ownerReview(base, "membership:owner_review_required");
  }
  const label = String(member.label).slice(0, 40);
  const expiry = dateLabel(member.expire_at);
  const former = truth.former_private_membership;
  const formerLabel = former && RENEWAL.has(former.lifecycle) ? String(former.label || "").slice(0, 40) : "";
  let answer = "";
  if (ACTIVE.has(lifecycle)) {
    const current = "ตอนนี้พี่เป็นสมาชิก " + label + " อยู่ครับ" + (expiry ? " ใช้ได้ถึง " + expiry : "");
    if (formerLabel && statusQuestion) answer = current + " ส่วน " + formerLabel + " เดิม" + (former.lifecycle === "expired" ? "หมดอายุแล้วครับ" : "อยู่ในช่วงตรวจต่ออายุครับ");
    else if (formerLabel && ["membership_renewal", "private_membership_signup"].includes(intent)) {
      answer = current + " และเคยมี " + formerLabel + " ครับ ถ้าจะใช้สิทธิ์ Private เดี๋ยวผมพาตรวจตัวเลือกต่ออายุจากบัญชีเดิมก่อนชำระครับ";
    }
    else if (statusQuestion) answer = current;
    else if (intent === "membership_renewal") answer = current + " ถ้าต้องการต่ออายุ เดี๋ยวผมพาดูตัวเลือกของบัญชีเดิมก่อนชำระครับ " + MEMBERSHIP_URL;
    else if (intent === "private_membership_signup" && !["private_standard", "private_premium", "vip", "svip", "black_card"].includes(member.level)) {
      answer = current + " ถ้าสนใจ Private เดี๋ยวเปอร์ดูตัวเลือกที่เหมาะกับบัญชีเดิมให้ครับ";
    } else answer = current + " ถ้าสนใจเรื่องสมาชิกต่อ บอกผมได้เลยครับ";
  } else if (statusQuestion) {
    answer = "สมาชิก " + label + (lifecycle === "expired" ? " หมดอายุแล้วครับ" : " อยู่ในช่วงตรวจต่ออายุครับ") + (expiry ? " สิทธิ์เดิมสิ้นสุด " + expiry : "");
  } else {
    answer = "พี่มีบัญชีสมาชิกเดิม " + label + " ครับ สนใจแบบไหนบอกผมได้เลย พอจะทำรายการเดี๋ยวผมพาตรวจตัวเลือกต่ออายุและยอดของบัญชีเดิมก่อนชำระครับ";
  }
  return {
    ...base, text: answer, reply_source: "first_contact_member_truth",
    handoff_required: false, handoff_reason: "", guard_blocked: false, guard_reason: "",
    truth_authority: KENJI_LIVE_TRUTH_AUTHORITY, truth_status: "verified",
    live_truth_used: true, live_truth_verified: true,
  };
}
