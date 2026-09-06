const PAGE_PATH = "/internal/admin/model-applications";
const API_PREFIX = "/v1/admin/model-applications";
const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_BASE_ID = "appsV1ILPRfIjkaYg";
const APPLICATIONS_TABLE_ID = "tblwUa8ySWln8OfaJ";
const ASSETS_TABLE_ID = "tblEhg3dsFzPERpNQ";
const APPLICATION_ID_RE = /^pma_[A-Za-z0-9_-]{8,120}$/;
const ASSET_ID_RE = /^pmua_[A-Za-z0-9_-]{8,120}$/;
const SAFE_ADMIN_ORIGINS = new Set(["https://mmdbkk.com", "https://www.mmdbkk.com"]);
const REVIEWABLE_ASSET_UPLOAD_STATES = new Set(["attached", "uploaded"]);

export const PUBLIC_MODEL_REVIEW_FIELDS = Object.freeze({
  applicationId: "fldE5jq01JlYtvSP7",
  applicationType: "fld3KMefCywUTNIoQ",
  nickname: "fldUIqNSM6Z9dK8Tj",
  gender: "fldGNS9k0SerUKpc7",
  age: "fldSRAY0jIsd7Plq9",
  height: "fldGbBKCkWXwdAtFV",
  location: "fldz32ZjP0ptkHfRZ",
  occupation: "fldn14ahMblpFMdjQ",
  phone: "fldKt4hogB4x1R51b",
  lineId: "fldYi4U0m5j9IZbPT",
  email: "fldIoxRG37yTYnSqR",
  socialUrl: "fld7hlA4nQUfcz8gX",
  category: "fldmyDPx9LMyg4yxt",
  privacyLevel: "fldj4qNE8ZfYqHsSN",
  payloadJson: "fldJ9ldETtMF2Qbqf",
  summaryJson: "fldSSEwULqezCAPzY",
  status: "fldj2yV7EPyRn2Nu9",
  reviewStatus: "fldInXMklAz53CiCq",
  intakeStatus: "fldHk2h9Rf6g5UlZw",
  handler: "fldEimjniWxflPnLz",
  notes: "fld0C1aLDZO43i7fw",
  submittedAt: "fldRs4JdlxOdtlqp9",
  createdAt: "flddbmI6akcZSAPye",
  photoCount: "fldoEssk98FpMqsxo",
  bodyPhotoCount: "fldCrBc6G3BVrvrds",
  documentCount: "fldHFmaRBsfMKjfMO",
});

export const PUBLIC_MODEL_ASSET_FIELDS = Object.freeze({
  assetId: "fldSKeoWClypsbPNF",
  applicationId: "fldPCr17XtTGH52BZ",
  kind: "fldGmoadvfKK2NHJn",
  role: "fldHQSKvqJ7Vk7QQA",
  fileName: "fldMmJU6py2iMGCBC",
  contentType: "fldE0qlrPfZXzTjnp",
  fileSize: "fldBpa9ZuQV2QXxPS",
  bucket: "fldOy0nJXvYH1zzrL",
  objectKey: "fldGTJmeQkiSD4NEP",
  uploadStatus: "fldDhx8xsUUFB8D8N",
  reviewStatus: "fldJIwNkFsNKuhgp1",
  uploadedAt: "fldTbBcPuxCuL3PBH",
});

const DECISIONS = Object.freeze({
  approve: { status: "Approved", reviewStatus: "accepted", intakeStatus: "approved", assetReviewStatus: "approved" },
  screening: { status: "In Review", reviewStatus: "screening", intakeStatus: "private_review_pending", assetReviewStatus: "pending_review" },
  reject: { status: "Rejected", reviewStatus: "rejected", intakeStatus: "rejected", assetReviewStatus: "rejected" },
});

export function isPublicModelApplicationReviewRequest(pathname = "") {
  const path = normalizePath(pathname);
  return path === PAGE_PATH || path === API_PREFIX || path.startsWith(`${API_PREFIX}/`);
}

