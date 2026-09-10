// admin-worker/src/admin-dashboard-jobs.js
// Read-only projection for the Operations Dashboard “All Jobs” surface.
// Browser authentication is enforced by admin-login-hero-worker before this
// handler is called. This module never accepts or issues service credentials.

const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_SESSIONS_TABLE_ID = "tblC98mKWbzmPuNzX";
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export function isAdminDashboardJobsView(url) {
  return String(url?.searchParams?.get("view") || "").trim().toLowerCase() === "jobs";
}

export async function handleAdminDashboardJobsRequest(request, env, actor) {
  if (!actor) return jobsJson({ ok: false, error: "unauthorized" }, 401);

  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return jobsJson({ ok: false, error: "method_not_allowed" }, 405);
  }

  const url = new URL(request.url);
  const rawDate = String(url.searchParams.get("date") || url.searchParams.get("job_date") || "").trim();
  const jobDate = normalizeDateOnly(rawDate);
  if (rawDate && !jobDate) {
    return jobsJson({ ok: false, error: "invalid_job_date", expected: "YYYY-MM-DD" }, 400);
  }

  const page = positiveInt(url.searchParams.get("page"), 1);
  const pageSize = clamp(positiveInt(url.searchParams.get("page_size"), DEFAULT_PAGE_SIZE), 1, MAX_PAGE_SIZE);
  const sessionsTable = env.AIRTABLE_TABLE_SESSIONS || DEFAULT_SESSIONS_TABLE_ID;

  try {
    const records = await airtableListAll(env, sessionsTable);
    const result = buildJobsPage(records, {
      now: new Date(),
      page,
      pageSize,
      jobDate,
    });

    const body = {
      ok: true,
      layer: "core",
      source: "admin-worker",
      view: "jobs",
      generated_at: new Date().toISOString(),
      filters: {
        job_date: jobDate || null,
      },
      pagination: result.pagination,
      counts: result.counts,
      jobs: result.items,
    };

    if (method === "HEAD") {
      const response = jobsJson(body);
      return new Response(null, { status: response.status, headers: response.headers });
    }
    return jobsJson(body);
  } catch (error) {
    return jobsJson({
      ok: false,
      error: "jobs_unavailable",
      detail: String(error?.message || error || "unknown_error").slice(0, 180),
    }, 503);
  }
}

export function buildJobsPage(records, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const requestedPage = positiveInt(options.page, 1);
  const pageSize = clamp(positiveInt(options.pageSize, DEFAULT_PAGE_SIZE), 1, MAX_PAGE_SIZE);
  const jobDate = normalizeDateOnly(options.jobDate || "");
  const allItems = projectJobs(records, now);
  const filtered = jobDate ? allItems.filter((item) => item.job_date === jobDate) : allItems;
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const start = (page - 1) * pageSize;
  const today = bangkokDateOffset(now, 0);

  return {
    items: filtered.slice(start, start + pageSize),
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: totalPages,
      has_prev: page > 1,
      has_next: page < totalPages,
    },
    counts: {
      all: allItems.length,
      filtered: total,
      today: allItems.filter((item) => item.job_date === today).length,
      upcoming: allItems.filter((item) => item.job_date && item.job_date > today).length,
      past: allItems.filter((item) => item.job_date && item.job_date < today).length,
      undated: allItems.filter((item) => !item.job_date).length,
    },
  };
}

