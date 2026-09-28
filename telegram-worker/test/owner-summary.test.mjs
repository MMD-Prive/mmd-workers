import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const URL = "https://telegram-worker.mmd.test/telegram/webhook";

function env(overrides = {}) {
  return {
    TELEGRAM_WEBHOOK_SECRET_TOKEN: "expected-secret",
    TELEGRAM_BOT_TOKEN: "telegram-token",
    TELEGRAM_BOT_USERNAME: "mmdprivebot",
    TELEGRAM_CHAT_ID: "-1003546439681",
    ...overrides,
  };
}

function req(text, chat, fromId) {
  return new Request(URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": "expected-secret",
    },
    body: JSON.stringify({
      update_id: 1,
      message: {
        message_id: 10,
        text,
        chat,
        from: { id: fromId, username: "operator" },
      },
    }),
  });
}

function summary() {
  return {
    ok: true,
    mode: "hype_owner_summary_v1",
    bangkok_date: "2026-09-19",
    focus: { title: "ตรวจเงินก่อน", text: "มี Payment Review รอตรวจ 2 รายการ" },
    counts: {
      payment_review: 2,
      historical_recovery: 1,
      membership_review: 1,
      jobs_need_confirm: 1,
      jobs: 3,
      recovery_open: 2,
      recovery_attention: 1,
      recovery_overdue: 1,
      recovery_unassigned: 1,
      recovery_attention_unassigned: 1,
      recovery_picker_waiting_reselection: 1,
      recovery_picker_authority_unavailable: 1,
      recovery_picker_no_candidates: 0,
      recovery_picker_watch: 2,
    },
    review_required: {
      payment: [{ client_name: "ลูกค้า A", amount_thb: 5000, text: "Deposit · พร้อมตรวจ" }],
    },
    recovery_queue: {
      available: true,
      policy_version: "mmd-recovery-queue-sla-v1-20260919",
      open_count: 2,
      attention_count: 1,
      overdue_count: 1,
      watch_count: 0,
      assigned_count: 1,
      unassigned_count: 1,
      attention_unassigned_count: 1,
      picker_waiting_reselection_count: 1,
      picker_authority_unavailable_count: 1,
      picker_no_candidates_count: 0,
      picker_selected_count: 0,
      picker_watch_count: 2,
      operational_only: true,
      business_truth_inferred: false,
    },
    what_to_watch_now: [{
      case_ref: "HYPE-PER-20260919010000-acde1234",
      client_name: "ลูกค้า Recovery",
      domain: "booking",
      state: "reviewing",
      sla_status: "overdue",
      since_update_minutes: 420,
      case_age_minutes: 510,
      next_attention: "review_and_update_outcome",
      assignment_status: "unassigned",
      assigned_to: null,
      assigned_lane: null,
      picker_state: "authority_unavailable",
      picker_status: "stale",
      picker_revision: 3,
      picker_candidate_count: 2,
      picker_reissue_count: 2,
      picker_next_attention: "owner_refresh_picker",
      href: "/internal/admin/recovery?case_ref=HYPE-PER-20260919010000-acde1234",
    }],
    calendar: {
      today_jobs: [{ job_id: "JOB-1", model_name: "Model A", client_name: "ลูกค้า A", status: "รอคอนเฟิร์ม", time: "19:00" }],
      tomorrow_jobs: [],
      tomorrow_reconfirm: { pending: 1, overdue: 0 },
    },
    jobs: {
      items: [{ job_id: "JOB-1", model_name: "Model A", client_name: "ลูกค้า A", status: "รอคอนเฟิร์ม", time: "19:00" }],
    },
    clients: { display_names: ["ลูกค้า A"] },
    alerts: [{ title: "Owner Review", text: "มีเคสพิเศษ 1 รายการ" }],
    next_actions: [
      { priority: 1, label: "ตรวจ Payments", href: "/internal/admin/payments" },
      { priority: 2, label: "ดู Picker ที่ refresh ไม่ได้", href: "/internal/admin/recovery?picker=authority_unavailable" },
      { priority: 3, label: "รับ Recovery ที่ยังไม่มีคนดู", href: "/internal/admin/recovery?assignment=unassigned" },
    ],
  };
}

