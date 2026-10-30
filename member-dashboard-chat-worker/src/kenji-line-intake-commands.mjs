const WINDOW_MS = 30 * 60 * 1000;
const ENTRY = "line_intake_command_v1";
const COMMANDS = new Set(["package", "regis", "apply"]);
const INTENTS = { package: "membership_package", regis: "private_membership_signup", apply: "model_application" };
const normalize = value => String(value ?? "").normalize("NFKC").replace(/[\u200B\uFEFF]/g, "").trim().toLowerCase();

export function lineIntakeCommand(event = {}) {
  if (event.type !== "message" || event.message?.type !== "text" || event.source?.type !== "user") return "";
  const value = normalize(event.message.text);
  return COMMANDS.has(value) ? value : "";
}

export function lineIntakeTopic(event = {}, continuity = {}, now = Date.now()) {
  const command = lineIntakeCommand(event);
  if (command) return command;
  const state = continuity.matrix?.payload_json?.rich_menu_v1;
  const expires = Date.parse(state?.expires_at);
  if (event.type !== "message" || event.message?.type !== "text" || event.source?.type !== "user" ||
      !continuity.available || continuity.decision === "stale_refresh" || continuity.matrix?.handoff_required === true ||
      state?.entry !== ENTRY || state.closed === true || !COMMANDS.has(state.topic) ||
      !Number.isFinite(expires) || expires <= now || expires > now + WINDOW_MS ||
      !normalize(event.message.text) || String(event.message.text).length > 600) return "";
  return state.topic;
}

// Reuse the existing read-only catalog contract; never derive prices from chat.
export async function readLineIntakeCatalog(env = {}, event = {}) {
  const userId = String(event.source?.userId || "");
  if (!/^U[a-f0-9]{32}$/i.test(userId) || !env.MEMBER_PAGES_WORKER?.fetch) return null;
  try {
    const response = await env.MEMBER_PAGES_WORKER.fetch(new Request("https://member-pages-worker.internal/__internal/kenji/member-truth", {
      method: "POST", headers: { "content-type": "application/json", "x-mmd-internal-call": "true", "x-mmd-service-binding": "member-dashboard-chat-worker" },
      body: JSON.stringify({ line_user_id: userId, intent: "private_interest" }), signal: AbortSignal.timeout(1600),
    }));
    const body = response.ok ? await response.json() : null;
    if (body?.ok !== true || body.authority !== "my_mmd_entitlement_resolver_v1") return null;
    return body.private_signup_catalog || null;
  } catch { return null; }
}

function packageText(catalog) {
  const rows = Array.isArray(catalog?.packages) ? catalog.packages : [];
  const standard = rows.filter(row => row.code === "standard");
  const premium = rows.filter(row => row.code === "premium");
  const verified = catalog?.authority === "canonical_private_signup_catalog_v1" && catalog.status === "verified" &&
    rows.length === 2 && standard.length === 1 && premium.length === 1 &&
    standard[0].base_years === 1 && premium[0].base_years === 2 &&
    rows.every(row => Number.isSafeInteger(row.price_thb) && row.price_thb > 0 && row.price_thb <= 250000);
  return [
    "Private มีแพ็กเกจหลัก 2 แบบครับ",
    verified ? `• Standard ${standard[0].price_thb.toLocaleString("th-TH")} บาท / 1 ปี` : "• Standard อายุสมาชิกพื้นฐาน 1 ปี",
    verified ? `• Premium ${premium[0].price_thb.toLocaleString("th-TH")} บาท / 2 ปีรวม` : "• Premium อายุสมาชิกพื้นฐาน 2 ปี",
    "ค่าสมาชิกแยกจากค่าจองนายแบบครับ กลุ่มนายแบบที่ดูได้ขึ้นอยู่กับแพ็กเกจและสิทธิ์ที่ตรวจแล้ว ไม่ได้รวมสิทธิ์พิเศษทุกระดับ",
    verified ? "ราคานี้เป็นข้อมูลสมัครใหม่ทั่วไป ถ้าเคยเป็นสมาชิก เปอร์จะตรวจสิทธิ์เดิมก่อนแจ้งยอดครับ" : "ราคาล่าสุดยังตรวจไม่ได้ เดี๋ยวเปอร์เช็กยอดให้ก่อนโอนครับ",
  ].join("\n");
}

function careBack(now) {
  if (now < Date.parse("2026-10-01T00:00:00+07:00") || now >= Date.parse("2026-11-01T00:00:00+07:00")) return "";
  return "\n\nเดือนนี้มี CARE BACK ถึง 31 ต.ค. 2569 ครับ สมาชิกเดิมสอบถามต่ออายุล่วงหน้าได้ เปอร์จะตรวจสถานะและเงื่อนไขก่อนสรุปโบนัสให้ คูปองบริการสูงสุด 10% หลังอวยพรและผ่านเงื่อนไข แยกจากค่าสมาชิกครับ";
}

