// MMD Privé — Public Job Board V2
// Public shell is read-only until a visitor explicitly opens a job. Private jobs
// reveal only a server-approved safe brief and never trust client entitlements.

const MAX_BRIEF = 4000;
const MAX_INTEREST = 2200;
const MAX_PHOTOS = 8;
const ALLOWED_GENDERS = new Set(["ชาย", "เกย์", "ไบฯ", "ระบุเอง", "ยังไม่ระบุ"]);
const ALLOWED_CUSTOMER_SCOPES = new Set(["ผู้ชาย", "ผู้หญิง", "ทั้งคู่"]);

export function isPublicJobBoardPath(path) {
  return path === "/public/api/jobs" || path.startsWith("/public/api/jobs/") ||
    path === "/public/api/owner/jobs" || path.startsWith("/public/api/owner/jobs/");
}

export async function handlePublicJobBoard(request, env, path) {
  const store = new Store(env.PUBLIC_JOB_BOARD_STORE || env.JOB_BOARD_STORE);
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  if (method === "GET" && path === "/public/api/jobs") {
    const jobs = await listJobs(store);
    await recordViewer(store, request, "board_view", null, env);
    const visible = []; for (const job of jobs) if (!(await viewerBlocked(store, request, job.id))) visible.push(job);
    return response({ ok: true, world: "JOB_BOARD", jobs: visible.map(publicCard) });
  }

  if (method === "GET" && path === "/public/api/owner/jobs") {
    requireOwner(request, env);
    return response({ ok: true, jobs: await listAllJobs(store) });
  }

  const jobMatch = path.match(/^\/public\/api\/jobs\/([^/]+)$/);
  const actionMatch = path.match(/^\/public\/api\/jobs\/([^/]+)\/(reveal|interest)$/);
  if (jobMatch && method === "GET") {
    const job = await getJob(store, jobMatch[1]);
    if (!job || !isVisible(job)) throw error(404, "job_not_found");
    if (await viewerBlocked(store, request, job.id)) throw error(404, "job_unavailable");
    return response({ ok: true, job: safeJob(job, false) });
  }
  if (actionMatch) {
    const job = await getJob(store, actionMatch[1]);
    if (!job || !isVisible(job)) throw error(404, "job_not_found");
    if (await viewerBlocked(store, request, job.id)) throw error(404, "job_unavailable");
    if (actionMatch[2] === "reveal" && method === "POST") {
      await recordViewer(store, request, "private_brief_reveal", job.id, env);
      const viewer = viewerId(request);
      const token = randomHex(24);
      await store.put(`reveal:${viewer}:${job.id}`, { token, expires_at: Date.now() + 30 * 60 * 1000 }, { expirationTtl: 1800 });
      const out = response({ ok: true, job: safeJob(job, true), reveal_required: true });
      out.headers.set("Set-Cookie", `mmd_job_reveal_${job.id}=${token}; HttpOnly; Max-Age=1800; SameSite=Lax; Path=/`);
      return out;
    }
    if (actionMatch[2] === "interest" && method === "POST") {
      const body = await readJson(request);
      await requireReveal(store, request, job.id, body.reveal_token);
      const application = await createInterest(store, request, job, body, env);
      return response({ ok: true, application: publicApplication(application) }, 201);
    }
  }

  if (path === "/public/api/owner/jobs" && method === "POST") {
    requireOwner(request, env);
    const body = await readJson(request);
    const job = await createJob(store, body);
    return response({ ok: true, job: safeJob(job, true) }, 201);
  }
  const ownerMatch = path.match(/^\/public\/api\/owner\/jobs\/([^/]+)\/candidates$/);
  if (ownerMatch && method === "GET") {
    requireOwner(request, env);
    const candidates = await listApplications(store, ownerMatch[1]);
    return response({ ok: true, candidates: candidates.map(ownerApplication) });
  }
  const ownerAction = path.match(/^\/public\/api\/owner\/jobs\/([^/]+)$/);
  if (ownerAction && method === "PATCH") {
    requireOwner(request, env);
    const job = await getJob(store, ownerAction[1]); if (!job) throw error(404, "job_not_found");
    const body = await readJson(request);
    const next = { ...job };
    if (body.status && ["draft", "published", "paused", "closed", "expired"].includes(body.status)) next.status = body.status;
    if (typeof body.budget_disclosure_approved === "boolean") next.budget_disclosure_approved = body.budget_disclosure_approved;
    await store.put(`job:${job.id}`, next);
    return response({ ok: true, job: safeJob(next, true) });
  }
  const ownerViewer = path.match(/^\/public\/api\/owner\/viewers\/([^/]+)$/);
  if (ownerViewer && method === "GET") {
    requireOwner(request, env); const viewer = await store.get(`viewer:${ownerViewer[1]}`);
    return response({ ok: true, viewer: viewer ? ownerViewerProjection(viewer) : null });
  }
  const viewerAction = path.match(/^\/public\/api\/owner\/viewers\/([^/]+)\/(restrict|unrestrict)$/);
  if (viewerAction && method === "POST") {
    requireOwner(request, env); const key = `restriction:${viewerAction[1]}`;
    if (viewerAction[2] === "restrict") await store.put(key, { until: Date.now() + 24 * 3600000 }, { expirationTtl: 86400 }); else await store.put(key, null);
    return response({ ok: true, status: viewerAction[2] === "restrict" ? "restricted" : "active" });
  }
  throw error(404, "not_found");
}

