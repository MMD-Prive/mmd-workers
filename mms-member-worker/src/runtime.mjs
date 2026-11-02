import { memberPage, privacyPage } from './member-page.mjs';

export const STAGES = Object.freeze({
  developing: { channel: '2011388355', liff: '2011388355-vspjKK62' },
  review: { channel: '2011388356', liff: '2011388356-D15MQyj9' },
  published: { channel: '2011388357', liff: '2011388357-ft2o17gf' },
});
export const NOTICE_VERSION = 'mms-account-2026-10-17';
const BASE = '/api/mms/app/membership';
const PAGE = '/male-massage/member';
const TTL = 8 * 60 * 60 * 1000;
const MAX_BODY = 16_384;
const ORIGINS = new Set(['https://mmdbkk.com', 'https://www.mmdbkk.com']);

export async function handleMemberRequest(request, env = {}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '');
  if (path === PAGE || path === `${PAGE}/privacy`) {
    if (!['GET', 'HEAD'].includes(request.method)) return json({ ok: false }, 405, { allow: 'GET, HEAD' });
    return new Response(request.method === 'HEAD' ? null : path.endsWith('/privacy') ? privacyPage() : memberPage(), {
      headers: {
        ...securityHeaders(), 'content-type': 'text/html; charset=utf-8',
        'content-security-policy': "default-src 'none'; script-src 'self' 'unsafe-inline' https://static.line-scdn.net; connect-src 'self' https://*.line.me https://*.line-scdn.net https://*.line.biz; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://*.line-scdn.net https://cdn.prod.website-files.com; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      },
    });
  }
  if (!path.startsWith(`${BASE}/`)) return json({ ok: false, error: { code: 'NOT_FOUND' } }, 404);
  try {
    if ([...url.searchParams.keys()].some(key => key !== 'stage') || url.searchParams.getAll('stage').length > 1) fail(400, 'MMS_QUERY_INVALID');
    const stage = url.searchParams.get('stage') || 'published';
    if (!Object.hasOwn(STAGES, stage)) fail(400, 'MMS_STAGE_INVALID');
    const action = path.slice(BASE.length + 1);
    const methods = { config: 'GET', line: 'POST', me: 'GET', register: 'POST', profile: 'PUT', logout: 'POST' };
    if (!Object.hasOwn(methods, action)) fail(404, 'NOT_FOUND');
    if (request.method !== methods[action]) return json({ ok: false, error: { code: 'METHOD_NOT_ALLOWED' } }, 405, { allow: methods[action] });
    if (request.method !== 'GET') requireOrigin(request);
    if (action === 'config') return json({ ok: true, data: {
      stage, liff_id: STAGES[stage].liff, miniapp_url: `https://miniapp.line.me/${STAGES[stage].liff}`,
      notice_version: NOTICE_VERSION, service: 'male_massage',
    } });
    if (!env.MMS_MEMBER_ACCOUNTS?.getByName) fail(503, 'MMS_STORAGE_UNAVAILABLE');
    const cookieName = `__Host-mms_customer_${stage}`;
    if (action === 'line') {
      const body = await readJson(request);
      onlyKeys(body, ['id_token', 'access_token']);
      const identity = await verifyLine(body, stage);
      const key = await sha256(`male-massage-customer-v1:${stage}:2005499394:${identity.subject}`);
      const token = randomToken();
      const digest = await sha256(token);
      const data = await env.MMS_MEMBER_ACCOUNTS.getByName(`${stage}:${key}`).openSession(digest, identity.name, Date.now(), TTL);
      return json({ ok: true, data }, 200, { 'set-cookie': cookie(cookieName, `${key}.${token}`, TTL / 1000) });
    }
    const session = await sessionContext(request, env, cookieName, stage);
    if (action === 'logout') {
      // Idempotent logout remains usable after expiry and revokes the stored token.
      if (session) await session.stub.logout(session.digest);
      return json({ ok: true }, 200, { 'set-cookie': cookie(cookieName, '', 0) });
    }
    if (!session) fail(401, 'MMS_SESSION_REQUIRED');
    if (action === 'me') {
      const data = await session.stub.view(session.digest, Date.now());
      if (!data) fail(401, 'MMS_SESSION_REQUIRED');
      return json({ ok: true, data });
    }
    const body = await readJson(request);
    onlyKeys(body, ['display_name', 'phone', 'email', 'language', 'marketing_consent', 'notice_version', 'account_consent']);
    if (action === 'register' && (body.account_consent !== true || body.notice_version !== NOTICE_VERSION)) fail(400, 'MMS_ACCOUNT_CONSENT_REQUIRED');
    const profile = validateProfile(body);
    const data = await session.stub.saveProfile(session.digest, profile, action === 'register', Date.now(), NOTICE_VERSION);
    if (data?.error) fail(data.error === 'MMS_SESSION_REQUIRED' ? 401 : 409, data.error);
    return json({ ok: true, data });
  } catch (error) {
    return json({ ok: false, error: { code: error.publicCode || 'MMS_SERVICE_UNAVAILABLE' } }, error.httpStatus || 503);
  }
}

