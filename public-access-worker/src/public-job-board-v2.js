const PREFIX = "/public/api/jobs";
const STORE_PREFIX = "public-job-board/v2";
const JOB_STATUSES = new Set(["draft", "published", "paused", "closed", "expired"]);
const OWNER_DECISIONS = new Set(["approve", "request_more_information", "reject", "bind_to_existing_model", "create_new_model_review"]);
const GENDERS = new Set(["male", "gay", "bisexual", "self_described", "unspecified"]);
const CUSTOMER_SCOPES = new Set(["men", "women", "both"]);
const IMAGE_TYPES = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_MEDIA = 12;
const VIEWER_EVENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const VIEWER_RECORD_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const VIEWER_ACTIONS = new Set(["restrict_private", "suspend_session", "ban_job_link", "unban"]);
const PUBLIC_VIEWER_EVENTS = new Set(["read_ping", "cta_click"]);
const encoder = new TextEncoder();

export async function handlePublicJobBoardV2Request(request, env = {}) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  if (path !== PREFIX && !path.startsWith(`${PREFIX}/`)) return null;

  try {
    requireStore(env);
    const rest = path.slice(PREFIX.length).replace(/^\/+/, "");
    const parts = rest ? rest.split("/").map(decodeURIComponent) : [];

    if (parts[0] === "internal") return await handleOwnerRoute(request, env, parts.slice(1));
    if (request.method === "GET" && parts.length === 0) return await renderBoard(request, env);
    if (request.method === "GET" && parts.length === 1 && parts[0] === "data") return json({ ok: true, jobs: await listPublicJobs(env) });
    if (request.method === "POST" && parts.length === 1 && parts[0] === "events") return await receiveViewerEvent(request, env);
    if (request.method === "GET" && parts.length === 1) return await renderJobDetail(request, env, parts[0]);
    if (request.method === "POST" && parts.length === 2 && parts[1] === "reveal") return await revealPrivateJob(request, env, parts[0]);
    if (request.method === "GET" && parts.length === 2 && parts[1] === "apply") return await renderApplication(request, env, parts[0]);
    if (request.method === "POST" && parts.length === 2 && parts[1] === "interest") return await createInterest(request, env, parts[0]);
    if (request.method === "POST" && parts.length === 4 && parts[1] === "applications" && parts[3] === "upload-grant") {
      return await createUploadGrant(request, env, parts[0], parts[2]);
    }
    if (request.method === "PUT" && parts.length === 5 && parts[1] === "applications" && parts[3] === "uploads") {
      return await acceptUpload(request, env, parts[0], parts[2], parts[4]);
    }
    if (request.method === "POST" && parts.length === 4 && parts[1] === "applications" && parts[3] === "submit") {
      return await submitApplication(request, env, parts[0], parts[2]);
    }
    return json({ ok: false, error: "not_found" }, 404);
  } catch (error) {
    return json({ ok: false, error: safeCode(error) }, statusFor(error));
  }
}

async function handleOwnerRoute(request, env, parts) {
  if (request.method === "POST" && parts.length === 1 && parts[0] === "session") {
    requireOwnerHeader(request, env);
    const exp = Math.floor(Date.now() / 1000) + 60 * 60;
    const ownerToken = await signToken(env, { typ: "owner", exp });
    return json({ ok: true, expires_at: new Date(exp * 1000).toISOString() }, 200, { "Set-Cookie": `mmd_pjb_owner=${encodeURIComponent(ownerToken)}; Path=${PREFIX}/internal; Max-Age=3600; HttpOnly; Secure; SameSite=Strict` });
  }
  await requireOwnerAccess(request, env);
  if (request.method === "GET" && parts.length === 0) return html(pageShell("จัดการ Public Job Board", ownerPage()));
  if (request.method === "GET" && parts.length === 1 && parts[0] === "jobs") {
    return json({ ok: true, jobs: await listOwnerJobs(env) });
  }
  if (request.method === "POST" && parts.length === 1 && parts[0] === "jobs") {
    const input = await readJson(request);
    const job = createJobRecord(input);
    await putJson(env, jobKey(job.id), job, { onlyIfMissing: true });
    return json({ ok: true, job: ownerJobView(job) }, 201);
  }
  if (request.method === "GET" && parts.length === 3 && parts[0] === "jobs" && parts[2] === "candidates") {
    const job = await requireJob(env, parts[1], { publicOnly: false });
    const applications = await listApplications(env, job.id);
    return json({ ok: true, job: ownerJobView(job), candidates: applications.map(ownerApplicationView) });
  }
  if (request.method === "POST" && parts.length === 3 && parts[0] === "jobs" && parts[2] === "status") {
    const job = await requireJob(env, parts[1], { publicOnly: false });
    const input = await readJson(request);
    if (input.status !== undefined) {
      const status = token(input.status);
      if (!JOB_STATUSES.has(status)) throw httpError(400, "job_status_invalid");
      job.status = status;
    }
    if (typeof input.confidentiality === "boolean") {
      job.public.confidentiality = input.confidentiality;
      job.public.world = input.confidentiality ? "private" : "public";
      if (!input.confidentiality) job.public.budget_disclosure_approved = false;
    }
    if (typeof input.budget_disclosure_approved === "boolean") {
      job.public.budget_disclosure_approved = job.public.world === "private" && input.budget_disclosure_approved;
    }
    job.updated_at = new Date().toISOString();
    await putJson(env, jobKey(job.id), job);
    return json({ ok: true, job: ownerJobView(job) });
  }
  if (request.method === "POST" && parts.length === 5 && parts[0] === "jobs" && parts[2] === "candidates" && parts[4] === "decision") {
    return await decideApplication(request, env, parts[1], parts[3]);
  }
  if (request.method === "GET" && parts.length === 1 && parts[0] === "viewers") {
    return json({ ok: true, viewers: await listViewerSummaries(env) });
  }
  if (request.method === "POST" && parts.length === 3 && parts[0] === "viewers" && parts[2] === "action") {
    return await updateViewerControl(request, env, parts[1]);
  }
  return json({ ok: false, error: "not_found" }, 404);
}

export function createJobRecord(input = {}, now = new Date()) {
  const brief = requiredMultiline(input.brief, "brief", 6000);
  const parsed = parsePublicJobBriefV2(brief);
  const status = token(input.status || "draft");
  if (!JOB_STATUSES.has(status)) throw httpError(400, "job_status_invalid");
  const id = cleanId(input.id) || makeRef("JOB", now);
  const mediaRequiredCount = boundedInt(input.media_requirements?.count ?? parsed.media_requirements.count, 1, MAX_MEDIA, 1);
  const confidentiality = Boolean(input.confidentiality ?? parsed.confidentiality);
  const world = confidentiality ? "private" : "public";
  return {
    schema: "mmd_public_job_board_v2.job",
    id,
    status,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    public: {
      title: clean(input.title || parsed.title, 160),
      category: token(input.category || parsed.category || "other"),
      duration: clean(input.duration || parsed.duration, 80),
      date: clean(input.date || parsed.date, 80),
      time: clean(input.time || parsed.time, 80),
      area: clean(input.area || parsed.area, 120),
      compensation: clean(input.compensation || parsed.compensation, 120),
      customer_count: boundedInt(input.customer_count ?? parsed.customer_count, 1, 200, 1),
      safe_customer_description: sanitizePublicText(input.safe_customer_description || parsed.safe_customer_description, 500),
      required_appearance_profile: sanitizePublicText(input.required_appearance_profile || parsed.required_appearance_profile, 600),
      confidentiality,
      world,
      budget_disclosure_approved: world === "private" && input.budget_disclosure_approved === true,
      media_requirements: { count: mediaRequiredCount, kind: "current_solo_photos" },
    },
    protected: {
      source_brief: brief,
      deeper_interest_detail: sanitizePublicText(input.deeper_interest_detail || parsed.deeper_interest_detail, 1200),
      owner_note: clean(input.owner_note, 1200),
    },
    controls: {
      auto_bind: false,
      auto_rate: false,
      auto_book: false,
      auto_reply: false,
      public_gallery: false,
    },
  };
}

