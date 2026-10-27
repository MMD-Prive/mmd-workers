import { readCredentialBoundAdminActor } from "./credential-bound-admin-session.js";
import { isOwnerActor } from "./owner-my-mmd-recovery-diagnostic.js";
import { renderHypeConsole } from "./hype-console-page.js";

export const HYPE_CONSOLE_PAGE = "/internal/admin/hype";
export const HYPE_CONSOLE_API = "/v1/admin/hype";
const ORIGINS = new Set(["https://mmdbkk.com", "https://www.mmdbkk.com"]);
const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;
const SOURCES = Object.freeze({
  member: {
    table: "tbl8z2MQpIqcdylim", label: "Membership Applications",
    names: ["Applicant Name"], fields: ["Applicant Name", "Application Status", "Application Date"],
    status: "Application Status", date: "Application Date",
  },
  applicant: {
    table: "tblwUa8ySWln8OfaJ", label: "Model Applications",
    names: ["nickname", "Working Name"], fields: ["nickname", "Working Name", "status", "submitted_at"],
    status: "status", date: "submitted_at",
  },
  model: {
    table: "tblI4B0bI446vp9GX", label: "Models",
    names: ["folder_name", "working_name", "display_name_compact"],
    fields: ["folder_name", "working_name", "display_name_compact", "status"],
    status: "status",
  },
});
const TOPICS = new Set(["next_step", "profile", "access", "availability"]);
const HEADERS = {
  "cache-control": "private, no-store", vary: "Cookie", "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer", "x-mmd-hype-console": "read-only-v1",
};
const json = (body, status = 200, extra = {}) => Response.json(body, { status, headers: { ...HEADERS, ...extra } });

export function isHypeConsoleRequest(request) {
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  return path === HYPE_CONSOLE_PAGE || path === HYPE_CONSOLE_API || path.startsWith(`${HYPE_CONSOLE_API}/`);
}

export async function handleHypeConsole(request, env = {}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  if (!ORIGINS.has(url.origin)) return json({ ok: false, error: "host_not_allowed" }, 403);
  const actor = await readCredentialBoundAdminActor(request, env);
  if (!actor) {
    if (path === HYPE_CONSOLE_PAGE && ["GET", "HEAD"].includes(request.method)) {
      return new Response(null, { status: 303, headers: { ...HEADERS, location: "/internal/admin/login" } });
    }
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  if (!isOwnerActor(actor)) return json({ ok: false, error: "owner_required" }, 403);
  if (url.search) return json({ ok: false, error: "query_not_supported" }, 400);
  if (path === HYPE_CONSOLE_PAGE) {
    if (!["GET", "HEAD"].includes(request.method)) return json({ ok: false, error: "method_not_allowed" }, 405, { allow: "GET, HEAD" });
    return new Response(request.method === "HEAD" ? null : renderHypeConsole(), {
      headers: { ...HEADERS, "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" },
    });
  }
  if (![`${HYPE_CONSOLE_API}/search`, `${HYPE_CONSOLE_API}/draft`].includes(path)) return json({ ok: false, error: "not_found" }, 404);
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, { allow: "POST" });
  if (request.headers.get("origin") !== url.origin || request.headers.get("sec-fetch-site") === "cross-site") return json({ ok: false, error: "origin_not_allowed" }, 403);
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") || "")) return json({ ok: false, error: "json_required" }, 415);
  try {
    const body = await readJson(request, 2048);
    const source = SOURCES[body?.lane];
    if (!Object.hasOwn(SOURCES, body?.lane)) return json({ ok: false, error: "invalid_lane" }, 400);
    if (path.endsWith("/search")) {
      if (Object.keys(body).some(key => !["lane", "query"].includes(key))) return json({ ok: false, error: "invalid_input" }, 400);
      if (typeof body.query !== "string" || body.query.trim().length < 2 || body.query.length > 80 || /[\u0000-\u001f]/.test(body.query)) return json({ ok: false, error: "invalid_query" }, 400);
      const literal = JSON.stringify(body.query.trim().toLowerCase());
      const formula = `OR(${source.names.map(field => `FIND(${literal},LOWER({${field}}&""))`).join(",")})`;
      const data = await readSource(env, source, { formula });
      return json({ ok: true, lane: body.lane, source: source.label, read_only: true, checked_at: new Date().toISOString(), truncated: Boolean(data.offset) || data.records.length > 20, items: data.records.slice(0, 20).map(row => project(row, source)) });
    }
    if (Object.keys(body).some(key => !["lane", "record_id", "topic"].includes(key)) || !RECORD_ID.test(body.record_id || "") || !TOPICS.has(body.topic)) return json({ ok: false, error: "invalid_input" }, 400);
    if (body.lane !== "model" && body.topic !== "next_step") return json({ ok: false, error: "invalid_topic" }, 400);
    // Never trust browser-supplied names or status when preparing a reply.
    const row = await readSource(env, source, { recordId: body.record_id });
    const item = project(row, source);
    return json({ ok: true, read_only: true, review_required: true, checked_at: new Date().toISOString(), item, draft: buildHypeDraft(body.lane, body.topic), source: source.label });
  } catch (error) {
    const status = error?.status || 503;
    return json({ ok: false, error: status === 404 ? "record_not_found" : status === 400 ? "invalid_json" : status === 413 ? "body_too_large" : "source_unavailable" }, status);
  }
}

