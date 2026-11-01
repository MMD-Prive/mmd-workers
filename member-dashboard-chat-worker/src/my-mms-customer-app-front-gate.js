import { renderMmsDirectChatPage } from './mms-direct-chat-page.mjs';

const WORKER_NAME = "member-dashboard-chat-worker";
const CUSTOMER_UI_PREFIX = "/male-massage";
const CUSTOMER_ASSET_PREFIX = "/male-massage-assets/";
const CUSTOMER_API_BASE = "/api/mms/app";
const PRESENTATION_ORIGIN = "https://mms-customer-ui.internal";
const MEMBER_PROFILE_PATH = "/api/mms/app/membership/me";
const MMS_MEMBER_PREBOOKINGS_PATH = "/internal/mms/member/prebookings";
const MMS_INTERNAL_ORIGIN = "https://mms.internal";
const MEMBER_REF_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{2,119}$/;
const PREBOOKING_ID_RE = /^mmspre_[a-f0-9]{24}$/;
const CUSTOMER_UI_SEGMENTS = new Set(["bookings", "payment", "after-service", "profile", "support"]);
const CUSTOMER_API_PATHS = Object.freeze({
  customer: `${CUSTOMER_API_BASE}/customer`,
  bookings: `${CUSTOMER_API_BASE}/bookings`,
  currentBooking: `${CUSTOMER_API_BASE}/bookings/current`,
  therapists: `${CUSTOMER_API_BASE}/therapists`,
  payments: `${CUSTOMER_API_BASE}/payments`,
  afterService: `${CUSTOMER_API_BASE}/after-service`,
  support: `${CUSTOMER_API_BASE}/support`,
});

function normalizePath(value = "/") {
  const clean = String(value || "/").replace(/\/{2,}/g, "/");
  return clean.length > 1 ? clean.replace(/\/+$/g, "") : clean;
}

function requestPath(request) {
  try {
    return normalizePath(new URL(request.url).pathname.toLowerCase());
  } catch (_) {
    return "/";
  }
}

export function isMyMmsCustomerUiRequest(request) {
  const path = requestPath(request);
  if (path === CUSTOMER_UI_PREFIX) return true;
  if (path === `${CUSTOMER_UI_PREFIX}/therapists`) return true;
  for (const segment of CUSTOMER_UI_SEGMENTS) {
    const base = `${CUSTOMER_UI_PREFIX}/${segment}`;
    if (path === base || path.startsWith(`${base}/`)) return true;
  }
  return false;
}

export function isMyMmsCustomerAssetRequest(request) {
  const path = requestPath(request);
  return path.startsWith(CUSTOMER_ASSET_PREFIX);
}

export function isMyMmsCustomerApiRequest(request) {
  const path = requestPath(request);
  return path === CUSTOMER_API_BASE || path.startsWith(`${CUSTOMER_API_BASE}/`);
}

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private, max-age=0",
      "x-content-type-options": "nosniff",
      "x-mmd-worker": WORKER_NAME,
      "x-mmd-route-owner": WORKER_NAME,
      "x-mmd-app": "my-mms-customer",
      ...extraHeaders,
    },
  });
}

function methodNotAllowed(allow) {
  return new Response(null, { status: 405, headers: { allow, "cache-control": "no-store" } });
}