export function parsePublicJobBriefV2(value = "") {
  const lines = String(value).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const first = lines[0] || "งานที่เปิดรับ";
  const joined = lines.join("\n");
  const findLine = (pattern) => lines.find((line) => pattern.test(line)) || "";
  const durationLine = findLine(/(?:⏳|\bงาน\b).*?(\d+(?:\.\d+)?)\s*(?:ชม|ชั่วโมง)/i);
  const whenLine = findLine(/(?:🏡|\b(?:จ|อ|พ|พฤ|ศ|ส|อา)\.?\b).*?(?:\d{1,2}:\d{2})/i);
  const compensationLine = findLine(/(?:💰|บาท|ถึงตัว|ค่าตอบแทน)/i);
  const customerLine = findLine(/(?:👤|ลูกค้า\s*\d+)/i);
  const appearanceLine = findLine(/(?:ขอ|โปรไฟล์|นายแบบ|นักแสดง|หน้าตา|สูง|หุ่น)/i);
  const mediaLine = findLine(/(?:🍌|รูปเดี่ยว|รูปปัจจุบัน|\d+\s*รูป)/i);
  const durationMatch = durationLine.match(/(\d+(?:\.\d+)?)\s*(?:ชม|ชั่วโมง)/i);
  const timeMatch = whenLine.match(/(\d{1,2}:\d{2})/);
  const dateMatch = whenLine.match(/((?:จ|อ|พ|พฤ|ศ|ส|อา)\.?\s*\d{1,2}\s*[^\s,]*|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)/i);
  const areaMatch = whenLine.match(/(?:ย่าน|แถว|บริเวณ)\s*([^,·]+)/i);
  const customerMatch = customerLine.match(/ลูกค้า\s*(\d+)/i);
  const mediaMatch = mediaLine.match(/(\d+)\s*รูป/i);
  return {
    title: first.replace(/^งาน\s*/i, "").slice(0, 160) || "งานที่เปิดรับ",
    category: inferCategory(joined),
    duration: durationMatch ? `${durationMatch[1]} ชั่วโมง` : "",
    date: dateMatch?.[1] || "",
    time: timeMatch?.[1] || "",
    area: areaMatch?.[1]?.trim() || "",
    compensation: sanitizePublicText(compensationLine.replace(/^💰\s*/, ""), 120),
    customer_count: Number(customerMatch?.[1]) || 1,
    safe_customer_description: sanitizeCustomerDescription(customerLine),
    required_appearance_profile: sanitizePublicText(appearanceLine, 600),
    confidentiality: /🔐|ความลับ|confidential/i.test(joined),
    media_requirements: { count: boundedInt(Number(mediaMatch?.[1]) || 1, 1, MAX_MEDIA, 1), kind: "current_solo_photos" },
    deeper_interest_detail: sanitizePublicText(lines.slice(1).filter((line) => !/^💰/.test(line)).join("\n"), 1200),
  };
}

async function renderBoard(request, env) {
  const jobs = await listPublicJobs(env);
  const { token: anon, setCookie } = await ensureAnonymousSession(request, env);
  await recordViewerEvent(env, anon, { type: "board_open" });
  const publicCards = jobs.filter((job) => job.world !== "private").map(jobCard).join("");
  const privateCards = jobs.filter((job) => job.world === "private").map(jobCard).join("");
  return html(pageShell("งานที่เปิดรับกับ MMD", `
    <main><section class="hero"><p class="eyebrow">MMD · PUBLIC JOB BOARD</p><h1>สวัสดีครับ</h1><p>ที่นี่เป็นพื้นที่รวมงานที่เปิดรับอยู่กับ MMD</p><p>เลือกดูงานที่ตรงกับคุณได้เลย อ่านรายละเอียดก่อน แล้วค่อยส่งความสนใจเมื่อพร้อม</p><p>งานแต่ละงานมีรายละเอียด เวลา สถานที่ และค่าตอบแทนระบุไว้ชัดเจน</p><a class="primary" href="#jobs">เลือกงานที่คุณสนใจ</a></section><section id="jobs" class="job-world"><p class="eyebrow">PUBLIC JOB</p><div class="grid">${publicCards || '<div class="empty">ตอนนี้ยังไม่มีงานทั่วไปที่เปิดรับครับ</div>'}</div></section><section class="job-world private-world"><p class="eyebrow">PRIVATE JOB</p><div class="grid">${privateCards || '<div class="empty">ตอนนี้ยังไม่มีงานลับที่เปิดรับครับ</div>'}</div></section></main>`), 200, { ...(setCookie ? { "Set-Cookie": setCookie } : {}), "x-mmd-anonymous-session": anon ? "ready" : "missing" });
}

async function renderJobDetail(request, env, jobId) {
  const job = await requireJob(env, jobId, { publicOnly: true });
  const { token: anon, setCookie } = await ensureAnonymousSession(request, env);
  await enforceViewerAccess(env, anon, job);
  const view = publicJobView(job, { detail: true });
  if (view.world === "private" && !(await hasPrivateReveal(request, env, job.id, anon))) {
    await recordViewerEvent(env, anon, { type: "private_gate_open", job_id: job.id, world: "private" });
    return html(pageShell("งานลับ", `<main><a class="back" href="${PREFIX}">← งานทั้งหมด</a><article class="detail private-detail"><p class="eyebrow">งานลับ 🔐</p><h1>${esc(categoryLabel(view.category))}</h1><p>งานนี้เป็นงานลับ กดต่อเพื่อดูรายละเอียด</p><p>${esc([view.date, view.time, view.area].filter(Boolean).join(" · "))}</p><form method="post" action="${PREFIX}/${encodeURIComponent(job.id)}/reveal"><button class="primary" type="submit">ดูรายละเอียดงานลับ</button></form></article></main>`), 200, setCookie ? { "Set-Cookie": setCookie } : {});
  }
  await recordViewerEvent(env, anon, { type: "brief_open", job_id: job.id, world: view.world });
  return html(pageShell(view.title, `<main><a class="back" href="${PREFIX}">← งานทั้งหมด</a><article class="detail${view.world === "private" ? " private-detail" : ""}"><p class="eyebrow">${esc(view.world === "private" ? "งานลับ 🔐" : categoryLabel(view.category))}</p><h1>${esc(view.title)}</h1><p>งานนี้กำลังเปิดรับคนที่สนใจครับ</p><p>อ่านรายละเอียดให้ครบก่อนนะ ถ้าตรงกับคุณ กดส่งความสนใจได้เลย</p>${detailRows(view)}<p>${esc(view.safe_customer_description)}</p><p>${esc(view.required_appearance_profile)}</p><a class="primary" data-interest-cta href="${PREFIX}/${encodeURIComponent(job.id)}/apply">สนใจงานนี้</a></article></main>${viewerSignalScript(job.id)}`), 200, setCookie ? { "Set-Cookie": setCookie } : {});
}

async function revealPrivateJob(request, env, jobId) {
  requireWriteOrigin(request, env);
  const job = await requireJob(env, jobId, { publicOnly: true });
  if (job.public.world !== "private") throw httpError(404, "private_job_not_found");
  const anon = await requireAnonymousSession(request, env);
  await enforceViewerAccess(env, anon.id, job);
  await recordViewerEvent(env, anon.id, { type: "private_reveal", job_id: job.id, world: "private" });
  const exp = Math.floor(Date.now() / 1000) + 30 * 60;
  const reveal = await signToken(env, { typ: "private_reveal", job_id: job.id, session_id: anon.id, exp });
  return new Response(null, { status: 303, headers: { location: `${PREFIX}/${encodeURIComponent(job.id)}`, "Set-Cookie": `${revealCookieName(job.id)}=${encodeURIComponent(reveal)}; Path=${PREFIX}/${encodeURIComponent(job.id)}; Max-Age=1800; HttpOnly; Secure; SameSite=Lax`, "cache-control": "no-store" } });
}