export function resolveLineIntakeReply(event = {}, continuity = {}, catalog = null, now = Date.now()) {
  const topic = lineIntakeTopic(event, continuity, now);
  if (!topic) return null;
  const command = lineIntakeCommand(event);
  const raw = normalize(event.message.text);
  const prior = continuity.matrix?.payload_json?.rich_menu_v1 || {};
  const state = command ? { entry: ENTRY, topic, expires_at: new Date(now + WINDOW_MS).toISOString() } : { ...prior };
  let answer, handoff = false;
  if (!command && /(สลิป|ชำระ|โอน|จ่าย|คืนเงิน|refund|payment|paid|black\s*card|บัตรดำ|svip|\bvip\b|ร้องเรียน)/i.test(raw)) {
    answer = "ได้ครับ เดี๋ยวเปอร์ตรวจรายการและเงื่อนไขให้ก่อนนะครับ ถ้าโอนหรือส่งสลิปแล้ว ยังไม่ต้องโอนซ้ำครับ ข้อความนี้ยังไม่ยืนยันการชำระ สมาชิก หรือการจองครับ";
    handoff = true;
  } else if (topic === "apply") {
    answer = command
      ? "สนใจสมัครเป็นนายแบบกับ MMD ใช่ไหมครับ 📸\nส่งชื่อที่สะดวกใช้ติดต่อกับจังหวัดที่อยู่มาได้เลยครับ ถ้ามีโปรไฟล์อยู่แล้วส่งประกอบในแชตนี้ได้ เปอร์จะดูและแจ้งขั้นตอนต่อให้ครับ"
      : "รับข้อมูลเบื้องต้นแล้วครับ ถ้ามีรูปหรือโปรไฟล์เพิ่มเติมส่งต่อในแชตนี้ได้เลย เดี๋ยวเปอร์ดูรายละเอียดและแจ้งขั้นตอนสมัครให้ครับ ยังไม่ถือว่าผ่านการคัดเลือกนะครับ";
    handoff = !command;
  } else if (!command && /(ต่ออายุ|หมดอายุ|เคย|สมาชิกเดิม|renew)/i.test(raw) && !/(ไม่เคย|ยังไม่เคย)/.test(raw)) {
    answer = "ถ้าเคยเป็นสมาชิก ให้พิมพ์ checkpts ได้เลยครับ เปอร์จะดูสถานะ วันหมดอายุ และสิทธิ์ของบัญชีเดิมก่อน ไม่ต้องสมัครซ้ำหรือโอนก่อนครับ";
  } else if (topic === "package" && (command || /^(ต่างกันยังไง|ต่างกันอย่างไร|รายละเอียด|ขอรายละเอียด|ราคา|ราคาเท่าไหร่|ราคาเท่าไร|สิทธิประโยชน์)(ครับ|ค่ะ|คะ)?[.!?]*$/.test(raw))) {
    answer = packageText(catalog) + careBack(now) + "\n\nเคยเป็นสมาชิกกับ MMD มาก่อนไหมครับ?";
  } else if (command === "regis" || /^(?:สมัคร(?:สมาชิก)?|regis|standard|premium|สแตนดาร์ด|พรีเมียม)(?:ครับ|ค่ะ|คะ)?[.!?]*$/.test(raw)) {
    state.topic = "regis";
    state.selected_package = /standard|สแตนดาร์ด/.test(raw) ? "standard" : /premium|พรีเมียม/.test(raw) ? "premium" : "";
    answer = (state.selected_package ? `สนใจ ${state.selected_package === "standard" ? "Standard" : "Premium"} ได้ครับ` : packageText(catalog) + careBack(now)) +
      "\n\nเคยเป็นสมาชิกกับ MMD มาก่อนไหมครับ? คุยและส่งข้อมูลต่อในแชตนี้ได้เลย ยังไม่ต้องเข้าแอปหรือโอนเงินก่อนครับ";
  } else {
    answer = "ได้ครับ เดี๋ยวเปอร์ตรวจข้อมูลเดิมและสรุปแพ็กเกจ ยอด พร้อมบัญชีรับเงินที่ถูกต้องให้ในแชตนี้ก่อนโอนครับ ถ้ามีรายการชำระอยู่แล้วไม่ต้องโอนซ้ำนะครับ";
    handoff = true;
  }
  return { text: answer, intent: INTENTS[state.topic], inferred_intent: INTENTS[state.topic],
    reply_source: "line_intake_command_v1", model_attempted: false, live_truth_used: false,
    handoff_required: handoff, handoff_reason: handoff ? "line_intake:per_review" : "",
    rich_menu_state: { ...state, closed: handoff }, cta_appended: false };
}
