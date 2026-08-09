// admin-worker/src/dashboard-worker.js
// =========================================================
// Admin dashboard wrapper
//
// Purpose:
// - Add GET /v1/admin/dashboard without touching the large core router.
// - Delegate every other request to the existing admin-worker implementation.
// - Keep the dashboard endpoint read-only and safe for Webflow.
// =========================================================

import coreWorker, { isAuthed as isCoreAuthed } from "./index.js";

const AIRTABLE_API = "https://api.airtable.com/v0";
const DASHBOARD_PATH = "/v1/admin/dashboard";
const MEMBER_DASHBOARD_PATH = "/v1/member/dashboard";
const SAFE_MEMBER_QUERY_KEYS = ["t", "code", "promo", "source", "invite"];

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = normalizePathname(url.pathname);
    const method = req.method.toUpperCase();
    const cors = corsHeaders(req, env);

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (path === MEMBER_DASHBOARD_PATH) {
      if (method !== "GET" && method !== "HEAD") {
        return withCors(memberDashboardJson({ ok: false, error: "method_not_allowed" }, 405), cors);
      }

      return withCors(handleMemberDashboard(url, method === "HEAD"), cors);
    }

    if (path === DASHBOARD_PATH) {
      if (!isAllowedOrigin(req, env)) {
        return withCors(json({ ok: false, error: "origin_not_allowed" }, 403), cors);
      }

      if (!(await isAuthed(req, env))) {
        return withCors(json({ ok: false, error: "unauthorized" }, 401), cors);
      }

      if (method !== "GET") {
        return withCors(json({ ok: false, error: "method_not_allowed" }, 405), cors);
      }

      return withCors(json(await buildAdminDashboard(env)), cors);
    }

    return coreWorker.fetch(req, env, ctx);
  },
};

function handleMemberDashboard(url, head = false) {
  const token = str(url.searchParams.get("t"));
  if (!token) {
    return memberDashboardJson({
      ok: false,
      state: "invalid_link",
      message: "ไม่พบลิงก์ส่วนตัวครับ",
    }, 404, head);
  }

  const query = safeMemberQuery(url.searchParams);
  return memberDashboardJson({
    ok: true,
    data: buildSafeMemberDashboardContract(query),
  }, 200, head);
}

function memberDashboardJson(data, status = 200, head = false) {
  return new Response(head ? null : JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
      "x-mmd-worker": "admin-worker",
      "x-mmd-page": "member-dashboard-api",
      "x-mmd-contract": "customer-safe-status",
    },
  });
}

function buildSafeMemberDashboardContract(query) {
  const actions = buildMemberDashboardActions(query);
  return {
    dashboard_state: "review_required",
    member: {
      display_name: "สมาชิก MMD",
      tier: null,
      status: "review_required",
      expires_at: null,
    },
    access: {
      status: "review_required",
      tier: null,
      expire_label: null,
      model_access: [],
    },
    points: {
      available: false,
      active: null,
      lifetime: null,
      spend_year: null,
      spend_lifetime: null,
      status: "MMD will confirm points after review.",
    },
    payment: {
      status: "review_required",
      message: "MMD is reviewing your payment evidence.",
    },
    telegram_access: {
      status: "review_required",
      label: "MMD will confirm Telegram access.",
    },
    next_recommended_step: {
      key: "mmd_review",
      label: "MMD is reviewing your member status.",
      href: actions.membership_url,
    },
    actions,
    grants: {
      membership: false,
      points: false,
      payment_status: false,
      telegram_access: false,
      private_access: false,
    },
    data_status: "contract_only",
    updates: [],
  };
}

function buildMemberDashboardActions(query) {
  return {
    membership_url: appendSafeMemberQuery("/sigil/member/membership", query),
    payment_url: appendSafeMemberQuery("/confirm/payment-confirmation", query),
    booking_url: null,
    renewal_url: null,
  };
}

function safeMemberQuery(params) {
  const out = new URLSearchParams();
  for (const key of SAFE_MEMBER_QUERY_KEYS) {
    const value = str(params.get(key));
    if (value) out.set(key, value);
  }
  return out;
}

function appendSafeMemberQuery(path, params) {
  const rendered = params.toString();
  return rendered ? `${path}?${rendered}` : path;
}