export async function handlePublicModelApplicationReviewRequest(request, env = {}, actor = null) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  const method = request.method.toUpperCase();

  if (path === PAGE_PATH) {
    if (method !== "GET" && method !== "HEAD") return methodNotAllowed(["GET", "HEAD"]);
    const response = html(renderReviewPage());
    response.headers.set("x-mmd-admin-surface", "public-model-application-review");
    return method === "HEAD" ? new Response(null, { status: 200, headers: response.headers }) : response;
  }

  if (path === API_PREFIX && method === "GET") {
    const limit = clampInt(url.searchParams.get("limit"), 1, 50, 30);
    const records = await listPublicModelApplications(env, limit);
    return json({ ok: true, applications: records.map((record) => normalizeApplication(record, [])) });
  }

  const detail = path.match(/^\/v1\/admin\/model-applications\/(pma_[A-Za-z0-9_-]{8,120})$/);
  if (detail && method === "GET") {
    const application = await findApplicationById(env, detail[1]);
    if (!application) return json({ ok: false, error: "application_not_found" }, 404);
    if (clean(application.fields?.[PUBLIC_MODEL_REVIEW_FIELDS.applicationType]) !== "public_model") {
      return json({ ok: false, error: "not_public_model_application" }, 409);
    }
    const assets = await listAssetsForApplication(env, detail[1]);
    return json({ ok: true, application: normalizeApplication(application, assets) });
  }

  const decision = path.match(/^\/v1\/admin\/model-applications\/(pma_[A-Za-z0-9_-]{8,120})\/decision$/);
  if (decision && method === "POST") {
    const originError = enforceSameOrigin(request);
    if (originError) return originError;
    return applyDecision(request, env, actor, decision[1]);
  }

  const asset = path.match(/^\/v1\/admin\/model-applications\/(pma_[A-Za-z0-9_-]{8,120})\/assets\/(pmua_[A-Za-z0-9_-]{8,120})$/);
  if (asset && method === "GET") {
    return serveAsset(env, asset[1], asset[2]);
  }

  return json({ ok: false, error: "not_found" }, 404);
}

async function applyDecision(request, env, actor, applicationId) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  const decision = clean(body?.decision).toLowerCase();
  const policy = DECISIONS[decision];
  if (!policy) return json({ ok: false, error: "invalid_decision" }, 400);
  const note = clean(body?.note).slice(0, 1500);

  const application = await findApplicationById(env, applicationId);
  if (!application) return json({ ok: false, error: "application_not_found" }, 404);
  if (clean(application.fields?.[PUBLIC_MODEL_REVIEW_FIELDS.applicationType]) !== "public_model") {
    return json({ ok: false, error: "not_public_model_application" }, 409);
  }

  const currentIntake = clean(application.fields?.[PUBLIC_MODEL_REVIEW_FIELDS.intakeStatus]);
  const actorId = clean(actor?.id || request.headers.get("x-mmd-admin-actor") || "per").slice(0, 80) || "per";
  const fields = {
    [PUBLIC_MODEL_REVIEW_FIELDS.status]: policy.status,
    [PUBLIC_MODEL_REVIEW_FIELDS.reviewStatus]: policy.reviewStatus,
    [PUBLIC_MODEL_REVIEW_FIELDS.intakeStatus]: policy.intakeStatus,
    [PUBLIC_MODEL_REVIEW_FIELDS.handler]: actorId,
  };

  if (currentIntake !== policy.intakeStatus || note) {
    const previous = clean(application.fields?.[PUBLIC_MODEL_REVIEW_FIELDS.notes]);
    const line = `[${new Date().toISOString()}] Public Model review: ${decision} by ${actorId}${note ? ` — ${note}` : ""}`;
    fields[PUBLIC_MODEL_REVIEW_FIELDS.notes] = [previous, line].filter(Boolean).join("\n").slice(-9000);
  }

  await patchApplication(env, application.id, fields);
  const assets = await listAssetsForApplication(env, applicationId);
  if (assets.length) await patchAssetReviewStatuses(env, assets, policy.assetReviewStatus);

  const refreshed = await findApplicationById(env, applicationId);
  const refreshedAssets = await listAssetsForApplication(env, applicationId);
  return json({
    ok: true,
    decision,
    application: normalizeApplication(refreshed || application, refreshedAssets),
    publishes_model: false,
    next_step: decision === "approve" ? "onboarding_ready" : null,
  });
}