test("Owner Summary requires Telegram creator and delivers details in private", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const sends = [];
  const memberChecks = [];
  const ownerCallers = [];
  let ownerRead = 0;

  globalThis.fetch = async (url, init = {}) => {
    const method = String(url).split("/").pop();
    const payload = init.body ? JSON.parse(String(init.body)) : null;
    if (method === "getChatMember") {
      memberChecks.push(payload);
      return Response.json({ ok: true, result: { status: "creator" } });
    }
    if (method === "sendMessage") {
      sends.push(payload);
      return Response.json({ ok: true, result: { message_id: 901, chat: { id: Number(payload.chat_id) } } });
    }
    throw new Error("unexpected Telegram method");
  };

  try {
    const response = await worker.fetch(req(
      "วันนี้มีอะไรต้องดูบ้าง",
      { id: 111111, type: "private" },
      111111,
    ), env({
      HYPE_OPERATIONS: {
        async fetch(request) {
          ownerRead += 1;
          ownerCallers.push(request?.headers?.get?.("x-mmd-service-binding") || "");
          return Response.json(summary());
        },
      },
    }));

    const body = await response.json();
    assert.equal(body.flow, "hype_owner_summary");
    assert.ok(body.ok === true, JSON.stringify(body));
    assert.deepEqual(memberChecks, [{ chat_id: "-1003546439681", user_id: 111111 }]);
    assert.deepEqual(ownerCallers, ["telegram-worker"]);
    assert.equal(ownerRead, 1);
    assert.equal(sends.length, 1);
    assert.equal(String(sends[0].chat_id), "111111");
    assert.match(sends[0].text, /HYPE · PER OWNER SUMMARY/);
    assert.match(sends[0].text, /Payment Review: 2/);
    assert.match(sends[0].text, /ลูกค้า A/);
    assert.match(sends[0].text, /Model A/);
    assert.match(sends[0].text, /RECOVERY QUEUE · ต้องดูอะไรตอนนี้/);
    assert.match(sends[0].text, /ลูกค้า Recovery/);
    assert.match(sends[0].text, /overdue/);
    assert.match(sends[0].text, /Picker: reselection 1 · authority unavailable 1 · no candidates 0/);
    assert.match(sends[0].text, /Picker r3 refresh authority ไม่ได้/);
    assert.match(sends[0].text, /Owner refresh choices/);
    assert.match(sends[0].text, /ยังไม่มีคนรับ/);
    assert.match(sends[0].text, /Assignment \/ Picker \/ SLA เป็น operational metadata เท่านั้น/);
    assert.match(sends[0].text, /Read-only summary/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Owner Summary rejects non-creator before reading Ops truth", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  let ownerRead = 0;
  let sent = null;

  globalThis.fetch = async (url, init = {}) => {
    const method = String(url).split("/").pop();
    const payload = init.body ? JSON.parse(String(init.body)) : null;
    if (method === "getChatMember") return Response.json({ ok: true, result: { status: "administrator" } });
    if (method === "sendMessage") {
      sent = payload;
      return Response.json({ ok: true, result: { message_id: 902 } });
    }
    throw new Error("unexpected Telegram method");
  };

  try {
    const response = await worker.fetch(req(
      "/owner",
      { id: -1003546439681, type: "supergroup" },
      222222,
    ), env({
      HYPE_OPERATIONS: {
        async fetch() {
          ownerRead += 1;
          return Response.json(summary());
        },
      },
    }));

    const body = await response.json();
    assert.equal(body.flow, "hype_owner_summary");
    assert.equal(body.ok, false);
    assert.equal(body.code_status, "owner_required");
    assert.equal(ownerRead, 0);
    assert.match(sent.text, /เฉพาะ Per · Owner Mode/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Owner Summary invoked in Ops group sends detail privately and only a safe ack to group", { concurrency: false }, async () => {
  const originalFetch = globalThis.fetch;
  const sends = [];

  globalThis.fetch = async (url, init = {}) => {
    const method = String(url).split("/").pop();
    const payload = init.body ? JSON.parse(String(init.body)) : null;
    if (method === "getChatMember") return Response.json({ ok: true, result: { status: "creator" } });
    if (method === "sendMessage") {
      sends.push(payload);
      return Response.json({ ok: true, result: { message_id: 903 + sends.length } });
    }
    throw new Error("unexpected Telegram method");
  };

  try {
    const response = await worker.fetch(req(
      "/today",
      { id: -1003546439681, type: "supergroup" },
      111111,
    ), env({
      HYPE_OPERATIONS: { async fetch() { return Response.json(summary()); } },
    }));

    const body = await response.json();
    assert.equal(body.ok, true);
    const privateCall = sends.find((x) => String(x.chat_id) === "111111");
    const groupCall = sends.find((x) => String(x.chat_id) === "-1003546439681");
    assert.ok(privateCall);
    assert.ok(groupCall);
    assert.match(privateCall.text, /ลูกค้า A/);
    assert.doesNotMatch(groupCall.text, /ลูกค้า A|5,000|Payment Review: 2/);
    assert.match(groupCall.text, /private chat/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