async function receiveViewerEvent(request, env) {
  requireWriteOrigin(request, env);
  const anon = await requireAnonymousSession(request, env);
  const input = await readJson(request);
  const type = token(input.type);
  if (!PUBLIC_VIEWER_EVENTS.has(type)) throw httpError(400, "viewer_event_invalid");
  const job = await requireJob(env, input.job_id, { publicOnly: true });
  await enforceViewerAccess(env, anon.id, job);
  if (job.public.world === "private" && !(await hasPrivateReveal(request, env, job.id, anon.id))) throw httpError(403, "job_brief_not_opened");
  await recordViewerEvent(env, anon.id, { type, job_id: job.id, world: job.public.world, read_seconds: boundedInt(input.read_seconds, 0, 600, 0) });
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

async function renderApplication(request, env, jobId) {
  const job = await requireJob(env, jobId, { publicOnly: true });
  const anon = await requireAnonymousSession(request, env);
  await enforceViewerAccess(env, anon.id, job);
  if (job.public.world === "private" && !(await hasPrivateReveal(request, env, job.id, anon.id))) throw httpError(403, "job_brief_not_opened");
  const count = job.public.media_requirements.count;
  const script = applicationScript(job.id, count);
  return html(pageShell(`ส่งความสนใจ · ${job.public.title}`, `<main><a class="back" href="${PREFIX}/${encodeURIComponent(job.id)}">← กลับไปอ่านบรีฟ</a><section class="detail"><p class="eyebrow">ส่งความสนใจ</p><h1>${esc(job.public.title)}</h1><p>ขอข้อมูลสั้น ๆ และรูปปัจจุบัน เพื่อให้พี่ดูว่างานนี้เหมาะกับคุณไหมครับ</p><form data-apply><div class="fields"><label>ชื่อเล่น<input name="nickname" required maxlength="80"></label><label>อายุ<input name="age" type="number" min="18" max="100" required></label><label>ส่วนสูง (ซม.)<input name="height_cm" type="number" min="120" max="230" required></label><label>น้ำหนัก (กก.)<input name="weight_kg" type="number" min="35" max="250" required></label><label>เพศสภาพ<select name="gender" required><option value="">เลือก</option><option value="male">ชาย</option><option value="gay">เกย์</option><option value="bisexual">ไบฯ</option><option value="self_described">ระบุเอง</option><option value="unspecified">ยังไม่ระบุ</option></select></label><label>ระบุเพศสภาพเพิ่มเติม<input name="gender_note" maxlength="120"></label><label>รับงานกับลูกค้า<select name="customer_scope" required><option value="">เลือก</option><option value="men">ผู้ชาย</option><option value="women">ผู้หญิง</option><option value="both">ทั้งคู่</option></select></label><label>ไซซ์เสื้อผ้า<input name="clothing_size" maxlength="120"></label></div><label>ประสบการณ์ / โปรไฟล์ / ลิงก์ผลงาน<textarea name="profile" maxlength="1500"></textarea></label><label>ขอบเขตงานที่รับ<textarea name="work_scope" required maxlength="1500"></textarea></label><label>ขอบเขตที่ทำไม่ได้<textarea name="unavailable_scope" required maxlength="1500"></textarea></label><label>ถ้าเคยเป็น Model MMD ระบุชื่อหรือรหัสที่เคยใช้<input name="existing_model_claim" maxlength="160"></label><label>รูปเดี่ยวปัจจุบัน ${count} รูป<input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple required></label><button class="primary" type="submit">ส่งข้อมูลให้พี่พิจารณา</button><p data-status role="status"></p></form></section></main>${script}`));
}

async function createInterest(request, env, jobId) {
  requireWriteOrigin(request, env);
  const job = await requireJob(env, jobId, { publicOnly: true });
  const input = await readJson(request);
  const anon = await requireAnonymousSession(request, env);
  await enforceViewerAccess(env, anon.id, job);
  if (job.public.world === "private" && !(await hasPrivateReveal(request, env, job.id, anon.id))) throw httpError(403, "job_brief_not_opened");
  const actorHash = await sha256(`${job.id}:${anon.id}`);
  const dedupe = await getJson(env, dedupeKey(job.id, actorHash));
  if (dedupe?.application_ref) throw httpError(409, "job_interest_already_exists");
  const identity = await resolveIdentity(request, env, input);
  const applicationRef = makeRef("APP");
  const now = new Date().toISOString();
  const application = {
    schema: "mmd_public_job_board_v2.application",
    application_ref: applicationRef,
    job_id: job.id,
    created_at: now,
    updated_at: now,
    submission_status: "draft",
    identity,
    workflow_status: identity.workflow_status,
    owner_decision: null,
    applicant: null,
    uploads: [],
    controls: { auto_bind: false, auto_rate: false, auto_book: false, auto_reply: false },
  };
  await putJson(env, applicationKey(job.id, applicationRef), application, { onlyIfMissing: true });
  try {
    await putJson(env, dedupeKey(job.id, actorHash), { application_ref: applicationRef, created_at: now }, { onlyIfMissing: true });
  } catch (error) {
    await env.PUBLIC_ACCESS_EVIDENCE.delete(applicationKey(job.id, applicationRef));
    throw error;
  }
  await recordViewerEvent(env, anon.id, { type: "interest_started", job_id: job.id, world: job.public.world, applied: true });
  return json({
    ok: true,
    application_ref: applicationRef,
    status: identity.public_status,
    media_required_count: job.public.media_requirements.count,
    interest_detail: job.public.confidentiality ? job.protected.deeper_interest_detail : "",
  }, 201);
}

async function createUploadGrant(request, env, jobId, applicationRef) {
  requireWriteOrigin(request, env);
  await requireOwnedApplication(request, env, jobId, applicationRef);
  const job = await requireJob(env, jobId, { publicOnly: true });
  const input = await readJson(request);
  const slot = boundedInt(input.slot, 1, job.public.media_requirements.count);
  const contentType = clean(input.content_type, 80).toLowerCase();
  const size = boundedInt(input.size, 1, MAX_IMAGE_BYTES);
  if (!IMAGE_TYPES.has(contentType)) throw httpError(415, "image_type_not_allowed");
  const exp = Math.floor(Date.now() / 1000) + 10 * 60;
  const tokenValue = await signToken(env, { typ: "upload", job_id: job.id, application_ref: applicationRef, slot, content_type: contentType, size, exp });
  return json({ ok: true, upload: { method: "PUT", url: `${PREFIX}/${encodeURIComponent(job.id)}/applications/${encodeURIComponent(applicationRef)}/uploads/${slot}?token=${encodeURIComponent(tokenValue)}`, expires_at: new Date(exp * 1000).toISOString() } });
}

async function acceptUpload(request, env, jobId, applicationRef, slotRaw) {
  requireWriteOrigin(request, env);
  await requireOwnedApplication(request, env, jobId, applicationRef);
  const slot = boundedInt(slotRaw, 1, MAX_MEDIA);
  const tokenValue = new URL(request.url).searchParams.get("token") || "";
  const grant = await verifyToken(env, tokenValue, "upload");
  if (grant.job_id !== jobId || grant.application_ref !== applicationRef || Number(grant.slot) !== slot) throw httpError(403, "upload_grant_scope_mismatch");
  const contentType = clean(request.headers.get("content-type"), 80).toLowerCase();
  const bytes = await request.arrayBuffer();
  if (contentType !== grant.content_type || bytes.byteLength !== Number(grant.size)) throw httpError(400, "upload_grant_payload_mismatch");
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_IMAGE_BYTES || !IMAGE_TYPES.has(contentType)) throw httpError(413, "image_payload_invalid");
  const digest = await sha256Bytes(bytes);
  const key = mediaKey(jobId, applicationRef, slot, IMAGE_TYPES.get(contentType));
  await env.PUBLIC_ACCESS_EVIDENCE.put(key, bytes, { httpMetadata: { contentType }, customMetadata: { schema: "mmd_public_job_board_v2.private_media", job_id: jobId, application_ref: applicationRef, slot: String(slot), sha256: digest } });
  const application = await requireApplication(env, jobId, applicationRef);
  application.uploads = [...application.uploads.filter((item) => Number(item.slot) !== slot), { slot, key, content_type: contentType, bytes: bytes.byteLength, sha256: digest }].sort((a, b) => a.slot - b.slot);
  application.updated_at = new Date().toISOString();
  await putJson(env, applicationKey(jobId, applicationRef), application);
  return json({ ok: true, upload_ref: `${applicationRef}:${slot}`, private: true });
}