async function serveAsset(env, applicationId, assetId) {
  if (!APPLICATION_ID_RE.test(applicationId) || !ASSET_ID_RE.test(assetId)) return json({ ok: false, error: "invalid_asset" }, 400);
  if (!env.PUBLIC_MODEL_UPLOADS_R2 || typeof env.PUBLIC_MODEL_UPLOADS_R2.get !== "function") {
    return json({ ok: false, error: "public_model_asset_store_unavailable" }, 503);
  }
  const assets = await listAssetsForApplication(env, applicationId);
  const asset = assets.find((item) => clean(item.fields?.[PUBLIC_MODEL_ASSET_FIELDS.assetId]) === assetId);
  if (!asset) return json({ ok: false, error: "asset_not_found" }, 404);
  const uploadState = selectName(asset.fields?.[PUBLIC_MODEL_ASSET_FIELDS.uploadStatus]).toLowerCase();
  if (!REVIEWABLE_ASSET_UPLOAD_STATES.has(uploadState)) {
    return json({ ok: false, error: "asset_not_reviewable" }, 409);
  }
  const key = clean(asset.fields?.[PUBLIC_MODEL_ASSET_FIELDS.objectKey]);
  if (!key) return json({ ok: false, error: "asset_key_missing" }, 404);
  const object = await env.PUBLIC_MODEL_UPLOADS_R2.get(key);
  if (!object) return json({ ok: false, error: "asset_object_not_found" }, 404);
  const contentType = clean(asset.fields?.[PUBLIC_MODEL_ASSET_FIELDS.contentType]) || object.httpMetadata?.contentType || "application/octet-stream";
  const headers = new Headers({
    "content-type": contentType,
    "cache-control": "private, no-store, max-age=0",
    "x-content-type-options": "nosniff",
    "content-disposition": `inline; filename="${safeFileName(asset.fields?.[PUBLIC_MODEL_ASSET_FIELDS.fileName] || assetId)}"`,
  });
  if (object.size) headers.set("content-length", String(object.size));
  return new Response(object.body, { status: 200, headers });
}

async function listPublicModelApplications(env, limit) {
  const url = airtableUrl(env, APPLICATIONS_TABLE_ID);
  url.searchParams.set("maxRecords", String(limit));
  url.searchParams.set("pageSize", String(limit));
  url.searchParams.set("returnFieldsByFieldId", "true");
  url.searchParams.set("filterByFormula", "{application_type}='public_model'");
  url.searchParams.set("sort[0][field]", "submitted_at");
  url.searchParams.set("sort[0][direction]", "desc");
  const data = await airtableRequest(env, url.toString(), { method: "GET" });
  return Array.isArray(data.records) ? data.records : [];
}

async function findApplicationById(env, applicationId) {
  if (!APPLICATION_ID_RE.test(applicationId)) return null;
  const url = airtableUrl(env, APPLICATIONS_TABLE_ID);
  url.searchParams.set("maxRecords", "1");
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("returnFieldsByFieldId", "true");
  url.searchParams.set("filterByFormula", `{application_id}='${applicationId}'`);
  const data = await airtableRequest(env, url.toString(), { method: "GET" });
  return Array.isArray(data.records) ? data.records[0] || null : null;
}

async function listAssetsForApplication(env, applicationId) {
  const url = airtableUrl(env, ASSETS_TABLE_ID);
  url.searchParams.set("maxRecords", "50");
  url.searchParams.set("pageSize", "50");
  url.searchParams.set("returnFieldsByFieldId", "true");
  url.searchParams.set("filterByFormula", `{application_id}='${applicationId}'`);
  url.searchParams.set("sort[0][field]", "uploaded_at");
  url.searchParams.set("sort[0][direction]", "asc");
  const data = await airtableRequest(env, url.toString(), { method: "GET" });
  return Array.isArray(data.records) ? data.records : [];
}

async function patchApplication(env, recordId, fields) {
  const url = airtableUrl(env, `${APPLICATIONS_TABLE_ID}/${encodeURIComponent(recordId)}`);
  url.searchParams.set("returnFieldsByFieldId", "true");
  return airtableRequest(env, url.toString(), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fields, typecast: false }),
  });
}

async function patchAssetReviewStatuses(env, assets, reviewStatus) {
  for (let index = 0; index < assets.length; index += 10) {
    const records = assets.slice(index, index + 10).map((asset) => ({
      id: asset.id,
      fields: { [PUBLIC_MODEL_ASSET_FIELDS.reviewStatus]: reviewStatus },
    }));
    const url = airtableUrl(env, ASSETS_TABLE_ID);
    url.searchParams.set("returnFieldsByFieldId", "true");
    await airtableRequest(env, url.toString(), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ records, typecast: false }),
    });
  }
}

