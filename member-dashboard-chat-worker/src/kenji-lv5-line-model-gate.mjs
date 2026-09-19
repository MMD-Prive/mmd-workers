import { parseKenjiLv5LineIntent } from "./kenji-lv5-line-operational.mjs";

const MODEL_ACCESS_RPC_PATH = "/v1/internal/kenji/model-access";

function text(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function lineUserId(event = {}) {
  const value = event?.source?.type === "user" ? text(event?.source?.userId, 80) : "";
  return /^U[0-9a-f]{32}$/i.test(value) ? value : "";
}

async function callModelAccess(env = {}, userId = "", query = "") {
  const internalToken = text(env.INTERNAL_TOKEN, 2000);
  if (!env.ADMIN_WORKER?.fetch || !internalToken || !userId || !query) return { status: "unavailable" };
  try {
    const response = await env.ADMIN_WORKER.fetch(new Request(`https://admin-worker.local${MODEL_ACCESS_RPC_PATH}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${internalToken}`,
        "content-type": "application/json",
        "x-mmd-internal-call": "true",
        "x-mmd-service-binding": "member-dashboard-chat-worker",
      },
      body: JSON.stringify({ line_user_id: userId, query }),
    }));
    if (!response.ok) return { status: "unavailable" };
    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== "object") return { status: "unavailable" };
    return {
      status: text(payload.status, 80) || "silent",
      model: payload.model && typeof payload.model === "object" ? {
        model_code: text(payload.model.model_code, 80),
        working_name: text(payload.model.working_name, 120),
      } : null,
    };
  } catch {
    return { status: "unavailable" };
  }
}

export async function resolveKenjiLv5LineModelGate({ env = {}, event = {}, currentIntent = "", parsedIntent = null, now = new Date() } = {}) {
  const parsed = parsedIntent && typeof parsedIntent === "object"
    ? parsedIntent
    : parseKenjiLv5LineIntent(event, currentIntent, now);
  if (!parsed || parsed.type !== "booking" || !text(parsed.model_name, 120)) {
    return { required: false, status: "not_required", parsed };
  }
  const userId = lineUserId(event);
  if (!userId) return { required: true, status: "unavailable", parsed };
  const access = await callModelAccess(env, userId, parsed.model_name);
  return { required: true, ...access, parsed };
}

export function renderKenjiLv5ModelGateReply(gate = {}) {
  if (gate.required !== true) return "";
  if (gate.status === "match") return "";
  if (gate.status === "renewal") {
    return "สถานะสมาชิกตอนนี้ยังไม่เปิดสิทธิ์กับนายแบบที่ขอครับ ผมยังไม่เช็กคิวต่อให้เป็นการยืนยันงานจนกว่าสถานะสมาชิกจะกลับมาใช้งานได้ครับ";
  }
  if (gate.status === "clarification") {
    return "ขอชื่อที่ใช้ทำงานหรือรหัสนายแบบให้ครบอีกนิดครับ ผมจะใช้วัน เวลา และสถานที่ที่ส่งมาแล้วต่อให้ ไม่ต้องพิมพ์ใหม่ทั้งหมด";
  }
  if (gate.status === "verification_required") {
    return "สิทธิ์เข้าถึงนายแบบที่ขอยังต้องยืนยันบัญชีก่อนครับ ผมเก็บวัน เวลา และสถานที่ชุดนี้ไว้ต่อได้ หลังยืนยันแล้วไม่ต้องเริ่มใหม่ครับ";
  }
  return "ผมยังยืนยันสิทธิ์กับนายแบบที่ขอจากบัญชีนี้ไม่ได้ครับ จึงยังไม่เปิดข้อมูลคิวหรือถือว่าเป็นการจอง ผมรับรายละเอียดที่ส่งมาไว้แล้วและจะให้ตรวจสิทธิ์ก่อนครับ";
}