async function submitApplication(request, env, jobId, applicationRef) {
  requireWriteOrigin(request, env);
  const { application } = await requireOwnedApplication(request, env, jobId, applicationRef);
  const job = await requireJob(env, jobId, { publicOnly: true });
  const input = await readJson(request);
  const gender = token(input.gender);
  const customerScope = token(input.customer_scope);
  if (!GENDERS.has(gender)) throw httpError(400, "gender_invalid");
  if (!CUSTOMER_SCOPES.has(customerScope)) throw httpError(400, "customer_scope_invalid");
  if (application.uploads.length !== job.public.media_requirements.count) throw httpError(400, "required_media_incomplete");
  application.applicant = {
    nickname: required(input.nickname, "nickname", 80),
    age: boundedInt(input.age, 18, 100),
    height_cm: boundedInt(input.height_cm, 120, 230),
    weight_kg: boundedInt(input.weight_kg, 35, 250),
    profile: cleanMultiline(input.profile, 1500),
    gender,
    gender_note: gender === "self_described" ? required(input.gender_note, "gender_note", 120) : clean(input.gender_note, 120),
    customer_scope: customerScope,
    work_scope: requiredMultiline(input.work_scope, "work_scope", 1500),
    unavailable_scope: requiredMultiline(input.unavailable_scope, "unavailable_scope", 1500),
    clothing_size: clean(input.clothing_size, 120),
  };
  application.submission_status = "submitted";
  application.updated_at = new Date().toISOString();
  await putJson(env, applicationKey(jobId, applicationRef), application);
  return json({ ok: true, application_ref: applicationRef, status: "ส่งให้พี่พิจารณาแล้ว", auto_bound: false, auto_reply: false });
}

async function decideApplication(request, env, jobId, applicationRef) {
  await requireJob(env, jobId, { publicOnly: false });
  const application = await requireApplication(env, jobId, applicationRef);
  if (application.submission_status !== "submitted") throw httpError(409, "application_not_submitted");
  const input = await readJson(request);
  const decision = token(input.decision);
  if (!OWNER_DECISIONS.has(decision)) throw httpError(400, "owner_decision_invalid");
  if (decision === "bind_to_existing_model") {
    const modelRecordId = cleanRecordId(input.model_record_id);
    if (!modelRecordId) throw httpError(400, "model_record_id_required");
    application.identity = { ...application.identity, verified_model_record_id: modelRecordId, binding_source: "owner_decision" };
    application.workflow_status = "bound_after_owner_review";
  } else if (decision === "approve") application.workflow_status = "owner_approved";
  else if (decision === "reject") application.workflow_status = "owner_rejected";
  else application.workflow_status = "identity_review_required";
  application.owner_decision = { decision, note: clean(input.note, 1200), decided_at: new Date().toISOString() };
  application.updated_at = application.owner_decision.decided_at;
  await putJson(env, applicationKey(jobId, applicationRef), application);
  return json({ ok: true, application: ownerApplicationView(application), side_effects: { model_created: false, booked: false, rated: false, customer_replied: false } });
}

async function resolveIdentity(request, env, input) {
  const claim = clean(input.existing_model_claim, 160);
  if (env.PUBLIC_JOB_IDENTITY_RESOLVER?.fetch) {
    try {
      const response = await env.PUBLIC_JOB_IDENTITY_RESOLVER.fetch("https://identity.internal/resolve-public-job-applicant", { method: "POST", headers: { "content-type": "application/json", "authorization": request.headers.get("authorization") || "", "x-line-id-token": request.headers.get("x-line-id-token") || "" }, body: JSON.stringify({ claim }) });
      const data = await response.json().catch(() => ({}));
      const modelRecordId = cleanRecordId(data.model_record_id);
      if (response.ok && data.verified === true && modelRecordId) return { identity_class: "VERIFIED_LINE_MODEL", workflow_status: "existing_model_unbound", public_status: "received", verified_model_record_id: modelRecordId, claim: claim || null };
    } catch { /* fail closed below */ }
  }
  if (claim) return { identity_class: "UNVERIFIED_CANDIDATE", workflow_status: "identity_review_required", public_status: "received", verified_model_record_id: null, claim };
  return { identity_class: "UNVERIFIED_CANDIDATE", workflow_status: "new_candidate", public_status: "received", verified_model_record_id: null, claim: null };
}

async function listPublicJobs(env) {
  const listed = await env.PUBLIC_ACCESS_EVIDENCE.list({ prefix: `${STORE_PREFIX}/jobs/`, limit: 200 });
  const rows = await Promise.all((listed.objects || []).map((item) => getJson(env, item.key)));
  return rows.filter(isOpenPublicJob).sort((a, b) => String(a.public.date || "9999").localeCompare(String(b.public.date || "9999"))).map(publicJobView);
}

async function listOwnerJobs(env) {
  const listed = await env.PUBLIC_ACCESS_EVIDENCE.list({ prefix: `${STORE_PREFIX}/jobs/`, limit: 500 });
  const rows = await Promise.all((listed.objects || []).map((item) => getJson(env, item.key)));
  return rows.filter((job) => job?.schema === "mmd_public_job_board_v2.job").sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).map(ownerJobView);
}

function isOpenPublicJob(job) {
  return job?.schema === "mmd_public_job_board_v2.job" && job.status === "published";
}

async function listApplications(env, jobId) {
  const listed = await env.PUBLIC_ACCESS_EVIDENCE.list({ prefix: `${STORE_PREFIX}/applications/${jobId}/`, limit: 500 });
  return (await Promise.all((listed.objects || []).map((item) => getJson(env, item.key)))).filter(Boolean);
}

async function requireJob(env, jobId, { publicOnly }) {
  const job = await getJson(env, jobKey(cleanId(jobId)));
  if (!job || job.schema !== "mmd_public_job_board_v2.job") throw httpError(404, "job_not_found");
  if (publicOnly && !isOpenPublicJob(job)) throw httpError(404, "job_not_open");
  return job;
}

async function requireApplication(env, jobId, applicationRef) {
  const application = await getJson(env, applicationKey(cleanId(jobId), cleanId(applicationRef)));
  if (!application || application.schema !== "mmd_public_job_board_v2.application") throw httpError(404, "application_not_found");
  return application;
}

async function requireOwnedApplication(request, env, jobId, applicationRef) {
  const anon = await requireAnonymousSession(request, env);
  const application = await requireApplication(env, jobId, applicationRef);
  const actorHash = await sha256(`${jobId}:${anon.id}`);
  const dedupe = await getJson(env, dedupeKey(jobId, actorHash));
  if (dedupe?.application_ref !== applicationRef) throw httpError(403, "application_owner_mismatch");
  return { application, anon };
}