function normalizeApplication(record, assets) {
  const fields = record?.fields || {};
  const payload = parseObject(fields[PUBLIC_MODEL_REVIEW_FIELDS.payloadJson]);
  const summary = parseObject(fields[PUBLIC_MODEL_REVIEW_FIELDS.summaryJson]);
  const applicationId = clean(fields[PUBLIC_MODEL_REVIEW_FIELDS.applicationId]);
  const get = (field, fallback = "") => clean(fields[field]) || clean(fallback);
  const customerScope = arrayStrings(payload.mmd_public_customer_scope || payload.customer_groups || summary.customer_groups);
  const previousBackground = arrayStrings(payload.mmd_previous_work_background || summary.previous_work_background);
  const mmdYears = numberValue(payload.mmd_experience_years);
  const mmdMonths = numberValue(payload.mmd_experience_months);
  return {
    id: record?.id || "",
    application_id: applicationId,
    application_type: get(PUBLIC_MODEL_REVIEW_FIELDS.applicationType),
    nickname: get(PUBLIC_MODEL_REVIEW_FIELDS.nickname, payload.nickname),
    gender: selectName(fields[PUBLIC_MODEL_REVIEW_FIELDS.gender]) || clean(payload.gender || summary.gender),
    age: numberValue(fields[PUBLIC_MODEL_REVIEW_FIELDS.age] ?? payload.age ?? summary.age),
    height_cm: numberValue(fields[PUBLIC_MODEL_REVIEW_FIELDS.height] ?? payload.height_cm ?? payload.height ?? summary.height_cm),
    weight_kg: numberValue(payload.weight_kg ?? summary.weight_kg),
    location: get(PUBLIC_MODEL_REVIEW_FIELDS.location, payload.location || summary.location),
    occupation: get(PUBLIC_MODEL_REVIEW_FIELDS.occupation, payload.occupation_detail || payload.occupation || summary.occupation),
    intro: clean(payload.intro || payload.story || payload.why_consider || summary.why_consider),
    experience: clean(payload.experience || payload.occupation_detail || summary.experience),
    skills: clean(payload.skills || summary.skills),
    boundaries: clean(payload.boundaries || summary.boundaries),
    work_interests: arrayStrings(payload.work_types || payload.interested_work_types || summary.work_interests),
    customer_scope: customerScope,
    previous_work_background: previousBackground,
    previous_agency_or_venue: clean(payload.mmd_previous_agency_or_venue || summary.previous_agency_or_venue),
    worked_independently_before: Boolean(payload.mmd_worked_independently_before),
    mmd_experience_years: mmdYears,
    mmd_experience_months: mmdMonths,
    lgbt_professional: clean(payload.lgbt_professional),
    portfolio_links: clean(payload.portfolio_links || payload.portfolio_url || summary.portfolio_links),
    public_model_category: selectName(fields[PUBLIC_MODEL_REVIEW_FIELDS.category]) || clean(payload.mmd_public_model_category || payload.mmd_public_model_category_label || payload.category || payload.category_label),
    privacy_level: selectName(fields[PUBLIC_MODEL_REVIEW_FIELDS.privacyLevel]) || clean(payload.privacy_level || payload.public_level),
    contact: {
      phone: get(PUBLIC_MODEL_REVIEW_FIELDS.phone, payload.phone),
      line_id: get(PUBLIC_MODEL_REVIEW_FIELDS.lineId, payload.line_id),
      email: get(PUBLIC_MODEL_REVIEW_FIELDS.email, payload.email),
      social_url: get(PUBLIC_MODEL_REVIEW_FIELDS.socialUrl, payload.social_url),
    },
    counts: {
      photos: numberValue(fields[PUBLIC_MODEL_REVIEW_FIELDS.photoCount] ?? summary.photos_count),
      body_photos: numberValue(fields[PUBLIC_MODEL_REVIEW_FIELDS.bodyPhotoCount] ?? summary.body_photos_count),
      documents: numberValue(fields[PUBLIC_MODEL_REVIEW_FIELDS.documentCount] ?? summary.documents_count),
    },
    status: selectName(fields[PUBLIC_MODEL_REVIEW_FIELDS.status]),
    review_status: selectName(fields[PUBLIC_MODEL_REVIEW_FIELDS.reviewStatus]),
    intake_status: get(PUBLIC_MODEL_REVIEW_FIELDS.intakeStatus),
    handler: get(PUBLIC_MODEL_REVIEW_FIELDS.handler),
    notes: get(PUBLIC_MODEL_REVIEW_FIELDS.notes),
    submitted_at: get(PUBLIC_MODEL_REVIEW_FIELDS.submittedAt, fields[PUBLIC_MODEL_REVIEW_FIELDS.createdAt]),
    assets: (Array.isArray(assets) ? assets : []).map((asset) => normalizeAsset(applicationId, asset)),
  };
}