async function buildAdminDashboard(env) {
  const now = new Date();

  const [proofsResult, sessionsResult, membersResult] = await Promise.allSettled([
    airtableList(env, env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || "tblfJfM4Sqag9zrLi", 30),
    airtableList(env, env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX", 30),
    airtableList(env, env.AIRTABLE_TABLE_MEMBERS || "members", 30),
  ]);

  const proofRecords = settledRecords(proofsResult);
  const sessionRecords = settledRecords(sessionsResult);
  const memberRecords = settledRecords(membersResult);

  const money = buildMoneyList(proofRecords);
  const jobs = buildJobList(sessionRecords, now);
  const members = buildMemberList(memberRecords, now);
  const boss = buildBossList({ money, jobs, members, proofRecords, sessionRecords, memberRecords });
  const todos = buildTodos({ money, jobs, members, boss });

  const counts = {
    urgent: todos.length + boss.length,
    payments: money.length,
    jobs: jobs.length,
    members: members.length,
  };

  const focus = buildFocus({ money, jobs, members, boss });

  return {
    ok: true,
    layer: "core",
    source: "admin-worker",
    generated_at: now.toISOString(),
    focus,
    counts,
    todos,
    jobs,
    money,
    members,
    boss,
    status: {
      admin: "พร้อม",
      payments: proofRecords.length ? "พร้อม" : statusFromResult(proofsResult),
      telegram: "พร้อม",
      data: dataMode([proofsResult, sessionsResult, membersResult]),
    },
    debug: {
      payments_loaded: proofRecords.length,
      sessions_loaded: sessionRecords.length,
      members_loaded: memberRecords.length,
      payment_source: resultReason(proofsResult),
      session_source: resultReason(sessionsResult),
      member_source: resultReason(membersResult),
    },
  };
}

function buildFocus({ money, jobs, members, boss }) {
  if (money.length) {
    return {
      title: "ตรวจเงินก่อน",
      text: `มีรายการรอตรวจ ${money.length} รายการ อย่าเพิ่งเปิดสิทธิ์หรือเริ่มงานที่ผูกกับยอดนี้จนกว่าจะตรวจเสร็จ`,
    };
  }

  if (boss.length) {
    return {
      title: "ส่งเคสให้ Boss Per ดู",
      text: `มีเคสพิเศษ ${boss.length} รายการที่ไม่ควรให้แอดมินตัดสินใจเอง`,
    };
  }

  if (jobs.length) {
    return {
      title: "เช็กงานวันนี้",
      text: `มีงาน ${jobs.length} รายการที่ควรดูสถานะ เวลา และการคอนเฟิร์ม`,
    };
  }

  if (members.length) {
    return {
      title: "ดูสมาชิกที่ต้องต่ออายุ",
      text: `มีสมาชิก ${members.length} รายการที่ควรตรวจสถานะหรือต่ออายุ`,
    };
  }

  return {
    title: "ยังไม่มีเรื่องด่วน",
    text: "ตอนนี้ยังไม่มีรายการที่ต้องรีบทำก่อน",
  };
}

function buildTodos({ money, jobs, members, boss }) {
  const todos = [];

  if (money[0]) {
    todos.push({
      title: `ตรวจเงินของ ${money[0].title}`,
      text: money[0].text,
      href: "/internal/admin/payments",
      icon: "฿",
      tag: "ตรวจเงิน",
      color: "red",
    });
  }

  if (jobs.find((job) => /telegram|รอ|pending|confirm/i.test(job.status || job.text))) {
    const job = jobs.find((item) => /telegram|รอ|pending|confirm/i.test(item.status || item.text));
    todos.push({
      title: `เช็กงาน ${job.id || job.title}`,
      text: job.text,
      href: job.href || "/internal/admin/jobs",
      icon: "+",
      tag: "เช็กงาน",
      color: "yellow",
    });
  }

  if (members[0]) {
    todos.push({
      title: `ดูสมาชิก ${members[0].title}`,
      text: members[0].text,
      href: members[0].href || "/internal/admin/member-intelligence",
      icon: "◇",
      tag: members[0].tag || "สมาชิก",
      color: "gold",
    });
  }

  if (boss[0]) {
    todos.push({
      title: boss[0].title,
      text: boss[0].text,
      href: boss[0].href || "/internal/admin/exceptions",
      icon: "!",
      tag: "Boss Per",
      color: "gold",
    });
  }

  return todos.slice(0, 4);
}

function buildMoneyList(records) {
  return records
    .filter((record) => {
      const fields = record.fields || {};
      const status = lower(fields.status || fields.verification_status || fields.payment_status);
      return !status || /pending|รอ|review|unmatched|new/.test(status);
    })
    .slice(0, 6)
    .map((record) => {
      const fields = record.fields || {};
      const name = firstText(fields.payer_name, fields.member_name, fields.client_name, fields.name, "ลูกค้า");
      const amount = amountText(fields.amount_thb, fields.amount, fields.total_thb);
      const ref = firstText(fields.payment_ref, fields.proof_id, fields.session_id, record.id);
      return {
        title: name,
        text: compactJoin([firstText(fields.note, fields.channel, "รอตรวจสลิป"), ref ? `ref ${ref}` : ""], " · "),
        amount,
        href: "/internal/admin/payments",
      };
    });
}

function buildJobList(records, now) {
  return records
    .slice(0, 6)
    .map((record, index) => {
      const fields = record.fields || {};
      const sessionId = firstText(fields.session_id, fields.sid, fields.job_id, record.id);
      const model = firstText(fields.model_name, fields["Model Name"], fields.model, fields.assigned_model, "ยังไม่ระบุ model");
      const customer = firstText(fields.member_name, fields.customer_name, fields.client_name, fields.name, "ลูกค้า");
      const status = firstText(fields.session_state, fields.status, fields.job_status, "กำลังดำเนินการ");
      const time = timeLabel(fields.start_time || fields.start_at || fields.scheduled_at || fields.date_time, now, index);
      return {
        id: sessionId,
        title: `${model} · ${customer}`,
        text: compactJoin([status, firstText(fields.service_type, fields.package_code, fields.work_type, "")], " · "),
        time,
        status: thaiStatus(status),
        progress: progressFromStatus(status),
        href: `/internal/admin/jobs/${encodeURIComponent(sessionId)}`,
      };
    });
}

function buildMemberList(records, now) {
  return records
    .filter((record) => {
      const fields = record.fields || {};
      const status = lower(fields.status || fields.member_status || fields.membership_status);
      const expiry = parseDate(fields.expire_at || fields.expiry || fields.end_date || fields.expires_at);
      const nearExpiry = expiry ? expiry.getTime() - now.getTime() < 1000 * 60 * 60 * 24 * 30 : false;
      return /expired|pending|hold|รอ|หมด/.test(status) || nearExpiry;
    })
    .slice(0, 6)
    .map((record) => {
      const fields = record.fields || {};
      const name = firstText(fields.name, fields.mmd_client_name, fields.nickname, fields.email, "สมาชิก");
      const tier = firstText(fields.tier, fields.package_code, fields.member_tier, "Member");
      const status = firstText(fields.status, fields.member_status, fields.membership_status, "ควรตรวจ");
      return {
        title: name,
        text: `${tier} · ${thaiStatus(status)}`,
        tag: memberTag(status),
        href: "/internal/admin/member-intelligence",
      };
    });
}

function buildBossList({ money, jobs, members, proofRecords, sessionRecords, memberRecords }) {
  const out = [];

  const blackCardMember = memberRecords.find((record) => /black|vip|svip/i.test(JSON.stringify(record.fields || {})));
  if (blackCardMember) {
    const fields = blackCardMember.fields || {};
    out.push({
      title: `Black Card Review · ${firstText(fields.name, fields.mmd_client_name, fields.email, "สมาชิก")}`,
      text: "มีข้อมูลระดับ VIP / Black Card ควรให้ Boss Per ตรวจเอง",
      href: "/internal/admin/black-card-review",
    });
  }

  const unmatchedPayment = proofRecords.find((record) => /unmatched|จับคู่ไม่ได้|missing/i.test(JSON.stringify(record.fields || {})));
  if (unmatchedPayment) {
    out.push({
      title: "ยอดโอนจับคู่ไม่ได้",
      text: "มีรายการจ่ายเงินที่ยังจับคู่กับ session หรือสมาชิกไม่ได้",
      href: "/internal/admin/payments",
    });
  }

  const exceptionJob = sessionRecords.find((record) => /exception|telegram missing|invalid|hold|blocked/i.test(JSON.stringify(record.fields || {})));
  if (exceptionJob) {
    out.push({
      title: "Job Exception",
      text: "มีงานที่สถานะไม่ปกติ ควรตรวจเองก่อนให้ flow ไปต่อ",
      href: "/internal/admin/exceptions",
    });
  }

  if (!out.length && (money.length > 3 || jobs.length > 5 || members.length > 3)) {
    out.push({
      title: "รายการวันนี้ค่อนข้างแน่น",
      text: "ควรไล่ตรวจเงิน งาน และสมาชิกที่ใกล้หมดอายุก่อน",
      href: "/internal/admin/dashboard",
    });
  }

  return out.slice(0, 5);
}

async function airtableList(env, tableName, maxRecords = 20) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID || !tableName) {
    throw new Error("missing_airtable_env");
  }

  const qs = new URLSearchParams({ maxRecords: String(maxRecords) });
  const res = await fetch(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}?${qs.toString()}`, {
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`airtable_${tableName}_${res.status}`);
  }

  const data = await res.json();
  return Array.isArray(data.records) ? data.records : [];
}

function settledRecords(result) {
  return result.status === "fulfilled" && Array.isArray(result.value) ? result.value : [];
}

function statusFromResult(result) {
  return result.status === "fulfilled" ? "พร้อม" : "ยังไม่มีข้อมูล";
}

function resultReason(result) {
  return result.status === "fulfilled" ? "ok" : String(result.reason?.message || result.reason || "unavailable");
}

function dataMode(results) {
  const ok = results.filter((item) => item.status === "fulfilled").length;
  if (ok === results.length) return "ข้อมูลจริง";
  if (ok > 0) return "ข้อมูลจริงบางส่วน";
  return "ยังไม่มีข้อมูล";
}

function corsHeaders(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allow = getAllowedOrigins(env);
  const h = new Headers();

  if (!origin) {
    // server-to-server
  } else if (allow.length === 0 || allow.includes(origin)) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Vary", "Origin");
  }

  h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Confirm-Key");
  h.set("Access-Control-Max-Age", "86400");
  h.set("Content-Type", "application/json");
  return h;
}

function withCors(res, cors) {
  const headers = new Headers(res.headers);
  cors.forEach((value, key) => headers.set(key, value));
  return new Response(res.body, { status: res.status, headers });
}

function getAllowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isAllowedOrigin(req, env) {
  const allow = getAllowedOrigins(env);
  const origin = req.headers.get("Origin") || "";
  if (!origin) return true;
  if (!allow.length) return true;
  return allow.includes(origin);
}

async function isAuthed(req, env) {
  return await isCoreAuthed(req, env);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function normalizePathname(pathname = "") {
  const normalized = String(pathname || "/").replace(/\/{2,}/g, "/");
  if (normalized.length > 1) return normalized.replace(/\/$/, "");
  return normalized || "/";
}

function str(value) {
  return String(value == null ? "" : value).trim();
}

function lower(value) {
  return str(value).toLowerCase();
}

function firstText(...values) {
  for (const value of values) {
    const text = str(Array.isArray(value) ? value[0] : value);
    if (text) return text;
  }
  return "";
}

function compactJoin(values, separator) {
  return values.map(str).filter(Boolean).join(separator);
}

function amountText(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) {
      return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 }).format(num);
    }
  }
  return "-";
}

function parseDate(value) {
  const raw = str(Array.isArray(value) ? value[0] : value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function timeLabel(value, now, index) {
  const date = parseDate(value);
  if (date) {
    return new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" }).format(date);
  }
  const fallback = new Date(now.getTime() + (index + 1) * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" }).format(fallback);
}

function thaiStatus(value) {
  const text = lower(value);
  if (/active|confirmed|ready|verified|paid|approved/.test(text)) return "พร้อม";
  if (/pending|wait|review|new|รอ/.test(text)) return "รอตรวจ";
  if (/expired|หมด/.test(text)) return "หมดอายุ";
  if (/hold|paused|blocked|พัก/.test(text)) return "พักไว้ก่อน";
  if (/travel|en_route|on_the_way/.test(text)) return "กำลังเดินทาง";
  if (/arrived/.test(text)) return "ถึงแล้ว";
  if (/working|live/.test(text)) return "กำลังทำงาน";
  if (/finished|done|closed/.test(text)) return "เสร็จแล้ว";
  return str(value) || "กำลังดำเนินการ";
}

function progressFromStatus(value) {
  const text = lower(value);
  if (/new|pending|wait|รอ/.test(text)) return 20;
  if (/confirmed|ready|approved/.test(text)) return 40;
  if (/travel|en_route|on_the_way/.test(text)) return 58;
  if (/arrived/.test(text)) return 72;
  if (/working|live/.test(text)) return 86;
  if (/finished|done|closed/.test(text)) return 100;
  return 35;
}

function memberTag(status) {
  const text = lower(status);
  if (/expired|หมด/.test(text)) return "ต่ออายุ";
  if (/pending|รอ/.test(text)) return "รอตรวจ";
  if (/hold|paused|พัก/.test(text)) return "พักไว้ก่อน";
  return "ดู";
}
