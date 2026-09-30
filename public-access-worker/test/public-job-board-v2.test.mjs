import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { createJobRecord, parsePublicJobBriefV2 } from "../src/public-job-board-v2.js";

class MemoryR2 {
  constructor() { this.rows = new Map(); }
  async put(key, value, options = {}) {
    if (options.onlyIf?.etagDoesNotMatch === "*" && this.rows.has(key)) return null;
    const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
    this.rows.set(key, { bytes, options });
    return { key };
  }
  async get(key) {
    const row = this.rows.get(key);
    if (!row) return null;
    return {
      text: async () => new TextDecoder().decode(row.bytes),
      arrayBuffer: async () => row.bytes.buffer.slice(row.bytes.byteOffset, row.bytes.byteOffset + row.bytes.byteLength),
      customMetadata: row.options.customMetadata || {},
    };
  }
  async list({ prefix = "", limit = 1000 } = {}) {
    return { objects: [...this.rows.keys()].filter((key) => key.startsWith(prefix)).slice(0, limit).map((key) => ({ key })) };
  }
  async delete(key) { this.rows.delete(key); }
}

function env(extra = {}) {
  return {
    PUBLIC_ACCESS_EVIDENCE: new MemoryR2(),
    PUBLIC_JOB_BOARD_SIGNING_SECRET: "local-test-signing-secret-32-characters",
    INTERNAL_TOKEN: "owner-test-token",
    ALLOWED_ORIGINS: "https://sigil.mmdbkk.com",
    MODEL_AUTH: {
      fetch: async (request) => {
        const url = new URL(request.url);
        if (url.hostname !== "model-auth.internal" || url.pathname !== "/__internal/model-job-board/validate") {
          return Response.json({ ok: false, error: "not_found" }, { status: 404 });
        }
        if (request.headers.get("x-mmd-service-caller") !== "public-access-worker") {
          return Response.json({ ok: false, error: "service_auth_required" }, { status: 403 });
        }
        const body = await request.json().catch(() => ({}));
        if (!body.token) return Response.json({ ok: false, error: "model_handoff_required" }, { status: 401 });
        return Response.json({ ok: true, model_record_id: "rec12345678901234" });
      },
    },
    ...extra,
  };
}

async function call(testEnv, path, { method = "GET", body, headers = {} } = {}) {
  const init = { method, headers: new Headers(headers) };
  if (body !== undefined) {
    if (body instanceof Blob) init.body = body;
    else {
      init.body = JSON.stringify(body);
      init.headers.set("content-type", "application/json");
    }
  }
  return worker.fetch(new Request(`https://sigil.mmdbkk.com${path}`, init), testEnv);
}

async function ownerCreate(testEnv, overrides = {}) {
  const response = await call(testEnv, "/public/api/jobs/internal/jobs", {
    method: "POST",
    headers: { "x-internal-token": "owner-test-token" },
    body: {
      id: "JOB-20261001-DEMO01",
      status: "published",
      world: "private",
      brief: "งาน กินข้าว ลูกค้าเกย์ผู้ใหญ่ ขอหล่อ สูงหุ่นดี มีโปรไฟล์\nถ้าเป็นนายแบบ/นักแสดง มีโปรไฟล์ ได้บัทพิเศษ 🔐\n\n⏳ งาน 3 ชม.\n🏡 พฤ 1 ต.ค. 20:00 ย่านสุขุมวิท\n💰 10,000 ถึงตัว\n👤 ลูกค้า 1 ท่าน ร้านมีห้องส่วนตัว ไม่ล่วงเกิน\n\n🍌 ส่งด่วน รูปเดี่ยว 2 รูป",
      ...overrides,
    },
  });
  const text = await response.text();
  assert.equal(response.status, 201, text);
  return JSON.parse(text);
}

async function anonymousCookie(testEnv) {
  const handoff = await call(testEnv, "/public/api/jobs?mmd_job_board_handoff=test-handoff");
  assert.equal(handoff.status, 303, await handoff.text());
  const modelCookie = handoff.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(modelCookie?.startsWith("mmd_pjb_model_v2="));
  const board = await call(testEnv, "/public/api/jobs", { headers: { cookie: modelCookie } });
  assert.equal(board.status, 200, await board.text());
  const anonCookie = board.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(anonCookie?.startsWith("mmd_pjb="));
  return `${modelCookie}; ${anonCookie}`;
}

async function interest(testEnv, cookie, body = {}) {
  const reveal = await call(testEnv, "/public/api/jobs/JOB-20261001-DEMO01/reveal", { method: "POST", headers: { cookie } });
  assert.equal(reveal.status, 303, await reveal.text());
  const revealCookie = reveal.headers.get("set-cookie").split(";", 1)[0];
  return call(testEnv, "/public/api/jobs/JOB-20261001-DEMO01/interest", { method: "POST", headers: { cookie: `${cookie}; ${revealCookie}` }, body });
}

