export const MMS_AI_KNOWLEDGE_VERSION = "mms-ai-knowledge-v4-20260906";
export const MMS_APPLICATION_ROUTE = "/apply/mms-therapist";
export const MMS_APPLICATION_REVIEW_ROUTE = "/internal/admin/mms?tab=applications&application_id=";

export const MMS_SERVICE_TAXONOMY = Object.freeze([
  "Aroma Oil",
  "Thai Massage",
  "Sport Massage",
  "Office Syndrome",
  "Health & Fitness Advisor",
  "Herbal Compress",
  "Partner-Present",
  "Women Massage",
]);

export const MMS_DYNAMIC_INTENTS = new Set([
  "availability",
  "therapist_recommendation",
  "price_quote",
  "payment_status",
  "application_status",
  "missing_documents",
  "therapist_state",
  "booking_status",
]);

function text(value) {
  return String(value == null ? "" : value).trim();
}

function normalized(value) {
  return text(value).normalize("NFKC").toLowerCase();
}

export function detectMmsLanguage(value = "") {
  const raw = text(value);
  if (/[一-鿿]/u.test(raw)) return "zh";
  if (/[ก-๙]/u.test(raw)) return "th";
  return "en";
}

export function extractMmsApplicationId(value = "") {
  const match = text(value).match(/\bmmsapp_[a-f0-9]{24}\b/i);
  return match ? match[0] : "";
}

export function classifyMmsIntent(value = "") {
  const raw = normalized(value);
  if (!raw) return "unknown";
  if (/^(?:hi|hello|hey|สวัสดี|หวัดดี|你好|您好)\b/i.test(raw)) return "greeting";
  if (/(?:สมัคร|apply|application|应聘|申请).*(?:therapist|เทอราปิส|นักบำบัด|按摩师)|(?:อยากสมัคร|สมัครงาน)/i.test(raw)) return "application_start";
  if (/mmsapp_[a-f0-9]{24}/i.test(raw) || /(?:ใบสมัคร|application).*(?:ถึงไหน|สถานะ|status|进度|状态)/i.test(raw)) return "application_status";
  if (/(?:ขาด|missing|ยังไม่ครบ|เอกสาร|document|certificate|证件|资料)/i.test(raw) && /(?:สมัคร|application|mmsapp_)/i.test(raw)) return "missing_documents";
  if (/(?:matching\s*off|paused|ready|เปิดรับงาน|work mode|สถานะรับงาน|为什么.*matching|接单状态)/i.test(raw)) return "therapist_state";
  if (/(?:จ่ายแล้ว|ชำระแล้ว|payment status|paid|付款.*吗|支付状态)/i.test(raw)) return "payment_status";
  if (/(?:ราคา|ค่าบริการ|ค่าเดินทาง|มัดจำ|เหลือจ่าย|price|quote|travel fee|deposit|多少钱|价格|路费)/i.test(raw)) return "price_quote";
  if (/(?:ว่าง|คิว|available|availability|今晚|有空|档期)/i.test(raw)) return "availability";
  if (/(?:แนะนำ|recommend|เลือก.*therapist|หา.*therapist|คนไหนดี|推荐|哪位.*therapist)/i.test(raw)) return "therapist_recommendation";
  if (/(?:จอง|booking|pre-?booking|预约)/i.test(raw) && /(?:สถานะ|ถึงไหน|status|确认|进度)/i.test(raw)) return "booking_status";
  if (/(?:มีบริการอะไร|บริการอะไร|services?|นวดแบบไหน|有什么服务|项目)/i.test(raw)) return "service_discovery";
  if (/(?:office syndrome|ออฟฟิศ|ไหล่|หลัง|คอ|sport|recovery|aroma|thai massage|herbal|ผ่อนคลาย|เมื่อย|ล้า|酸痛|放松)/i.test(raw)) return "service_guidance";
  if (/(?:แฟนอยู่ด้วย|partner.?present|partner present|伴侣.*在场)/i.test(raw)) return "partner_present";
  if (/(?:ผู้หญิงจอง|women massage|woman.*book|女性.*预约)/i.test(raw)) return "women_massage";
  if (/(?:training|อบรม|ฝึก|fast track|培训)/i.test(raw)) return "training";
  if (/(?:จอง|book|预约)/i.test(raw)) return "booking_start";
  return "general";
}

function joinServices(language) {
  const list = MMS_SERVICE_TAXONOMY.join(", ");
  if (language === "zh") return `MMS 目前包括 ${list}。你可以先告诉我今天最需要什么，我帮你缩小选择范围。`;
  if (language === "en") return `MMS currently covers ${list}. Tell me what you need today and I can narrow it down.`;
  return `ตอนนี้ MMS มีทั้ง ${list} ครับ ถ้าบอกอาการล้าหรือสิ่งที่อยากได้คร่าว ๆ ผมช่วยไล่ตัวเลือกให้สั้นลงได้`;
}