function normalizeAsset(applicationId, record) {
  const fields = record?.fields || {};
  const assetId = clean(fields[PUBLIC_MODEL_ASSET_FIELDS.assetId]);
  return {
    asset_id: assetId,
    kind: selectName(fields[PUBLIC_MODEL_ASSET_FIELDS.kind]) || clean(fields[PUBLIC_MODEL_ASSET_FIELDS.kind]),
    role: selectName(fields[PUBLIC_MODEL_ASSET_FIELDS.role]) || clean(fields[PUBLIC_MODEL_ASSET_FIELDS.role]),
    file_name: clean(fields[PUBLIC_MODEL_ASSET_FIELDS.fileName]),
    content_type: clean(fields[PUBLIC_MODEL_ASSET_FIELDS.contentType]),
    upload_status: selectName(fields[PUBLIC_MODEL_ASSET_FIELDS.uploadStatus]) || clean(fields[PUBLIC_MODEL_ASSET_FIELDS.uploadStatus]),
    review_status: selectName(fields[PUBLIC_MODEL_ASSET_FIELDS.reviewStatus]),
    url: applicationId && assetId ? `${API_PREFIX}/${encodeURIComponent(applicationId)}/assets/${encodeURIComponent(assetId)}` : "",
  };
}

function airtableUrl(env, path) {
  return new URL(`${AIRTABLE_API}/${clean(env.AIRTABLE_BASE_ID || DEFAULT_BASE_ID)}/${path}`);
}

async function airtableRequest(env, url, init = {}) {
  const token = clean(env.AIRTABLE_API_KEY || env.AIRTABLE_API_TOKEN || env.AIRTABLE_PAT);
  if (!token) throw new Error("public_model_review_airtable_not_configured");
  const headers = new Headers(init.headers || {});
  headers.set("authorization", `Bearer ${token}`);
  const fetcher = typeof env.AIRTABLE_FETCH === "function" ? env.AIRTABLE_FETCH : fetch;
  const response = await fetcher(url, { ...init, headers });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const provider = clean(data?.error?.type || data?.error?.message || `HTTP_${response.status}`).slice(0, 160);
    throw new Error(`public_model_review_airtable_failed:${provider}`);
  }
  return data || {};
}

function enforceSameOrigin(request) {
  const url = new URL(request.url);
  const origin = clean(request.headers.get("origin"));
  if (!SAFE_ADMIN_ORIGINS.has(url.origin) || origin !== url.origin) {
    return json({ ok: false, error: "forbidden_origin" }, 403);
  }
  return null;
}