function visibleText(html) {
  return String(html).replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

test("validated exact-job model handoff writes a durable privacy-safe receipt", async () => {
  const testEnv = env();
  await ownerCreate(testEnv, { id: "JOB-20261001-HANDOFF1", world: "public", confidentiality: false });

  const response = await call(testEnv, "/public/api/jobs/JOB-20261001-HANDOFF1?mmd_job_board_handoff=real-signed-token-placeholder");
  assert.equal(response.status, 303, await response.text());

  const receiptKeys = [...testEnv.PUBLIC_ACCESS_EVIDENCE.rows.keys()].filter((key) => key.includes("/handoffs/"));
  assert.equal(receiptKeys.length, 1);
  const receipt = JSON.parse(new TextDecoder().decode(testEnv.PUBLIC_ACCESS_EVIDENCE.rows.get(receiptKeys[0]).bytes));
  assert.equal(receipt.schema, "mmd_public_job_board_v2.model_handoff_receipt");
  assert.equal(receipt.model_record_id, "rec12345678901234");
  assert.equal(receipt.job_id, "JOB-20261001-HANDOFF1");
  assert.equal(receipt.target_path, "/public/api/jobs/JOB-20261001-HANDOFF1");
  assert.match(receipt.receipt_ref, /^handoff_[a-f0-9]{24}$/);
  assert.equal(JSON.stringify(receipt).includes("real-signed-token-placeholder"), false);
  assert.equal(JSON.stringify(receipt).includes("line_user_id"), false);

  const owner = await call(testEnv, "/public/api/jobs/internal/handoffs?model_record_id=rec12345678901234&job_id=JOB-20261001-HANDOFF1", {
    headers: { "x-internal-token": "owner-test-token" },
  });
  const ownerBody = await owner.json();
  assert.equal(owner.status, 200, JSON.stringify(ownerBody));
  assert.equal(ownerBody.handoffs.length, 1);
  assert.equal(ownerBody.handoffs[0].receipt_ref, receipt.receipt_ref);
});

test("validated handoff mirrors a safe audit row when Airtable is configured", async () => {
  let captured = null;
  const testEnv = env({
    AIRTABLE_API_KEY: "pat-test",
    AIRTABLE_BASE_ID: "app-test",
    AIRTABLE_HTTP: {
      fetch: async (url, init) => {
        captured = { url: String(url), body: JSON.parse(init.body), authorization: init.headers.authorization };
        return Response.json({ id: "recAudit" }, { status: 200 });
      },
    },
  });

  const response = await call(testEnv, "/public/api/jobs/JOB-20261001-AUDIT1?mmd_job_board_handoff=real-signed-token-placeholder");
  assert.equal(response.status, 303, await response.text());
  assert.ok(captured);
  assert.match(captured.url, /System%20%E2%80%94%20Access%20Log$/);
  assert.equal(captured.authorization, "Bearer pat-test");
  assert.equal(captured.body.typecast, false);
  assert.equal(captured.body.fields.Action, "model_job_board_handoff_validated");
  assert.equal(captured.body.fields.Target, "JOB-20261001-AUDIT1");
  assert.equal(captured.body.fields.Result, "success");
  assert.equal(captured.body.fields.Actor, "public_access_worker");
  assert.equal(captured.body.fields["Identity Ref"], "rec12345678901234");
  assert.match(captured.body.fields["Event ID"], /^handoff_[a-f0-9]{24}$/);
  assert.doesNotMatch(JSON.stringify(captured.body), /real-signed-token-placeholder|line_user_id|cookie/i);
});

test("handoff receipt write failure never blocks an already validated Model", async () => {
  const testEnv = env();
  const originalPut = testEnv.PUBLIC_ACCESS_EVIDENCE.put.bind(testEnv.PUBLIC_ACCESS_EVIDENCE);
  testEnv.PUBLIC_ACCESS_EVIDENCE.put = async (key, value, options) => {
    if (key.includes("/handoffs/")) throw new Error("audit_store_unavailable");
    return originalPut(key, value, options);
  };
  const response = await call(testEnv, "/public/api/jobs?mmd_job_board_handoff=real-signed-token-placeholder");
  assert.equal(response.status, 303, await response.text());
  assert.ok(response.headers.get("set-cookie")?.includes("mmd_pjb_model_v2="));
});

test("free-form Per brief maps to the Public Job Board V2 contract", () => {
  const parsed = parsePublicJobBriefV2("งาน กินข้าว ลูกค้าเกย์ผู้ใหญ่ ขอหล่อ สูงหุ่นดี มีโปรไฟล์\n⏳ งาน 3 ชม.\n🏡 พฤ 1 ต.ค. 20:00 ย่านสุขุมวิท\n💰 10,000 ถึงตัว\n👤 ลูกค้า 1 ท่าน ร้านมีห้องส่วนตัว ไม่ล่วงเกิน 🔐\n🍌 ส่งด่วน รูปเดี่ยว 8 รูป");
  assert.equal(parsed.category, "dining");
  assert.equal(parsed.duration, "3 ชั่วโมง");
  assert.equal(parsed.time, "20:00");
  assert.equal(parsed.area, "สุขุมวิท");
  assert.equal(parsed.compensation, "10,000 ถึงตัว");
  assert.equal(parsed.customer_count, 1);
  assert.equal(parsed.customer_gender, "unspecified");
  assert.equal(parsed.confidentiality, true);
  assert.equal(parsed.media_requirements.count, 8);
});

test("confidentiality does not turn a Public MMD job into SIGIL Private", () => {
  const job = createJobRecord({
    id: "JOB-20260928-PUBLIC-CONF",
    status: "published",
    world: "public",
    confidentiality: true,
    brief: "งานกินข้าว 🔐\n⏳ งาน 3 ชม.\n🏡 พฤ 1 ต.ค. 20:00 ย่านสุขุมวิท\n💰 12,000 ถึงตัว",
  });
  assert.equal(job.public.world, "public");
  assert.equal(job.public.confidentiality, true);
});

test("explicit customer gender is structured without using orientation", () => {
  const male = parsePublicJobBriefV2("งานอีเวนต์\n👤 ลูกค้า 1 ท่าน ผู้ชาย\n💰 8,000 บาท\n🍌 รูปเดี่ยว 1 รูป");
  const female = parsePublicJobBriefV2("งานอีเวนต์\n👤 ลูกค้า 1 ท่าน ผู้หญิง\n💰 8,000 บาท\n🍌 รูปเดี่ยว 1 รูป");
  const couple = parsePublicJobBriefV2("งานอีเวนต์\n👤 ลูกค้า คู่ชายหญิง\n💰 8,000 บาท\n🍌 รูปเดี่ยว 1 รูป");
  assert.equal(male.customer_gender, "male");
  assert.equal(female.customer_gender, "female");
  assert.equal(couple.customer_gender, "couple");
});

test("runtime fails closed without durable R2 or a strong signing secret", async () => {
  let response = await call({ PUBLIC_JOB_BOARD_SIGNING_SECRET: "local-test-signing-secret-32-characters" }, "/public/api/jobs");
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "public_job_board_store_unavailable");
  response = await call({ PUBLIC_ACCESS_EVIDENCE: new MemoryR2(), PUBLIC_JOB_BOARD_SIGNING_SECRET: "short", MODEL_AUTH: env().MODEL_AUTH }, "/public/api/jobs?mmd_job_board_handoff=test-handoff");
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "public_job_board_signing_unavailable");
});