async function verifyLine(body, stage) {
  const idToken = body.id_token;
  const accessToken = body.access_token;
  if (Boolean(idToken) === Boolean(accessToken)) fail(400, 'MMS_LINE_TOKEN_REQUIRED');
  const token = idToken || accessToken;
  if (typeof token !== 'string' || token.length < 16 || token.length > 12_000 || /\s/.test(token)) fail(400, 'MMS_LINE_TOKEN_INVALID');
  const expected = STAGES[stage].channel;
  if (idToken) {
    const result = await lineJson('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: expected }),
    });
    const now = Date.now() / 1000;
    if (result.aud !== expected || result.iss !== 'https://access.line.me' || !Number.isFinite(result.exp) || result.exp <= now || !Number.isFinite(result.iat) || result.iat > now + 300) fail(401, 'MMS_LINE_TOKEN_INVALID');
    if (!/^U[a-f0-9]{32}$/i.test(result.sub || '')) fail(401, 'MMS_LINE_TOKEN_INVALID');
    return { subject: result.sub, name: safeName(result.name || '') };
  }
  const verified = await lineJson(`https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(accessToken)}`);
  if (verified.client_id !== expected || !Number.isFinite(verified.expires_in) || verified.expires_in <= 0) fail(401, 'MMS_LINE_TOKEN_INVALID');
  const profile = await lineJson('https://api.line.me/v2/profile', { headers: { authorization: `Bearer ${accessToken}` } });
  if (!/^U[a-f0-9]{32}$/i.test(profile.userId || '')) fail(401, 'MMS_LINE_TOKEN_INVALID');
  return { subject: profile.userId, name: safeName(profile.displayName || '') };
}

async function lineJson(url, init = {}) {
  let response;
  // Workers supports manual/follow, not the browser's redirect="error".
  // Reject redirects explicitly so credentials never follow a changed endpoint.
  try { response = await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(8000) }); }
  catch { fail(503, 'MMS_LINE_UNAVAILABLE'); }
  if (response.status >= 300 && response.status < 400) fail(503, 'MMS_LINE_UNAVAILABLE');
  if (!response.ok) fail(response.status >= 500 || response.status === 429 ? 503 : 401, response.status >= 500 || response.status === 429 ? 'MMS_LINE_UNAVAILABLE' : 'MMS_LINE_TOKEN_INVALID');
  try { return await response.json(); } catch { fail(503, 'MMS_LINE_UNAVAILABLE'); }
}

async function sessionContext(request, env, name, stage) {
  const raw = (request.headers.get('cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${name}=`))?.slice(name.length + 1) || '';
  if (!/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(raw)) return null;
  const [key, token] = raw.split('.');
  return { stub: env.MMS_MEMBER_ACCOUNTS.getByName(`${stage}:${key}`), digest: await sha256(token) };
}
function requireOrigin(request) {
  const origin = request.headers.get('origin');
  if (!ORIGINS.has(origin) || origin !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') fail(403, 'MMS_ORIGIN_REJECTED');
}
function validateProfile(body) {
  if (typeof body.display_name !== 'string' || !body.display_name.trim() || body.display_name.length > 100 || /[\u0000-\u001f\u007f]/.test(body.display_name)) fail(400, 'MMS_NAME_INVALID');
  const phone = body.phone ?? '';
  const email = body.email ?? '';
  if (typeof phone !== 'string' || phone.length > 30 || (phone && !/^\+?[0-9 ()-]{7,30}$/.test(phone))) fail(400, 'MMS_PHONE_INVALID');
  if (typeof email !== 'string' || email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) fail(400, 'MMS_EMAIL_INVALID');
  if (!['th', 'en'].includes(body.language ?? 'th')) fail(400, 'MMS_LANGUAGE_INVALID');
  if (body.marketing_consent !== undefined && typeof body.marketing_consent !== 'boolean') fail(400, 'MMS_MARKETING_CONSENT_INVALID');
  return { display_name: body.display_name.trim(), phone: phone.trim(), email: email.trim(), language: body.language ?? 'th', marketing_consent: body.marketing_consent === true };
}
function safeName(value) { return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 100) : ''; }
function onlyKeys(body, keys) { if (Object.keys(body).some(k => !keys.includes(k))) fail(400, 'MMS_FIELDS_INVALID'); }
async function readJson(request) {
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) fail(415, 'MMS_JSON_REQUIRED');
  if (Number(request.headers.get('content-length')) > MAX_BODY) fail(413, 'MMS_BODY_TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'MMS_BODY_INVALID');
  let bytes = 0;
  const chunks = [];
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_BODY) { await reader.cancel(); fail(413, 'MMS_BODY_TOO_LARGE'); }
      chunks.push(part.value);
    }
    const data = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
    const body = JSON.parse(new TextDecoder().decode(data));
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'MMS_BODY_INVALID');
    return body;
  } catch (error) { if (error.publicCode) throw error; fail(400, 'MMS_BODY_INVALID'); }
}
async function sha256(text) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), b => b.toString(16).padStart(2, '0')).join(''); }
function randomToken() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join(''); }
function cookie(name, value, maxAge) { return `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`; }
function fail(status, code) { throw Object.assign(new Error(code), { httpStatus: status, publicCode: code }); }
function securityHeaders() { return { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-mms-app': 'my-mms-membership' }; }
function json(body, status = 200, headers = {}) { return Response.json(body, { status, headers: { ...securityHeaders(), ...headers } }); }