function renderReviewPage() {
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>MMD · Public Model Applications</title>
<style>
:root{color-scheme:dark;--bg:#090a0c;--panel:#111318;--panel2:#171a20;--line:#272b33;--text:#f5f6f7;--muted:#9ca3af;--ok:#69d59b;--warn:#f6c65b;--bad:#ff7070;--accent:#e4c36a}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% 0,#1a1b16 0,#090a0c 34rem);color:var(--text);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:1120px;margin:auto;padding:22px 16px 110px}.top{display:flex;gap:12px;align-items:center;justify-content:space-between;margin-bottom:18px}.eyebrow{font-size:12px;letter-spacing:.14em;color:var(--accent);text-transform:uppercase}.title{font-size:clamp(25px,5vw,40px);font-weight:720;letter-spacing:-.035em;margin:2px 0}.muted{color:var(--muted)}.card{background:rgba(17,19,24,.92);border:1px solid var(--line);border-radius:22px;padding:18px;margin:12px 0;box-shadow:0 18px 60px #0005}.hero{display:grid;grid-template-columns:1.05fr .95fr;gap:14px}.name{font-size:30px;font-weight:720;letter-spacing:-.03em}.chips{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}.chip{padding:6px 10px;border:1px solid var(--line);border-radius:999px;background:#0c0e12;color:#cbd1d9;font-size:12px}.chip.ok{color:var(--ok);border-color:#29563d}.chip.bad{color:var(--bad);border-color:#5e2d2d}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.kv{padding:12px;border-radius:15px;background:var(--panel2);min-height:72px}.k{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}.v{font-size:16px;margin-top:3px;word-break:break-word;white-space:pre-wrap}.lead{font-size:19px;line-height:1.55;letter-spacing:-.015em}.photos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.photo{position:relative;overflow:hidden;border-radius:17px;background:#0b0c0f;aspect-ratio:4/5;border:1px solid var(--line)}.photo img{width:100%;height:100%;object-fit:cover;display:block}.photo span{position:absolute;left:9px;bottom:9px;padding:5px 8px;border-radius:999px;background:#000a;font-size:11px}.docs{display:grid;gap:8px;margin-top:10px}.doc{display:flex;justify-content:space-between;gap:10px;padding:11px 12px;border-radius:13px;background:#0c0e12;border:1px solid var(--line);color:#e3e6ea;text-decoration:none}.section-title{font-size:18px;font-weight:670;margin:2px 0 12px}details summary{cursor:pointer;color:#d7dbe2}.note{width:100%;min-height:92px;resize:vertical;border-radius:15px;border:1px solid var(--line);background:#0b0d11;color:#fff;padding:12px;font:inherit}.actions{position:fixed;z-index:10;left:0;right:0;bottom:0;padding:10px max(12px,env(safe-area-inset-right)) calc(10px + env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));background:#090a0ce8;backdrop-filter:blur(18px);border-top:1px solid #242830}.action-inner{max-width:1120px;margin:auto;display:flex;gap:8px}.btn{appearance:none;border:0;border-radius:14px;padding:13px 15px;font:650 14px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer;background:#242832;color:#fff;flex:1}.btn.approve{background:#e7c76f;color:#16130b}.btn.reject{background:#3b1f23;color:#ffb1b1}.btn:disabled{opacity:.45;cursor:not-allowed}.banner{padding:12px 14px;border-radius:14px;margin:10px 0;background:#17231d;border:1px solid #29563d;color:#a6e7c2}.queue{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.q{display:block;text-decoration:none;color:inherit}.q:hover{border-color:#5b5747}.error{color:#ff9d9d}.loading{padding:36px;text-align:center;color:var(--muted)}@media(max-width:760px){.hero{grid-template-columns:1fr}.photos{grid-template-columns:repeat(2,minmax(0,1fr))}.queue{grid-template-columns:1fr}.wrap{padding-top:16px}.action-inner{flex-wrap:wrap}.btn{min-width:30%}}@media(max-width:420px){.grid{grid-template-columns:1fr}.photos{grid-template-columns:1fr 1fr}.btn{padding:12px 8px;font-size:13px}}
</style></head><body><main class="wrap"><div class="top"><div><div class="eyebrow">MMD PRIVÉ · INTERNAL</div><div class="title">Public Model Applications</div><div class="muted">เปิดจาก Telegram แล้วดูข้อมูลจริง รูปจริง และตัดสินใจได้ในหน้าเดียว</div></div><a href="/internal/admin/control-room" class="chip" style="text-decoration:none">Control Room</a></div><div id="app" class="loading">กำลังโหลดใบสมัคร…</div></main><div class="actions" id="actions" hidden><div class="action-inner"><button class="btn" data-decision="screening">ขอดูต่อ / กำลังพิจารณา</button><button class="btn reject" data-decision="reject">ไม่รับ</button><button class="btn approve" data-decision="approve">อนุมัติใบสมัคร</button></div></div>
<script>
const $=s=>document.querySelector(s), app=$('#app'), actions=$('#actions');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const id=new URL(location.href).searchParams.get('application_id')||'';
const val=v=>(v===0||v)?esc(v):'—';
const list=v=>Array.isArray(v)&&v.length?v.map(esc).join(' · '):'—';
const chip=(text,cls='')=>text?'<span class="chip '+cls+'">'+esc(text)+'</span>':'';
async function api(path,init){const r=await fetch(path,{credentials:'same-origin',...init});const d=await r.json().catch(()=>({}));if(!r.ok||d.ok===false)throw new Error(d.error||('HTTP '+r.status));return d}
function statusClass(a){return a.intake_status==='approved'?'ok':a.intake_status==='rejected'?'bad':''}
function mmdExp(a){const y=Number(a.mmd_experience_years||0),m=Number(a.mmd_experience_months||0);return y||m?(y?y+' ปี ':'')+(m?m+' เดือน':''):'—'}
function render(a){
 const assets=a.assets||[], photos=assets.filter(x=>String(x.content_type||'').startsWith('image/')), docs=assets.filter(x=>!String(x.content_type||'').startsWith('image/'));
 const contact=a.contact||{};
 app.className='';
 app.innerHTML='<section class="card hero"><div><div class="eyebrow">'+esc(a.application_id)+'</div><div class="name">'+val(a.nickname)+'</div><div class="chips">'+chip(a.public_model_category)+chip(a.status,statusClass(a))+chip(a.review_status)+chip(a.intake_status,statusClass(a))+'</div><div class="muted">ส่งเมื่อ '+val(a.submitted_at)+'</div></div><div class="grid"><div class="kv"><div class="k">Age</div><div class="v">'+val(a.age)+'</div></div><div class="kv"><div class="k">Height / Weight</div><div class="v">'+(a.height_cm?esc(a.height_cm)+' cm':'—')+' / '+(a.weight_kg?esc(a.weight_kg)+' kg':'—')+'</div></div><div class="kv"><div class="k">Location</div><div class="v">'+val(a.location)+'</div></div><div class="kv"><div class="k">Occupation / Background</div><div class="v">'+val(a.occupation)+'</div></div></div></section>'+
 (a.intake_status==='approved'?'<div class="banner">อนุมัติใบสมัครแล้ว · พร้อมเข้าสู่ onboarding แต่ยังไม่ Publish ขึ้นหน้า Public อัตโนมัติ</div>':'')+
 '<section class="card"><div class="section-title">แนะนำตัว / ภาพรวม</div><div class="lead">'+val(a.intro)+'</div></section>'+
 '<section class="card"><div class="section-title">รูปที่ส่งมา ('+photos.length+')</div><div class="photos">'+(photos.length?photos.map(x=>'<a class="photo" href="'+esc(x.url)+'" target="_blank" rel="noopener"><img loading="lazy" src="'+esc(x.url)+'" alt="'+esc(x.role||x.kind||'photo')+'"><span>'+esc(x.role||x.kind||'photo')+'</span></a>').join(''):'<div class="muted">ไม่มีรูปที่อ่านได้</div>')+'</div>'+(docs.length?'<div class="docs">'+docs.map(x=>'<a class="doc" href="'+esc(x.url)+'" target="_blank" rel="noopener"><span>'+esc(x.file_name||x.role||'เอกสาร')+'</span><span>เปิด ↗</span></a>').join('')+'</div>':'')+'</section>'+
 '<section class="card"><div class="section-title">ข้อมูลสำหรับตัดสินใจ</div><div class="grid"><div class="kv"><div class="k">ประสบการณ์</div><div class="v">'+val(a.experience)+'</div></div><div class="kv"><div class="k">Skills / ภาษา</div><div class="v">'+val(a.skills)+'</div></div><div class="kv"><div class="k">ประสบการณ์กับ MMD</div><div class="v">'+esc(mmdExp(a))+'</div></div><div class="kv"><div class="k">เคยทำกับ / สถานที่เดิม</div><div class="v">'+val(a.previous_agency_or_venue)+'</div></div><div class="kv" style="grid-column:1/-1"><div class="k">งาน / Background ที่เคยทำ</div><div class="v">'+list(a.previous_work_background)+'</div></div><div class="kv" style="grid-column:1/-1"><div class="k">กลุ่มลูกค้าที่รับ</div><div class="v">'+list(a.customer_scope)+'</div></div><div class="kv" style="grid-column:1/-1"><div class="k">ขอบเขตที่ไม่รับ</div><div class="v">'+val(a.boundaries)+'</div></div><div class="kv"><div class="k">LGBT Professional</div><div class="v">'+val(a.lgbt_professional)+'</div></div><div class="kv"><div class="k">เคยรับงานเอง</div><div class="v">'+(a.worked_independently_before?'เคย':'—')+'</div></div><div class="kv" style="grid-column:1/-1"><div class="k">Portfolio</div><div class="v">'+val(a.portfolio_links)+'</div></div></div></section>'+
 '<section class="card"><details><summary>ข้อมูลติดต่อ (Internal)</summary><div class="grid" style="margin-top:12px"><div class="kv"><div class="k">Phone</div><div class="v">'+val(contact.phone)+'</div></div><div class="kv"><div class="k">LINE</div><div class="v">'+val(contact.line_id)+'</div></div><div class="kv"><div class="k">Email</div><div class="v">'+val(contact.email)+'</div></div><div class="kv"><div class="k">Social</div><div class="v">'+val(contact.social_url)+'</div></div></div></details></section>'+
 '<section class="card"><div class="section-title">หมายเหตุการพิจารณา</div><textarea id="reviewNote" class="note" placeholder="เขียนเหตุผล / สิ่งที่ต้องติดตาม (ไม่บังคับ)"></textarea><div class="muted" style="margin-top:8px">อนุมัติใบสมัคร = รับเข้าสู่ขั้น onboarding เท่านั้น ระบบจะไม่เปิด Public visibility หรือ publish profile เอง</div></section>';
 actions.hidden=false;
 actions.querySelectorAll('button').forEach(b=>b.onclick=()=>decide(b.dataset.decision,a));
}
async function decide(decision,a){
 const labels={approve:'อนุมัติใบสมัครนี้เข้าสู่ onboarding',reject:'ปฏิเสธใบสมัครนี้',screening:'ย้ายใบสมัครนี้ไปสถานะกำลังพิจารณา'};
 if(!confirm((labels[decision]||'บันทึกการตัดสินใจ')+'?'))return;
 const note=$('#reviewNote')?.value||''; actions.querySelectorAll('button').forEach(b=>b.disabled=true);
 try{const d=await api('/v1/admin/model-applications/'+encodeURIComponent(a.application_id)+'/decision',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({decision,note})});render(d.application)}catch(e){alert('บันทึกไม่สำเร็จ: '+e.message)}finally{actions.querySelectorAll('button').forEach(b=>b.disabled=false)}
}
async function loadQueue(){const d=await api('/v1/admin/model-applications?limit=30');app.className='';const rows=d.applications||[];app.innerHTML='<div class="queue">'+(rows.length?rows.map(a=>'<a class="card q" href="?application_id='+encodeURIComponent(a.application_id)+'"><div class="eyebrow">'+esc(a.application_id)+'</div><div class="section-title" style="margin-top:6px">'+val(a.nickname)+'</div><div class="chips">'+chip(a.public_model_category)+chip(a.status,statusClass(a))+chip(a.intake_status,statusClass(a))+'</div><div class="muted">'+val(a.age)+' ปี · '+val(a.height_cm)+' cm · '+val(a.location)+'</div></a>').join(''):'<div class="card muted">ยังไม่มีใบสมัคร Public Model</div>')+'</div>'}
(async()=>{try{if(id){if(!/^pma_[A-Za-z0-9_-]{8,120}$/.test(id))throw new Error('invalid application_id');const d=await api('/v1/admin/model-applications/'+encodeURIComponent(id));render(d.application)}else await loadQueue()}catch(e){app.className='card error';app.textContent='เปิดใบสมัครไม่ได้: '+e.message}})();
</script></body></html>`;
}

function normalizePath(pathname) {
  const value = clean(pathname || "/").replace(/\/+/g, "/");
  return value.length > 1 && value.endsWith("/") ? value.slice(0, -1) : value || "/";
}
function parseObject(value) { if (!value) return {}; if (typeof value === "object" && !Array.isArray(value)) return value; try { const parsed = JSON.parse(String(value)); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }
function selectName(value) { if (value && typeof value === "object" && !Array.isArray(value)) return clean(value.name); return clean(value); }
function arrayStrings(value) { return Array.isArray(value) ? value.map((item) => selectName(item)).filter(Boolean).slice(0, 20) : []; }
function numberValue(value) { const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : null; }
function clean(value) { return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim(); }
function clampInt(value, min, max, fallback) { const number = Number.parseInt(value, 10); return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback; }
function safeFileName(value) { return clean(value).replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120) || "asset"; }
function json(payload, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, max-age=0", "x-content-type-options": "nosniff" } }); }
function html(body) { return new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, max-age=0", "x-content-type-options": "nosniff", "referrer-policy": "same-origin", "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'" } }); }
function methodNotAllowed(allowed) { return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), { status: 405, headers: { "content-type": "application/json; charset=utf-8", allow: allowed.join(", ") } }); }