test("owner short link renders a Per-led job-first landing", async () => {
  const testEnv = env();
  const created = await ownerCreate(testEnv, { id: "JOB-20261001-A1B2C3D4E5F6", world: "public", confidentiality: true });
  assert.equal(created.job.broadcast_url, "https://mmdbkk.com/j/A1B2C3D4E5F6");

  const short = await worker.fetch(new Request(created.job.broadcast_url), testEnv);
  assert.equal(short.status, 200);
  assert.equal(short.headers.get("x-mmd-job-short-link"), "v2");
  const page = await short.text();
  assert.match(page, /MMD JOB · CONFIDENTIAL/);
  assert.match(page, /ส่งรูปและข้อมูลเพิ่มเติมให้พี่เปอร์ดูหน่อยน้า/);
  assert.match(page, /ที่นี่พี่เปอร์ดูแลงานให้ครับ/);
  assert.match(page, /t\.me\/per_mmd/);
  assert.doesNotMatch(page, /LINE ใช้ยืนยันตัวตน|ยืนยันตัวตน/);
  assert.doesNotMatch(page, /PRIVATE JOB|SIGIL · PRIVATE JOB/);
  assert.match(page, /https:\/\/miniapp\.line\.me\/2010864854-N34SgCqq\//);
  assert.match(page, /intent=job_board/);
  assert.match(page, new RegExp(created.job.id));
  assert.doesNotMatch(page, /MMD APP \| Welcome|สวัสดีครับ|ยินดีที่ได้รู้จัก/);
  assert.match(page, /og:image/i);\n  assert.match(page, /twitter:image/i);\n  assert.match(page, /summary_large_image/i);

  const direct = await call(testEnv, "/public/api/jobs");
  assert.equal(direct.status, 302);
  const login = new URL(direct.headers.get("location"));
  assert.equal(login.origin, "https://www.mmdbkk.com");
  assert.equal(login.pathname, "/sigil/model/login");
  assert.equal(login.searchParams.get("intent"), "job_board");
});

test("branded short link renders an existing canonical job created before aliases existed", async () => {
  const testEnv = env();
  const job = createJobRecord({
    id: "JOB-20260928-3DE86201F471",
    status: "published",
    brief: "งานกินข้าว\n⏳ งาน 3 ชม.\n🏡 พฤ 1 ต.ค. 20:00 ย่านสุขุมวิท\n💰 12,000 ถึงตัว",
  }, new Date("2026-09-28T12:00:00.000Z"));
  await testEnv.PUBLIC_ACCESS_EVIDENCE.put(
    "public-job-board/v2/jobs/JOB-20260928-3DE86201F471.json",
    JSON.stringify(job),
  );

  const response = await worker.fetch(new Request("https://mmdbkk.com/j/3DE86201F471"), testEnv);
  assert.equal(response.status, 200);
  const page = await response.text();
  assert.match(page, /JOB-20260928-3DE86201F471/);
  assert.match(page, /สุขุมวิท/);
  assert.match(page, /miniapp\.line\.me\/2010864854-N34SgCqq/);
  assert.match(page, /MMD JOB · CONFIDENTIAL/);
  assert.doesNotMatch(page, /PRIVATE JOB|SIGIL · PRIVATE JOB/);
  assert.doesNotMatch(page, /สวัสดีครับ|ยินดีที่ได้รู้จัก/);
});

test("job board Welcome is Per-led and keeps Public plus Private in one feed", async () => {
  const testEnv = env();
  const created = await ownerCreate(testEnv);
  assert.equal(created.job.public.title, "กินข้าว ลูกค้าเกย์ผู้ใหญ่ ขอหล่อ สูงหุ่นดี มีโปรไฟล์");
  assert.equal(created.job.public.area, "สุขุมวิท");
  assert.equal(created.job.public.compensation, "10,000 ถึงตัว");
  const cookie = await anonymousCookie(testEnv);
  const response = await call(testEnv, "/public/api/jobs", { headers: { cookie } });
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /ที่นี่พี่เปอร์ดูแลงานให้ครับ/);
  assert.match(html, /Public และ Private อยู่ในกระดานเดียวกัน/);
  assert.match(html, /งานที่เปิดรับ · PUBLIC \+ PRIVATE/);
  assert.match(html, /PRIVATE JOB/);
  assert.match(html, /แตะเพื่อดูรายละเอียด/);
  const copy = visibleText(html);
  for (const banned of ["Verify", "ยืนยันตัวตน", "Bind", "Candidate", "Identity review", "สมัครสมาชิก"]) assert.doesNotMatch(copy, new RegExp(banned, "i"));
  assert.doesNotMatch(html, /source_brief|owner_note|private-media/);
});

