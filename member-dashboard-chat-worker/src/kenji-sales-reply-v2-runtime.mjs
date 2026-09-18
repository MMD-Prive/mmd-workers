import { resolveKenjiLineLiveTruth } from "./kenji-line-live-truth.mjs";
import { SALES_REPLY_VERSION, SALES_REPLY_REVIEW_AT, SALES_CARD_IDS, SALES_ROUTES, salesCardKey, publishedSalesCard } from "./kenji-sales-reply-v2-policy.mjs";

const clean = (value) => String(value ?? "").trim();
const ACTIVE = new Set(["active", "expiring_soon"]);
const CLOSED = new Set(["blocked", "suspended", "revoked", "ambiguous", "pending", "unresolved"]);
const AUTHORITY = "my_mmd_entitlement_resolver_v1";
const CARD_HASHES = Object.freeze({
  promotion_overview: "17dc84c103a296183abe6420ccdc1435e2d4899108a2889356f988a2fb594ab8",
  double_moment: "652553f955e16fd9bd9c9fcbbfcfc50422ab3344b3f917f7e778c917517abb9c24",
  care_back: "513d36b943145dd56125078eddd5b453fc59f2a2e5e552e042e70141a68f98a2",
  signup: "3ba248c1d33e460cf85b5e90126c9adeb6cd613bcf6ed2b4a337df5ff0db528f",
  current: "b917a711657431b4f7626e949c9d13000f137f98ecbe6c1b86e6859937fee859",
  renewal: "01aa4b3248f7f748f82ca850a83654ae19755c5627c20285f33ebed64dd463e5",
  payment: "2bc9d9d057acb0d234e83f3be72d7313e5f8ee6b8f59ad2b1399887e11a19f9f",
  coupon: "288f7342c0faf05d91242ad74123e9d207c6e82267bf84703b88abb250d0f5bd",
});
// Publication freezes these exact owner-reviewed answers. Revision requires code/QA too.
export const SALES_REPLY_HASHES = Object.freeze({ ...CARD_HASHES, double_moment: "652553f955e16fd9bd9c9fcbbfc50422ab3344b3f917f7e778c917517abb9c24" });

async function digest(text) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
}
export async function validateSalesCard(card, key, now = Date.now()) {
  return Boolean(publishedSalesCard(card, SALES_CARD_IDS[key], now) && await digest(card.customer_answer) === SALES_REPLY_HASHES[key]);
}
export async function readSalesCard(env, key) {
  const id = SALES_CARD_IDS[key];
  const apiKey = clean(env.AIRTABLE_API_KEY);
  const base = clean(env.AIRTABLE_BASE_ID);
  const table = clean(env.AIRTABLE_KENJI_KNOWLEDGE_TABLE_ID) || "tblsLd1uVOtG2kHoU";
  if (!id || !apiKey || !base) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 900);
  try {
    const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(base)}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", "2");
    url.searchParams.set("filterByFormula", `{knowledge_id}="${id}"`);
    for (const field of ["knowledge_id", "customer_answer", "allowed_channels", "allowed_audience", "status", "response_mode", "workflow_stage", "workflow_version", "effective_from", "payload_json"]) url.searchParams.append("fields[]", field);
    const response = await fetch(url, { headers: { authorization: `Bearer ${apiKey}` }, signal: controller.signal });
    if (!response.ok) return null;
    const data = await response.json();
    return data.records?.length === 1 ? data.records[0].fields : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

function answerDecision(text, intent, { card = null, key = "", route = SALES_ROUTES.status, label = "ดูสิทธิ์ใน MY MMD", reason = "reviewed_reply", live = false, handoff = false } = {}) {
  const answer = clean(text);
  const withCta = answer && !/https?:\/\//i.test(answer) ? `${answer}\n\n${label} → ${route}` : answer;
  return {
    text: withCta, intent, reply_pack_version: SALES_REPLY_VERSION, reply_source: "kenji_reply_pack_v2",
    fallback: false, model_attempted: false, model_success: false, model_latency_ms: 0,
    knowledge_hits: card ? 1 : 0, selected_knowledge_ids: card ? [card.knowledge_id] : [],
    knowledge_response_mode: card ? "auto_reply_allowed" : "safe_navigation_only",
    knowledge_risk_level: "medium", knowledge_source_path: route,
    guard_blocked: !card, guard_reason: card ? "" : reason,
    handoff_required: handoff, handoff_reason: handoff ? reason : "",
    live_truth_used: live, live_truth_verified: live,
    truth_authority: live ? AUTHORITY : "", truth_status: live ? "verified" : "not_claimed",
    cta_type: withCta ? "open_action_route" : "none", cta_label: label, cta_route: withCta ? route : "", cta_appended: Boolean(withCta),
    next_action: { schema: "mmd.kenji_next_action.v1", type: withCta ? "open_action_route" : "none", label, route: withCta ? route : "", reason },
    selected_reply_key: key,
  };
}
function cardRoute(card) {
  return clean(card?.customer_answer).match(/https?:\/\/[^\s<>]+/)?.[0] || SALES_ROUTES.status;
}
function handoffRequested(continuity = {}) {
  const stage = clean(continuity.conversation_stage || continuity.matrix?.conversation_stage);
  return continuity.handoff_required === true || continuity.matrix?.human_takeover === true || /^(human_takeover|handoff_per|handoff_required|paused|awaiting_human)$/.test(clean(continuity.decision)) || /^(human_takeover|awaiting_human|handoff_per)$/.test(stage);
}
function pendingProofCue(continuity = {}) {
  const stage = clean(continuity.conversation_stage || continuity.matrix?.conversation_stage);
  const values = continuity.do_not_ask_again || continuity.matrix?.do_not_ask_again;
  return stage === "awaiting_payment_verification" || (Array.isArray(values) && values.includes("payment_proof"));
}
function safeName(truth) {
  const name = clean(truth.display_name).replace(/[\r\n<>]/g, " ").slice(0, 100);
  return name ? (name.startsWith("คุณ") ? name : `คุณ${name}`) : "พี่";
}
function expiryText(value) {
  const raw = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(raw)) return "";
  const date = new Date(raw.length === 10 ? `${raw}T12:00:00+07:00` : raw);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).format(date);
}

