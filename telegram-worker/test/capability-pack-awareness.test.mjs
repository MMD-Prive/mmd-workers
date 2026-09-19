import test from "node:test";
import assert from "node:assert/strict";

import worker from "../src/index.js";

const WEBHOOK_URL = "https://telegram-worker.mmd.test/telegram/webhook";

function env(overrides = {}) {
  return {
    TELEGRAM_WEBHOOK_SECRET_TOKEN: "expected-secret",
    TELEGRAM_BOT_TOKEN: "telegram-token",
    TELEGRAM_BOT_USERNAME: "mmdprivebot",
    TELEGRAM_CHAT_ID: "-1003546439681",
    TELEGRAM_STANDARD_GROUP_ID: "-1002073919780",
    MMD_PUBLIC_BASE_URL: "https://www.mmdbkk.com",
    ...overrides,
  };
}

function req(text, {
  chatId = 111111,
  chatType = "private",
  fromId = 111111,
} = {}) {
  return new Request(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": "expected-secret",
    },
    body: JSON.stringify({
      update_id: 12000,
      message: {
        message_id: 300,
        text,
        chat: { id: chatId, type: chatType },
        from: { id: fromId, username: "member" },
      },
    }),
  });
}
function callbackReq(data, {
  chatId = 111111,
  chatType = "private",
  fromId = 111111,
} = {}) {
  return new Request(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": "expected-secret",
    },
    body: JSON.stringify({
      update_id: 12001,
      callback_query: {
        id: "callback-1",
        from: { id: fromId, username: "member" },
        data,
        message: {
          message_id: 301,
          chat: { id: chatId, type: chatType },
        },
      },
    }),
  });
}