export function projectJobs(records, now = new Date()) {
  const items = (Array.isArray(records) ? records : []).map((record) => {
    const fields = record?.fields || {};
    const sessionId = firstText(fields.session_id, fields.sid, fields.job_id, record?.id);
    const model = firstText(
      fields.model_name,
      fields["Assigned Model"],
      fields["Model Name"],
      fields.model,
      fields.assigned_model,
      "ยังไม่ระบุ model",
    );
    const customer = firstText(fields.client_name, fields.member_name, fields.customer_name, fields.name, "ลูกค้า");
    const rawStatus = firstText(fields.session_state, fields.status, fields["Session Status"], fields.job_status, "กำลังดำเนินการ");
    const jobDateSource = firstText(fields.job_date, fields.service_date, fields.date, fields["Job Date"]);
    const scheduleSource = firstText(fields.start_at, fields.scheduled_at, fields.date_time);
    const startTimeSource = firstText(fields.start_time, fields["Start Time"], scheduleSource);
    const jobDate = normalizeDateOnly(jobDateSource) || normalizeDateOnly(scheduleSource);
    const dateLabel = jobDateLabel(jobDate || jobDateSource || scheduleSource);
    const timeOnly = timeLabel(startTimeSource);
    const when = compactJoin([dateLabel, timeOnly], " · ") || "ยังไม่มีวันเวลา";

    return {
      id: sessionId,
      title: `${model} · ${customer}`,
      text: compactJoin([
        rawStatus,
        firstText(fields.service_type, fields.package_code, fields["Session Type"], fields.work_type, ""),
      ], " · "),
      job_date: jobDate,
      date_label: dateLabel,
      start_time: firstText(fields.start_time, fields["Start Time"]),
      time_only: timeOnly,
      time: when,
      when,
      status: thaiStatus(rawStatus),
      progress: progressFromStatus(rawStatus),
      href: `/internal/admin/jobs/${encodeURIComponent(sessionId)}`,
    };
  });

  return sortJobs(items, now);
}

async function airtableListAll(env, tableName) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID || !tableName) {
    throw new Error("missing_airtable_env");
  }

  const records = [];
  const seenOffsets = new Set();
  let offset = "";

  do {
    const qs = new URLSearchParams({ pageSize: "100" });
    if (offset) qs.set("offset", offset);
    const response = await fetch(
      `${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}?${qs.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      throw new Error(`airtable_${tableName}_${response.status}`);
    }

    const data = await response.json();
    if (Array.isArray(data.records)) records.push(...data.records);

    const nextOffset = String(data.offset || "").trim();
    if (!nextOffset) break;
    if (seenOffsets.has(nextOffset)) throw new Error("airtable_offset_loop");
    seenOffsets.add(nextOffset);
    offset = nextOffset;
  } while (offset);

  return records;
}

function sortJobs(items, now) {
  const today = bangkokDateOffset(now, 0);
  const bucket = (job) => {
    if (!job.job_date) return 3;
    if (job.job_date === today) return 0;
    if (job.job_date > today) return 1;
    return 2;
  };

  return [...items].sort((a, b) => {
    const aBucket = bucket(a);
    const bBucket = bucket(b);
    if (aBucket !== bBucket) return aBucket - bBucket;
    if (a.job_date !== b.job_date) {
      if (aBucket === 2) return String(b.job_date).localeCompare(String(a.job_date));
      return String(a.job_date).localeCompare(String(b.job_date));
    }
    return String(a.time_only || "99:99").localeCompare(String(b.time_only || "99:99"));
  });
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

function jobDateLabel(value) {
  const raw = str(Array.isArray(value) ? value[0] : value);
  if (!raw) return "";
  const normalized = normalizeDateOnly(raw);
  const date = normalized ? new Date(`${normalized}T12:00:00+07:00`) : parseDate(raw);
  if (!date) return "";
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function timeLabel(value) {
  const raw = str(Array.isArray(value) ? value[0] : value);
  if (!raw) return "";

  const timeOnly = raw.match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?$/);
  if (timeOnly) {
    const hour = Number(timeOnly[1]);
    const minute = Number(timeOnly[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  }

  const date = parseDate(raw);
  if (!date) return "";
  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function bangkokDateOffset(value, days) {
  const base = value instanceof Date ? value : new Date(value);
  const shifted = new Date(base.getTime() + Number(days || 0) * 86400000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(shifted);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function normalizeDateOnly(value) {
  const raw = str(Array.isArray(value) ? value[0] : value);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return "";
  const date = new Date(`${match[1]}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10) === match[1] ? match[1] : "";
}

function parseDate(value) {
  const raw = str(Array.isArray(value) ? value[0] : value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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

function lower(value) {
  return str(value).toLowerCase();
}

function str(value) {
  return String(value == null ? "" : value).trim();
}

function jobsJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private",
      "X-MMD-Dashboard-View": "jobs-v1",
    },
  });
}
