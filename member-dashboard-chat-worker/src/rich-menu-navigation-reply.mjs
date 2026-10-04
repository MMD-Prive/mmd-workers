import { getMmdRichMenuDestinationMap } from "./mmd-rich-menu-scheduled-runtime.mjs";

const COPY = {
  guest: ["กดเพื่อกรอกข้อมูลในหน้าถัดไปได้เลยครับ", "เปิดดูน้อง ๆ ฝั่ง Public ได้ตรงนี้ครับ", "แจ้งวัน เวลา และรายละเอียดงานได้ตรงนี้ครับ", "ดูบริการ Companion และรูปแบบงานได้ตรงนี้ครับ", "เข้าไปอ่าน TRUST ME IN BANGKOK ได้ตรงนี้ครับ"],
  public: ["ที่นี่พี่เปอร์ดูแลงานให้ครับ บอกเรื่องที่อยากให้ช่วยได้เลยครับ", "เปิดดูน้อง ๆ ฝั่ง Public ได้ตรงนี้ครับ", "แจ้งวัน เวลา และรายละเอียดงานได้ตรงนี้ครับ", "เปิด MY MMD เพื่อดูข้อมูลและสิทธิ์ล่าสุดของคุณครับ", "เริ่มดู PRIVÉ ACCESS ได้ตรงนี้ครับ"],
  private: ["", "เปิดดู MODEL CARDS ตามสิทธิ์ของคุณได้ตรงนี้ครับ", "ส่งรายละเอียดงานที่ต้องการได้ตรงนี้ครับ", "เปิด MY MMD เพื่อดูข้อมูลและสิทธิ์ล่าสุดของคุณครับ", "ดูข่าวและอัปเดตล่าสุดใน MY MMD ได้ตรงนี้ครับ"],
};

export function richMenuNavigation(event = {}) {
  if (event.type !== "postback") return null;
  const params = new URLSearchParams(String(event.postback?.data || ""));
  if (params.get("mmd_action") !== "rich_menu" || params.getAll("mmd_action").length !== 1) return null;
  if ([...params.keys()].some(key => !["mmd_action", "menu", "button"].includes(key))) return null;
  if (params.getAll("menu").length !== 1 || params.getAll("button").length !== 1) return null;
  const menu = params.get("menu"), value = params.get("button");
  if (!/^[0-5]$/.test(value || "") || !Object.hasOwn(COPY, menu || "")) return null;
  const button = Number(value), action = getMmdRichMenuDestinationMap()[menu][button];
  if (!(action?.type === "uri" || (menu === "public" && button === 0 && action?.type === "message")) || !COPY[menu][button]) return null;
  return { menu, button, action };
}

export async function resolveRichMenuNavigation(event, { getContext } = {}) {
  const navigation = richMenuNavigation(event);
  if (!navigation) return null;
  const { menu, button, action } = navigation;
  let route = action.uri, copy = COPY[menu][button], verified = false;
  if (menu === "private") {
    let context;
    try { context = await getContext?.(); } catch { /* Require fresh member truth. */ }
    verified = context?.live_truth === true && context.identity_state === "matched" &&
      ["active", "expiring_soon"].includes(context.membership_state) &&
      (context.level || context.membership_level) === "private" &&
      Boolean(context.private_visibility_envelope && context.private_visibility_envelope !== "none");
    if (!verified) {
      route = getMmdRichMenuDestinationMap().public[4].uri;
      copy = "กดผ่าน LINE เพื่อตรวจสิทธิ์ล่าสุดก่อนเข้าหน้า Private ได้ตรงนี้ครับ";
    }
  }
  return {
    intent: "rich_menu_navigation", inferred_intent: "rich_menu_navigation",
    text: route ? `${copy}\n${route}` : copy, reply_source: "rich_menu_navigation_v1",
    cta_type: route ? "open_action_route" : "continue_in_chat", cta_route: route || "", cta_label: action.label,
    cta_appended: false, live_truth_used: verified,
    guard_blocked: menu === "private" && !verified,
    guard_reason: menu === "private" && !verified ? "private_navigation_requires_live_truth" : "",
    handoff_required: false, model_attempted: false,
  };
}