test("linked Model uses the fast lane instead of repeating an application", async () => {
  const testEnv = env();
  await ownerCreate(testEnv);
  const cookie = await anonymousCookie(testEnv);
  const gate = await call(testEnv, "/public/api/jobs/JOB-20261001-DEMO01", { headers: { cookie } });
  const gateHtml = await gate.text();
  assert.match(gateHtml, /รายละเอียดของงานนี้จะยังไม่แสดงบนหน้ารวมครับ/);
  assert.doesNotMatch(gateHtml, /ลูกค้าเกย์ผู้ใหญ่|สุขุมวิท|10,000/);

  const reveal = await call(testEnv, "/public/api/jobs/JOB-20261001-DEMO01/reveal", { method: "POST", headers: { cookie } });
  assert.equal(reveal.status, 303);
  const openedCookie = `${cookie}; ${reveal.headers.get("set-cookie").split(";", 1)[0]}`;
  const detail = await call(testEnv, "/public/api/jobs/JOB-20261001-DEMO01", { headers: { cookie: openedCookie } });
  const detailHtml = await detail.text();
  assert.match(detailHtml, /งานนี้กำลังเปิดรับคนที่สนใจครับ/);
  assert.match(detailHtml, /สนใจงานนี้/);

  const apply = await call(testEnv, "/public/api/jobs/JOB-20261001-DEMO01/apply", { headers: { cookie: openedCookie } });
  const applyHtml = await apply.text();
  assert.match(applyHtml, /โปรไฟล์ของคุณเชื่อมกับพี่เปอร์ไว้แล้วครับ/);
  assert.match(applyHtml, /สนใจงานนี้ · ส่งให้พี่เปอร์/);
  assert.doesNotMatch(applyHtml, /เพศสภาพ|รับงานกับลูกค้า|type="file"/);
  assert.doesNotMatch(applyHtml, /Verify|ยืนยันตัวตน|Identity review|สมัครสมาชิก/i);

  const interested = await call(testEnv, "/public/api/jobs/JOB-20261001-DEMO01/interest", {
    method: "POST",
    headers: { cookie: openedCookie },
    body: { fast_lane: true },
  });
  const result = await interested.json();
  assert.equal(interested.status, 201, JSON.stringify(result));
  assert.equal(result.fast_lane, true);
  assert.equal(result.model_record_id, "rec12345678901234");
  const key = [...testEnv.PUBLIC_ACCESS_EVIDENCE.rows.keys()].find((item) => item.endsWith(`/${result.application_ref}.json`));
  const application = JSON.parse(new TextDecoder().decode(testEnv.PUBLIC_ACCESS_EVIDENCE.rows.get(key).bytes));
  assert.equal(application.submission_status, "submitted");
  assert.equal(application.workflow_status, "candidate_pending_owner");
  assert.equal(application.applicant.fast_lane, true);
});

test("Public and Private share one feed while Private teaser leaks no sensitive detail", async () => {
  const testEnv = env();
  await ownerCreate(testEnv, { budget_disclosure_approved: true, customer_gender: "male" });
  await ownerCreate(testEnv, { id: "JOB-20261001-PUBLIC1", world: "public", confidentiality: false, brief: "งานอีเวนต์ ขอคนมีโปรไฟล์\n⏳ งาน 4 ชม.\n🏡 ศ 2 ต.ค. 18:00 ย่านสาทร\n💰 6,000 บาท\n🍌 รูปเดี่ยว 1 รูป" });
  const cookie = await anonymousCookie(testEnv);
  const response = await call(testEnv, "/public/api/jobs", { headers: { cookie } });
  const page = await response.text();
  assert.match(page, /งานที่เปิดรับ · PUBLIC \+ PRIVATE/);
  assert.match(page, /PUBLIC JOB/);
  assert.match(page, /PRIVATE JOB · 🔒/);
  assert.match(page, /เลือกงานนี้/);
  assert.match(page, /แตะเพื่อดูรายละเอียด/);
  assert.doesNotMatch(page, /BUDGET · 10,000|ลูกค้า · ชาย|ลูกค้าเกย์ผู้ใหญ่/);

  const data = await (await call(testEnv, "/public/api/jobs/data", { headers: { cookie } })).json();
  const privateJob = data.jobs.find((job) => job.world === "private");
  assert.equal(privateJob.compensation, "");
  assert.equal(privateJob.title, "PRIVATE JOB");
  assert.equal(privateJob.date, "");
  assert.equal(privateJob.time, "");
  assert.equal(privateJob.area, "");
  assert.equal(privateJob.customer_count, null);
  assert.equal(privateJob.customer_gender, "unspecified");
});