export function staticMmsReply({ message = "", intent = classifyMmsIntent(message), role = "unknown" } = {}) {
  const language = detectMmsLanguage(message);

  if (intent === "greeting") {
    if (language === "zh") return "你好。如果想预约上门按摩，可以先告诉我今天更想放松、恢复体力，还是重点处理某个部位。我可以帮你缩小选择范围。";
    if (language === "en") return "Hi. If you’re looking for an at-home massage, tell me what you’d like to focus on — relaxation, recovery, a specific area, or a service you already have in mind.";
    return "สวัสดีครับ ถ้ากำลังหาบริการนวดถึงที่ บอกได้เลยว่าอยากเน้นผ่อนคลาย ดูแลจุดไหน หรือมีบริการที่สนใจอยู่แล้วครับ";
  }

  if (intent === "service_discovery") return joinServices(language);

  if (intent === "service_guidance") {
    if (language === "zh") return "如果主要想放松，可以先看 Aroma Oil；如果肩、背、腿或其他部位特别累，告诉我重点位置，我再帮你按 Skill 缩小选择。";
    if (language === "en") return "For general relaxation, Aroma Oil is a good place to start. If your shoulders, back, legs, or another area feels especially tired, tell me the focus and I’ll narrow it down by skill.";
    return "ถ้าเน้นพักผ่อนสบาย ๆ เริ่มจาก Aroma Oil ได้ครับ แต่ถ้ามีไหล่ หลัง ขา หรือจุดที่ล้าเป็นพิเศษ บอกผมก่อน เดี๋ยวช่วยดูว่าบริการไหนตรงกว่าครับ";
  }

  if (intent === "application_start") {
    if (language === "zh") return `Therapist 可以从 ${MMS_APPLICATION_ROUTE} 开始申请。提交申请并不代表自动通过，之后还需要 Review 和准备状态确认。`;
    if (language === "en") return `You can start the Therapist application at ${MMS_APPLICATION_ROUTE}. Submitting the form does not mean automatic approval; it goes through review before work matching can be enabled.`;
    return `สมัคร Therapist ได้ครับ เริ่มที่ ${MMS_APPLICATION_ROUTE} ได้เลย ข้อมูลหลักจะมีประสบการณ์ Skill พื้นที่ทำงาน รูปโปรไฟล์ และเอกสารที่เกี่ยวข้อง การส่งใบสมัครยังไม่ถือว่าผ่านนะครับ จะมีขั้น Review ต่อ`;
  }

  if (intent === "partner_present") {
    if (language === "zh") return "Partner-Present เป็นหนึ่งในหมวดบริการของ MMS ครับ การจองจริงต้องดูขอบเขต ความสบายใจของทุกฝ่าย และ Therapist ที่รองรับหมวดนี้ในคิวปัจจุบันก่อน";
    if (language === "en") return "Partner-Present is an MMS service category. A real booking still depends on clear boundaries, everyone’s comfort, and a currently eligible Therapist.";
    return "Partner-Present เป็นหนึ่งในหมวดบริการของ MMS ครับ การจองจริงต้องดูขอบเขต ความสบายใจของทุกฝ่าย และ Therapist ที่รองรับหมวดนี้ในคิวปัจจุบันก่อน";
  }

  if (intent === "women_massage") {
    if (language === "zh") return "女性可以预约 Women Massage，但要以当前服务范围和已获准接待该客户类型的 Therapist 为准。实际人选和档期我不会从旧资料猜。";
    if (language === "en") return "Women Massage is supported where the current service scope and Therapist eligibility allow it. I won’t guess the actual Therapist or availability from old information.";
    return "ผู้หญิงจองได้ในหมวด Women Massage ครับ แต่ต้องดู Therapist ที่ได้รับอนุญาตสำหรับลูกค้ากลุ่มนี้และคิวจริงในปัจจุบัน ผมจะไม่เดาจากข้อมูลเก่าให้ครับ";
  }

  if (intent === "training") {
    if (language === "zh") return "Therapist 有准备和培训路径。你可以先告诉我目前大概有多少经验；具体课程、时间和条件需要按当前信息确认。";
    if (language === "en") return "There is a preparation and training path for Therapists. Tell me roughly how much experience you have; current rounds and conditions should be checked from the latest information.";
    return "มีเส้นทางเตรียมความพร้อมสำหรับ Therapist ครับ ถ้าบอกว่าตอนนี้มีประสบการณ์ประมาณไหน ผมช่วยชี้ว่าควรเริ่มตรงไหนได้ โดยรายละเอียดรอบและเงื่อนไขจะเช็กจากข้อมูลปัจจุบันอีกที";
  }

  if (intent === "booking_start") {
    if (language === "zh") return "可以。先告诉我日期、方便的时间段和区域就好，之后我再帮你继续看适合的服务和 Therapist。";
    if (language === "en") return "Sure. Send me your preferred date, time window, and area first. I’ll help narrow down the service and Therapist options from there.";
    return "ได้ครับ ขอวัน ช่วงเวลา และโซนที่สะดวกก่อนก็พอ เดี๋ยวผมช่วยไล่บริการกับ Therapist ที่เข้ากันต่อให้";
  }

  if (intent === "application_status") {
    const id = extractMmsApplicationId(message);
    if (!id) {
      if (language === "zh") return "把 Application ID 发给我就可以ครับ。状态属于实时信息，需要先确认对应申请和身份，不能从旧消息猜。";
      if (language === "en") return "Send me the Application ID first. Application status is live information and needs to be checked against the real application and identity.";
      return "ส่ง Application ID มาได้ครับ สถานะใบสมัครเป็นข้อมูลปัจจุบัน ต้องเช็กจากใบสมัครจริงและยืนยันว่าเป็นเคสของคุณก่อน ผมไม่เดาจากข้อความเก่าให้ครับ";
    }
    if (language === "zh") return "收到 Application ID 了。申请状态属于受保护的实时信息，需要先完成身份对应确认；仅有编号还不能直接公开结果。";
    if (language === "en") return "I have the Application ID. The status is protected live information, so identity still has to be resolved before I can disclose the result.";
    return "ได้ Application ID แล้วครับ แต่สถานะใบสมัครเป็นข้อมูลภายในของผู้สมัคร ต้องยืนยันตัวตนให้ตรงกับใบสมัครก่อนถึงจะเปิดสถานะจริงได้ครับ";
  }

  if (intent === "missing_documents") {
    if (language === "zh") return "缺哪些资料需要从实际申请记录里确认，我不会凭印象列。先发 Application ID；如果身份ยังไม่对应，会先完成确认。";
    if (language === "en") return "Missing documents must come from the real application record. Send the Application ID first; identity still needs to match before protected details can be shown.";
    return "รายการที่ขาดต้องดูจากใบสมัครจริงครับ ผมจะไม่ไล่จากความจำ ส่ง Application ID มาก่อนได้ แต่ถ้ายังยืนยันตัวตนไม่ตรงกับใบสมัคร จะต้องยืนยันก่อนเปิดรายละเอียดครับ";
  }

  if (intent === "therapist_state") {
    if (language === "zh") return "Approve 申请不等于已经可以接单。通过申请后仍会先อยู่ใน Review · Paused · Matching OFF，ต้อง完成授权和准备检查后才会เปลี่ยน状态。";
    if (language === "en") return "Application approval is not the same as being ready to work. After approval the initial state remains Review · Paused · Matching OFF until authorized readiness checks are complete.";
    return "สถานะ Approve ยังไม่เท่ากับเปิดรับงานทันทีครับ หลังผ่านใบสมัครจะอยู่ Review · Paused · Matching OFF ก่อน จนกว่าจะผ่านขั้นยืนยันสิทธิ์และตั้งค่าความพร้อม";
  }

  if (MMS_DYNAMIC_INTENTS.has(intent)) {
    if (intent === "availability" || intent === "therapist_recommendation") {
      if (language === "zh") return "我需要按实际日期、时间和区域查当前状态。先发这三个信息就可以，我不会拿旧档期来猜。";
      if (language === "en") return "I need the actual date, time, and area to check current availability. Send those first and I won’t guess from old schedules.";
      return "เดี๋ยวต้องเช็กคิวจริงจากวัน เวลา และพื้นที่ครับ ส่ง 3 อย่างนี้มาก่อนได้ ผมจะไม่เอาคิวเก่ามาเดาให้";
    }
    if (intent === "price_quote") {
      if (language === "zh") return "价格属于当前报价，需要按服务和区域确认。先告诉我想要的服务和区域，我不会用旧价格或旧路费公式回答。";
      if (language === "en") return "Price is current quote data. Send the service and area first; I won’t reuse an old rate or travel-fee formula.";
      return "ราคาเป็นข้อมูลตามคิวปัจจุบันครับ ส่งบริการที่สนใจกับพื้นที่มาก่อนได้ ผมจะเช็กจากข้อมูลล่าสุด ไม่ใช้เรตหรือสูตรค่าเดินทางเก่ามาตอบ";
    }
    if (intent === "payment_status") {
      if (language === "zh") return "付款状态必须以实际付款记录为准，聊天ข้อความหรือสลิปอย่างเดียวไม่ถือว่า已确认。请发对应的 booking / payment reference。";
      if (language === "en") return "Payment status must come from the real payment record; a chat message or slip alone is not confirmation. Send the related booking or payment reference.";
      return "สถานะชำระเงินต้องยึดจากรายการเงินจริงครับ ข้อความหรือสลิปอย่างเดียวยังไม่ถือว่ายืนยัน ส่ง booking / payment reference ที่เกี่ยวข้องมาได้ครับ";
    }
    if (intent === "booking_status") {
      if (language === "zh") return "请发 booking / pre-booking reference。状态ต้องดูจากรายการจริง，我不会从聊天记录猜。";
      if (language === "en") return "Send the booking or pre-booking reference. Status has to come from the real record, not chat history.";
      return "ส่ง booking / pre-booking reference มาได้ครับ สถานะต้องดูจากรายการจริง ผมไม่เดาจากประวัติแชตให้";
    }
  }

  if (role === "therapist") {
    if (language === "en") return "Tell me what you need help with in the MMS Therapist flow — profile, skill, work area, availability, job brief, or work status.";
    if (language === "zh") return "如果你是 MMS Therapist，可以告诉我你要处理的是 profile、Skill、工作区域、availability、job brief 还是接单状态。";
    return "ถ้าเป็นฝั่ง MMS Therapist บอกได้เลยครับว่าต้องการดูเรื่องโปรไฟล์ Skill พื้นที่รับงาน availability, job brief หรือสถานะรับงาน";
  }

  return "";
}

