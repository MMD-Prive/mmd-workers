import test from "node:test";
import assert from "node:assert/strict";
import { File as NodeFile } from "node:buffer";

import {
  handleRefundOpsInternalIntake,
  handleRefundOpsRequest,
} from "./src/refund-ops.js";

if (!globalThis.File) globalThis.File = NodeFile;

const BASE_ID = "appTestRefund";
const TABLE = "tblRefundInbox";
const TOKEN = "airtable-token";
const LINE_ID = "U" + "a".repeat(32);

function env(extra = {}) {
  return {
    AIRTABLE_BASE_ID: BASE_ID,
    AIRTABLE_API_KEY: TOKEN,
    AIRTABLE_TABLE_CONSOLE_INBOX_ID: TABLE,
    CONFIRM_KEY: "refund-signing-secret",
    ...extra,
  };
}

function internalIntake(body) {
  return new Request("https://admin-worker.internal/v1/internal/refund-ops/intake", {
    method:"POST",
    headers:{
      "content-type":"application/json",
      "x-mmd-internal-call":"true",
      "x-mmd-service-binding":"member-dashboard-chat-worker",
    },
    body:JSON.stringify(body),
  });
}

test("same-job refund account change is flagged without overwriting prior evidence", async () => {
  const originalFetch = globalThis.fetch;
  const created = [];
  const priorFingerprint = "1".repeat(64);
  const nextFingerprint = "2".repeat(64);
  const prior = {
    id:"recPriorRefund",
    fields:{
      inbox_id:"refund_prior",
      line_user_id:LINE_ID,
      intent:"refund_bank_detail",
      created_at:"2026-09-29T03:00:00.000Z",
      payload_json:JSON.stringify({
        schema:"mmd_refund_bank_detail_v1",
        purpose:"refund",
        job_id:"JOB-FILM-J-001",
        account_fingerprint:priorFingerprint,
        account_number_masked:"•••• 1234",
      }),
    },
  };

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = String(init.method || "GET").toUpperCase();
    const formula = url.searchParams.get("filterByFormula") || "";
    if (method === "GET" && formula.includes("{inbox_id}")) return Response.json({ records:[] });
    if (method === "GET" && formula.includes("{line_user_id}")) return Response.json({ records:[prior] });
    if (method === "POST") {
      const body = JSON.parse(init.body || "{}");
      created.push(body.fields);
      return Response.json({ id:"recNewRefund", fields:body.fields });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  };

  try {
    const response = await handleRefundOpsInternalIntake(internalIntake({
      inbox_id:"refund_new",
      line_user_id:LINE_ID,
      customer_name:"แมน",
      purpose:"refund",
      bank_name:"กสิกรไทย",
      account_name_masked:"ม••",
      account_number_masked:"•••• 9876",
      account_fingerprint:nextFingerprint,
      private_detail_key:"line-ofc/bank-details/new/detail.json",
      source_image_key:"line-ofc/bank-details/new/original.jpg",
      job_id:"JOB-FILM-J-001",
      refund_amount_due:"4500",
      refund_currency:"THB",
    }), env());

    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.account_changed, true);
    assert.equal(payload.account_change_review_required, true);
    assert.equal(payload.previous_account_inbox_id, "refund_prior");
    assert.equal(payload.refund_amount_due, "4500");
    assert.equal(created.length, 1);
    const stored = JSON.parse(created[0].payload_json);
    assert.equal(stored.account_changed, true);
    assert.equal(stored.account_change_review_required, true);
    assert.equal(stored.account_fingerprint, nextFingerprint);
    assert.equal(stored.previous_account_inbox_id, "refund_prior");
    assert.equal(stored.refund_amount_due, "4500");
    assert.match(created[0].admin_note, /ACCOUNT CHANGED/);
    assert.match(created[0].admin_note, /amount 4500 THB/);
    assert.doesNotMatch(created[0].payload_json, /123-4-56789-0/);
    assert.equal(stored.money_truth_mutated, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("different account on another job is not falsely promoted to ACCOUNT CHANGED", async () => {
  const originalFetch = globalThis.fetch;
  const created = [];
  const prior = {
    id:"recPriorRefund",
    fields:{
      inbox_id:"refund_prior",
      line_user_id:LINE_ID,
      intent:"refund_bank_detail",
      created_at:"2026-09-29T03:00:00.000Z",
      payload_json:JSON.stringify({
        purpose:"refund",
        job_id:"OTHER-JOB",
        account_fingerprint:"1".repeat(64),
      }),
    },
  };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = String(init.method || "GET").toUpperCase();
    const formula = url.searchParams.get("filterByFormula") || "";
    if (method === "GET" && formula.includes("{inbox_id}")) return Response.json({ records:[] });
    if (method === "GET" && formula.includes("{line_user_id}")) return Response.json({ records:[prior] });
    if (method === "POST") {
      const body = JSON.parse(init.body || "{}");
      created.push(body.fields);
      return Response.json({ id:"recNewRefund", fields:body.fields });
    }
    throw new Error("unexpected fetch");
  };
  try {
    const response = await handleRefundOpsInternalIntake(internalIntake({
      inbox_id:"refund_new_other",
      line_user_id:LINE_ID,
      purpose:"refund",
      account_number_masked:"•••• 9876",
      account_fingerprint:"2".repeat(64),
      job_id:"JOB-FILM-J-001",
    }), env());
    const payload = await response.json();
    assert.equal(payload.account_changed, false);
    assert.equal(JSON.parse(created[0].payload_json).account_changed, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("owner receipt upload requires amount, completes task, calls LINE notifier, and signed media reads private R2", async () => {
  const originalFetch = globalThis.fetch;
  const objects = new Map();
  const record = {
    id:"recRefundTask",
    fields:{
      inbox_id:"refund_receipt_test",
      line_user_id:LINE_ID,
      member_name:"แมน",
      status:"new",
      admin_note:"Refund account received",
      payload_json:JSON.stringify({
        schema:"mmd_refund_bank_detail_v1",
        purpose:"refund",
        job_id:"JOB-FILM-J-001",
        customer_name:"แมน",
        money_truth_mutated:false,
      }),
    },
  };
  const lineCalls = [];
  const bucket = {
    async put(key, value, options = {}) {
      const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value);
      objects.set(key, { bytes, options });
    },
    async get(key) {
      const found = objects.get(key);
      if (!found) return null;
      return {
        body:found.bytes,
        size:found.bytes.byteLength,
        httpMetadata:{ contentType:found.options?.httpMetadata?.contentType || "application/octet-stream" },
      };
    },
  };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = String(init.method || "GET").toUpperCase();
    const formula = url.searchParams.get("filterByFormula") || "";
    if (method === "GET" && formula.includes("{inbox_id}")) return Response.json({ records:[record] });
    if (method === "PATCH") {
      const body = JSON.parse(init.body || "{}");
      Object.assign(record.fields, body.fields || {});
      return Response.json({ id:record.id, fields:record.fields });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  };

  const e = env({
    LINE_SLIP_EVIDENCE:bucket,
    MEMBER_DASHBOARD_CHAT_WORKER:{
      async fetch(request) {
        const body = await request.json();
        lineCalls.push({ url:request.url, headers:Object.fromEntries(request.headers), body });
        return Response.json({ ok:true, status:"sent", mode:"image", money_truth_mutated:false });
      },
    },
  });

  try {
    const missingAmount = new FormData();
    missingAmount.append("inbox_id", "refund_receipt_test");
    missingAmount.append("file", new File([new Uint8Array([1])], "receipt.jpg", { type:"image/jpeg" }));
    const missingAmountResponse = await handleRefundOpsRequest(new Request("https://www.mmdbkk.com/v1/admin/refunds/receipt", {
      method:"POST",
      body:missingAmount,
    }), e, { isAuthed:async () => true });
    assert.equal(missingAmountResponse.status, 400);
    assert.equal((await missingAmountResponse.json()).error, "refund_amount_required");

    const form = new FormData();
    form.append("inbox_id", "refund_receipt_test");
    form.append("refund_amount", "4,500");
    form.append("refund_currency", "THB");
    form.append("refund_note", "คืนยอดจากงานที่ยกเลิก");
    form.append("refund_reference", "KTB-20260929-001");
    form.append("file", new File([new Uint8Array([1,2,3,4])], "receipt.jpg", { type:"image/jpeg" }));
    const response = await handleRefundOpsRequest(new Request("https://www.mmdbkk.com/v1/admin/refunds/receipt", {
      method:"POST",
      body:form,
    }), e, { isAuthed:async () => true });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.status, "completed");
    assert.equal(payload.refund_amount, "4500");
    assert.equal(payload.refund_currency, "THB");
    assert.match(payload.confirmation_url, /^https:\/\/www\.mmdbkk\.com\/refund-receipt\/media\?/);
    assert.equal(payload.money_truth_mutated, false);
    assert.equal(payload.line_notification.sent, true);
    assert.equal(payload.owner_telegram.skipped, true);
    assert.equal(lineCalls.length, 1);
    assert.equal(lineCalls[0].url, "https://member-dashboard-chat-worker.local/__internal/line/refund-receipt-notify");
    assert.equal(lineCalls[0].headers["x-mmd-service-binding"], "admin-worker");
    assert.equal(lineCalls[0].body.line_user_id, LINE_ID);
    assert.equal(lineCalls[0].body.refund_amount, "4500");
    assert.equal(lineCalls[0].body.refund_currency, "THB");
    assert.equal(lineCalls[0].body.refund_note, "คืนยอดจากงานที่ยกเลิก");
    assert.match(lineCalls[0].body.receipt_url, /^https:\/\/www\.mmdbkk\.com\/refund-receipt\/media\?/);
    assert.equal(lineCalls[0].body.confirmation_url, lineCalls[0].body.receipt_url);
    assert.equal(lineCalls[0].body.money_truth_mutated, false);

    const stored = JSON.parse(record.fields.payload_json);
    assert.match(stored.receipt_r2_key, /^owner-refund-receipts\//);
    assert.equal(stored.owner_refund_amount, "4500");
    assert.equal(stored.owner_refund_currency, "THB");
    assert.equal(stored.owner_refund_reference, "KTB-20260929-001");
    assert.equal(stored.customer_receipt_delivery_status, "sent");
    assert.equal(stored.customer_receipt_delivery_mode, "image");
    assert.equal(stored.customer_receipt_confirmation_url_issued, true);
    assert.match(stored.customer_confirmation_url, /^https:\/\/www\.mmdbkk\.com\/refund-receipt\/media\?/);
    assert.match(stored.admin_job_url, /\/internal\/admin\/jobs\/all\?job_id=JOB-FILM-J-001$/);
    assert.match(stored.model_job_app_url, /\/sigil\/model\/login\?/);
    assert.equal(stored.owner_telegram_delivery_status, "skipped");
    assert.equal(stored.money_truth_mutated, false);

    const media = await handleRefundOpsRequest(new Request(lineCalls[0].body.receipt_url), e, { isAuthed:async () => false });
    assert.equal(media.status, 200);
    assert.equal(media.headers.get("content-type"), "image/jpeg");
    assert.match(media.headers.get("cache-control"), /no-store/);
    assert.deepEqual([...new Uint8Array(await media.arrayBuffer())], [1,2,3,4]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("refund receipt upload sends owner Telegram completed pack with customer, admin, and model URLs", async () => {
  const originalFetch = globalThis.fetch;
  const objects = new Map();
  const telegramCalls = [];
  const record = {
    id:"recRefundTelegram",
    fields:{
      inbox_id:"refund_telegram_pack",
      line_user_id:LINE_ID,
      member_name:"คุณ SVIP",
      status:"new",
      admin_note:"Refund account received",
      payload_json:JSON.stringify({
        schema:"mmd_refund_bank_detail_v1",
        purpose:"refund",
        job_id:"JOB-FILM-J-20260929",
        session_id:"sess_film_j",
        model_name:"Film J",
        customer_name:"คุณ SVIP",
        refund_amount_due:"4500",
        refund_currency:"THB",
        money_truth_mutated:false,
      }),
    },
  };
  const bucket = {
    async put(key, value, options = {}) {
      const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value);
      objects.set(key, { bytes, options });
    },
    async get(key) {
      const found = objects.get(key);
      if (!found) return null;
      return {
        body:found.bytes,
        size:found.bytes.byteLength,
        httpMetadata:{ contentType:found.options?.httpMetadata?.contentType || "application/octet-stream" },
      };
    },
  };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = String(init.method || "GET").toUpperCase();
    const formula = url.searchParams.get("filterByFormula") || "";
    if (url.hostname === "api.telegram.org") {
      const body = JSON.parse(init.body || "{}");
      telegramCalls.push({ url:String(input), body });
      return Response.json({ ok:true, result:{ message_id:99 } });
    }
    if (method === "GET" && formula.includes("{inbox_id}")) return Response.json({ records:[record] });
    if (method === "PATCH") {
      const body = JSON.parse(init.body || "{}");
      Object.assign(record.fields, body.fields || {});
      return Response.json({ id:record.id, fields:record.fields });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  };

  const e = env({
    LINE_SLIP_EVIDENCE:bucket,
    TELEGRAM_BOT_TOKEN:"123:telegram-token",
    TELEGRAM_CHAT_ID:"-1003546439681",
    TG_THREAD_REFUNDS:"22",
  });

  try {
    const form = new FormData();
    form.append("inbox_id", "refund_telegram_pack");
    form.append("refund_amount", "4500");
    form.append("refund_currency", "THB");
    form.append("refund_note", "คืนยอดจากงานที่ยกเลิก");
    form.append("refund_reference", "KTB-20260929-FILMJ");
    form.append("file", new File([new Uint8Array([9,9])], "receipt.jpg", { type:"image/jpeg" }));

    const response = await handleRefundOpsRequest(new Request("https://www.mmdbkk.com/v1/admin/refunds/receipt", {
      method:"POST",
      body:form,
    }), e, { isAuthed:async () => true });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.match(payload.customer_confirmation_url, /^https:\/\/www\.mmdbkk\.com\/refund-receipt\/media\?/);
    assert.match(payload.admin_job_url, /^https:\/\/www\.mmdbkk\.com\/internal\/admin\/jobs\/all\?job_id=JOB-FILM-J-20260929$/);
    assert.match(payload.model_job_app_url, /^https:\/\/www\.mmdbkk\.com\/sigil\/model\/login\?/);
    assert.match(payload.model_job_app_url, /intent=job_board/);
    assert.match(payload.model_job_app_url, /job_id=JOB-FILM-J-20260929/);
    assert.equal(payload.owner_telegram.sent, true);
    assert.equal(payload.owner_telegram.message_id, 99);
    assert.equal(telegramCalls.length, 1);
    const sent = telegramCalls[0].body;
    assert.equal(sent.chat_id, "-1003546439681");
    assert.equal(sent.message_thread_id, 22);
    assert.match(sent.text, /HYPE · REFUND COMPLETED/);
    assert.match(sent.text, /Customer receipt URL/);
    assert.match(sent.text, /Admin job URL/);
    assert.match(sent.text, /Model job\/app URL for Film J/);
    assert.match(sent.text, /ส่งเฉพาะ Model job\/app URL ให้น้อง/);
    assert.doesNotMatch(sent.text, /ส่ง.*URL สลิปลูกค้า/);
    assert.equal(sent.reply_markup.inline_keyboard.length, 3);
    assert.equal(sent.reply_markup.inline_keyboard[0][0].text, "Customer receipt");
    assert.equal(sent.reply_markup.inline_keyboard[1][0].text, "Open admin job");
    assert.equal(sent.reply_markup.inline_keyboard[2][0].text, "Send to Film J");
    const stored = JSON.parse(record.fields.payload_json);
    assert.equal(stored.owner_telegram_delivery_status, "sent");
    assert.equal(stored.owner_telegram_message_id, 99);
    assert.equal(stored.customer_confirmation_url, payload.customer_confirmation_url);
    assert.equal(stored.admin_job_url, payload.admin_job_url);
    assert.equal(stored.model_job_app_url, payload.model_job_app_url);
    assert.equal(stored.money_truth_mutated, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("refund owner page renders a clickable upload trigger and well-formed reference field", async () => {
  const response = await handleRefundOpsRequest(
    new Request("https://www.mmdbkk.com/internal/admin/refunds"),
    env(),
    { isAuthed:async () => true },
  );
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /data-refund-ref placeholder="optional" value="[^"]*">/);
  assert.match(body, /data-upload-trigger>อัปโหลดสลิปคืน<\/button>/);
  assert.match(body, /data-file type="file" accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(body, /trigger\.onclick=\(\)=>file\.click\(\)/);
  assert.match(body, /Model Job\/App URL/);
  assert.doesNotMatch(body, /data-refund-ref placeholder="optional" value="[^"]*>\<\/div>/);
});


test("targeted refund page renders native upload form immediately and permits its client runtime", async () => {
  const originalFetch = globalThis.fetch;
  const record = {
    id:"recRefundNative",
    fields:{
      inbox_id:"refund_manual_man_20260929_pay_mulcs8o4",
      line_user_id:LINE_ID,
      member_name:"แมน",
      status:"new",
      admin_note:"Refund account received",
      payload_json:JSON.stringify({
        schema:"mmd_refund_bank_detail_v1",
        purpose:"refund",
        bank_name:"กสิกรไทย",
        account_number_masked:"•••• 9876",
        refund_amount_due:"4500",
        refund_currency:"THB",
      }),
    },
  };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = String(init.method || "GET").toUpperCase();
    const formula = url.searchParams.get("filterByFormula") || "";
    if (method === "GET" && formula.includes("{inbox_id}")) return Response.json({ records:[record] });
    throw new Error(`unexpected fetch ${method} ${url}`);
  };

  try {
    const response = await handleRefundOpsRequest(
      new Request("https://www.mmdbkk.com/internal/admin/refunds?inbox_id=refund_manual_man_20260929_pay_mulcs8o4&action=upload"),
      env(),
      { isAuthed:async () => true },
    );
    assert.equal(response.status, 200);
    const csp = response.headers.get("content-security-policy") || "";
    assert.match(csp, /script-src 'unsafe-inline'/);
    assert.match(csp, /connect-src 'self'/);
    assert.match(csp, /form-action 'self'/);

    const body = await response.text();
    assert.match(body, /data-direct-refund/);
    assert.match(body, /<form method="post" enctype="multipart\/form-data" action="\/internal\/admin\/refunds\?inbox_id=refund_manual_man_20260929_pay_mulcs8o4&amp;action=upload">/);
    assert.match(body, /name="inbox_id" value="refund_manual_man_20260929_pay_mulcs8o4"/);
    assert.match(body, /name="file" type="file" accept="image\/jpeg,image\/png,image\/webp" required/);
    assert.match(body, />อัปโหลดสลิปคืน<\/button>/);
    assert.doesNotMatch(body, /<div id="list" class="grid"><div class="empty">กำลังโหลด…<\/div>/);

    const script = body.match(/<script>([\s\S]*?)<\/script>/)?.[1] || "";
    assert.ok(script.length > 100);
    assert.doesNotThrow(() => new Function(script));
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("manual Boss Per refund evidence can open full account detail without private R2 key", async () => {
  const originalFetch = globalThis.fetch;
  const record = {
    id:"recManualRefundDetail",
    fields:{
      inbox_id:"refund_manual_man_20260929_pay_mulcs8o4",
      member_name:"แมน",
      line_user_id:LINE_ID,
      status:"new",
      payload_json:JSON.stringify({
        schema:"mmd_refund_bank_detail_v1",
        purpose:"refund",
        manual_source:"boss_per_chatgpt_image_20260929",
        bank_name:"กรุงไทย",
        account_name_masked:"นาย แมน อาชีพสมุทร",
        account_number_masked:"715-1-42993-2",
        private_detail_key:null,
        owner_refund_amount:"3150",
        refund_currency:"THB",
      }),
    },
  };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = String(init.method || "GET").toUpperCase();
    const formula = url.searchParams.get("filterByFormula") || "";
    if (method === "GET" && formula.includes("{inbox_id}")) return Response.json({ records:[record] });
    throw new Error(`unexpected fetch ${method} ${url}`);
  };
  try {
    const response = await handleRefundOpsRequest(
      new Request("https://www.mmdbkk.com/v1/admin/refunds/detail?inbox_id=refund_manual_man_20260929_pay_mulcs8o4"),
      env(),
      { isAuthed:async () => true },
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.deepEqual(payload.detail, {
      bank_name:"กรุงไทย",
      account_name:"นาย แมน อาชีพสมุทร",
      account_number:"715-1-42993-2",
      purpose:"refund",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("masked manual account does not bypass private detail storage", async () => {
  const originalFetch = globalThis.fetch;
  const record = {
    id:"recMaskedManualRefundDetail",
    fields:{
      inbox_id:"refund_manual_masked",
      payload_json:JSON.stringify({
        purpose:"refund",
        manual_source:"boss_per_manual",
        bank_name:"กรุงไทย",
        account_name_masked:"ม••",
        account_number_masked:"•••• 1234",
        private_detail_key:null,
      }),
    },
  };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = String(init.method || "GET").toUpperCase();
    const formula = url.searchParams.get("filterByFormula") || "";
    if (method === "GET" && formula.includes("{inbox_id}")) return Response.json({ records:[record] });
    throw new Error(`unexpected fetch ${method} ${url}`);
  };
  try {
    const response = await handleRefundOpsRequest(
      new Request("https://www.mmdbkk.com/v1/admin/refunds/detail?inbox_id=refund_manual_masked"),
      env(),
      { isAuthed:async () => true },
    );
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error, "private_detail_missing");
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("targeted native refund POST keeps the case URL on the result page", async () => {
  const originalFetch = globalThis.fetch;
  const objects = new Map();
  const record = {
    id:"recRefundNativePost",
    fields:{
      inbox_id:"refund_manual_man_20260929_pay_mulcs8o4",
      line_user_id:LINE_ID,
      member_name:"แมน",
      status:"new",
      payload_json:JSON.stringify({
        schema:"mmd_refund_bank_detail_v1",
        purpose:"refund",
        job_id:"JOB-8B799C2387-C1BC84",
        refund_amount_due:"3150",
        refund_currency:"THB",
      }),
    },
  };
  const bucket = {
    async put(key, value, options = {}) {
      const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value);
      objects.set(key, { bytes, options });
    },
    async get(key) {
      const found = objects.get(key);
      if (!found) return null;
      return { body:found.bytes, size:found.bytes.byteLength, httpMetadata:{ contentType:"image/jpeg" } };
    },
  };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = String(init.method || "GET").toUpperCase();
    const formula = url.searchParams.get("filterByFormula") || "";
    if (method === "GET" && formula.includes("{inbox_id}")) return Response.json({ records:[record] });
    if (method === "PATCH") {
      const body = JSON.parse(init.body || "{}");
      Object.assign(record.fields, body.fields || {});
      return Response.json({ id:record.id, fields:record.fields });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  };

  try {
    const form = new FormData();
    form.append("inbox_id", "refund_manual_man_20260929_pay_mulcs8o4");
    form.append("refund_amount", "3150");
    form.append("refund_currency", "THB");
    form.append("refund_note", "คืนยอดหลังหัก 30%");
    form.append("refund_reference", "KTB-20260929-MAN");
    form.append("file", new File([new Uint8Array([7,1,5])], "refund.jpg", { type:"image/jpeg" }));

    const response = await handleRefundOpsRequest(
      new Request("https://www.mmdbkk.com/internal/admin/refunds?inbox_id=refund_manual_man_20260929_pay_mulcs8o4&action=upload", {
        method:"POST",
        body:form,
      }),
      env({ LINE_SLIP_EVIDENCE:bucket }),
      { isAuthed:async () => true },
    );
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.match(body, /อัปโหลดสลิปสำเร็จ/);
    assert.match(
      body,
      /href="\/internal\/admin\/refunds\?inbox_id=refund_manual_man_20260929_pay_mulcs8o4&amp;action=upload">กลับ Refund เคสนี้<\/a>/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