test("Private reveal is server-issued and pause invalidates an opened link immediately", async () => {
  const testEnv = env();
  await ownerCreate(testEnv, { budget_disclosure_approved: true });
  const cookie = await anonymousCookie(testEnv);
  const blockedApply = await call(testEnv, "/public/api/jobs/JOB-20261001-DEMO01/apply", { headers: { cookie } });
  assert.equal(blockedApply.status, 403);
  const reveal = await call(testEnv, "/public/api/jobs/JOB-20261001-DEMO01/reveal", { method: "POST", headers: { cookie } });
  const openedCookie = `${cookie}; ${reveal.headers.get("set-cookie").split(";", 1)[0]}`;
  assert.equal((await call(testEnv, "/public/api/jobs/JOB-20261001-DEMO01", { headers: { cookie: openedCookie } })).status, 200);
  const paused = await call(testEnv, "/public/api/jobs/internal/jobs/JOB-20261001-DEMO01/status", { method: "POST", headers: { "x-internal-token": "owner-test-token" }, body: { status: "paused" } });
  assert.equal(paused.status, 200, await paused.text());
  assert.equal((await call(testEnv, "/public/api/jobs/JOB-20261001-DEMO01", { headers: { cookie: openedCookie } })).status, 404);
});

test("Private reveal token expires and returns to the redacted gate", async () => {
  const testEnv = env();
  await ownerCreate(testEnv);
  const cookie = await anonymousCookie(testEnv);
  const issuedAt = Date.now();
  const reveal = await call(testEnv, "/public/api/jobs/JOB-20261001-DEMO01/reveal", { method: "POST", headers: { cookie } });
  const openedCookie = `${cookie}; ${reveal.headers.get("set-cookie").split(";", 1)[0]}`;
  const realNow = Date.now;
  try {
    Date.now = () => issuedAt + 31 * 60 * 1000;
    const detail = await call(testEnv, "/public/api/jobs/JOB-20261001-DEMO01", { headers: { cookie: openedCookie } });
    const page = await detail.text();
    assert.equal(detail.status, 200);
    assert.match(page, /รายละเอียดของงานนี้จะยังไม่แสดงบนหน้ารวมครับ/);
    assert.doesNotMatch(page, /ลูกค้าเกย์ผู้ใหญ่/);
    assert.equal((await call(testEnv, "/public/api/jobs/JOB-20261001-DEMO01/apply", { headers: { cookie: openedCookie } })).status, 403);
  } finally { Date.now = realNow; }
});

test("anonymous viewer summaries trigger owner alerts without storing direct identity and remain owner-controlled", async () => {
  const alerts = [];
  const testEnv = env({ PUBLIC_JOB_OWNER_ALERTS: { fetch: async (_url, init) => { alerts.push(JSON.parse(init.body)); return new Response(null, { status: 202 }); } } });
  for (const id of ["JOB-20261001-PRIV01", "JOB-20261001-PRIV02", "JOB-20261001-PRIV03"]) await ownerCreate(testEnv, { id, world: "private", confidentiality: true });
  const cookie = await anonymousCookie(testEnv);
  for (const id of ["JOB-20261001-PRIV01", "JOB-20261001-PRIV02", "JOB-20261001-PRIV03"]) {
    const opened = await call(testEnv, `/public/api/jobs/${id}/reveal`, { method: "POST", headers: { cookie } });
    assert.equal(opened.status, 303, await opened.text());
  }
  const viewerResponse = await call(testEnv, "/public/api/jobs/internal/viewers", { headers: { "x-internal-token": "owner-test-token" } });
  const viewers = (await viewerResponse.json()).viewers;
  assert.equal(viewerResponse.status, 200);
  assert.equal(viewers.length, 1);
  assert.equal(viewers[0].alert_level, "SUSPICIOUS");
  assert.equal(viewers[0].viewer_status, "interested_not_applied");
  assert.equal(Object.hasOwn(viewers[0], "ip"), false);
  assert.equal(Object.hasOwn(viewers[0], "line_id"), false);
  assert.equal(alerts.length, 1);
  assert.equal(Object.hasOwn(alerts[0], "events"), false);

  const ref = viewers[0].viewer_ref;
  const restricted = await call(testEnv, `/public/api/jobs/internal/viewers/${ref}/action`, { method: "POST", headers: { "x-internal-token": "owner-test-token" }, body: { action: "restrict_private" } });
  assert.equal(restricted.status, 200, await restricted.text());
  for (let i = 0; i < 3; i += 1) assert.equal((await call(testEnv, "/public/api/jobs/JOB-20261001-PRIV01", { headers: { cookie } })).status, 404);
  const escalated = await call(testEnv, "/public/api/jobs/internal/viewers", { headers: { "x-internal-token": "owner-test-token" } });
  assert.equal((await escalated.json()).viewers[0].alert_level, "HIGH_RISK");
  assert.equal(alerts.length, 2);
  const unbanned = await call(testEnv, `/public/api/jobs/internal/viewers/${ref}/action`, { method: "POST", headers: { "x-internal-token": "owner-test-token" }, body: { action: "unban" } });
  assert.equal(unbanned.status, 200, await unbanned.text());
  assert.equal((await call(testEnv, "/public/api/jobs/JOB-20261001-PRIV01", { headers: { cookie } })).status, 200);
});