test("HYPE Shop Orders reads bounded member-owned Order Payment Fulfillment truth in private chat", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let sent = null;
  let serviceBody = null;
  globalThis.fetch = async (_url, init = {}) => {
    sent = JSON.parse(String(init.body || "{}"));
    return Response.json({ ok: true, result: { message_id: 3001 } });
  };

  try {
    const response = await worker.fetch(req("GG Water ของผมถึงไหนแล้ว"), env({
      HYPE_OPERATIONS: {
        async fetch(request) {
          serviceBody = JSON.parse(await request.clone().text());
          assert.equal(new URL(request.url).pathname, "/__internal/hype/shop-orders");
          return Response.json({
            ok: true,
            state: "ready",
            authority: "mmd.hype_shop_orders_projection.v1",
            display_name: "ลูกค้า A",
            orders: [{
              order_id: "MMD-ORDER-001",
              order_date: "2026-09-18T10:00:00.000Z",
              order_status: "confirmed",
              payment_status: "paid",
              total_thb: 2500,
              items: [{ item_name: "GG Water 25ml", quantity: 1, line_total_thb: 2500, status: "confirmed" }],
              fulfillment: { state: "shipped", courier: "Example Express", tracking_number: "TRACK123" },
            }],
            correlation: {
              auto_correlation_allowed: true,
              candidate_count: 1,
              candidate_order_id: "MMD-ORDER-001",
              method: "single_recent_owned_order",
            },
          });
        },
      },
    }));
    const body = await response.json();

    assert.equal(body.flow, "hype_operating_orders_inline");
    assert.equal(body.ok, true);
    assert.equal(serviceBody.telegram_user_id, "111111");
    assert.match(sent.text, /MMD SHOP ORDERS/);
    assert.match(sent.text, /MMD-ORDER-001/);
    assert.match(sent.text, /Payment:<\/b> paid/);
    assert.match(sent.text, /Fulfillment:<\/b> shipped/);
    assert.match(sent.text, /TRACK123/);
    assert.match(sent.text, /GG Water 25ml/);
    assert.match(sent.text, /ไม่ mark paid \/ shipped \/ delivered \/ refunded/);
    const urls = sent.reply_markup.inline_keyboard.flat().map((item) => item.url);
    assert.equal(urls.some((url) => new URL(url).pathname === "/my-mmd/orders"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HYPE never reads private Shop Orders in a group", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let sent = null;
  let operationsCalled = false;
  globalThis.fetch = async (_url, init = {}) => {
    sent = JSON.parse(String(init.body || "{}"));
    return Response.json({ ok: true, result: { message_id: 30015 } });
  };

  try {
    const response = await worker.fetch(req("/orders", {
      chatId: -1002073919780,
      chatType: "supergroup",
    }), env({
      HYPE_OPERATIONS: {
        async fetch() {
          operationsCalled = true;
          throw new Error("group must not resolve private shop orders");
        },
      },
    }));
    const body = await response.json();

    assert.equal(body.flow, "hype_operating_private_required");
    assert.equal(operationsCalled, false);
    assert.match(sent.text, /เฉพาะใน private chat/);
    assert.doesNotMatch(sent.text, /MMD-ORDER|Payment:<\/b>|Tracking:<\/b>/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HYPE Hall awareness is group-safe and never resolves private Client context", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let sent = null;
  let operationsCalled = false;
  globalThis.fetch = async (_url, init = {}) => {
    sent = JSON.parse(String(init.body || "{}"));
    return Response.json({ ok: true, result: { message_id: 3002 } });
  };

  try {
    const response = await worker.fetch(req("/hall", {
      chatId: -1002073919780,
      chatType: "supergroup",
    }), env({
      HYPE_OPERATIONS: {
        async fetch() {
          operationsCalled = true;
          throw new Error("Hall route must not read Client 360 in group");
        },
      },
    }));
    const body = await response.json();

    assert.equal(body.flow, "hype_operating_hall_route");
    assert.equal(operationsCalled, false);
    assert.match(sent.text, /ไม่เดาเพศ\/ความสนใจ/);
    assert.match(sent.text, /Hall audience/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HYPE bridges MMS Therapist options to HENNA/MMS authority instead of claiming confirmation", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let sent = null;
  globalThis.fetch = async (_url, init = {}) => {
    sent = JSON.parse(String(init.body || "{}"));
    return Response.json({ ok: true, result: { message_id: 3003 } });
  };

  try {
    const response = await worker.fetch(req("ช่วยหา therapist ที่เหมาะหน่อย"), env());
    const body = await response.json();

    assert.equal(body.flow, "hype_operating_mms_options_bridge");
    assert.match(sent.text, /HENNA \/ MMS เป็น specialist owner/);
    assert.match(sent.text, /ยังไม่ถือว่า Confirm Therapist/);
    assert.doesNotMatch(sent.text, /ว่างแน่นอน|ยืนยัน Therapist แล้ว/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HYPE service recovery creates a Per handoff with recovery reason and existing context", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const sends = [];
  let handoffBody = null;
  let transitionBody = null;

  globalThis.fetch = async (_url, init = {}) => {
    const payload = JSON.parse(String(init.body || "{}"));
    sends.push(payload);
    return Response.json({ ok: true, result: { message_id: 3100 + sends.length } });
  };

  try {
    const response = await worker.fetch(req("งานมีปัญหา น้องยังไม่มา"), env({
      HYPE_CONTEXT_WRITER: {
        async fetch(request) {
          const pathname = new URL(request.url).pathname;
          const payload = JSON.parse(await request.clone().text());
          if (pathname === "/__internal/hype/handoff") {
            handoffBody = payload;
            return Response.json({
              ok: true,
              state: "handoff_ready",
              target: "per",
              handoff_id: "HYPE-PER-20260919120000-deadbeef",
              display_name: "ลูกค้า A",
              line_continuity_ready: true,
              operator_summary: "Recovery case · active job · customer reports model has not arrived.",
            });
          }
          if (pathname === "/__internal/hype/handoff-status") {
            transitionBody = payload;
            return Response.json({
              ok: true,
              state: "sent",
              handoff_id: "HYPE-PER-20260919120000-deadbeef",
              target: "per",
            });
          }
          return Response.json({ ok: false, error: "unexpected_path" }, { status: 404 });
        },
      },
    }));

    const body = await response.json();
    assert.equal(body.flow, "hype_supervised_handoff");
    assert.equal(body.target, "per");
    assert.equal(handoffBody.reason, "customer_service_recovery");
    assert.equal(handoffBody.command, "recovery");
    assert.match(handoffBody.customer_message, /น้องยังไม่มา/);
    assert.equal(body.operator_notified, true);
    assert.equal(transitionBody.state, "sent");
    assert.equal(transitionBody.actor_role, "hype");

    const customer = sends.find((item) => String(item.chat_id) === "111111");
    const ops = sends.find((item) => String(item.chat_id) === "-1003546439681");
    assert.ok(customer);
    assert.ok(ops);
    assert.match(customer.text, /ส่งต่อให้ Per แล้ว/);
    assert.match(ops.text, /HYPE → PER HANDOFF/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("HYPE shop delivery problem opens recovery with one correlated Order Payment Fulfillment Case reference", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const sends = [];
  let handoffBody = null;

  globalThis.fetch = async (_url, init = {}) => {
    const payload = JSON.parse(String(init.body || "{}"));
    sends.push(payload);
    return Response.json({ ok: true, result: { message_id: 3200 + sends.length } });
  };

  try {
    const response = await worker.fetch(req("GG Water ยังไม่ถึงเลย"), env({
      HYPE_CONTEXT_WRITER: {
        async fetch(request) {
          const pathname = new URL(request.url).pathname;
          const payload = JSON.parse(await request.clone().text());
          if (pathname === "/__internal/hype/handoff") {
            handoffBody = payload;
            return Response.json({
              ok: true,
              state: "handoff_ready",
              target: "per",
              handoff_id: "HYPE-PER-20260919123000-cafefeed",
              display_name: "ลูกค้า A",
              line_continuity_ready: true,
              recovery_correlation: {
                domain: "mmd_shop",
                state: "correlated",
                correlated: true,
                case_ref: "HYPE-PER-20260919123000-cafefeed",
                order_id: "MMD-ORDER-001",
                order_status: "confirmed",
                payment_status: "paid",
                fulfillment_state: "shipped",
              },
              operator_summary: "Shop Recovery: Order MMD-ORDER-001 · Payment paid · Fulfillment shipped · Case HYPE-PER-20260919123000-cafefeed",
            });
          }
          if (pathname === "/__internal/hype/handoff-status") {
            return Response.json({
              ok: true,
              state: "sent",
              handoff_id: "HYPE-PER-20260919123000-cafefeed",
              target: "per",
            });
          }
          return Response.json({ ok: false, error: "unexpected_path" }, { status: 404 });
        },
      },
    }));

    const body = await response.json();
    assert.equal(body.flow, "hype_supervised_handoff");
    assert.equal(body.target, "per");
    assert.equal(body.handoff_id, "HYPE-PER-20260919123000-cafefeed");
    assert.equal(handoffBody.command, "recovery");
    assert.match(handoffBody.customer_message, /GG Water ยังไม่ถึง/);

    const customer = sends.find((item) => String(item.chat_id) === "111111");
    const ops = sends.find((item) => String(item.chat_id) === "-1003546439681");
    assert.ok(customer);
    assert.ok(ops);
    assert.match(customer.text, /MMD-ORDER-001/);
    assert.match(customer.text, /Payment: paid · Fulfillment: shipped/);
    assert.match(customer.text, /HYPE-PER-20260919123000-cafefeed/);
    assert.match(customer.text, /ไม่ต้องเล่าข้อมูลเดิมซ้ำ/);
    assert.match(ops.text, /Shop recovery correlation/);
    assert.match(ops.text, /MMD-ORDER-001/);
    assert.doesNotMatch(customer.text, /refund approved|delivered ✅|คืนเงินแล้ว/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("ambiguous Shop recovery renders customer-safe inline Order picker on the same Case", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const sends = [];

  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.includes("/sendMessage")) {
      const payload = JSON.parse(String(init.body || "{}"));
      sends.push(payload);
      return Response.json({ ok: true, result: { message_id: 3250 + sends.length } });
    }
    throw new Error("unexpected fetch " + target);
  };

  try {
    const response = await worker.fetch(req("GG Water ยังไม่ถึง ช่วยตามให้หน่อย"), env({
      HYPE_CONTEXT_WRITER: {
        async fetch(request) {
          const pathname = new URL(request.url).pathname;
          if (pathname === "/__internal/hype/handoff") {
            return Response.json({
              ok: true,
              state: "handoff_ready",
              target: "per",
              handoff_id: "HYPE-PER-20260919124500-feedface",
              display_name: "ลูกค้า A",
              line_continuity_ready: true,
              recovery_case: {
                case_ref: "HYPE-PER-20260919124500-feedface",
                domain: "mmd_shop",
                state: "prepared",
                outcome_code: "intake_received",
                outcome_label: "รับเคสแล้ว",
              },
              recovery_correlation: {
                domain: "mmd_shop",
                state: "ambiguous",
                correlated: false,
                case_ref: "HYPE-PER-20260919124500-feedface",
                candidate_count: 2,
                options: [
                  {
                    order_id: "MMD-ORDER-A",
                    order_date: "2026-09-18T10:00:00.000Z",
                    total_thb: 2500,
                    item_summary: "GG Water 25ml",
                  },
                  {
                    order_id: "MMD-ORDER-B",
                    order_date: "2026-09-17T10:00:00.000Z",
                    total_thb: 4500,
                    item_summary: "GG Water 50ml",
                  },
                ],
              },
              operator_summary: "Shop recovery requires customer Order selection.",
            });
          }
          if (pathname === "/__internal/hype/handoff-status") {
            return Response.json({
              ok: true,
              state: "sent",
              handoff_id: "HYPE-PER-20260919124500-feedface",
              target: "per",
            });
          }
          return Response.json({ ok: false }, { status: 404 });
        },
      },
    }));

    const body = await response.json();
    assert.equal(body.flow, "hype_supervised_handoff");
    const customer = sends.find((item) => String(item.chat_id) === "111111");
    const ops = sends.find((item) => String(item.chat_id) === "-1003546439681");
    assert.ok(customer);
    assert.ok(ops);
    assert.match(customer.text, /พบมากกว่า 1 Order/);
    assert.match(customer.text, /HYPE-PER-20260919124500-feedface/);

    const callbacks = customer.reply_markup.inline_keyboard
      .flat()
      .map((item) => item.callback_data)
      .filter(Boolean);
    assert.deepEqual(callbacks, [
      "hrop|HYPE-PER-20260919124500-feedface|0",
      "hrop|HYPE-PER-20260919124500-feedface|1",
    ]);
    assert.doesNotMatch(callbacks.join("|"), /MMD-ORDER-A|MMD-ORDER-B/);
    assert.match(ops.text, /Recovery domain:<\/b> mmd_shop/);
    assert.match(ops.text, /Terminal outcomes:/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("recovery Order picker callback selects by Case/index, clears buttons, and never sends Order id as callback data", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const telegramCalls = [];
  let selection = null;

  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    const payload = JSON.parse(String(init.body || "{}"));
    telegramCalls.push({ target, payload });
    return Response.json({ ok: true, result: { message_id: 3260 + telegramCalls.length } });
  };

  try {
    const response = await worker.fetch(callbackReq("hrop|HYPE-PER-20260919124500-feedface|1"), env({
      HYPE_CONTEXT_WRITER: {
        async fetch(request) {
          selection = JSON.parse(await request.clone().text());
          return Response.json({
            ok: true,
            state: "correlated",
            handoff_id: "HYPE-PER-20260919124500-feedface",
            replayed: false,
            recovery_correlation: {
              domain: "mmd_shop",
              state: "correlated",
              correlated: true,
              case_ref: "HYPE-PER-20260919124500-feedface",
              order_id: "MMD-ORDER-B",
              payment_status: "paid",
              fulfillment_state: "shipped",
              selected_by: "customer",
            },
            recovery_case: {
              case_ref: "HYPE-PER-20260919124500-feedface",
              domain: "mmd_shop",
              state: "reviewing",
              outcome_code: "intake_received",
            },
          });
        },
      },
    }));

    const body = await response.json();
    assert.equal(body.flow, "hype_recovery_order_picker");
    assert.equal(body.code_status, "order_linked_to_existing_case");
    assert.equal(selection.operation, "select_recovery_order");
    assert.equal(selection.telegram_user_id, "111111");
    assert.equal(selection.handoff_id, "HYPE-PER-20260919124500-feedface");
    assert.equal(selection.selection_index, 1);
    assert.equal(Object.hasOwn(selection, "order_id"), false);

    const answer = telegramCalls.find((item) => item.target.includes("/answerCallbackQuery"));
    const edit = telegramCalls.find((item) => item.target.includes("/editMessageReplyMarkup"));
    const customer = telegramCalls.find((item) => item.target.includes("/sendMessage") && String(item.payload.chat_id) === "111111");
    assert.ok(answer);
    assert.ok(edit);
    assert.deepEqual(edit.payload.reply_markup, { inline_keyboard: [] });
    assert.ok(customer);
    assert.match(customer.payload.text, /MMD-ORDER-B/);
    assert.match(customer.payload.text, /Case เดิม/);
    assert.match(customer.payload.text, /ไม่ได้เปลี่ยนสถานะ Order, Payment หรือ Fulfillment/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("ambiguous Booking recovery renders customer-safe picker and callback contains only Case/index", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const sends = [];
  const caseRef = "HYPE-PER-20260919133000-b00cb00c";

  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.includes("/sendMessage")) {
      const payload = JSON.parse(String(init.body || "{}"));
      sends.push(payload);
      return Response.json({ ok: true, result: { message_id: 3265 + sends.length } });
    }
    throw new Error("unexpected fetch " + target);
  };

  try {
    const response = await worker.fetch(req("/recovery booking มีปัญหา ช่วยตามให้หน่อย"), env({
      HYPE_CONTEXT_WRITER: {
        async fetch(request) {
          const pathname = new URL(request.url).pathname;
          if (pathname === "/__internal/hype/handoff") {
            return Response.json({
              ok: true,
              state: "handoff_ready",
              target: "per",
              handoff_id: caseRef,
              display_name: "ลูกค้า Booking",
              line_continuity_ready: true,
              recovery_case: {
                case_ref: caseRef,
                domain: "booking",
                state: "prepared",
                outcome_code: "intake_received",
                outcome_label: "รับเคสแล้ว",
              },
              recovery_correlation: {
                domain: "booking",
                state: "ambiguous",
                correlated: false,
                case_ref: caseRef,
                candidate_count: 2,
                options: [
                  {
                    booking_ref: "kenji_aaaaaaaaaaaaaaaaaaaaaaaa",
                    request_status: "pending",
                    preferred_date: "2026-10-02",
                    preferred_time: "19:00",
                    selected_model_name: "Model A",
                    summary: "Model A · private",
                  },
                  {
                    booking_ref: "kenji_bbbbbbbbbbbbbbbbbbbbbbbb",
                    request_status: "review_required",
                    preferred_date: "2026-10-03",
                    preferred_time: "20:30",
                    selected_model_name: "Model B",
                    summary: "Model B · private",
                  },
                ],
              },
              operator_summary: "Booking Recovery: ambiguous (2 owned candidates) · ask customer to choose Booking Request",
            });
          }
          if (pathname === "/__internal/hype/handoff-status") {
            return Response.json({ ok: true, state: "sent", handoff_id: caseRef, target: "per" });
          }
          return Response.json({ ok: false }, { status: 404 });
        },
      },
    }));

    const body = await response.json();
    assert.equal(body.flow, "hype_supervised_handoff");
    const customer = sends.find((item) => String(item.chat_id) === "111111");
    const ops = sends.find((item) => String(item.chat_id) === "-1003546439681");
    assert.ok(customer);
    assert.ok(ops);
    assert.match(customer.text, /Booking/);
    assert.match(customer.text, /2 รายการ/);
    const callbacks = customer.reply_markup.inline_keyboard
      .flat()
      .map((item) => item.callback_data)
      .filter(Boolean);
    assert.deepEqual(callbacks, [
      "hrbp|" + caseRef + "|0",
      "hrbp|" + caseRef + "|1",
    ]);
    assert.doesNotMatch(callbacks.join("|"), /kenji_|Model A|Model B/);
    assert.match(customer.reply_markup.inline_keyboard[0][0].text, /2026-10-02/);
    assert.match(ops.text, /Booking recovery/);
    assert.match(ops.text, /HYPE ไม่เลือก Booking\/Job แทนลูกค้า/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Booking recovery picker callback sends only Case/index to server, clears buttons, and preserves authority wording", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const telegramCalls = [];
  let selection = null;
  const caseRef = "HYPE-PER-20260919133000-b00cb00c";

  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    const payload = JSON.parse(String(init.body || "{}"));
    telegramCalls.push({ target, payload });
    return Response.json({ ok: true, result: { message_id: 3270 + telegramCalls.length } });
  };

  try {
    const response = await worker.fetch(callbackReq("hrbp|" + caseRef + "|1"), env({
      HYPE_CONTEXT_WRITER: {
        async fetch(request) {
          selection = JSON.parse(await request.clone().text());
          return Response.json({
            ok: true,
            state: "correlated",
            handoff_id: caseRef,
            replayed: false,
            recovery_correlation: {
              domain: "booking",
              state: "confirmed",
              correlated: true,
              case_ref: caseRef,
              booking_ref: "kenji_bbbbbbbbbbbbbbbbbbbbbbbb",
              session_id: "sess_booking_b",
              job_id: "JOB-BOOKING-B",
              session_state: "confirmed",
              job_state: "confirmed",
              selected_by: "customer",
            },
            recovery_case: {
              case_ref: caseRef,
              domain: "booking",
              state: "reviewing",
              outcome_code: "intake_received",
            },
          });
        },
      },
    }));

    const body = await response.json();
    assert.equal(body.flow, "hype_recovery_booking_picker");
    assert.equal(body.code_status, "booking_linked_to_existing_case");
    assert.equal(selection.operation, "select_recovery_booking");
    assert.equal(selection.telegram_user_id, "111111");
    assert.equal(selection.handoff_id, caseRef);
    assert.equal(selection.selection_index, 1);
    assert.equal(Object.hasOwn(selection, "booking_ref"), false);
    assert.equal(Object.hasOwn(selection, "job_id"), false);

    const edit = telegramCalls.find((item) => item.target.includes("/editMessageReplyMarkup"));
    const customer = telegramCalls.find((item) => item.target.includes("/sendMessage") && String(item.payload.chat_id) === "111111");
    assert.ok(edit);
    assert.deepEqual(edit.payload.reply_markup, { inline_keyboard: [] });
    assert.ok(customer);
    assert.match(customer.payload.text, /BOOKING LINKED/);
    assert.match(customer.payload.text, /kenji_bbbbbbbbbbbbbbbbbbbbbbbb/);
    assert.match(customer.payload.text, /Case เดิม/);
    assert.match(customer.payload.text, /ไม่ได้ confirm Job, Model, Payment หรือ Calendar/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ambiguous MMS recovery renders customer-safe picker and callback contains only Case/index", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const sends = [];
  const caseRef = "HYPE-PER-20260919134500-acde7788";

  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.includes("/sendMessage")) {
      const payload = JSON.parse(String(init.body || "{}"));
      sends.push(payload);
      return Response.json({ ok: true, result: { message_id: 3280 + sends.length } });
    }
    throw new Error("unexpected fetch " + target);
  };

  try {
    const response = await worker.fetch(req("/recovery MMS Therapist มีปัญหา ช่วยตามให้หน่อย"), env({
      HYPE_CONTEXT_WRITER: {
        async fetch(request) {
          const pathname = new URL(request.url).pathname;
          if (pathname === "/__internal/hype/handoff") {
            return Response.json({
              ok: true,
              state: "handoff_ready",
              target: "per",
              handoff_id: caseRef,
              display_name: "ลูกค้า MMS",
              line_continuity_ready: true,
              recovery_case: {
                case_ref: caseRef,
                domain: "mms",
                state: "prepared",
                outcome_code: "intake_received",
                outcome_label: "รับเคสแล้ว",
              },
              recovery_correlation: {
                domain: "mms",
                state: "ambiguous",
                correlated: false,
                case_ref: caseRef,
                candidate_count: 2,
                options: [
                  {
                    prebooking_id: "mmspre_111111111111111111111111",
                    prebooking_status: "coordination_pending",
                    service_date: "2026-10-02",
                    service_time: "19:00",
                    zone: "Sukhumvit",
                    skills: ["Sport Massage"],
                  },
                  {
                    prebooking_id: "mmspre_222222222222222222222222",
                    prebooking_status: "matching",
                    service_date: "2026-10-03",
                    service_time: "20:30",
                    zone: "Silom",
                    skills: ["Aroma Oil", "Office Syndrome"],
                  },
                ],
              },
              operator_summary: "MMS Recovery: ambiguous (2 owned candidates) · ask customer to choose Pre-booking",
            });
          }
          if (pathname === "/__internal/hype/handoff-status") {
            return Response.json({ ok: true, state: "sent", handoff_id: caseRef, target: "per" });
          }
          return Response.json({ ok: false }, { status: 404 });
        },
      },
    }));

    const body = await response.json();
    assert.equal(body.flow, "hype_supervised_handoff");
    const customer = sends.find((item) => String(item.chat_id) === "111111");
    const ops = sends.find((item) => String(item.chat_id) === "-1003546439681");
    assert.ok(customer);
    assert.ok(ops);
    assert.match(customer.text, /MMS Pre-booking/);
    assert.match(customer.text, /2 รายการ/);
    const callbacks = customer.reply_markup.inline_keyboard
      .flat()
      .map((item) => item.callback_data)
      .filter(Boolean);
    assert.deepEqual(callbacks, [
      "hrmp|" + caseRef + "|0",
      "hrmp|" + caseRef + "|1",
    ]);
    assert.doesNotMatch(callbacks.join("|"), /mmspre_|Sukhumvit|Silom/);
    assert.match(customer.reply_markup.inline_keyboard[1][0].text, /Silom/);
    assert.match(customer.reply_markup.inline_keyboard[1][0].text, /Aroma Oil/);
    assert.match(ops.text, /MMS recovery/);
    assert.match(ops.text, /HYPE ไม่เลือก MMS Pre-booking แทนลูกค้า/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("MMS recovery picker callback sends only Case/index to server and never claims Therapist or Payment confirmation", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const telegramCalls = [];
  let selection = null;
  const caseRef = "HYPE-PER-20260919134500-acde7788";

  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    const payload = JSON.parse(String(init.body || "{}"));
    telegramCalls.push({ target, payload });
    return Response.json({ ok: true, result: { message_id: 3290 + telegramCalls.length } });
  };

  try {
    const response = await worker.fetch(callbackReq("hrmp|" + caseRef + "|1"), env({
      HYPE_CONTEXT_WRITER: {
        async fetch(request) {
          selection = JSON.parse(await request.clone().text());
          return Response.json({
            ok: true,
            state: "correlated",
            handoff_id: caseRef,
            replayed: false,
            recovery_correlation: {
              domain: "mms",
              state: "matching",
              correlated: true,
              case_ref: caseRef,
              prebooking_id: "mmspre_222222222222222222222222",
              prebooking_status: "matching",
              service_date: "2026-10-03",
              service_time: "20:30",
              zone: "Silom",
              selected_by: "customer",
            },
            recovery_case: {
              case_ref: caseRef,
              domain: "mms",
              state: "acknowledged",
              outcome_code: "intake_received",
            },
          });
        },
      },
    }));

    const body = await response.json();
    assert.equal(body.flow, "hype_recovery_mms_picker");
    assert.equal(body.code_status, "mms_linked_to_existing_case");
    assert.equal(selection.operation, "select_recovery_mms");
    assert.equal(selection.telegram_user_id, "111111");
    assert.equal(selection.handoff_id, caseRef);
    assert.equal(selection.selection_index, 1);
    assert.equal(Object.hasOwn(selection, "prebooking_id"), false);
    assert.equal(Object.hasOwn(selection, "therapist_id"), false);

    const edit = telegramCalls.find((item) => item.target.includes("/editMessageReplyMarkup"));
    const customer = telegramCalls.find((item) => item.target.includes("/sendMessage") && String(item.payload.chat_id) === "111111");
    assert.ok(edit);
    assert.deepEqual(edit.payload.reply_markup, { inline_keyboard: [] });
    assert.ok(customer);
    assert.match(customer.payload.text, /MMS PRE-BOOKING LINKED/);
    assert.match(customer.payload.text, /mmspre_222222222222222222222222/);
    assert.match(customer.payload.text, /Case เดิม/);
    assert.match(customer.payload.text, /ไม่ได้ confirm Therapist, Booking หรือ Payment/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Owner can resolve a recovery Case only with an explicit taxonomy outcome", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const sends = [];
  let transition = null;

  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.includes("/getChatMember")) {
      return Response.json({ ok: true, result: { status: "creator" } });
    }
    if (target.includes("/sendMessage")) {
      const payload = JSON.parse(String(init.body || "{}"));
      sends.push(payload);
      return Response.json({ ok: true, result: { message_id: 3271 } });
    }
    throw new Error("unexpected fetch " + target);
  };

  try {
    const response = await worker.fetch(
      req("/case-resolve HYPE-PER-20260919120000-deadbeef reshipment_arranged"),
      env({
        HYPE_CONTEXT_WRITER: {
          async fetch(request) {
            transition = JSON.parse(await request.clone().text());
            return Response.json({
              ok: true,
              state: "resolved",
              handoff_id: "HYPE-PER-20260919120000-deadbeef",
              target: "per",
              recovery_case: {
                domain: "mmd_shop",
                outcome_code: "reshipment_arranged",
                outcome_label: "จัดส่งใหม่แล้ว",
              },
            });
          },
        },
      }),
    );
    const body = await response.json();

    assert.equal(body.ok, true);
    assert.equal(transition.operation, "transition");
    assert.equal(transition.state, "resolved");
    assert.equal(transition.actor_role, "owner");
    assert.equal(transition.recovery_outcome_code, "reshipment_arranged");
    assert.match(sends.at(-1).text, /mmd_shop/);
    assert.match(sends.at(-1).text, /จัดส่งใหม่แล้ว/);
    assert.match(sends.at(-1).text, /ไม่เปลี่ยน Payment \/ Job \/ Membership truth/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HYPE owner-only case command writes acknowledgement through the guarded handoff contract", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const sends = [];
  let transition = null;

  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.includes("/getChatMember")) {
      return Response.json({ ok: true, result: { status: "creator" } });
    }
    if (target.includes("/sendMessage")) {
      const payload = JSON.parse(String(init.body || "{}"));
      sends.push(payload);
      return Response.json({ ok: true, result: { message_id: 3301 } });
    }
    throw new Error(`unexpected fetch ${target}`);
  };

  try {
    const response = await worker.fetch(req("/case-ack HYPE-PER-20260919120000-deadbeef"), env({
      HYPE_CONTEXT_WRITER: {
        async fetch(request) {
          transition = JSON.parse(await request.clone().text());
          return Response.json({
            ok: true,
            state: "acknowledged",
            handoff_id: "HYPE-PER-20260919120000-deadbeef",
            target: "per",
          });
        },
      },
    }));
    const body = await response.json();

    assert.equal(body.flow, "hype_owner_handoff_transition");
    assert.equal(body.ok, true);
    assert.equal(body.code_status, "acknowledged");
    assert.equal(transition.operation, "transition");
    assert.equal(transition.handoff_id, "HYPE-PER-20260919120000-deadbeef");
    assert.equal(transition.state, "acknowledged");
    assert.equal(transition.actor_role, "owner");
    assert.match(sends.at(-1).text, /รับทราบเคสแล้ว/);
    assert.match(sends.at(-1).text, /ไม่เปลี่ยน Payment \/ Job \/ Membership truth/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HYPE rejects owner case state commands from non-owner Telegram users", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let contextCalled = false;
  let sent = null;

  globalThis.fetch = async (url, init = {}) => {
    const target = String(url);
    if (target.includes("/getChatMember")) {
      return Response.json({ ok: true, result: { status: "member" } });
    }
    if (target.includes("/sendMessage")) {
      sent = JSON.parse(String(init.body || "{}"));
      return Response.json({ ok: true, result: { message_id: 3302 } });
    }
    throw new Error(`unexpected fetch ${target}`);
  };

  try {
    const response = await worker.fetch(req("/case-resolve HYPE-PER-20260919120000-deadbeef"), env({
      HYPE_CONTEXT_WRITER: {
        async fetch() {
          contextCalled = true;
          throw new Error("non-owner must not reach state writer");
        },
      },
    }));
    const body = await response.json();

    assert.equal(body.flow, "hype_owner_handoff_transition");
    assert.equal(body.ok, false);
    assert.equal(body.code_status, "owner_required");
    assert.equal(contextCalled, false);
    assert.match(sent.text, /เฉพาะ Per/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HYPE /case reads the explicitly written closed-loop state without inventing resolution", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let sent = null;
  let statusRead = null;
  globalThis.fetch = async (_url, init = {}) => {
    sent = JSON.parse(String(init.body || "{}"));
    return Response.json({ ok: true, result: { message_id: 3005 } });
  };

  try {
    const response = await worker.fetch(req("เรื่องที่ส่งให้เปอร์ถึงไหนแล้ว"), env({
      HYPE_CONTEXT_WRITER: {
        async fetch(request) {
          statusRead = JSON.parse(await request.clone().text());
          return Response.json({
            ok: true,
            state: "reviewing",
            tracking: true,
            handoff_id: "HYPE-PER-20260919120000-deadbeef",
            target: "per",
            updated_at: "2026-09-19T12:01:00.000Z",
            recovery_case: {
              schema: "mmd.recovery_case.v1",
              taxonomy_version: "mmd-recovery-outcome-taxonomy-v1-20260919",
              case_ref: "HYPE-PER-20260919120000-deadbeef",
              domain: "mmd_shop",
              state: "reviewing",
              outcome_code: "awaiting_operations",
              outcome_label: "รอทีมดำเนินการ",
              outcome_terminal: false,
            },
            recovery_correlation: {
              domain: "mmd_shop",
              state: "correlated",
              correlated: true,
              case_ref: "HYPE-PER-20260919120000-deadbeef",
              order_id: "MMD-ORDER-001",
              payment_status: "paid",
              fulfillment_state: "shipped",
              live_refresh_status: "fresh",
              refreshed_at: "2026-09-19T12:01:00.000Z",
            },
          });
        },
      },
    }));
    const body = await response.json();

    assert.equal(body.flow, "hype_operating_handoff_status");
    assert.equal(body.code_status, "reviewing");
    assert.equal(statusRead.operation, "read");
    assert.equal(statusRead.telegram_user_id, "111111");
    assert.match(sent.text, /ทีมกำลังตรวจสอบ/);
    assert.match(sent.text, /HYPE-PER-20260919120000-deadbeef/);
    assert.match(sent.text, /MMD-ORDER-001/);
    assert.match(sent.text, /payment paid · fulfillment shipped/);
    assert.match(sent.text, /Recovery:<\/b> mmd_shop/);
    assert.match(sent.text, /รอทีมดำเนินการ/);
    assert.doesNotMatch(sent.text, /แจ้งลูกค้าแล้ว|แก้ไขแล้วและยืนยัน/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HYPE /case renders canonical Booking recovery correlation without treating it as Shop truth", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let sent = null;
  globalThis.fetch = async (_url, init = {}) => {
    sent = JSON.parse(String(init.body || "{}"));
    return Response.json({ ok: true, result: { message_id: 3006 } });
  };

  try {
    const response = await worker.fetch(req("/case"), env({
      HYPE_CONTEXT_WRITER: {
        async fetch() {
          return Response.json({
            ok: true,
            state: "reviewing",
            tracking: true,
            handoff_id: "HYPE-PER-20260919131000-acde1234",
            target: "per",
            recovery_case: {
              case_ref: "HYPE-PER-20260919131000-acde1234",
              domain: "booking",
              state: "reviewing",
              outcome_code: "awaiting_operations",
              outcome_label: "รอทีมดำเนินการ",
            },
            recovery_correlation: {
              domain: "booking",
              state: "confirmed",
              correlated: true,
              case_ref: "HYPE-PER-20260919131000-acde1234",
              booking_ref: "kenji_0123456789abcdef01234567",
              session_id: "sess_exact_001",
              job_id: "JOB-EXACT-001",
              session_state: "confirmed",
              job_state: "confirmed",
              live_refresh_status: "fresh",
            },
          });
        },
      },
    }));
    const body = await response.json();

    assert.equal(body.flow, "hype_operating_handoff_status");
    assert.match(sent.text, /Recovery:<\/b> booking/);
    assert.match(sent.text, /Booking Ref:<\/b> <code>kenji_0123456789abcdef01234567/);
    assert.match(sent.text, /Session:<\/b> <code>sess_exact_001/);
    assert.match(sent.text, /Job:<\/b> <code>JOB-EXACT-001/);
    assert.match(sent.text, /Booking state:<\/b> confirmed/);
    assert.doesNotMatch(sent.text, /Shop state|Order:<\/b>/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HYPE /case renders canonical MMS Pre-booking recovery correlation without exposing therapist internals", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let sent = null;
  globalThis.fetch = async (_url, init = {}) => {
    sent = JSON.parse(String(init.body || "{}"));
    return Response.json({ ok: true, result: { message_id: 3007 } });
  };

  try {
    const response = await worker.fetch(req("/case"), env({
      HYPE_CONTEXT_WRITER: {
        async fetch() {
          return Response.json({
            ok: true,
            state: "reviewing",
            tracking: true,
            handoff_id: "HYPE-PER-20260919131100-acde5678",
            target: "per",
            recovery_case: {
              case_ref: "HYPE-PER-20260919131100-acde5678",
              domain: "mms",
              state: "reviewing",
              outcome_code: "awaiting_operations",
              outcome_label: "รอทีมดำเนินการ",
            },
            recovery_correlation: {
              domain: "mms",
              state: "coordination_pending",
              correlated: true,
              case_ref: "HYPE-PER-20260919131100-acde5678",
              prebooking_id: "mmspre_1234567890abcdef12345678",
              prebooking_status: "coordination_pending",
              service_date: "2026-10-02",
              service_time: "19:00",
              zone: "Sukhumvit",
              live_refresh_status: "fresh",
              therapist_id: "must-not-render",
            },
          });
        },
      },
    }));
    const body = await response.json();

    assert.equal(body.flow, "hype_operating_handoff_status");
    assert.match(sent.text, /Recovery:<\/b> mms/);
    assert.match(sent.text, /MMS Pre-booking:<\/b> <code>mmspre_1234567890abcdef12345678/);
    assert.match(sent.text, /MMS state:<\/b> coordination_pending/);
    assert.match(sent.text, /Schedule:<\/b> 2026-10-02 · 19:00/);
    assert.match(sent.text, /Zone:<\/b> Sukhumvit/);
    assert.doesNotMatch(sent.text, /must-not-render|therapist_id/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