class Store {
  constructor(binding) { this.binding = binding; this.memory = binding ? null : (globalThis.__MMD_JOB_BOARD_MEMORY ||= new Map()); }
  async get(key) {
    if (this.binding?.get) return this.binding.get(key, "json");
    const value = this.memory.get(key); return value === undefined ? null : structuredClone(value);
  }
  async put(key, value, options) {
    if (this.binding?.put) return this.binding.put(key, JSON.stringify(value), options);
    this.memory.set(key, structuredClone(value));
  }
}

async function listJobs(store) {
  const ids = await store.get("index:jobs") || [];
  const jobs = (await Promise.all(ids.map((id) => store.get(`job:${id}`)))).filter(Boolean);
  return jobs.filter(isVisible).sort((a, b) => String(b.published_at || "").localeCompare(String(a.published_at || "")));
}

async function listAllJobs(store) {
  const ids = await store.get("index:jobs") || [];
  return (await Promise.all(ids.map((id) => store.get(`job:${id}`)))).filter(Boolean).sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))).map((job) => safeJob(job, true));
}

async function getJob(store, id) { return store.get(`job:${clean(id, 80)}`); }

async function createJob(store, body) {
  const brief = requiredBrief(body.brief);
  const parsed = parseBrief(brief);
  const safeParsedTitle = (parsed.title || "").replace(/ลูกค้า.*$/i, "").trim() || parsed.category || "งานเปิดรับ";
  const id = `JOB-${Date.now().toString(36).toUpperCase()}-${randomHex(3)}`;
  const now = new Date().toISOString();
  const job = {
    id, type: body.type === "private" ? "private" : "public", status: "published",
    title: clean(body.title || (body.type === "private" ? (parsed.category || "งานลับ") : safeParsedTitle) || "งานเปิดรับ", 180), category: clean(body.category || parsed.category || "งานทั่วไป", 80),
    duration: clean(body.duration || parsed.duration, 80), date: clean(body.date || parsed.date, 80), time: clean(body.time || parsed.time, 40),
    area: clean(body.area || parsed.area, 120), compensation: clean(body.compensation || parsed.compensation, 100),
    customer_count: clean(body.customer_count || parsed.customer_count || "1 ท่าน", 40),
    safe_customer_description: clean(body.safe_customer_description || parsed.safe_customer_description, 500),
    appearance_profile: clean(body.appearance_profile || parsed.appearance_profile, 500), confidentiality: Boolean(body.confidentiality || body.type === "private"),
    media_requirement: clean(body.media_requirement || parsed.media_requirement, 120), budget_disclosure_approved: body.budget_disclosure_approved === true,
    published_at: now, created_at: now
  };
  const ids = await store.get("index:jobs") || [];
  await store.put(`job:${id}`, job); await store.put("index:jobs", [...ids, id]);
  return job;
}