test("brief reading time and CTA signals are stored as bounded anonymous events", async () => {
  const testEnv = env();
  await ownerCreate(testEnv, { id: "JOB-20261001-PUBLIC2", world: "public", confidentiality: false });
  const cookie = await anonymousCookie(testEnv);
  assert.equal((await call(testEnv, "/public/api/jobs/JOB-20261001-PUBLIC2", { headers: { cookie } })).status, 200);
  const ping = await call(testEnv, "/public/api/jobs/events", { method: "POST", headers: { cookie }, body: { type: "read_ping", job_id: "JOB-20261001-PUBLIC2", read_seconds: 42 } });
  assert.equal(ping.status, 204, await ping.text());
  const owner = await call(testEnv, "/public/api/jobs/internal/viewers", { headers: { "x-internal-token": "owner-test-token" } });
  const viewers = (await owner.json()).viewers;
  const event = viewers[0].events.find((item) => item.type === "read_ping");
  assert.equal(event.read_seconds, 42);
  assert.equal(event.job_id, "JOB-20261001-PUBLIC2");
});

test("LIFF-verified model interest stays verified and duplicate interest is rejected", async () => {
  const testEnv = env();
  await ownerCreate(testEnv);
  const cookie = await anonymousCookie(testEnv);
  const first = await interest(testEnv, cookie);
  const created = await first.json();
  assert.equal(first.status, 201);
  assert.equal(created.status, "received");
  assert.doesNotMatch(JSON.stringify(created), /candidate|identity|verify/i);
  const applicationKey = [...testEnv.PUBLIC_ACCESS_EVIDENCE.rows.keys()].find((key) => key.includes("/applications/"));
  const application = JSON.parse(new TextDecoder().decode(testEnv.PUBLIC_ACCESS_EVIDENCE.rows.get(applicationKey).bytes));
  assert.equal(application.identity.identity_class, "VERIFIED_LINE_MODEL");
  assert.equal(application.identity.verified_model_record_id, "rec12345678901234");
  assert.equal(application.workflow_status, "existing_model_unbound");
  const second = await interest(testEnv, cookie);
  assert.equal(second.status, 409);
  assert.equal((await second.json()).error, "job_interest_already_exists");
});

test("verified model gate is authoritative for interest while owner binding stays manual", async () => {
  const testEnv = env();
  await ownerCreate(testEnv);
  const cookie = await anonymousCookie(testEnv);
  const response = await interest(testEnv, cookie, { existing_model_claim: "MMD Model A" });
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  const key = [...testEnv.PUBLIC_ACCESS_EVIDENCE.rows.keys()].find((item) => item.includes("/applications/"));
  const application = JSON.parse(new TextDecoder().decode(testEnv.PUBLIC_ACCESS_EVIDENCE.rows.get(key).bytes));
  assert.equal(application.identity.identity_class, "VERIFIED_LINE_MODEL");
  assert.equal(application.identity.verified_model_record_id, "rec12345678901234");
  assert.equal(application.workflow_status, "existing_model_unbound");
  assert.equal(application.controls.auto_bind, false);
  assert.equal(application.controls.auto_book, false);
});

test("upload grant is bound to job application slot and media remains private", async () => {
  const testEnv = env();
  await ownerCreate(testEnv);
  const cookie = await anonymousCookie(testEnv);
  const created = await (await interest(testEnv, cookie)).json();
  const bytes = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/jpeg" });
  const grantResponse = await call(testEnv, `/public/api/jobs/JOB-20261001-DEMO01/applications/${created.application_ref}/upload-grant`, { method: "POST", headers: { cookie }, body: { slot: 1, content_type: "image/jpeg", size: 4 } });
  const grant = await grantResponse.json();
  assert.equal(grantResponse.status, 200, JSON.stringify(grant));
  const upload = await call(testEnv, new URL(grant.upload.url, "https://sigil.mmdbkk.com").pathname + new URL(grant.upload.url, "https://sigil.mmdbkk.com").search, { method: "PUT", headers: { cookie, "content-type": "image/jpeg" }, body: bytes });
  const uploaded = await upload.json();
  assert.equal(upload.status, 200, JSON.stringify(uploaded));
  assert.equal(uploaded.private, true);
  assert.equal(Object.hasOwn(uploaded, "object_key"), false);
  const mediaKeys = [...testEnv.PUBLIC_ACCESS_EVIDENCE.rows.keys()].filter((key) => key.includes("/private-media/"));
  assert.equal(mediaKeys.length, 1);
  assert.equal(mediaKeys[0].includes(created.application_ref), true);
});

test("upload contract rejects invalid MIME size slot payload and expired grants", async () => {
  const testEnv = env();
  await ownerCreate(testEnv, { media_requirements: { count: 1 } });
  const cookie = await anonymousCookie(testEnv);
  const created = await (await interest(testEnv, cookie)).json();
  const base = `/public/api/jobs/JOB-20261001-DEMO01/applications/${created.application_ref}/upload-grant`;
  assert.equal((await call(testEnv, base, { method: "POST", headers: { cookie }, body: { slot: 1, content_type: "image/gif", size: 3 } })).status, 415);
  assert.equal((await call(testEnv, base, { method: "POST", headers: { cookie }, body: { slot: 2, content_type: "image/png", size: 3 } })).status, 400);
  assert.equal((await call(testEnv, base, { method: "POST", headers: { cookie }, body: { slot: 1, content_type: "image/png", size: 10 * 1024 * 1024 + 1 } })).status, 400);
  let grant = await (await call(testEnv, base, { method: "POST", headers: { cookie }, body: { slot: 1, content_type: "image/png", size: 3 } })).json();
  let target = new URL(grant.upload.url, "https://sigil.mmdbkk.com");
  assert.equal((await call(testEnv, target.pathname + target.search, { method: "PUT", headers: { cookie, "content-type": "image/png" }, body: new Blob([new Uint8Array([1, 2])], { type: "image/png" }) })).status, 400);
  const realNow = Date.now;
  try {
    const issuedAt = realNow();
    grant = await (await call(testEnv, base, { method: "POST", headers: { cookie }, body: { slot: 1, content_type: "image/png", size: 3 } })).json();
    target = new URL(grant.upload.url, "https://sigil.mmdbkk.com");
    Date.now = () => issuedAt + 11 * 60 * 1000;
    assert.equal((await call(testEnv, target.pathname + target.search, { method: "PUT", headers: { cookie, "content-type": "image/png" }, body: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }) })).status, 401);
  } finally { Date.now = realNow; }
});