async function readSource(env, source, { formula, recordId }) {
  const token = env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN;
  if (!env.AIRTABLE_BASE_ID || !token) throw new Error("source_unavailable");
  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${source.table}`);
  // Read selected records through a filtered list too, so private fields are never requested.
  for (const field of source.fields) url.searchParams.append("fields[]", field);
  url.searchParams.set("filterByFormula", recordId ? `RECORD_ID()=${JSON.stringify(recordId)}` : formula);
  url.searchParams.set("pageSize", recordId ? "1" : "21");
  url.searchParams.set("maxRecords", recordId ? "1" : "21");
  const request = new Request(url, { method: "GET", headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
  const response = env.AIRTABLE_HTTP?.fetch ? await env.AIRTABLE_HTTP.fetch(request) : await fetch(request);
  if (!response.ok) throw new Error("source_unavailable");
  let data;
  try { data = await readJson(response, 524288); }
  catch { throw new Error("source_unavailable"); }
  if (!Array.isArray(data?.records)) throw new Error("source_malformed");
  if (recordId) {
    if (!data.records.length) throw Object.assign(new Error("record_not_found"), { status: 404 });
    if (data.records.length !== 1 || data.records[0].id !== recordId) throw new Error("source_malformed");
    return data.records[0];
  }
  return data;
}

function project(row, source) {
  if (!RECORD_ID.test(row?.id || "") || !row.fields || typeof row.fields !== "object") throw new Error("source_malformed");
  const fields = row.fields;
  const name = source.names.map(field => fields[field]).find(value => typeof value === "string" && value.trim());
  const observed = String(fields[source.status] || "").trim().toLowerCase().replaceAll(" ", "_");
  const status = ["new", "pending", "in_review", "pending_review", "waitlisted", "new_review", "approved", "rejected", "active", "inactive"].includes(observed) ? observed : "unknown";
  const date = source.date && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(String(fields[source.date] || "")) ? String(fields[source.date]).slice(0, 10) : null;
  return { id: row.id, name: String(name || "ไม่ระบุชื่อ").replace(/[\u0000-\u001f]/g, " ").slice(0, 160), status, date };
}

export function buildHypeDraft(lane, topic) {
  if (lane === "member") return "ผมพบรายการสมัครสมาชิกแล้วครับ เดี๋ยวขอตรวจขั้นตอนที่ยังค้างให้ก่อนนะครับ ถ้าต้องการข้อมูลเพิ่ม ผมจะแจ้งให้ทราบครับ";
  if (lane === "applicant") return "ผมพบรายการสมัครโมเดลแล้วครับ เดี๋ยวขอตรวจรายละเอียดที่ยังต้องเติมก่อนนะครับ ถ้าต้องการข้อมูลเพิ่ม ผมจะแจ้งให้ทราบครับ";
  if (topic === "profile") return "ได้ครับ อยากแก้ข้อมูลหรือรูปส่วนไหนของโปรไฟล์ ส่งรายละเอียดที่ต้องการเปลี่ยนมาได้เลยครับ ผมจะตรวจรายการให้ก่อน ยังไม่ได้เปลี่ยนข้อมูลนะครับ";
  if (topic === "access") return "เข้า Model Dashboard ติดตรงไหนครับ แจ้งขั้นตอนที่ติดหรือส่งภาพหน้าจอที่ปิดข้อมูลส่วนตัวแล้วมาได้ครับ ไม่ต้องส่งรหัสผ่านหรือรหัสยืนยันนะครับ";
  if (topic === "availability") return "ต้องการแจ้งวันและช่วงเวลาที่สะดวกใช่ไหมครับ ส่งช่วงเวลามาได้เลยครับ ผมจะตรวจตารางให้ก่อน โดยยังไม่ถือเป็นการยืนยันรับงานนะครับ";
  return "ได้ครับ ต้องการให้ผมช่วยเรื่องโปรไฟล์ การเข้า Model Dashboard หรือตารางงาน บอกเรื่องที่ติดมาได้เลยครับ";
}

async function readJson(message, limit) {
  const reader = message.body?.getReader();
  if (!reader) throw Object.assign(new Error("invalid_json"), { status: 400 });
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw Object.assign(new Error("body_too_large"), { status: 413 }); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw Object.assign(new Error("invalid_json"), { status: 400 }); }
}