export const MMS_AI_SYSTEM_PROMPT_V4 = `You are the MMS · Male Massage conversational assistant.
Knowledge lock: ${MMS_AI_KNOWLEDGE_VERSION}.

Core authority:
- mms-worker owns current MMS truth.
- You are conversation/guidance only. Never become the source of truth.
- HENNA is an internal operations guardian, not the customer-facing brain and not an approver.
- MMS Partner operates human workflows. Per is final authority where defined.

Voice:
- Always use Per Voice without impersonating Per.
- Thai first when the user writes Thai; support English and Simplified Chinese.
- Natural, concise, practical, warm, discreet, semi-formal. In Thai normally use ครับ and ผม.
- Do not sound like a call center or admin dashboard. Avoid needless use of the word ระบบ.
- Answer the immediate question first and ask at most one useful clarification.

Current service framing:
- Professional wellness / recovery / relaxation only.
- Current service categories: ${MMS_SERVICE_TAXONOMY.join(", ")}.
- Never promise that every Therapist performs every service.
- Do not diagnose medical conditions.

Truth boundary:
- Static knowledge can explain services, application flow, privacy, professional boundaries, and general next steps.
- Live lookup is required for availability, exact Therapist capability, area availability, price/quote/travel/deposit, payment state, booking confirmation/status, application status/missing documents, approval, Ready/Paused/Matching state.
- If current truth was not supplied in grounded context, do not invent it and do not reuse legacy values.
- Never use old MMS fixed prices, old travel-fee formulas, old weight surcharge, erotic/sexual service wording, Soft Extra, or Body to Body as current truth.

Access and privacy:
- LINE display name alone does not prove identity or authorization.
- MMD Model status does not automatically grant MMS Therapist access.
- Never expose private applicant/Therapist documents, secrets, tokens, storage keys, internal notes, Worker implementation details, or another user’s state.

Mutation boundary:
- Never approve/reject a Therapist, set Ready, set Matching ON, change price/quote, mark paid, change roles/permissions/policy, or imply Per approved something.
- If a human decision is required, explain that it needs review without claiming a handoff already happened unless grounded context explicitly proves it.

Return only the requested JSON object.`;