test("submission preserves self-described gender and customer scope without inference", async () => {
  const testEnv = env();
  await ownerCreate(testEnv);
  const cookie = await anonymousCookie(testEnv);
  const created = await (await interest(testEnv, cookie)).json();
  for (let slot = 1; slot <= 2; slot += 1) {
    const grant = await (await call(testEnv, `/public/api/jobs/JOB-20261001-DEMO01/applications/${created.application_ref}/upload-grant`, { method: "POST", headers: { cookie }, body: { slot, content_type: "image/png", size: 3 } })).json();
    const target = new URL(grant.upload.url, "https://sigil.mmdbkk.com");
    const upload = await call(testEnv, target.pathname + target.search, { method: "PUT", headers: { cookie, "content-type": "image/png" }, body: new Blob([new Uint8Array([slot, 2, 3])], { type: "image/png" }) });
    assert.equal(upload.status, 200, await upload.text());
  }
  const submitted = await call(testEnv, `/public/api/jobs/JOB-20261001-DEMO01/applications/${created.application_ref}/submit`, { method: "POST", headers: { cookie }, body: { nickname: "เอ", age: 25, height_cm: 180, weight_kg: 70, profile: "งานแสดง", gender: "self_described", gender_note: "nonbinary", customer_scope: "both", work_scope: "งานสังคมและงานแสดง", unavailable_scope: "ไม่รับงานสัมผัสตัว", clothing_size: "M" } });
  const result = await submitted.json();
  assert.equal(submitted.status, 200, JSON.stringify(result));
  assert.equal(result.auto_bound, false);
  const key = [...testEnv.PUBLIC_ACCESS_EVIDENCE.rows.keys()].find((item) => item.endsWith(`/${created.application_ref}.json`));
  const application = JSON.parse(new TextDecoder().decode(testEnv.PUBLIC_ACCESS_EVIDENCE.rows.get(key).bytes));
  assert.equal(application.applicant.gender, "self_described");
  assert.equal(application.applicant.gender_note, "nonbinary");
  assert.equal(application.applicant.customer_scope, "both");
  assert.equal(application.applicant.unavailable_scope, "ไม่รับงานสัมผัสตัว");
});

test("only owner decisions can bind and no decision auto-rates books or replies", async () => {
  const testEnv = env();
  await ownerCreate(testEnv, { media_requirements: { count: 1 } });
  const cookie = await anonymousCookie(testEnv);
  const created = await (await interest(testEnv, cookie)).json();
  const grant = await (await call(testEnv, `/public/api/jobs/JOB-20261001-DEMO01/applications/${created.application_ref}/upload-grant`, { method: "POST", headers: { cookie }, body: { slot: 1, content_type: "image/jpeg", size: 2 } })).json();
  const target = new URL(grant.upload.url, "https://sigil.mmdbkk.com");
  assert.equal((await call(testEnv, target.pathname + target.search, { method: "PUT", headers: { cookie, "content-type": "image/jpeg" }, body: new Blob([new Uint8Array([1, 2])], { type: "image/jpeg" }) })).status, 200);
  const submit = await call(testEnv, `/public/api/jobs/JOB-20261001-DEMO01/applications/${created.application_ref}/submit`, { method: "POST", headers: { cookie }, body: { nickname: "บี", age: 28, height_cm: 178, weight_kg: 68, gender: "male", customer_scope: "men", work_scope: "งานสังคม", unavailable_scope: "ไม่รับงานเกินบรีฟ" } });
  assert.equal(submit.status, 200, await submit.text());
  const unauthorized = await call(testEnv, `/public/api/jobs/internal/jobs/JOB-20261001-DEMO01/candidates/${created.application_ref}/decision`, { method: "POST", body: { decision: "bind_to_existing_model", model_record_id: "rec12345678901234" } });
  assert.equal(unauthorized.status, 403);
  const decision = await call(testEnv, `/public/api/jobs/internal/jobs/JOB-20261001-DEMO01/candidates/${created.application_ref}/decision`, { method: "POST", headers: { "x-internal-token": "owner-test-token" }, body: { decision: "bind_to_existing_model", model_record_id: "rec12345678901234" } });
  const result = await decision.json();
  assert.equal(decision.status, 200, JSON.stringify(result));
  assert.equal(result.application.workflow_status, "bound_after_owner_review");
  assert.deepEqual(result.side_effects, { model_created: false, booked: false, rated: false, customer_replied: false });
});

