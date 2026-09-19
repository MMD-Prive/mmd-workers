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

function bookingIntentActionId(event = {}) {
  const user = lineUserId(event);
  const timestamp = Number(event?.timestamp || 0);
  if (!user || !Number.isFinite(timestamp) || timestamp <= 0) return actionId(event);
  const twoHourBucket = Math.floor(timestamp / (2 * 60 * 60 * 1000));
  return `line:deposit:${twoHourBucket}:${user.slice(-12)}`.slice(0, 180);
}

function matrixActionId(parsed = {}) {
  const id = text(parsed?.matrix_action_id, 180);
  return /^[A-Za-z0-9:_-]{8,180}$/.test(id) ? id : "";
}

function resolvedActionId(event = {}, parsed = {}, captureIntent = false) {
  return matrixActionId(parsed) || (captureIntent ? bookingIntentActionId(event) : actionId(event));
}

export function shouldCaptureKenjiLv5BookingIntent({ event = {}, modelGate = {}, canonicalClientId = "" } = {}) {
  const parsed = modelGate?.parsed || {};
  return Boolean(
    event?.source?.type === "user"
    && lineUserId(event)
    && resolvedActionId(event, parsed, true)
    && /^rec[A-Za-z0-9]+$/.test(text(canonicalClientId, 80))
    && text(parsed.type, 40) === "booking"
    && text(parsed.trigger, 40) === "deposit"
  );
}

export function shouldExecuteKenjiLv5BookingAction({ event = {}, modelGate = {}, decision = {}, canonicalClientId = "" } = {}) {
  const parsed = modelGate?.parsed || {};
  return Boolean(
    event?.source?.type === "user"
    && lineUserId(event)
    && resolvedActionId(event, parsed, false)
    && /^rec[A-Za-z0-9]+$/.test(text(canonicalClientId, 80))
    && modelGate?.required === true
    && modelGate?.status === "match"
    && text(parsed.type, 40) === "booking"
    && text(parsed.model_name, 120)
    && /^\d{4}-\d{2}-\d{2}$/.test(text(parsed.date, 10))
    && /^\d{2}:\d{2}$/.test(text(parsed.time, 5))
    && text(parsed.location, 160)
    && Number(parsed.amount_thb || 0) > 0
    && decision?.live_truth_verified === true
    && text(decision?.operational?.primary_action, 80) === "prepare_booking_intent"
  );
}

export async function executeKenjiLv5LineBookingAction({ env = {}, event = {}, modelGate = {}, decision = {}, canonicalClientId = "" } = {}) {
  const captureIntent = shouldCaptureKenjiLv5BookingIntent({ event, modelGate, canonicalClientId });
  if (!captureIntent && !shouldExecuteKenjiLv5BookingAction({ event, modelGate, decision, canonicalClientId })) {
    return { attempted: false, executed: false, status: "not_eligible" };
  }
  if (!env.ADMIN_WORKER?.fetch || !text(env.INTERNAL_TOKEN, 2000)) {
    return { attempted: true, executed: false, status: "action_transport_unavailable" };
  }

  const parsed = modelGate.parsed || {};
  const canonicalModelName = text(modelGate?.status === "match" ? modelGate?.model?.working_name : parsed.model_name, 120);
  const payload = {
    schema: "mmd.kenji_supervised_action.v1",
    action: captureIntent ? "capture_booking_intent" : "create_booking_request",
    action_id: resolvedActionId(event, parsed, captureIntent),
    client: {
      canonical_client_id: text(canonicalClientId, 80),
      line_user_id: lineUserId(event),
    },
    intent: {
      type: "booking",
      trigger: text(parsed.trigger, 40),
      model_name: canonicalModelName,
      customer_name: text(parsed.customer_name, 120),
      date: text(parsed.date, 10),
      time: text(parsed.time, 5),
      end_time: text(parsed.end_time, 5),
      duration_hours: Number(parsed.duration_hours || 0),
      location: text(parsed.location, 160),
      amount_thb: Number(parsed.amount_thb || 0),
      deposit_amount_thb: Number(parsed.deposit_amount_thb || 0),
      raw: text(parsed.raw, 1000),
      source_message_id: text(event?.message?.id || event?.webhookEventId, 120),
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
    if (actionResult.status === "job_created") {
      const sessionId = text(actionResult?.receipt?.session_id, 120);
      return {
        ...decision,
        text: `สร้าง Job${sessionId ? ` ${sessionId}` : ""} จากข้อมูลที่ให้มาแล้วครับ ตอนนี้ยังรอลูกค้าและนายแบบยืนยัน และยังไม่ถือว่าได้รับชำระจนกว่าระบบเงินจะตรวจสอบครับ`,
        reply_source: "lv5_p4_job_created",
        handoff_required: false,
        handoff_reason: "",
        truth_status: "verified_live_job_created",
        operational,
      };
    }
    if (["booking_intent_collected", "booking_intent_review_required"].includes(actionResult.status)) {
      return {
        ...decision,
        text: actionResult.status === "booking_intent_review_required"
          ? "ผมเก็บ Booking Intent ไว้แล้วครับ แต่มีจุดที่ต้องตรวจในระบบก่อน จึงยังไม่สร้าง Job หรือยืนยันการชำระเงินครับ"
          : decision.text,
        reply_source: `lv5_p4_${actionResult.status}`,
        handoff_required: actionResult.status === "booking_intent_review_required",
        handoff_reason: actionResult.status === "booking_intent_review_required" ? "lv5_p4:booking_intent_review_required" : "",
        truth_status: "booking_intent_draft",
        operational,
      };
    }
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

export const KENJI_LV5_LINE_ACTION_INTERNALS = Object.freeze({ actionId, bookingIntentActionId, matrixActionId, resolvedActionId, lineUserId });