const INTERNAL_DETAIL_RE = /(?:cloudflare|wrangler|airtable|openai_api_key|authorization|bearer|system prompt|worker binding|r2 key|record[_\s-]?id|tbl[a-zA-Z0-9]{8,}|rec[a-zA-Z0-9]{8,})/i;
const LEGACY_SERVICE_RE = /(?:soft\s*extra|body\s*to\s*body|erotic|sexual service|บริการทางเพศ)/i;
const UNTRUSTED_FINALITY_RE = /(?:อนุมัติแล้ว|ผ่านแล้ว.*รับงาน|matching\s*on|พร้อมรับงานแล้ว|จ่ายแล้ว.*ยืนยัน|payment.*confirmed|approved|ready to work|available now)/i;

export function guardMmsAiOutput(value = "", { live_truth_supplied = false } = {}) {
  const output = text(value);
  if (!output) return { ok: false, reason: "empty", text: "" };
  if (output.length > 1400) return { ok: false, reason: "too_long", text: "" };
  if (INTERNAL_DETAIL_RE.test(output)) return { ok: false, reason: "internal_detail", text: "" };
  if (LEGACY_SERVICE_RE.test(output)) return { ok: false, reason: "legacy_service_claim", text: "" };
  if (!live_truth_supplied && UNTRUSTED_FINALITY_RE.test(output)) return { ok: false, reason: "untrusted_finality", text: "" };
  return { ok: true, reason: "", text: output };
}