async function createInterest(store, request, job, body, env) {
  const nickname = required(body.nickname, "nickname", 80);
  const gender = clean(body.gender_identity, 40);
  const scope = clean(body.customer_scope, 40);
  if (!ALLOWED_GENDERS.has(gender)) throw error(400, "invalid_gender_identity");
  if (!ALLOWED_CUSTOMER_SCOPES.has(scope)) throw error(400, "invalid_customer_scope");
  const existing = await store.get(`interest:${viewerId(request)}:${job.id}`);
  if (existing) throw error(409, "interest_already_submitted");
  const photoCount = Array.isArray(body.photos) ? body.photos.length : 0;
  if (photoCount > MAX_PHOTOS) throw error(400, "too_many_photos");
  const id = `APP-${Date.now().toString(36).toUpperCase()}-${randomHex(3)}`;
  const application = { id, job_id: job.id, nickname, gender_identity: gender, customer_scope: scope,
    boundaries: clean(body.boundaries, 700), profile: clean(body.profile, 700), photos: photoCount,
    state: "new_candidate", created_at: new Date().toISOString() };
  await store.put(`interest:${viewerId(request)}:${job.id}`, application);
  const apps = await store.get(`applications:${job.id}`) || []; await store.put(`applications:${job.id}`, [...apps, id]);
  await store.put(`application:${id}`, application);
  return application;
}

async function requireReveal(store, request, jobId, bodyToken) {
  const viewer = viewerId(request);
  const saved = await store.get(`reveal:${viewer}:${jobId}`);
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)mmd_job_reveal_${jobId}=([A-Za-z0-9]+)`));
  const token = String(bodyToken || request.headers.get("X-Job-Reveal-Token") || match?.[1] || "");
  if (!saved || saved.expires_at < Date.now() || !token || token !== saved.token) throw error(403, "reveal_required");
}

async function listApplications(store, jobId) {
  const ids = await store.get(`applications:${jobId}`) || [];
  return (await Promise.all(ids.map((id) => store.get(`application:${id}`)))).filter(Boolean);
}

async function recordViewer(store, request, event, jobId, env) {
  const id = viewerId(request);
  const key = `viewer:${id}`;
  const record = await store.get(key) || { id: `Viewer #${id.slice(0, 4).toUpperCase()}`, events: [], jobs: {} };
  record.events.push({ event, job_id: jobId || undefined, at: new Date().toISOString() });
  if (jobId) record.jobs[jobId] = (record.jobs[jobId] || 0) + 1;
  record.events = record.events.slice(-40);
  const recent = record.events.filter((x) => Date.now() - Date.parse(x.at) < 7 * 86400000);
  const uniqueJobs = new Set(recent.map((x) => x.job_id).filter(Boolean)).size;
  record.risk = uniqueJobs >= 10 ? "high_risk" : uniqueJobs >= 5 ? "suspicious" : recent.length >= 3 ? "watch" : "normal";
  await store.put(key, record, { expirationTtl: 30 * 86400 });
  if (record.risk === "suspicious" || record.risk === "high_risk") await notifyOwner(env, record);
}

async function notifyOwner(env, record) {
  if (env?.PUBLIC_JOB_OWNER_ALERTS?.fetch) {
    try { await env.PUBLIC_JOB_OWNER_ALERTS.fetch("https://internal/alert", { method: "POST", body: JSON.stringify({ viewer_ref: record.id, display_label: record.id, alert_level: record.risk, viewer_status: record.status || "silent_viewer", last_seen: record.events.at(-1)?.at || null }) }); } catch {}
    return;
  }
  const endpoint = String(env?.TELEGRAM_INTERNAL_SEND_URL || "").trim(); const chatId = String(env?.TELEGRAM_PUBLIC_ACCESS_CHAT_ID || "").trim();
  if (!endpoint || !chatId) return;
  try { await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: `JOB BOARD ${record.risk}: ${record.id}`, source: "public_job_board_v2" }) }); } catch {}
}