/** Called only after transport controls and original signature verification. */
export async function resolveKenjiSalesReply(event = {}, env = {}, options = {}) {
  const intent = clean(options.intent);
  let key = salesCardKey(intent);
  if (!key) return null;
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const continuity = options.continuity || {};
  if (handoffRequested(continuity)) return answerDecision("", intent, { reason: "preserve_human_takeover", handoff: true });
  const campaign = intent.startsWith("care_back_") || ["promotion_overview", "double_moment"].includes(intent);
  const enabled = ["true", "1", "yes", "on"].includes(clean(env.LINE_KENJI_KNOWLEDGE_ENABLED).toLowerCase());
  let card = enabled ? await (options.readCard || readSalesCard)(env, key) : null;
  if (!await validateSalesCard(card, key, now)) {
    // Noncampaign seed behavior remains unchanged until its V2 card is published.
    if (!campaign) return null;
    const message = now >= SALES_REPLY_REVIEW_AT
      ? "ข้อเสนอที่คุยกันเป็นชุดเดือนกันยายน 2026 ครับ ก่อนทำรายการใหม่ต้องตรวจเงื่อนไขล่าสุด ส่วนสิทธิ์ที่เคยได้รับแล้วให้ดูวันหมดอายุจากรายการเดิมใน MY MMD ครับ"
      : "ผมช่วยพาไปตรวจรายละเอียด CARE BACK และสิทธิ์ของบัญชีใน MY MMD ได้ครับ ตอนนี้ยังไม่ยืนยันตัวเลขสิทธิ์หรือยอดชำระ เพื่อไม่ให้ใช้ข้อมูลเก่าหรือทำรายการซ้ำครับ";
    return answerDecision(message, intent, { reason: "current_published_card_required" });
  }
  // A memory cue can avoid a duplicate payment prompt, never confirm receipt/payment.
  if (pendingProofCue(continuity) && ["membership", "membership_signup", "membership_renewal", "care_back_expired_member", "care_back_payment_points"].includes(intent)) {
    return answerDecision("ถ้าพี่ส่งหลักฐานไว้แล้ว ให้ตรวจรายการเดิมก่อนนะครับ ยังไม่ต้องโอนหรือส่งสลิปซ้ำ อายุสมาชิกหรือสิทธิ์จะอัปเดตหลังตรวจยอดและจับคู่รายการเรียบร้อยครับ", intent, { card, key, route: SALES_ROUTES.payment, label: "ตรวจรายการชำระเดิม", reason: "avoid_duplicate_payment_without_claiming_payment_truth" });
  }
  if (intent === "care_back_personal_status" || ["membership", "membership_signup", "membership_renewal", "care_back_current_member", "care_back_expired_member"].includes(intent)) {
    const truth = await (options.readTruth || resolveKenjiLineLiveTruth)({ env, event, intent: "membership_status" }).catch(() => null);
    if (truth?.ok === true && truth.identity_status === "resolved" && truth.authority === AUTHORITY) {
      const membership = truth.membership || {};
      const state = clean(membership.lifecycle);
      if (membership.member_blocked === true || CLOSED.has(state)) {
        return answerDecision("ขอให้ตรวจบัญชีกับเปอร์ก่อนดำเนินการต่อครับ ระหว่างนี้ยังไม่ยืนยันการสมัคร ต่ออายุ หรือสิทธิ์เพิ่มเติมจากแชต", intent, { card, key, live: true, handoff: true, reason: "canonical_account_restricted" });
      }
      if (ACTIVE.has(state)) {
        const label = clean(membership.label).replace(/[\r\n<>]/g, " ").slice(0, 40) || "MMD";
        const expiry = expiryText(membership.expire_at);
        const first = `${safeName(truth)} ตอนนี้สมาชิก ${label} ยังใช้งานได้${expiry ? `ถึงวันที่ ${expiry}` : ""}ครับ`;
        const explicitRenewal = intent === "membership_renewal";
        const renewalDue = state === "expiring_soon";
        const route = explicitRenewal || renewalDue ? SALES_ROUTES.renewal : SALES_ROUTES.status;
        const next = explicitRenewal || renewalDue
          ? "ตรวจตัวเลือกต่ออายุจากบัญชีเดิมเพื่อดูยอดและเงื่อนไขก่อนชำระครับ หากมีรายการชำระไว้แล้วให้ใช้รายการเดิม ไม่ต้องโอนซ้ำ"
          : "ไม่ต้องสมัครใหม่ครับ ส่วนสิทธิ์ CARE BACK ให้ตรวจจากบัญชีเดิมก่อนยืนยัน ไม่เพิ่มสิทธิ์ซ้ำจากรายการที่เคยได้รับแล้ว";
        return answerDecision(`${first}\n\n${next}`, intent, { card, key, route, label: explicitRenewal || renewalDue ? "ตรวจตัวเลือกและสิทธิ์ต่ออายุ" : "ดูสิทธิ์ของฉัน", live: true });
      }
      if (["expired", "grace"].includes(state) && intent !== "care_back_personal_status") {
        const wording = state === "expired" ? "สมาชิกเดิมหมดอายุแล้ว" : "สิทธิ์เดิมอยู่ในช่วงที่ต้องตรวจเรื่องต่ออายุ";
        return answerDecision(`${safeName(truth)} ตอนนี้${wording}ครับ ใช้บัญชีเดิมตรวจตัวเลือกและยอดก่อนชำระ ไม่ต้องสมัครซ้ำ สิทธิ์ CARE BACK จะพิจารณาตามเงื่อนไขของรายการและไม่เพิ่มซ้ำครับ`, intent, { card, key, route: SALES_ROUTES.renewal, label: "ตรวจสิทธิ์และต่ออายุสมาชิกเดิม", live: true });
      }
    }
    if (intent === "care_back_personal_status") return answerDecision("สิทธิ์ CARE BACK ของพี่ต้องตรวจจากบัญชีที่ยืนยันตัวตน สถานะสมาชิก และสิทธิ์ที่เคยได้รับก่อนครับ ข้อความในแชตยังไม่ยืนยันว่าเพิ่มอายุ แต้ม หรือเปิดคูปองแล้ว", intent, { card, key });
    if (intent === "membership") return answerDecision("เลือกดูประเภทสมาชิก สมัครหรือต่ออายุได้จากหน้าสมาชิกครับ ถ้าเคยเป็นสมาชิกมาก่อนให้ใช้บัญชีเดิม เพื่อตรวจประวัติและสิทธิ์ก่อนทำรายการ", intent, { card, key, route: SALES_ROUTES.membership, label: "ดูประเภทสมาชิกและขั้นตอนถัดไป" });
  }
  if (intent === "care_back_membership_price") return answerDecision("ค่าสมัครและค่าต่ออายุต้องดูประเภทสมาชิกและสิทธิ์ของบัญชีก่อนครับ หน้าสมาชิกมีตัวเลือกและยอดให้ตรวจก่อนชำระ โดยไม่ใช้ราคาหรือรายการเก่ามาสรุปยอดให้พี่", intent, { card, key, route: SALES_ROUTES.membership, label: "ตรวจตัวเลือกและยอดล่าสุด" });
  if (intent === "care_back_black_card") return answerDecision("CARE BACK หรือแต้มพิเศษไม่ทำให้ได้รับ Black Card, VIP หรือ SVIP อัตโนมัติครับ สิทธิ์กลุ่มนี้ต้องผ่านการพิจารณาที่เกี่ยวข้อง ส่วนสิทธิ์ CARE BACK ของบัญชีให้ตรวจใน MY MMD ก่อน", intent, { card, key });
  if (intent === "care_back_historical_points") return answerDecision("สิทธิ์เพิ่มอายุสมาชิกกับ Points เป็นคนละส่วนกันครับ แต้มต้อนรับหรือแต้มย้อนหลังต้องดูเงื่อนไขและรายการที่ยืนยันแล้วของบัญชี ไม่รวมตัวเลขจากโปรโมชั่นเก่าหรือเพิ่มแต้มที่เคยบันทึกไว้ซ้ำครับ", intent, { card, key });
  return answerDecision(card.customer_answer, intent, { card, key, route: cardRoute(card) });
}

/** Read-only diagnostic: no customer identity, no LINE send, no telemetry write. */
export async function inspectKenjiSalesPublication(env, now = Date.now()) {
  const cards = await Promise.all(Object.keys(SALES_CARD_IDS).map(async (key) => {
    const card = await readSalesCard(env, key);
    return { key, knowledge_id: SALES_CARD_IDS[key], ready: await validateSalesCard(card, key, now) };
  }));
  return { version: SALES_REPLY_VERSION, ok: cards.every((card) => card.ready), cards, line_delivery_attempted: false, telemetry_write_attempted: false };
}