function publicJobView(job, { detail = false } = {}) {
  const view = { id: job.id, status: job.status, ...structuredClone(job.public) };
  if (view.world === "private" && !detail) {
    view.title = categoryLabel(view.category);
    if (!view.budget_disclosure_approved) view.compensation = "";
    view.safe_customer_description = "";
    view.required_appearance_profile = "";
  }
  return view;
}

function jobCard(job) {
  const meta = [job.date, job.world === "public" ? job.duration : "", job.area].filter(Boolean).join(" · ") || "ดูรายละเอียดในบรีฟ";
  if (job.world === "private") {
    const button = job.budget_disclosure_approved && job.compensation ? `ดูงานลับ · ${job.compensation.replace(/\s*ถึงตัว\s*$/i, "").trim()}` : "ดูงานลับ";
    return `<article class="job private-card" data-job-id="${esc(job.id)}" data-job-status="${esc(job.status)}"><p class="eyebrow">PRIVATE JOB · งานลับ 🔐</p><h2>${esc(categoryLabel(job.category))}</h2><p>${esc(meta)}</p><a href="${PREFIX}/${encodeURIComponent(job.id)}">${esc(button)}</a></article>`;
  }
  return `<article class="job" data-job-id="${esc(job.id)}" data-job-status="${esc(job.status)}"><p class="eyebrow">PUBLIC JOB</p><h2>${esc(job.title)}</h2><p>${esc(meta)}</p><p>${esc(job.required_appearance_profile)}</p><a href="${PREFIX}/${encodeURIComponent(job.id)}">เลือกงานนี้</a></article>`;
}

function ownerJobView(job) {
  return structuredClone(job);
}

function ownerApplicationView(application) {
  return structuredClone(application);
}

async function hasPrivateReveal(request, env, jobId, sessionId) {
  const raw = cookieValue(request.headers.get("cookie") || "", revealCookieName(jobId));
  if (!raw) return false;
  try {
    const payload = await verifyToken(env, raw, "private_reveal");
    return payload.job_id === jobId && payload.session_id === sessionId;
  } catch { return false; }
}

function revealCookieName(jobId) {
  return `mmd_pjb_open_${String(jobId).replace(/[^A-Za-z0-9_]/g, "_")}`;
}

async function viewerRef(sessionId) {
  return sha256(`mmd-public-job-board-v2:${sessionId}`);
}

async function recordViewerEvent(env, sessionId, event) {
  if (!sessionId) return null;
  const ref = await viewerRef(sessionId);
  const key = viewerKey(ref);
  const now = Date.now();
  const previous = await getJson(env, key);
  const events = (previous?.events || []).filter((item) => Date.parse(item.at) >= now - VIEWER_EVENT_RETENTION_MS);
  events.push({ type: token(event.type), job_id: cleanId(event.job_id) || null, world: event.world === "private" ? "private" : event.world === "public" ? "public" : null, applied: event.applied === true, read_seconds: Number.isInteger(event.read_seconds) ? Math.min(600, Math.max(0, event.read_seconds)) : null, at: new Date(now).toISOString() });
  const visits = events.filter((item) => ["private_gate_open", "private_reveal", "brief_open"].includes(item.type));
  const applied = events.some((item) => item.applied === true);
  const sameJobVisits = Math.max(0, ...[...new Set(visits.map((item) => item.job_id).filter(Boolean))].map((jobId) => visits.filter((item) => item.job_id === jobId).length));
  const recentHour = events.filter((item) => Date.parse(item.at) >= now - 60 * 60 * 1000);
  const privateJobs = new Set(recentHour.filter((item) => item.type === "private_reveal").map((item) => item.job_id).filter(Boolean));
  const denied = recentHour.filter((item) => item.type === "access_denied").length;
  const alertLevel = denied >= 3 ? "HIGH_RISK" : privateJobs.size >= 3 && !applied ? "SUSPICIOUS" : sameJobVisits >= 3 ? "WATCH" : "NONE";
  const viewerStatus = applied ? "applied" : visits.length > 0 ? "interested_not_applied" : events.length > 1 ? "returning_viewer" : "silent_viewer";
  const record = {
    schema: "mmd_public_job_board_v2.viewer_summary",
    viewer_ref: ref,
    display_label: `Viewer #${ref.slice(-4).toUpperCase()}`,
    viewer_status: viewerStatus,
    alert_level: alertLevel,
    first_seen_at: previous?.first_seen_at || new Date(now).toISOString(),
    last_seen_at: new Date(now).toISOString(),
    expires_at: new Date(now + VIEWER_RECORD_RETENTION_MS).toISOString(),
    controls: previous?.controls || { private_restricted: false, suspended_until: null, blocked_job_ids: [] },
    events: events.slice(-100),
  };
  await putJson(env, key, record);
  if (["SUSPICIOUS", "HIGH_RISK"].includes(alertLevel) && previous?.alert_level !== alertLevel) await sendOwnerViewerAlert(env, record);
  return record;
}