test("draft paused closed and expired jobs never appear on the public board", async () => {
  for (const status of ["draft", "paused", "closed", "expired"]) {
    const record = createJobRecord({ id: `JOB-20261001-${status.toUpperCase()}`, status, brief: "งานอีเวนต์\n💰 5,000 บาท\n🍌 รูปเดี่ยว 1 รูป" });
    assert.equal(record.status, status);
  }
  const testEnv = env();
  await ownerCreate(testEnv, { status: "paused" });
  const cookie = await anonymousCookie(testEnv);
  const html = await (await call(testEnv, "/public/api/jobs", { headers: { cookie } })).text();
  assert.match(html, /ตอนนี้ยังไม่มีงานที่เปิดรับครับ/);
  assert.doesNotMatch(html, /JOB-20261001-DEMO01/);
});

test("owner UI requires a short-lived HttpOnly session and exposes create plus review controls", async () => {
  const testEnv = env();
  const blocked = await call(testEnv, "/public/api/jobs/internal");
  assert.equal(blocked.status, 403);
  const session = await call(testEnv, "/public/api/jobs/internal/session", { method: "POST", headers: { "x-internal-token": "owner-test-token" }, body: {} });
  assert.equal(session.status, 200, await session.text());
  const rawCookie = session.headers.get("set-cookie");
  assert.match(rawCookie, /mmd_pjb_owner=/);
  assert.match(rawCookie, /HttpOnly/);
  assert.match(rawCookie, /SameSite=Strict/);
  const page = await call(testEnv, "/public/api/jobs/internal", { headers: { cookie: rawCookie.split(";", 1)[0] } });
  const html = await page.text();
  assert.equal(page.status, 200, html);
  assert.match(html, /วางบรีฟตามภาษาที่เปอร์ใช้/);
  assert.match(html, /บันทึกงาน/);
  assert.match(html, /เพศลูกค้า/);
  assert.match(html, /ผู้สนใจต่อ Job/);
  assert.match(html, /รายการงาน/);
  assert.match(html, /request_more_information/);
  assert.match(html, /bind_to_existing_model/);
});

test("owner can list jobs and update status privacy plus budget disclosure server-side", async () => {
  const testEnv = env();
  await ownerCreate(testEnv, { world: "public", confidentiality: false });
  const headers = { "x-internal-token": "owner-test-token" };
  let response = await call(testEnv, "/public/api/jobs/internal/jobs", { headers });
  let body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.jobs.length, 1);
  response = await call(testEnv, "/public/api/jobs/internal/jobs/JOB-20261001-DEMO01/status", { method: "POST", headers, body: { world: "private", confidentiality: true, budget_disclosure_approved: true, customer_gender: "female" } });
  body = await response.json();
  assert.equal(body.job.public.world, "private");
  assert.equal(body.job.public.budget_disclosure_approved, true);
  assert.equal(body.job.public.customer_gender, "female");
  response = await call(testEnv, "/public/api/jobs/internal/jobs/JOB-20261001-DEMO01/status", { method: "POST", headers, body: { world: "public", confidentiality: false, budget_disclosure_approved: true } });
  body = await response.json();
  assert.equal(body.job.public.world, "public");
  assert.equal(body.job.public.budget_disclosure_approved, false);
});

test("viewer events honor seven-day retention and WATCH classification", async () => {
  const testEnv = env();
  await ownerCreate(testEnv, { world: "private", confidentiality: true });
  const cookie = await anonymousCookie(testEnv);
  const viewerKey = [...testEnv.PUBLIC_ACCESS_EVIDENCE.rows.keys()].find((key) => key.includes("/viewers/"));
  const record = JSON.parse(new TextDecoder().decode(testEnv.PUBLIC_ACCESS_EVIDENCE.rows.get(viewerKey).bytes));
  record.events = Array.from({ length: 100 }, (_, i) => ({ type: "brief_open", job_id: "OLD", world: "private", at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000 - i).toISOString() }));
  await testEnv.PUBLIC_ACCESS_EVIDENCE.put(viewerKey, JSON.stringify(record));
  for (let i = 0; i < 3; i += 1) assert.equal((await call(testEnv, "/public/api/jobs/JOB-20261001-DEMO01", { headers: { cookie } })).status, 200);
  const owner = await call(testEnv, "/public/api/jobs/internal/viewers", { headers: { "x-internal-token": "owner-test-token" } });
  const viewer = (await owner.json()).viewers[0];
  assert.equal(viewer.alert_level, "WATCH");
  assert.equal(viewer.events.some((event) => event.job_id === "OLD"), false);
  assert.ok(viewer.events.length <= 100);
});

test("responsive board contract is four cards on desktop and two on mobile", async () => {
  const testEnv = env();
  await ownerCreate(testEnv, { world: "public", confidentiality: false });
  const page = await (await call(testEnv, "/public/api/jobs")).text();
  assert.match(page, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(page, /@media\(max-width:640px\)[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test("job-board preflight allows the upload method and credentialed exact origin", async () => {
  const response = await worker.fetch(new Request("https://sigil.mmdbkk.com/public/api/jobs", { method: "OPTIONS", headers: { origin: "https://sigil.mmdbkk.com" } }), env({ ALLOWED_ORIGINS: "https://sigil.mmdbkk.com" }));
  assert.equal(response.status, 204);
  assert.match(response.headers.get("access-control-allow-methods"), /PUT/);
  assert.equal(response.headers.get("access-control-allow-credentials"), "true");
});

test("existing public-access health route still delegates to the original worker", async () => {
  const response = await call(env(), "/health", { headers: { origin: "https://sigil.mmdbkk.com" } });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.worker, "public-access-worker");
  assert.equal(body.version, "v1");
});