function presentationRequestHeaders(request) {
  const headers = new Headers();
  // Presentation receives no MMD/LINE credentials. The browser talks only to
  // same-origin Worker APIs after the anonymous UI shell is republished.
  for (const name of ["accept", "accept-language", "if-none-match", "if-modified-since", "range", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function presentationResponseHeaders(upstreamHeaders = new Headers(), { html = false, rewritten = false } = {}) {
  const headers = new Headers(upstreamHeaders);
  for (const name of [
    "content-length", "set-cookie", "content-security-policy", "content-security-policy-report-only",
    "reporting-endpoints", "report-to", "nel", "server", "x-powered-by",
  ]) headers.delete(name);
  if (rewritten) {
    for (const name of ["content-encoding", "etag", "last-modified", "content-md5"]) headers.delete(name);
  }
  headers.set("x-mmd-worker", WORKER_NAME);
  headers.set("x-mmd-route-owner", WORKER_NAME);
  headers.set("x-mmd-ui-source", "my-mms-therapist-github-via-cloudflare");
  headers.set("x-mmd-presentation-owner", "MMD-Prive/my-mms-therapist");
  headers.set("x-mmd-behavior-owner", "mmd-workers");
  headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  headers.set("referrer-policy", "same-origin");
  headers.set("x-content-type-options", "nosniff");
  if (html) headers.set("cache-control", "no-store, no-cache, must-revalidate, max-age=0");
  return headers;
}

function presentationUrlForPage(request) {
  const source = new URL(request.url);
  const suffix = source.pathname.slice(CUSTOMER_UI_PREFIX.length);
  const upstream = new URL(PRESENTATION_ORIGIN);
  upstream.pathname = suffix || "/";
  upstream.search = source.search;
  return upstream;
}

function presentationUrlForAsset(request) {
  const source = new URL(request.url);
  const suffix = source.pathname.slice(CUSTOMER_ASSET_PREFIX.length);
  const upstream = new URL(PRESENTATION_ORIGIN);
  if (suffix.startsWith("lovable/")) upstream.pathname = `/__l5e/assets-v1/${suffix.slice("lovable/".length)}`;
  else if (/^(favicon\.(?:ico|svg)|robots\.txt|hype-loader\.png)$/i.test(suffix)) upstream.pathname = `/${suffix}`;
  else upstream.pathname = `/assets/${suffix}`;
  upstream.search = source.search;
  return upstream;
}

export function rewriteMyMmsCustomerHtml(html) {
  let output = String(html || "");
  output = output.replace(/<aside\b[^>]*id=["']lovable-badge["'][\s\S]*?<\/aside>/gi, "");
  output = output.replace(/<script\b[^>]*src=["']\/~flock\.js["'][\s\S]*?<\/script>/gi, "");
  output = output.replace(/<script\b[^>]*src=["']\/__l5e\/events[^"']*["'][\s\S]*?<\/script>/gi, "");
  output = output.replace(/<p\b[^>]*>โหมดตัวอย่างสำหรับออกแบบ[\s\S]*?<\/p>/g, "");
  output = output.replaceAll("/__l5e/assets-v1/", `${CUSTOMER_ASSET_PREFIX}lovable/`);
  output = output.replaceAll("/assets/", CUSTOMER_ASSET_PREFIX);
  output = output.replaceAll("/favicon.ico", `${CUSTOMER_ASSET_PREFIX}favicon.ico`);
  output = output.replaceAll("/favicon.svg", `${CUSTOMER_ASSET_PREFIX}favicon.svg`);
  output = output.replaceAll("/hype-loader.png", `${CUSTOMER_ASSET_PREFIX}hype-loader.png`);

  output = output.replace(/href=(["'])\/\1/g, (_match, quote) => `href=${quote}${CUSTOMER_UI_PREFIX}${quote}`);
  for (const suffix of ["bookings", "therapists", "payment", "after-service", "profile", "support"]) {
    const pattern = new RegExp(`href=(["'])\\/${suffix}([^"']*)\\1`, "g");
    output = output.replace(pattern, (_match, quote, rest) => `href=${quote}${CUSTOMER_UI_PREFIX}/${suffix}${rest}${quote}`);
  }
  return output;
}

function rewriteMyMmsCustomerJavascript(source) {
  return String(source || "")
    // Start's generated client bootstrap overwrites the router's runtime
    // basepath with its build-time root. This bundle is served only at MY MMS.
    .replace(/(\.update\(\{basepath:)(?:``|""|'')(,serializationAdapters:)/g, '$1"/male-massage"$2')
    .replaceAll("/__l5e/assets-v1/", `${CUSTOMER_ASSET_PREFIX}lovable/`)
    .replace(/(["'`])\/assets\//g, `$1${CUSTOMER_ASSET_PREFIX}`)
    .replace(/(["'`])assets\//g, `$1male-massage-assets/`);
}

function rewriteMyMmsCustomerStylesheet(source) {
  return String(source || "").replaceAll("/assets/", CUSTOMER_ASSET_PREFIX);
}

function recoveryHtml() {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>MY MMS · Male Massage</title><style>html,body{margin:0;min-height:100%;background:#f7f6f1;color:#1f2a22;font-family:system-ui,-apple-system,"Noto Sans Thai",sans-serif}main{min-height:100svh;display:grid;place-items:center;padding:24px;box-sizing:border-box}.card{width:min(100%,420px);padding:24px;border:1px solid #e4e6dd;border-radius:24px;background:#fff;box-sizing:border-box}.k{font-size:11px;font-weight:700;letter-spacing:.16em;color:#2f5d43}.t{font-size:21px;font-weight:650;margin:10px 0 8px}.copy{font-size:14px;line-height:1.7;color:#6d7a70}.btn{min-height:48px;margin-top:16px;border-radius:999px;display:flex;align-items:center;justify-content:center;text-decoration:none;font-size:14px;background:#24503a;color:#f7f6f1}.btn.alt{background:#fff;color:#24503a;border:1px solid #dfe4db}</style></head><body><main><section class="card"><div class="k">MY MMS · MALE MASSAGE</div><div class="t">ยังเปิด MY MMS ไม่สำเร็จครับ</div><div class="copy">ระบบจะไม่แสดงข้อมูลการจองที่ยังตรวจสอบไม่ได้ ลองเปิดอีกครั้งได้เลย หรือกลับไปหน้า Male Massage ก่อนครับ</div><a class="btn" href="/male-massage">ลองอีกครั้ง</a><a class="btn alt" href="/male-massage/home">กลับหน้า Male Massage</a></section></main></body></html>`;
}

export async function handleMyMmsCustomerUi(request, env = {}) {
  if (!new Set(["GET", "HEAD"]).has(String(request.method || "GET").toUpperCase())) return methodNotAllowed("GET, HEAD");
  if (requestPath(request) === '/male-massage/support/chat') return new Response(request.method === 'HEAD' ? null : renderMmsDirectChatPage('customer'), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', 'x-mmd-route-owner': WORKER_NAME,
      'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" },
  });

  let upstream;
  try {
    if (!env.MMS_CUSTOMER_UI?.fetch) throw new Error("MMS_PRESENTATION_UNAVAILABLE");
    upstream = await env.MMS_CUSTOMER_UI.fetch(new Request(presentationUrlForPage(request), {
      method: request.method,
      headers: presentationRequestHeaders(request),
      redirect: "follow",
    }));
  } catch (_) {
    return new Response(request.method === "HEAD" ? null : recoveryHtml(), {
      status: 502,
      headers: presentationResponseHeaders(new Headers({ "content-type": "text/html; charset=utf-8" }), { html: true }),
    });
  }

  const contentType = String(upstream.headers.get("content-type") || "").toLowerCase();
  const isHtml = contentType.includes("text/html");
  const headers = presentationResponseHeaders(upstream.headers, { html: isHtml, rewritten: isHtml });
  if (!upstream.ok && isHtml) {
    return new Response(request.method === "HEAD" ? null : recoveryHtml(), {
      status: 502,
      headers: presentationResponseHeaders(new Headers({ "content-type": "text/html; charset=utf-8" }), { html: true }),
    });
  }
  if (request.method === "HEAD") return new Response(null, { status: upstream.status, statusText: upstream.statusText, headers });
  if (isHtml) return new Response(rewriteMyMmsCustomerHtml(await upstream.text()), { status: upstream.status, statusText: upstream.statusText, headers });
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}

export async function handleMyMmsCustomerAsset(request, env = {}) {
  if (!new Set(["GET", "HEAD"]).has(String(request.method || "GET").toUpperCase())) return methodNotAllowed("GET, HEAD");
  const upstreamUrl = presentationUrlForAsset(request);
  let upstream;
  try {
    if (!env.MMS_CUSTOMER_UI?.fetch) throw new Error("MMS_PRESENTATION_UNAVAILABLE");
    upstream = await env.MMS_CUSTOMER_UI.fetch(new Request(upstreamUrl, {
      method: request.method,
      headers: presentationRequestHeaders(request),
      redirect: "follow",
    }));
  } catch (_) {
    return new Response("MY MMS asset unavailable", { status: 502, headers: { "cache-control": "no-store" } });
  }

  const contentType = String(upstream.headers.get("content-type") || "").toLowerCase();
  const isJavascript = contentType.includes("javascript") || upstreamUrl.pathname.endsWith(".js");
  const isStylesheet = contentType.includes("text/css") || upstreamUrl.pathname.endsWith(".css");
  const headers = presentationResponseHeaders(upstream.headers, { rewritten: isJavascript || isStylesheet });
  if (request.method === "HEAD") return new Response(null, { status: upstream.status, statusText: upstream.statusText, headers });
  if (isJavascript) return new Response(rewriteMyMmsCustomerJavascript(await upstream.text()), { status: upstream.status, statusText: upstream.statusText, headers });
  if (isStylesheet) return new Response(rewriteMyMmsCustomerStylesheet(await upstream.text()), { status: upstream.status, statusText: upstream.statusText, headers });
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}

function memberServiceHeaders(request) {
  const headers = new Headers();
  for (const name of ["accept", "accept-language", "cookie", "user-agent", "x-request-id"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

async function readMemberProfile(request, env) {
  if (!env.MMS_MEMBER_WORKER?.fetch) return { status: 503, data: null };
  const url = new URL(request.url);
  url.pathname = MEMBER_PROFILE_PATH;
  url.search = "";
  let response;
  try { response = await env.MMS_MEMBER_WORKER.fetch(new Request(url.toString(), {
    method: "GET",
    headers: memberServiceHeaders(request),
    redirect: "manual",
  })); } catch { return { status: 503, data: null }; }
  const payload = await response.clone().json().catch(() => null);
  if (response.status !== 200) return { status: response.status, data: null };
  const profile = payload?.data?.profile;
  if (!payload?.ok || !payload?.data?.registered || !/^mmsmem_[a-f0-9]{32}$/.test(profile?.member_id || '')) return { status: 409, data: null };
  return { status: 200, data: {
    match_state: 'matched', displayName: profile.display_name,
    lineDisplayName: payload.data.line_display_name,
    memberRef: profile.member_id, memberSince: profile.created_at,
    emailMasked: profile.email || null, emailVerified: false, emailSafeToDisplay: true,
    phoneMasked: profile.phone || null, phoneVerified: false, phoneSafeToDisplay: true,
  } };
}

function safeString(value, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeContact(value, verified, safeToDisplay) {
  const text = safeString(value, 254) || null;
  return {
    value: safeToDisplay === true ? text : null,
    verified: verified === true,
    safeToDisplay: safeToDisplay === true && Boolean(text),
  };
}

function memberSinceLabel(value) {
  const raw = safeString(value, 80);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(raw)) return null;
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok",
  }).format(date);
}

function customerFromProfile(profile) {
  const match = safeString(profile?.match_state, 40).toLowerCase();
  const identityState = match === "matched" ? "verified" : "checking";
  const lineAccountSummary = identityState === "verified"
    ? "เชื่อมต่อบัญชี LINE แล้ว"
    : null;
  return {
    displayName: safeString(profile?.displayName || profile?.member_display_name, 120) || null,
    lineDisplayName: safeString(profile?.lineDisplayName || profile?.line_display_name, 120) || null,
    lineAccountSummary,
    avatarUrl: null,
    identityState,
    customerRefDisplay: safeString(profile?.memberRef || profile?.member_ref, 120) || null,
    language: null,
    email: safeContact(profile?.emailMasked, profile?.emailVerified, profile?.emailSafeToDisplay),
    phone: safeContact(profile?.phoneMasked, profile?.phoneVerified, profile?.phoneSafeToDisplay),
    preferredAreas: [],
    preferredServices: [],
    memberSinceLabel: memberSinceLabel(profile?.memberSince || profile?.member_since),
  };
}

async function readPrebookings(env, memberRef) {
  if (!env.MMS_WORKER?.fetch) return { status: 503, requests: null };
  if (!MEMBER_REF_RE.test(memberRef)) return { status: 409, requests: null };
  const url = new URL(MMS_MEMBER_PREBOOKINGS_PATH, MMS_INTERNAL_ORIGIN);
  url.searchParams.set("member_ref", memberRef);
  const response = await env.MMS_WORKER.fetch(new Request(url.toString(), {
    method: "GET",
    headers: { accept: "application/json" },
  }));
  const payload = await response.clone().json().catch(() => null);
  return {
    status: response.status,
    requests: Array.isArray(payload?.data?.requests) ? payload.data.requests : null,
  };
}

function bookingStatus(value) {
  const state = safeString(value, 64).toLowerCase();
  if (state === "confirmed") return "confirmed";
  if (state === "completed") return "completed";
  if (state === "cancelled") return "cancelled";
  if (["received", "coordination_pending", "matching", "waiting_customer", "action_required", "reviewing"].includes(state)) return "pending";
  return "checking";
}

function bookingFromRequest(record) {
  const id = safeString(record?.prebooking_id || record?.request_id, 80).toLowerCase();
  if (!PREBOOKING_ID_RE.test(id)) return null;
  const rawStatus = safeString(record?.status, 64).toLowerCase();
  const date = safeString(record?.service_date, 16);
  const time = safeString(record?.service_time, 8);
  const skills = Array.isArray(record?.skills)
    ? record.skills.map((item) => safeString(item, 80)).filter(Boolean).slice(0, 8)
    : [];
  const needsAttention = ["waiting_customer", "action_required"].includes(rawStatus);
  return {
    id,
    refDisplay: id,
    serviceLabel: skills.join(" · ") || "Male Massage",
    scheduledLabel: [date, time].filter(Boolean).join(" · ") || null,
    durationLabel: null,
    areaLabel: safeString(record?.zone, 120) || null,
    therapist: null,
    status: bookingStatus(rawStatus),
    travelStatus: record?.travel_status === "en_route" ? "en_route" : record?.travel_status === "checking" ? "checking" : null,
    etaMinutes: Number.isInteger(record?.eta_minutes) && record.eta_minutes > 0 ? record.eta_minutes : null,
    paymentState: "checking",
    amountSummary: null,
    nextAction: needsAttention
      ? { kind: "contact_support", label: "ติดต่อทีมงาน Male Massage", url: "https://lin.ee/NkfXMu7" }
      : null,
    needsAttention,
  };
}

async function memberAndPrebookings(request, env) {
  const profile = await readMemberProfile(request, env);
  if (profile.status === 401) return { error: json({ ok: false, error: { code: "MMS_SESSION_REQUIRED" } }, 401) };
  if (profile.status !== 200 || !profile.data) {
    return { error: json({ ok: false, error: { code: "MMS_MEMBER_CONTEXT_UNAVAILABLE" } }, 503) };
  }
  const memberRef = safeString(profile.data.memberRef || profile.data.member_ref, 120);
  if (!MEMBER_REF_RE.test(memberRef)) {
    return { error: json({ ok: false, error: { code: "MMS_MEMBER_LINK_CHECKING" } }, 409) };
  }
  const read = await readPrebookings(env, memberRef);
  if (read.status !== 200 || !read.requests) {
    return { error: json({ ok: false, error: { code: "MMS_BOOKINGS_UNAVAILABLE" } }, read.status === 401 ? 401 : 503) };
  }
  return { profile: profile.data, requests: read.requests };
}

function currentBooking(bookings) {
  return bookings.find((item) => item && !["completed", "cancelled"].includes(item.status)) || null;
}

function unavailableContract(name) {
  return json({ ok: false, error: { code: "MMS_CUSTOMER_CONTRACT_CHECKING", feature: name } }, 503);
}

function searchUnavailable(code = "MMS_SEARCH_UPSTREAM_UNAVAILABLE") {
  return json({ ok: false, error: { code } }, 503);
}

export async function handleMyMmsCustomerApi(request, env = {}) {
  const method = String(request.method || "GET").toUpperCase();
  const path = requestPath(request);

  if (path === `${CUSTOMER_API_BASE}/chat` || path.startsWith(`${CUSTOMER_API_BASE}/chat/`)) {
    if (!['GET', 'POST'].includes(method)) return methodNotAllowed('GET, POST');
    if (method === 'POST' && !new Set(['https://mmdbkk.com', 'https://www.mmdbkk.com']).has(request.headers.get('origin'))) return json({ ok: false, error: { code: 'ORIGIN_NOT_ALLOWED' } }, 403);
    const profile = await readMemberProfile(request, env);
    if (profile.status === 401) return json({ ok: false, error: { code: 'MMS_SESSION_REQUIRED' } }, 401);
    if (profile.status !== 200 || !profile.data) return json({ ok: false, error: { code: 'MMS_MEMBER_CONTEXT_UNAVAILABLE' } }, 503);
    if (!env.MMS_WORKER?.fetch) return json({ ok: false, error: { code: 'MMS_CHAT_UNAVAILABLE' } }, 503);
    const target = new URL(request.url);
    target.protocol = 'https:'; target.host = 'mms.internal';
    target.pathname = '/internal/mms/chat/customer' + path.slice(`${CUSTOMER_API_BASE}/chat`.length);
    const headers = new Headers({ accept: 'application/json', 'x-mms-chat-member-ref': profile.data.memberRef });
    for (const name of ['origin', 'content-type']) if (request.headers.has(name)) headers.set(name, request.headers.get(name));
    try {
      const upstream = await env.MMS_WORKER.fetch(new Request(target, { method, headers, ...(method === 'POST' ? { body: request.body, duplex: 'half' } : {}), redirect: 'manual' }));
      const responseHeaders = new Headers(upstream.headers);
      responseHeaders.set('cache-control', 'private, no-store'); responseHeaders.set('x-mmd-route-owner', WORKER_NAME);
      return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
    } catch { return json({ ok: false, error: { code: 'MMS_CHAT_UNAVAILABLE' } }, 503); }
  }

  if (path === CUSTOMER_API_PATHS.customer) {
    if (method !== "GET") return methodNotAllowed("GET");
    const profile = await readMemberProfile(request, env);
    if (profile.status === 401) return json({ ok: false, error: { code: "MMS_SESSION_REQUIRED" } }, 401);
    if (profile.status !== 200 || !profile.data) return json({ ok: false, error: { code: "MMS_MEMBER_CONTEXT_UNAVAILABLE" } }, 503);
    return json({ ok: true, data: customerFromProfile(profile.data) });
  }

  if (path === CUSTOMER_API_PATHS.bookings || path === CUSTOMER_API_PATHS.currentBooking || path.startsWith(`${CUSTOMER_API_PATHS.bookings}/`)) {
    if (method !== "GET") return methodNotAllowed("GET");
    const context = await memberAndPrebookings(request, env);
    if (context.error) return context.error;
    const bookings = context.requests.map(bookingFromRequest).filter(Boolean);
    if (path === CUSTOMER_API_PATHS.bookings) return json({ ok: true, data: bookings });
    if (path === CUSTOMER_API_PATHS.currentBooking) return json({ ok: true, data: currentBooking(bookings) });
    let id = "";
    try {
      id = decodeURIComponent(path.slice(`${CUSTOMER_API_PATHS.bookings}/`.length));
    } catch (_) {
      return json({ ok: false, error: { code: "MMS_BOOKING_ID_INVALID" } }, 400);
    }
    if (!PREBOOKING_ID_RE.test(id)) return json({ ok: false, error: { code: "MMS_BOOKING_ID_INVALID" } }, 400);
    const booking = bookings.find((item) => item.id === id);
    if (!booking) return json({ ok: false, error: { code: "MMS_BOOKING_NOT_FOUND" } }, 404);
    return json({ ok: true, data: { ...booking, timeline: [], payment: null, operatorNote: null } });
  }

  if (path === `${CUSTOMER_API_PATHS.therapists}/search` || path === `${CUSTOMER_API_PATHS.therapists}/search/catalog`) {
    if (method !== 'GET') return methodNotAllowed('GET');
    const profile = await readMemberProfile(request, env);
    if (profile.status === 401 || profile.status === 403) return json({ ok: false, error: { code: profile.status === 401 ? 'MMS_SESSION_REQUIRED' : 'MMS_ACCESS_DENIED' } }, profile.status);
    if (profile.status === 409) return json({ ok: false, error: { code: 'MMS_MEMBER_LINK_CHECKING' } }, 409);
    if (profile.status !== 200 || !/^mmsmem_[a-f0-9]{32}$/.test(profile.data?.memberRef || '')) return json({ ok: false, error: { code: 'MMS_MEMBER_CONTEXT_UNAVAILABLE' } }, 503);
    if (!env.MMS_WORKER?.fetch) return searchUnavailable();
    const target = new URL(request.url);
    target.protocol = 'https:'; target.host = 'mms.internal';
    target.pathname = '/internal/mms/customer-search' + (path.endsWith('/catalog') ? '/catalog' : '');
    try {
      const upstream = await env.MMS_WORKER.fetch(new Request(target, {
        method: 'GET', headers: { accept: 'application/json', 'x-mms-customer-member-ref': profile.data.memberRef },
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(8000)]), redirect: 'manual',
      }));
      if (![200, 400, 401, 403, 409, 503].includes(upstream.status)) return searchUnavailable();
      const body = await upstream.json();
      if (typeof body?.ok !== 'boolean' || (upstream.status === 200 && body.ok !== true)) return searchUnavailable('MMS_SEARCH_RESPONSE_INVALID');
      if (upstream.status === 200) {
        const data = body.data;
        const catalog = path.endsWith('/catalog');
        if (!data || typeof data !== 'object' || (catalog
          ? !Array.isArray(data.services) || !data.services.length || !Array.isArray(data.zones) || !data.zones.length || !Array.isArray(data.availability) || !data.availability.length
          : !Array.isArray(data.results) || !data.criteria || typeof data.checkedAt !== 'string'))
          return searchUnavailable('MMS_SEARCH_RESPONSE_INVALID');
      }
      return json(body, upstream.status);
    } catch { return searchUnavailable(); }
  }

  if (path === CUSTOMER_API_PATHS.therapists || path.startsWith(`${CUSTOMER_API_PATHS.therapists}/`)) return unavailableContract("therapists");
  if (path === CUSTOMER_API_PATHS.payments) return unavailableContract("payments");
  if (path === CUSTOMER_API_PATHS.afterService) return unavailableContract("after-service");
  if (path === CUSTOMER_API_PATHS.support) return unavailableContract("support");
  return json({ ok: false, error: { code: "MMS_CUSTOMER_ROUTE_NOT_FOUND" } }, 404);
}

export const MY_MMS_CUSTOMER_INTERNALS = Object.freeze({
  bookingFromRequest,
  customerFromProfile,
  isMyMmsCustomerApiRequest,
  isMyMmsCustomerAssetRequest,
  isMyMmsCustomerUiRequest,
  rewriteMyMmsCustomerHtml,
});