function parseBrief(brief) {
  const lines = brief.split(/\r?\n/).map((x) => x.trim()).filter(Boolean); const title = lines[0] || "งานเปิดรับ";
  return { title: title.replace(/^งาน\s*/i, "").slice(0, 180), category: title.includes("กินข้าว") ? "งานกินข้าว" : "งานทั่วไป",
    duration: findLine(lines, /งาน\s+\d+\s*ชม/i), date: findLine(lines, /วัน|ต\.ค\.|พฤ/i), time: findLine(lines, /\d{1,2}[.:]\d{2}/), area: findLine(lines, /สุขุมวิท|ทองหล่อ|สาทร|ย่าน/i),
    compensation: findLine(lines, /\d[\d,]*\s*(ถึงตัว|บาท)/i), customer_count: findLine(lines, /ลูกค้า\s*\d+/i), safe_customer_description: lines.slice(1, 3).join(" ").slice(0, 500), appearance_profile: lines.slice(0, 2).join(" ").slice(0, 500), media_requirement: findLine(lines, /รูป|คลิป/i) };
}
function findLine(lines, re) { return lines.find((x) => re.test(x)) || ""; }
function publicCard(job) { return { id: job.id, type: job.type, title: job.title, category: job.category, date: job.date, time: job.time, area: job.area, duration: job.duration, budget_label: job.type === "private" && job.budget_disclosure_approved ? job.compensation : undefined }; }
function safeJob(job, reveal) { const out = { ...publicCard(job), confidentiality: job.confidentiality }; if (reveal) Object.assign(out, { safe_customer_description: job.safe_customer_description, appearance_profile: job.appearance_profile, customer_count: job.customer_count, media_requirement: job.media_requirement, compensation: job.compensation }); return out; }
function publicApplication(app) { return { id: app.id, job_id: app.job_id, state: "received" }; }
function ownerApplication(app) { return { ...app, photos: app.photos, state: app.state }; }
function isVisible(job) { return job && job.status === "published"; }
function requireOwner(request, env) { const expected = String(env.PUBLIC_JOB_BOARD_OWNER_TOKEN || "").trim(); const got = String(request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""); if (!expected || got !== expected) throw error(401, "owner_auth_required"); }
function viewerId(request) { const cookie = request.headers.get("Cookie") || ""; const match = cookie.match(/(?:^|;\s*)mmd_job_viewer=([A-Za-z0-9_-]+)/); return match?.[1] || randomHex(8); }
async function viewerBlocked(store, request, jobId) { const id = viewerId(request); const global = await store.get(`restriction:${id}`); return Boolean(global?.until && global.until > Date.now()) || Boolean(await store.get(`block:${id}:${jobId}`)); }
function ownerViewerProjection(viewer) { return { viewer_ref: viewer.id, status: viewer.risk === "normal" ? "silent_viewer" : viewer.risk, risk: viewer.risk, last_seen: viewer.events.at(-1)?.at || null, event_count: viewer.events.length, jobs: viewer.jobs }; }
async function readJson(request) { try { const body = await request.json(); if (!body || typeof body !== "object") throw new Error(); return body; } catch { throw error(400, "invalid_json"); } }
function required(value, field, max) { const v = clean(value, max); if (!v) throw error(400, `${field}_required`); return v; }
function requiredBrief(value) {
  const v = String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).join("\n").slice(0, MAX_BRIEF);
  if (!v) throw error(400, "brief_required");
  return v;
}
function clean(value, max = 160) { return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max); }
function randomHex(bytes) { const a = crypto.getRandomValues(new Uint8Array(bytes)); return [...a].map((x) => x.toString(16).padStart(2, "0")).join(""); }
function response(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" } }); }
function error(status, message) { const e = new Error(message); e.status = status; return e; }