async function sendOwnerViewerAlert(env, record) {
  if (!env.PUBLIC_JOB_OWNER_ALERTS?.fetch) return;
  try {
    await env.PUBLIC_JOB_OWNER_ALERTS.fetch("https://owner-alerts.internal/public-job-viewer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ viewer_ref: record.viewer_ref, display_label: record.display_label, alert_level: record.alert_level, viewer_status: record.viewer_status, last_seen_at: record.last_seen_at }) });
  } catch { /* alert delivery must not expose or break the public flow */ }
}

async function enforceViewerAccess(env, sessionId, job) {
  const ref = await viewerRef(sessionId);
  const record = await getJson(env, viewerKey(ref));
  if (!record) return;
  const suspended = record.controls?.suspended_until && Date.parse(record.controls.suspended_until) > Date.now();
  const blocked = (record.controls?.blocked_job_ids || []).includes(job.id);
  const privateRestricted = job.public.world === "private" && record.controls?.private_restricted === true;
  if (suspended || blocked || privateRestricted) {
    await recordViewerEvent(env, sessionId, { type: "access_denied", job_id: job.id, world: job.public.world });
    throw httpError(404, "job_unavailable");
  }
}

async function listViewerSummaries(env) {
  const listed = await env.PUBLIC_ACCESS_EVIDENCE.list({ prefix: `${STORE_PREFIX}/viewers/`, limit: 500 });
  const now = Date.now();
  const rows = await Promise.all((listed.objects || []).map((item) => getJson(env, item.key)));
  return rows.filter((row) => row?.schema === "mmd_public_job_board_v2.viewer_summary" && Date.parse(row.expires_at) > now).sort((a, b) => String(b.last_seen_at).localeCompare(String(a.last_seen_at))).map((row) => structuredClone(row));
}

async function updateViewerControl(request, env, ref) {
  if (!/^[a-f0-9]{64}$/.test(ref)) throw httpError(400, "viewer_ref_invalid");
  const record = await getJson(env, viewerKey(ref));
  if (!record) throw httpError(404, "viewer_not_found");
  const input = await readJson(request);
  const action = token(input.action);
  if (!VIEWER_ACTIONS.has(action)) throw httpError(400, "viewer_action_invalid");
  const controls = record.controls || { private_restricted: false, suspended_until: null, blocked_job_ids: [] };
  if (action === "restrict_private") controls.private_restricted = true;
  if (action === "suspend_session") controls.suspended_until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  if (action === "ban_job_link") {
    const jobId = cleanId(input.job_id);
    if (!jobId) throw httpError(400, "job_id_required");
    controls.blocked_job_ids = [...new Set([...(controls.blocked_job_ids || []), jobId])];
  }
  if (action === "unban") {
    const jobId = cleanId(input.job_id);
    controls.private_restricted = false;
    controls.suspended_until = null;
    controls.blocked_job_ids = jobId ? (controls.blocked_job_ids || []).filter((id) => id !== jobId) : [];
  }
  record.controls = controls;
  record.owner_action = { action, job_id: cleanId(input.job_id) || null, at: new Date().toISOString() };
  await putJson(env, viewerKey(ref), record);
  return json({ ok: true, viewer: record });
}

function detailRows(view) {
  const rows = [["เวลา", [view.date, view.time].filter(Boolean).join(" · ")], ["ระยะเวลา", view.duration], ["พื้นที่", view.area], ["ค่าตอบแทน", view.compensation], ["จำนวนลูกค้า", view.customer_count ? `${view.customer_count} ท่าน` : ""], ["รูปที่ต้องส่ง", `${view.media_requirements.count} รูป`]].filter(([, value]) => value);
  return `<dl>${rows.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>`;
}

function pageShell(title, body) {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>${esc(title)} · MMD</title><style>${styles()}</style></head><body>${body}</body></html>`;
}

function styles() {
  return `:root{color-scheme:dark;font-family:Inter,"Noto Sans Thai",system-ui,sans-serif;background:#0b0b0b;color:#f7f3eb}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 10% 0,#292116 0,transparent 36%),#0b0b0b}main{width:min(1180px,calc(100% - 32px));margin:auto;padding:32px 0 72px}.hero,.detail{border:1px solid #3d3224;border-radius:28px;padding:clamp(24px,6vw,64px);background:rgba(17,15,12,.94);box-shadow:0 24px 80px #0008}.hero h1,.detail h1{font-size:clamp(38px,8vw,78px);line-height:1;margin:.15em 0}.hero p,.detail p{color:#d8d0c2;line-height:1.7;max-width:720px}.eyebrow{color:#d6b56f!important;font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}.primary,.job a{display:inline-flex;min-height:48px;align-items:center;justify-content:center;border-radius:999px;padding:0 22px;background:#e0bd72;color:#17120b;text-decoration:none;font-weight:800;border:0;cursor:pointer;margin-top:16px}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-top:28px}.owner-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.job{min-width:0;padding:20px;border:1px solid #352c21;border-radius:20px;background:#12110f}.job h2{font-size:22px;line-height:1.25;margin:8px 0;overflow-wrap:anywhere}.job p{color:#bdb4a6;overflow-wrap:anywhere}.money{color:#e5c57e!important;font-weight:700}.back{display:inline-block;color:#d6b56f;margin-bottom:18px}dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:#31291f;border:1px solid #31291f;border-radius:16px;overflow:hidden;margin:24px 0}dl div{background:#12110f;padding:16px}dt{color:#958a7a;font-size:12px}dd{margin:4px 0 0;font-weight:700}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}label{display:grid;gap:7px;margin:14px 0;color:#d8d0c2;font-weight:700}input,select,textarea{width:100%;border:1px solid #4b4031;border-radius:12px;padding:13px;background:#090909;color:#fff;font:inherit}textarea{min-height:112px;resize:vertical}.owner-candidate{border-top:1px solid #3d3224;padding:18px 0}.owner-actions{display:flex;flex-wrap:wrap;gap:8px}.owner-actions button{border:1px solid #665235;border-radius:999px;background:#17130d;color:#e8d4a5;padding:8px 12px;cursor:pointer}.empty{padding:24px;color:#bdb4a6}@media(max-width:640px){main{width:min(100% - 16px,1180px);padding-top:8px}.hero,.detail{border-radius:20px;padding:20px}.hero h1,.detail h1{font-size:34px;line-height:1.08}.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.owner-grid,.fields,dl{grid-template-columns:1fr}.job{padding:14px}.job h2{font-size:18px}.job a{width:100%;padding:0 12px;font-size:13px}.primary{width:100%}}`;
}

function applicationScript(jobId, requiredCount) {
  return `<script>(()=>{const f=document.querySelector('[data-apply]'),s=document.querySelector('[data-status]');const say=(x,b=false)=>{s.textContent=x;s.style.color=b?'#ff9b9b':'#d6b56f'};f.addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(f),files=[...d.getAll('photos')].filter(x=>x&&x.size);if(files.length!==${requiredCount})return say('กรุณาเลือกรูปให้ครบ ${requiredCount} รูป',true);const profile=Object.fromEntries([...d.entries()].filter(([k])=>k!=='photos'));try{say('กำลังเตรียมข้อมูล…');let r=await fetch('${PREFIX}/${encodeURIComponent(jobId)}/interest',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({existing_model_claim:profile.existing_model_claim||''})});let x=await r.json();if(!r.ok)throw Error(x.error||'interest_failed');for(let i=0;i<files.length;i++){const file=files[i];r=await fetch('${PREFIX}/${encodeURIComponent(jobId)}/applications/'+encodeURIComponent(x.application_ref)+'/upload-grant',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({slot:i+1,content_type:file.type,size:file.size})});let g=await r.json();if(!r.ok)throw Error(g.error||'upload_grant_failed');r=await fetch(g.upload.url,{method:'PUT',credentials:'same-origin',headers:{'content-type':file.type},body:file});if(!r.ok){g=await r.json().catch(()=>({}));throw Error(g.error||'upload_failed')}say('อัปโหลดรูป '+(i+1)+' / '+files.length)}r=await fetch('${PREFIX}/${encodeURIComponent(jobId)}/applications/'+encodeURIComponent(x.application_ref)+'/submit',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(profile)});x=await r.json();if(!r.ok)throw Error(x.error||'submit_failed');f.reset();say('ส่งข้อมูลให้พี่พิจารณาแล้วครับ')}catch(err){say(err.message==='job_interest_already_exists'?'คุณส่งความสนใจงานนี้แล้วครับ':'ยังส่งข้อมูลไม่สำเร็จ กรุณาลองใหม่',true)}})})();</script>`;
}

function viewerSignalScript(jobId) {
  return `<script>(()=>{const started=Date.now(),send=type=>{const read_seconds=Math.min(600,Math.max(0,Math.round((Date.now()-started)/1000))),body=JSON.stringify({type,job_id:${JSON.stringify(jobId)},read_seconds});if(type==='read_ping'&&navigator.sendBeacon){navigator.sendBeacon('${PREFIX}/events',new Blob([body],{type:'application/json'}));return}fetch('${PREFIX}/events',{method:'POST',credentials:'same-origin',keepalive:true,headers:{'content-type':'application/json'},body}).catch(()=>{})};addEventListener('pagehide',()=>send('read_ping'),{once:true});document.querySelector('[data-interest-cta]')?.addEventListener('click',()=>send('cta_click'))})();</script>`;
}

function ownerPage() {
  return `<main><section class="hero"><p class="eyebrow">MMD · OWNER</p><h1>Public Job Board</h1><p>วางบรีฟตามภาษาที่เปอร์ใช้ ระบบจะแยกข้อมูลสำหรับหน้า Public โดยเก็บบรีฟต้นฉบับไว้ในพื้นที่ส่วนตัว</p></section><section class="grid owner-grid"><article class="job"><p class="eyebrow">สร้างงาน</p><label>บรีฟงาน<textarea data-owner-brief placeholder="วางบรีฟงานที่นี่"></textarea></label><label>สถานะ<select data-owner-status><option value="draft">Draft</option><option value="published">Published</option><option value="paused">Paused</option></select></label><label><input data-owner-private type="checkbox"> งานลับ</label><label><input data-owner-budget type="checkbox"> อนุมัติให้แสดง budget บนปุ่ม</label><button class="primary" type="button" data-owner-create>บันทึกงาน</button><p data-owner-create-status role="status"></p></article><article class="job"><p class="eyebrow">รายการงาน</p><button class="primary" type="button" data-owner-jobs>โหลดรายการงาน</button><p data-owner-jobs-status role="status"></p><div data-owner-jobs-list></div></article><article class="job"><p class="eyebrow">ผู้สนใจต่อ Job</p><label>Job ID<input data-owner-job-id placeholder="JOB-..."></label><button class="primary" type="button" data-owner-load>ดูผู้สนใจ</button><p data-owner-review-status role="status"></p><div data-owner-candidates></div></article><article class="job"><p class="eyebrow">Anonymous viewer watch</p><button class="primary" type="button" data-owner-viewers>ดูรายการล่าสุด</button><p data-owner-viewer-status role="status"></p><div data-owner-viewer-list></div></article></section></main><script>(()=>{const q=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));async function api(path,opt={}){const r=await fetch('${PREFIX}/internal'+path,{credentials:'same-origin',...opt,headers:{'content-type':'application/json',...(opt.headers||{})}}),d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||('HTTP '+r.status));return d}q('[data-owner-create]').onclick=async()=>{const out=q('[data-owner-create-status]');try{out.textContent='กำลังบันทึก…';const d=await api('/jobs',{method:'POST',body:JSON.stringify({brief:q('[data-owner-brief]').value,status:q('[data-owner-status]').value,confidentiality:q('[data-owner-private]').checked,budget_disclosure_approved:q('[data-owner-budget]').checked})});out.textContent='บันทึกแล้ว · '+d.job.id;q('[data-owner-job-id]').value=d.job.id;await loadJobs()}catch(e){out.textContent='ยังบันทึกไม่ได้ · '+e.message}};async function loadJobs(){const out=q('[data-owner-jobs-status]'),box=q('[data-owner-jobs-list]');try{const d=await api('/jobs');out.textContent=d.jobs.length+' งาน';box.innerHTML=d.jobs.map(j=>'<section class="owner-candidate" data-job="'+esc(j.id)+'"><strong>'+esc(j.public.title)+'</strong><p>'+esc(j.status)+' · '+esc(j.public.world)+' · budget '+(j.public.budget_disclosure_approved?'เปิด':'ปิด')+'</p><div class="owner-actions"><button data-job-status="published">Published</button><button data-job-status="paused">Paused</button><button data-job-status="closed">Closed</button><button data-job-private="true">Private</button><button data-job-private="false">Public</button><button data-job-budget="true">เปิด budget</button><button data-job-budget="false">ปิด budget</button></div></section>').join('')||'<p>ยังไม่มีงาน</p>';box.querySelectorAll('[data-job-status],[data-job-private],[data-job-budget]').forEach(btn=>btn.onclick=async()=>{const section=btn.closest('[data-job]'),payload={status:btn.dataset.jobStatus||undefined,confidentiality:btn.dataset.jobPrivate===undefined?undefined:btn.dataset.jobPrivate==='true',budget_disclosure_approved:btn.dataset.jobBudget===undefined?undefined:btn.dataset.jobBudget==='true'};await api('/jobs/'+encodeURIComponent(section.dataset.job)+'/status',{method:'POST',body:JSON.stringify(payload)});await loadJobs()})}catch(e){out.textContent='โหลดไม่ได้ · '+e.message}}async function load(){const id=q('[data-owner-job-id]').value.trim(),out=q('[data-owner-review-status]'),box=q('[data-owner-candidates]');try{out.textContent='กำลังโหลด…';const d=await api('/jobs/'+encodeURIComponent(id)+'/candidates');out.textContent=d.candidates.length+' รายการ';box.innerHTML=d.candidates.map(a=>'<section class="owner-candidate" data-app="'+esc(a.application_ref)+'"><strong>'+esc(a.applicant?.nickname||'ยังไม่ส่งข้อมูล')+'</strong><p>'+esc(a.workflow_status)+' · '+esc(a.identity?.identity_class)+'</p><p>'+esc(a.applicant?.profile||'')+'</p><p>'+esc(a.applicant?.gender||'')+' · '+esc(a.applicant?.customer_scope||'')+' · '+esc(a.applicant?.work_scope||'')+' · ไม่รับ '+esc(a.applicant?.unavailable_scope||'')+'</p><p>รูป '+(a.uploads?.length||0)+' ไฟล์</p><div class="owner-actions"><button data-decision="approve">Approve</button><button data-decision="request_more_information">ขอข้อมูลเพิ่ม</button><button data-decision="reject">Reject</button><button data-decision="bind_to_existing_model">ผูก Model เดิม</button><button data-decision="create_new_model_review">สร้าง Model review</button></div></section>').join('')||'<p>ยังไม่มีผู้สนใจ</p>';box.querySelectorAll('[data-decision]').forEach(btn=>btn.onclick=async()=>{const section=btn.closest('[data-app]'),decision=btn.dataset.decision,payload={decision};if(decision==='bind_to_existing_model'){const value=prompt('Model record ID');if(!value)return;payload.model_record_id=value}await api('/jobs/'+encodeURIComponent(id)+'/candidates/'+encodeURIComponent(section.dataset.app)+'/decision',{method:'POST',body:JSON.stringify(payload)});await load()})}catch(e){out.textContent='โหลดไม่ได้ · '+e.message;box.innerHTML=''}}async function loadViewers(){const out=q('[data-owner-viewer-status]'),box=q('[data-owner-viewer-list]');try{const d=await api('/viewers');out.textContent=d.viewers.length+' sessions';box.innerHTML=d.viewers.map(v=>'<section class="owner-candidate" data-viewer="'+esc(v.viewer_ref)+'"><strong>'+esc(v.display_label)+'</strong><p>'+esc(v.viewer_status)+' · '+esc(v.alert_level)+'</p><p>events '+v.events.length+' · '+esc(v.last_seen_at)+'</p><div class="owner-actions"><button data-viewer-action="restrict_private">จำกัด Private</button><button data-viewer-action="suspend_session">ระงับ 24 ชม.</button><button data-viewer-action="ban_job_link">แบน Job</button><button data-viewer-action="unban">ปลดข้อจำกัด</button></div></section>').join('')||'<p>ยังไม่มีรายการ</p>';box.querySelectorAll('[data-viewer-action]').forEach(btn=>btn.onclick=async()=>{const section=btn.closest('[data-viewer]'),action=btn.dataset.viewerAction,payload={action};if(action==='ban_job_link'){const value=prompt('Job ID');if(!value)return;payload.job_id=value}await api('/viewers/'+encodeURIComponent(section.dataset.viewer)+'/action',{method:'POST',body:JSON.stringify(payload)});await loadViewers()})}catch(e){out.textContent='โหลดไม่ได้ · '+e.message}}q('[data-owner-jobs]').onclick=loadJobs;q('[data-owner-load]').onclick=load;q('[data-owner-viewers]').onclick=loadViewers})();</script>`;
}

async function ensureAnonymousSession(request, env) {
  const existing = await readAnonymousSession(request, env);
  if (existing) return { token: existing.id, setCookie: "" };
  const id = randomHex(16);
  const exp = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
  const tokenValue = await signToken(env, { typ: "anon", id, exp });
  return { token: id, setCookie: `mmd_pjb=${encodeURIComponent(tokenValue)}; Path=${PREFIX}; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax` };
}

async function requireAnonymousSession(request, env) {
  const session = await readAnonymousSession(request, env);
  if (!session) throw httpError(401, "anonymous_session_required");
  return session;
}

async function readAnonymousSession(request, env) {
  const raw = cookieValue(request.headers.get("cookie") || "", "mmd_pjb");
  if (!raw) return null;
  try { return await verifyToken(env, raw, "anon"); } catch { return null; }
}

async function signToken(env, payload) {
  const secret = clean(env.PUBLIC_JOB_BOARD_SIGNING_SECRET, 500);
  if (secret.length < 32) throw httpError(503, "public_job_board_signing_unavailable");
  const body = base64Url(JSON.stringify(payload));
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${base64UrlBytes(signature)}`;
}

async function verifyToken(env, value, type) {
  const [body, signature] = String(value).split(".");
  if (!body || !signature) throw httpError(401, "signed_token_invalid");
  const expected = await signToken(env, JSON.parse(base64UrlDecode(body)));
  if (!timingSafeEqual(expected, value)) throw httpError(401, "signed_token_invalid");
  const payload = JSON.parse(base64UrlDecode(body));
  if (payload.typ !== type || Number(payload.exp) <= Math.floor(Date.now() / 1000)) throw httpError(401, "signed_token_expired");
  return payload;
}

function requireOwnerHeader(request, env) {
  const expected = clean(env.INTERNAL_TOKEN, 500);
  const supplied = clean(request.headers.get("x-internal-token"), 500);
  if (!expected || !supplied || !timingSafeEqual(expected, supplied)) throw httpError(403, "owner_auth_required");
}

async function requireOwnerAccess(request, env) {
  const expected = clean(env.INTERNAL_TOKEN, 500);
  const supplied = clean(request.headers.get("x-internal-token"), 500);
  if (expected && supplied && timingSafeEqual(expected, supplied)) return;
  const raw = cookieValue(request.headers.get("cookie") || "", "mmd_pjb_owner");
  if (!raw) throw httpError(403, "owner_auth_required");
  try { await verifyToken(env, raw, "owner"); } catch { throw httpError(403, "owner_auth_required"); }
}

function requireWriteOrigin(request, env) {
  const origin = request.headers.get("origin") || "";
  if (!origin) return;
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!allowed.includes(origin)) throw httpError(403, "origin_not_allowed");
}

function requireStore(env) {
  if (!env.PUBLIC_ACCESS_EVIDENCE?.get || !env.PUBLIC_ACCESS_EVIDENCE?.put || !env.PUBLIC_ACCESS_EVIDENCE?.list) throw httpError(503, "public_job_board_store_unavailable");
}

async function getJson(env, key) {
  if (!key) return null;
  const object = await env.PUBLIC_ACCESS_EVIDENCE.get(key);
  if (!object) return null;
  try { return JSON.parse(await object.text()); } catch { throw httpError(500, "stored_record_invalid"); }
}

async function putJson(env, key, value, { onlyIfMissing = false } = {}) {
  const options = { httpMetadata: { contentType: "application/json" }, customMetadata: { schema: clean(value.schema || "mmd_public_job_board_v2.index", 100) } };
  if (onlyIfMissing) options.onlyIf = { etagDoesNotMatch: "*" };
  const result = await env.PUBLIC_ACCESS_EVIDENCE.put(key, JSON.stringify(value), options);
  if (onlyIfMissing && result === null) throw httpError(409, "record_already_exists");
}

function jobKey(id) { return id ? `${STORE_PREFIX}/jobs/${id}.json` : ""; }
function applicationKey(jobId, applicationRef) { return jobId && applicationRef ? `${STORE_PREFIX}/applications/${jobId}/${applicationRef}.json` : ""; }
function dedupeKey(jobId, actorHash) { return `${STORE_PREFIX}/dedupe/${jobId}/${actorHash}.json`; }
function mediaKey(jobId, applicationRef, slot, ext) { return `${STORE_PREFIX}/private-media/${jobId}/${applicationRef}/${slot}.${ext}`; }
function viewerKey(ref) { return `${STORE_PREFIX}/viewers/${ref}.json`; }

function inferCategory(value) {
  if (/กินข้าว|dining|ร้านอาหาร/i.test(value)) return "dining";
  if (/ถ่าย|shoot|ถ่ายแบบ|โฆษณา/i.test(value)) return "shooting";
  if (/นักแสดง|แสดง|acting/i.test(value)) return "acting";
  if (/งานอีเวนต์|event|ปาร์ตี้/i.test(value)) return "event";
  return "other";
}

function categoryLabel(value) {
  return ({ dining: "งานร่วมรับประทานอาหาร", shooting: "งานถ่ายภาพ", acting: "งานแสดง", event: "งานอีเวนต์", other: "งานที่เปิดรับ" })[value] || "งานที่เปิดรับ";
}

function sanitizeCustomerDescription(value) {
  return sanitizePublicText(String(value).replace(/(?:ชื่อ|คุณ)\s*[A-Za-zก-๙]+/g, "ลูกค้า").replace(/\b\d{8,}\b/g, ""), 500);
}

function sanitizePublicText(value, max) {
  return cleanMultiline(value, max)
    .replace(/(?:line\s*id|ไลน์|โทร|phone)\s*[:：]?\s*\S+/gi, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "")
    .replace(/\b\d{8,}\b/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function cleanRecordId(value) { const out = clean(value, 32); return /^rec[A-Za-z0-9]{14}$/.test(out) ? out : ""; }
function cleanId(value) { const out = clean(value, 100); return /^[A-Za-z0-9][A-Za-z0-9_-]{2,99}$/.test(out) ? out : ""; }
function clean(value, max = 160) { return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max); }
function cleanMultiline(value, max = 1600) { return String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/\r/g, "").trim().slice(0, max); }
function required(value, field, max = 160) { const out = clean(value, max); if (!out) throw httpError(400, `${field}_required`); return out; }
function requiredMultiline(value, field, max) { const out = cleanMultiline(value, max); if (!out) throw httpError(400, `${field}_required`); return out; }
function boundedInt(value, min, max, fallback) { if ((value === undefined || value === null || value === "") && fallback !== undefined) return fallback; const n = Number(value); if (!Number.isInteger(n) || n < min || n > max) throw httpError(400, "number_out_of_range"); return n; }
function token(value) { return clean(value, 80).toLowerCase(); }
function normalizePath(value) { return String(value).replace(/\/+$/, "") || "/"; }
function cookieValue(header, name) { for (const part of header.split(";")) { const [key, ...rest] = part.trim().split("="); if (key === name) return decodeURIComponent(rest.join("=")); } return ""; }
function makeRef(prefix, now = new Date()) { return `${prefix}-${now.toISOString().slice(0, 10).replaceAll("-", "")}-${randomHex(6).toUpperCase()}`; }
function randomHex(size) { return [...crypto.getRandomValues(new Uint8Array(size))].map((n) => n.toString(16).padStart(2, "0")).join(""); }
async function sha256(value) { return sha256Bytes(encoder.encode(value)); }
async function sha256Bytes(value) { const digest = await crypto.subtle.digest("SHA-256", value); return [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, "0")).join(""); }
function base64Url(value) { return base64UrlBytes(encoder.encode(value)); }
function base64UrlBytes(value) { let binary = ""; for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte); return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""); }
function base64UrlDecode(value) { const normalized = value.replaceAll("-", "+").replaceAll("_", "/"); return atob(normalized + "=".repeat((4 - normalized.length % 4) % 4)); }
function timingSafeEqual(a, b) { const left = encoder.encode(String(a)); const right = encoder.encode(String(b)); if (left.length !== right.length) return false; let result = 0; for (let i = 0; i < left.length; i += 1) result |= left[i] ^ right[i]; return result === 0; }
async function readJson(request) { try { return await request.json(); } catch { throw httpError(400, "invalid_json"); } }
function httpError(status, code) { const error = new Error(code); error.status = status; return error; }
function statusFor(error) { return Number.isInteger(error?.status) ? error.status : 500; }
function safeCode(error) { const code = String(error?.message || "internal_error"); return /^[a-z0-9_]+$/i.test(code) ? code : "internal_error"; }
function esc(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
function json(value, status = 200, extra = {}) { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } }); }
function html(value, status = 200, extra = {}) { return new Response(value, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...extra } }); }

export const PUBLIC_JOB_BOARD_V2_INTERNALS = {
  applicationKey,
  dedupeKey,
  jobKey,
  mediaKey,
  parsePublicJobBriefV2,
  publicJobView,
};
