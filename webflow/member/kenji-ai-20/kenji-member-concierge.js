/*
  Kenji Member Concierge - Webflow-safe member layer
  Route intent: /member/kenji-ai-20
  Home/status context: /member/dashboard
*/
(function (global) {
  "use strict";

  const HIGH_POINTS_THRESHOLD = 1200;
  const MEMBER_SUMMARY_ENDPOINT = "/member/api/summary";

  const INTENTS = Object.freeze({
    EMPTY: "empty",
    MMD_COMPANION: "mmd_companion",
    MMS_WELLNESS: "mms_wellness",
    PARTNER_VENUE: "partner_venue",
    PRIVATE_TALENT: "private_talent",
    PAYMENT: "payment_slip",
    CARE_BACK: "care_back",
    POINTS: "points",
    VIP: "vip",
    SVIP: "svip",
    BLACK_CARD: "black_card",
    MEMBERSHIP: "membership_renewal",
    HIGH_POINTS: "high_points_fallback",
    GENERAL: "general"
  });

  const SAFE_COPY = Object.freeze({
    payment:
      "Payment slips are supporting evidence only. Confirmation happens only after official verification and fund matching.",
    svip: "SVIP is Boss Per manual-only, never points-based.",
    blackCard: "Black Card is private review, not automatic approval.",
    vip: "Kenji can summarize VIP eligibility signals, but there is no automatic guarantee.",
    booking: "Kenji can guide the booking flow, but membership and status should be checked first."
  });

  const DEMO_ONLY_MEMBER_SUMMARY = Object.freeze({
    demo_only: true,
    display_name: "Member",
    membership_status: "demo_preview",
    tier: "",
    points_balance: null,
    renewal_status: "unknown"
  });

  function toText(value) {
    return value === null || value === undefined ? "" : String(value).trim();
  }

  function normalize(value) {
    return toText(value).toLowerCase();
  }

  function asFiniteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function includesAny(text, terms) {
    return terms.some((term) => text.includes(term));
  }

  function getPointsBalance(memberSummary) {
    if (!memberSummary || typeof memberSummary !== "object") return null;
    return asFiniteNumber(memberSummary.points_balance ?? memberSummary.points?.balance);
  }

  function sanitizeMemberSummary(input) {
    const source = input && typeof input === "object" ? input : {};
    const pointsBalance = getPointsBalance(source);
    return {
      demo_only: Boolean(source.demo_only),
      display_name: toText(source.display_name || source.name),
      membership_status: toText(source.membership_status || source.status),
      tier: toText(source.tier || source.member_tier),
      points_balance: pointsBalance,
      points_updated_at: toText(source.points_updated_at),
      renewal_status: toText(source.renewal_status),
      last_verified_at: toText(source.last_verified_at)
    };
  }

  function classifyIntent(input, memberSummary) {
    const text = normalize(input);

    if (!text) {
      return { intent: INTENTS.EMPTY, priority: 100, confidence: 1 };
    }

    if (includesAny(text, ["massage", "male massage", "นวด", "คลายกล้าม", "recovery", "wellness", "therapist"])) {
      return { intent: INTENTS.MMS_WELLNESS, priority: 96, confidence: 0.95 };
    }

    if (includesAny(text, ["relax spa", "partner venue", "ไม่มีสถานที่", "ไม่มีที่", "สถานที่พร้อมอุปกรณ์", "ใช้ร้าน"])) {
      return { intent: INTENTS.PARTNER_VENUE, priority: 95, confidence: 0.95 };
    }

    if (includesAny(text, ["private talent", "specialist", "freelancer", "special skill", "ทักษะพิเศษ", "ล่าม", "ภาษา", "performance", "creative", "business presence"])) {
      return { intent: INTENTS.PRIVATE_TALENT, priority: 94, confidence: 0.95 };
    }

    if (includesAny(text, ["dinner", "dining", "drinks", "event", "appearance", "social", "ทานข้าว", "ดินเนอร์", "ดื่ม", "อีเวนต์", "ออกงาน", "จอง", "booking", "book", "reserve", "appointment", "session"])) {
      return { intent: INTENTS.MMD_COMPANION, priority: 90, confidence: 0.95 };
    }

    if (includesAny(text, ["care back", "careback", "แคร์แบ็ก", "แคร์ แบ็ก", "6 years", "6th anniversary", "birthday wish", "คำอวยพร", "คูปองวันเกิด"])) {
      return { intent: INTENTS.CARE_BACK, priority: 89, confidence: 0.95 };
    }

    if (includesAny(text, ["ส่งสลิป", "สลิป", "slip", "payment", "paid", "โอน", "ชำระ", "จ่าย"])) {
      return { intent: INTENTS.PAYMENT, priority: 88, confidence: 0.95 };
    }

    if (includesAny(text, ["svip", "s vip", "super vip"])) {
      return { intent: INTENTS.SVIP, priority: 86, confidence: 0.95 };
    }

    if (includesAny(text, ["black card", "blackcard", "บัตรดำ"])) {
      return { intent: INTENTS.BLACK_CARD, priority: 84, confidence: 0.95 };
    }

    if (includesAny(text, ["สมาชิก", "ต่ออายุ", "renew", "renewal", "membership", "member", "status hub"])) {
      return { intent: INTENTS.MEMBERSHIP, priority: 82, confidence: 0.9 };
    }

    if (includesAny(text, ["vip", "วีไอพี"])) {
      return { intent: INTENTS.VIP, priority: 80, confidence: 0.9 };
    }

    if (includesAny(text, ["แต้ม", "points", "point", "คะแนน"])) {
      return { intent: INTENTS.POINTS, priority: 70, confidence: 0.9 };
    }

    const pointsBalance = getPointsBalance(memberSummary);
    if (pointsBalance !== null && pointsBalance >= HIGH_POINTS_THRESHOLD) {
      return { intent: INTENTS.HIGH_POINTS, priority: 40, confidence: 0.7 };
    }

    return { intent: INTENTS.GENERAL, priority: 10, confidence: 0.5 };
  }

  function formatPoints(value) {
    const number = asFiniteNumber(value);
    if (number === null) return "not available";
    return number.toLocaleString("en-US");
  }

  function memberStatusLine(memberSummary) {
    const summary = sanitizeMemberSummary(memberSummary);
    const parts = [];
    if (summary.membership_status) parts.push(`status: ${summary.membership_status}`);
    if (summary.tier) parts.push(`tier: ${summary.tier}`);
    if (summary.points_balance !== null) parts.push(`points: ${formatPoints(summary.points_balance)}`);
    return parts.length ? ` Current member summary: ${parts.join(", ")}.` : "";
  }

  function buildKenjiReply(input, memberSummary) {
    const summary = sanitizeMemberSummary(memberSummary);
    const classified = classifyIntent(input, summary);
    const statusLine = memberStatusLine(summary);

    switch (classified.intent) {
      case INTENTS.EMPTY:
        return "ผมช่วยดูเส้นทางที่เหมาะกับ request ของคุณก่อนนะครับ เลือกได้ทั้ง MMD Companion, MMS Wellness, Partner Venue, Private Talent, Membership หรือ Payment Proof";
      case INTENTS.MMS_WELLNESS:
        return "ถ้าต้องการ male massage หรือ recovery service ผมจะแยกเป็น MMS Wellness route ให้ครับ เลือกได้ทั้ง hotel / home visit หรือ Partner Venue โดยต้องให้ MMD ตรวจรายละเอียดก่อน";
      case INTENTS.PARTNER_VENUE:
        return "ถ้าไม่มีสถานที่ที่เหมาะสม ผมช่วยแยกไป Partner Venue อย่าง Relax Spa by 9 ได้ครับ ขั้นตอนนี้เป็น request เพื่อ review ยังไม่ใช่การยืนยันคิว";
      case INTENTS.PRIVATE_TALENT:
        return "ผมช่วยรับ Private Talent & Specialist request แล้วส่งเข้า MMD review ก่อนพาไปขั้นตอนที่เหมาะสมครับ";
      case INTENTS.MMD_COMPANION:
        return `ผมช่วยรับ MMD Companion request สำหรับ Private Social, Dining, Drinks, Event หรือ Appearance ได้ครับ${statusLine} MMD จะตรวจความเหมาะสมและความพร้อมก่อนยืนยัน`;
      case INTENTS.PAYMENT:
        return "ถ้าต้องส่งหลักฐาน ผมจะพาไป /confirm/payment-proof ครับ MMD จะตรวจยอดจริงก่อนอัปเดตขั้นตอนถัดไป หลักฐานอย่างเดียวยังไม่ถือว่ายืนยันยอดหรืออนุมัติ request";
      case INTENTS.CARE_BACK:
        return "CARE BACK เป็นสิทธิ์ดูแลกลับที่ MMD ตรวจจากสถานะและประวัติจริงครับ เริ่มจากยืนยันผ่าน LINE แล้วส่ง Birthday Wish ให้บันทึกสำเร็จก่อน คูปองส่วนตัว 10% จึงจะเปิดได้ 1 ครั้งและมีอายุ 30 วันหลัง activation ส่วน Membership และ Points จะมีผลหลัง MMD ตรวจข้อมูล การสมัคร หรือการชำระเงินที่เกี่ยวข้องเรียบร้อยแล้วเท่านั้นครับ";
      case INTENTS.POINTS:
        return `Your points summary is ${formatPoints(summary.points_balance)} points. Points can guide the next step, but they must not override booking, payment, SVIP, Black Card, or membership intent.`;
      case INTENTS.VIP:
        return `${SAFE_COPY.vip}${statusLine} I can help gather the visible signals for review.`;
      case INTENTS.SVIP:
        return `${SAFE_COPY.svip} I can summarize the case for the proper manual review path.`;
      case INTENTS.BLACK_CARD:
        return `${SAFE_COPY.blackCard} I can help prepare the member context for that private review.`;
      case INTENTS.MEMBERSHIP:
        return `ผมช่วยดูสถานะสมาชิกหรือการต่ออายุได้ครับ${statusLine} และจะแยก Payment Proof ออกจากการยืนยันยอดอย่างเป็นทางการเสมอ`;
      case INTENTS.HIGH_POINTS:
        return `Your points look strong at ${formatPoints(summary.points_balance)} points. With no stronger intent detected, I can guide the next suitable member step without making automatic VIP, SVIP, or Black Card decisions.`;
      default:
        return `I can help from the member concierge layer. Ask me about booking, payment proof, points, VIP, SVIP, Black Card, or membership renewal.${statusLine}`;
    }
  }

  function getAccessT(search) {
    const params = new URLSearchParams(search || global.location?.search || "");
    return toText(params.get("t"));
  }

  async function loadSanitizedMemberSummary(options) {
    const config = options && typeof options === "object" ? options : {};
    const t = toText(config.t || getAccessT(config.search));
    if (!t) return sanitizeMemberSummary(config.demoSummary || DEMO_ONLY_MEMBER_SUMMARY);

    const fetcher = config.fetch || global.fetch;
    if (typeof fetcher !== "function") return sanitizeMemberSummary(config.demoSummary || DEMO_ONLY_MEMBER_SUMMARY);

    const endpoint = toText(config.endpoint) || MEMBER_SUMMARY_ENDPOINT;
    const url = new URL(endpoint, global.location?.origin || "https://www.mmdbkk.com");
    url.searchParams.set("t", t);

    try {
      const response = await fetcher(url.toString(), {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error("member_summary_unavailable");
      const data = await response.json();
      return sanitizeMemberSummary(data?.member || data?.summary || data);
    } catch (error) {
      return sanitizeMemberSummary(config.demoSummary || DEMO_ONLY_MEMBER_SUMMARY);
    }
  }

  function setText(root, selector, value) {
    const node = root.querySelector(selector);
    if (node) node.textContent = value;
  }

  function bindWebflow(root, initialSummary) {
    const input = root.querySelector("[data-kenji-input]");
    const send = root.querySelector("[data-kenji-send]");
    const reply = root.querySelector("[data-kenji-reply]");
    const intent = root.querySelector("[data-kenji-intent]");
    const state = { memberSummary: sanitizeMemberSummary(initialSummary) };

    function render(value) {
      const text = toText(value || input?.value);
      const classified = classifyIntent(text, state.memberSummary);
      if (reply) reply.textContent = buildKenjiReply(text, state.memberSummary);
      if (intent) intent.textContent = classified.intent;
    }

    if (send) {
      send.addEventListener("click", function (event) {
        event.preventDefault();
        render();
      });
    }

    if (input) {
      input.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          render();
        }
      });
    }

    setText(root, "[data-kenji-status]", memberStatusLine(state.memberSummary).replace(/^ Current member summary: /, ""));
    if (!reply?.textContent) render("");
    return { render, state };
  }

  async function boot() {
    const roots = Array.prototype.slice.call(global.document?.querySelectorAll?.("[data-kenji-concierge]") || []);
    if (!roots.length) return;
    const memberSummary = await loadSanitizedMemberSummary();
    roots.forEach((root) => bindWebflow(root, memberSummary));
  }

  const api = Object.freeze({
    INTENTS,
    SAFE_COPY,
    HIGH_POINTS_THRESHOLD,
    DEMO_ONLY_MEMBER_SUMMARY,
    classifyIntent,
    buildKenjiReply,
    sanitizeMemberSummary,
    loadSanitizedMemberSummary,
    bindWebflow
  });

  global.MMDKenjiMemberConcierge = api;

  if (typeof global.document !== "undefined") {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
      boot();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
