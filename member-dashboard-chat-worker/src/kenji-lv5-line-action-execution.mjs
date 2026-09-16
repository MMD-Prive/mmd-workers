const ACTION_PATH = "/v1/internal/kenji/actions/execute";

function text(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function lineUserId(event = {}) {
  const id = text(event?.source?.userId, 80);
  return /^U[0-9a-f]{32}$/i.test(id) ? id : "";
}

function actionId(event = {}) {
  const messageId = text(event?.message?.id || event?.webhookEventId, 120).replace(/[^A-Za-z0-9_-]/g, "_");
  const user = lineUserId(event);
  return messageId && user ? `line:${messageId}:${user.slice(-12)}`.slice(0, 180) : "";
}

export function shouldExecuteKenjiLv5BookingAction({ event = {}, modelGate = {}, decision = {}, canonicalClientId = "" } = {}) {
  const parsed = modelGate?.parsed || {};
  return Boolean(
    event?.source?.type === "user"
    && lineUserId(event)
    && actionId(event)
    && /^rec[A-Za-z0-9]+$/.test(text(canonicalClientId, 80))
    && modelGate?.required === true
    && modelGate?.status === "match"
    && text(parsed.type, 40) === "booking"
    && text(parsed.model_name, 120)
    && /^\d{4}-\d{2}-\d{2}$/.test(text(parsed.date, 10))
    && /^\d{2}:\d{2}$/.test(text(parsed.time, 5))
    && text(parsed.location, 160)
    && decision?.live_truth_verified === true
    && text(decision?.operational?.primary_action, 80) === "prepare_booking_intent"
  );
}

export async function executeKenjiLv5LineBookingAction({ env = {}, event = {}, modelGate = {}, decision = {}, canonicalClientId = "" } = {}) {
  if (!shouldExecuteKenjiLv5BookingAction({ event, modelGate, decision, canonicalClientId })) {
    return { attempted: false, executed: false, status: "not_eligible" };
  }
  if (!env.ADMIN_WORKER?.fetch || !text(env.INTERNAL_TOKEN, 2000)) {
    return { attempted: true, executed: false, status: "action_transport_unavailable" };
  }

  const parsed = modelGate.parsed || {};
  const canonicalModelName = text(modelGate?.model?.working_name || parsed.model_name, 120);
  const payload = {
    schema: "mmd.kenji_supervised_action.v1",
    action: "create_booking_request",
    action_id: actionId(event),
    client: {
      canonical_client_id: text(canonicalClientId, 80),
      line_user_id: lineUserId(event),
    },
    intent: {
      type: "booking",
      model_name: canonicalModelName,
      date: text(parsed.date, 10),
      time: text(parsed.time, 5),
      location: text(parsed.location, 160),
    },
  };

  try {
    const response = await env.ADMIN_WORKER.fetch(new Request(`https://admin-worker.local${ACTION_PATH}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${text(env.INTERNAL_TOKEN, 2000)}`,
        "content-type": "application/json",
        "x-mmd-internal-call": "true",
        "x-mmd-service-binding": "member-dashboard-chat-worker",
      },
      body: JSON.stringify(payload),
    }));
    const result = await response.json().catch(() => null);
    return {
      attempted: true,
      executed: response.ok && result?.ok === true && result?.executed === true,
      status: text(result?.status || (response.ok ? "unknown" : `http_${response.status}`), 80),
      http_status: response.status,
      receipt: result && typeof result === "object" ? result : null,
    };
  } catch (error) {
    return { attempted: true, executed: false, status: "action_request_failed", error: text(error?.message || error, 160) };
  }
}

export function applyKenjiLv5BookingActionToDecision(decision = {}, actionResult = {}) {
  if (actionResult?.attempted !== true) return decision;
  const operational = {
    ...(decision.operational || {}),
    phase: "P4_supervised_action_execution",
    action_attempted: true,
    action_executed: actionResult.executed === true,
    action_status: text(actionResult.status, 80),
    action_receipt: actionResult.receipt || null,
  };

  if (actionResult.executed === true) {
    const bookingRef = text(actionResult?.receipt?.booking_ref, 80);
    return {
      ...decision,
      text: `ผมเปิด Booking Request${bookingRef ? ` ${bookingRef}` : ""} ให้แล้วครับ รายละเอียดถูกบันทึกจากข้อมูลปัจจุบันแล้ว แต่รายการนี้ยังเป็น Draft — ยังไม่ถือว่าคอนเฟิร์มนายแบบ ไม่ได้สร้างยอดชำระ และยังไม่มีการตัดเครดิตจนกว่าจะผ่านขั้นตอนยืนยันต่อครับ`,
      reply_source: "lv5_p4_booking_request_created",
      handoff_required: false,
      handoff_reason: "",
      truth_status: "verified_live_action_executed",
      operational,
    };
  }

  return {
    ...decision,
    text: "รายละเอียดครบแล้วครับ และคิวที่ขอไม่ชนกับงานที่เห็นตอนนี้ แต่ขั้นตอนบันทึก Booking Request ยังไม่ผ่านครบ ผมจึงยังไม่บอกว่าเปิดรายการสำเร็จหรือคอนเฟิร์มงานครับ รายละเอียดเดิมยังคงใช้ต่อได้",
    reply_source: "lv5_p4_action_degraded",
    handoff_required: true,
    handoff_reason: `lv5_p4:${text(actionResult.status, 80) || "action_failed"}`,
    truth_status: "verified_live_action_not_executed",
    operational,
  };
}

export const KENJI_LV5_LINE_ACTION_INTERNALS = Object.freeze({ actionId, lineUserId });
