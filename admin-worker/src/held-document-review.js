import { readCredentialBoundAdminActor, getCredentialBoundAdminLoginCredential } from './credential-bound-admin-session.js';
import { projectPaymentCustomerRename } from '../../member-dashboard-chat-worker/src/payment-proof-intelligence.mjs';

export const HELD_DOCUMENT_API = '/v1/admin/payments/held-images';
const PREFIXES = ['line-ofc/held-evidence-review/', 'line-ofc/held-evidence/'];
const IMAGE_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_MANIFEST = 64 * 1024;
const PAGE_SIZE = 8;
const clean = value => String(value ?? '').trim();
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9_:-]{4,120}$/.test(value);
const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex, nofollow', 'content-security-policy': "default-src 'none'; frame-ancestors 'none'; sandbox" };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } });

export function isHeldDocumentRequest(request) {
  const url = new URL(request.url);
  return url.pathname === HELD_DOCUMENT_API || url.pathname === `${HELD_DOCUMENT_API}/image`
    || (url.pathname === '/internal/admin/payments' && url.searchParams.get('view') === 'held-images');
}

// Deliberately before contact backfill and other background work in the admin entry.
// Only a credential-bound browser admin may read; service credentials never qualify.
export async function handleHeldDocumentRequest(request, env, renderPage) {
  const url = new URL(request.url);
  const page = url.pathname === '/internal/admin/payments';
  if (request.headers.has('authorization') || request.headers.has('x-confirm-key')) return json({ ok: false, error: 'browser_admin_session_required' }, 403);
  const origin = request.headers.get('origin');
  if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') return json({ ok: false, error: 'forbidden_origin' }, 403);
  const actor = await readCredentialBoundAdminActor(request, env);
  if (!actor) {
    if (!page || request.method === 'HEAD') return json({ ok: false, error: 'unauthorized' }, 401);
    const login = new URL('/internal/admin/login', url.origin);
    login.searchParams.set('next', '/internal/admin/payments?view=held-images');
    return new Response(null, { status: 303, headers: { ...headers, location: login.href } });
  }
  if (!['owner', 'admin'].includes(actor.role)) return json({ ok: false, error: 'forbidden_role' }, 403);
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405, headers: { ...headers, allow: 'GET, HEAD' } });
  if (page) return renderPage(request);
  if (!env.LINE_SLIP_EVIDENCE || typeof env.LINE_SLIP_EVIDENCE.list !== 'function') return json({ ok: false, error: 'held_store_unavailable' }, 503);
  try {
    const key = await tokenKey(env);
    if (url.pathname.endsWith('/image')) return await imageResponse(request, env.LINE_SLIP_EVIDENCE, key, actor);
    const result = await listDocuments(url, env, key, actor);
    return request.method === 'HEAD' ? new Response(null, { headers: { ...headers, 'content-type': 'application/json' } }) : json(result);
  } catch (error) {
    return json({ ok: false, error: error?.message === 'invalid_reference' ? 'invalid_reference' : 'held_review_unavailable' }, error?.message === 'invalid_reference' ? 400 : 503);
  }
}

async function tokenKey(env) {
  const credential = getCredentialBoundAdminLoginCredential(env);
  if (!credential) throw new Error('token_key_unavailable');
  const secret = clean(env.ADMIN_SESSION_SECRET || env.SESSION_SECRET);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`held-documents-v1\n${secret}\n${credential}`));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
function encode(bytes) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }
function decode(text) {
  if (!/^[A-Za-z0-9_-]{20,6000}$/.test(text)) throw new Error('invalid_reference');
  return Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - text.length % 4) % 4)), c => c.charCodeAt(0));
}
async function seal(key, actor, kind, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = new TextEncoder().encode(JSON.stringify({ ...data, kind, actor: actor.id, exp: Math.min(actor.exp, Date.now() + 15 * 60 * 1000) }));
  const bytes = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('held-documents-v1') }, key, payload));
  return encode(new Uint8Array([...iv, ...bytes]));
}
async function open(key, actor, kind, token) {
  try {
    const bytes = decode(token);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: new TextEncoder().encode('held-documents-v1') }, key, bytes.slice(12));
    const payload = JSON.parse(new TextDecoder().decode(plain));
    if (payload.kind !== kind || payload.actor !== actor.id || !Number.isFinite(payload.exp) || payload.exp <= Date.now()) throw 0;
    return payload;
  } catch { throw new Error('invalid_reference'); }
}

async function manifest(bucket, phase, id) {
  if (![0, 1].includes(phase) || !safeId(id)) throw new Error('invalid_reference');
  const object = await bucket.get(`${PREFIXES[phase]}${id}/state.json`);
  if (!object) return null;
  if (!Number.isFinite(object.size) || object.size > MAX_MANIFEST) throw new Error('manifest_invalid');
  const value = JSON.parse(await object.text());
  if (value?.schema !== 'line_held_payment_evidence_v1' || value.proof_id !== id || value.evidence_only !== true) throw new Error('manifest_invalid');
  return value;
}
function imageKey(state, phase) {
  const type = IMAGE_TYPES[state.extension];
  if (!type || !safeId(state.proof_id)) return null;
  const key = `${PREFIXES[phase]}${state.proof_id}/original.${state.extension}`;
  if (state.original_key && state.original_key !== key) return null;
  return { key, type };
}
function reasonCode(state) {
  if (state.terminal_outcome === 'promoted_to_payment_proof') return 'promoted';
  if (state.terminal_outcome === 'rejected_non_payment') return 'non_payment';
  if (state.terminal_outcome) return 'manual_review';
  if (state.hold_reason === 'automated_extraction_disabled_document_review') return 'not_extracted';
  if (/extract|ocr|unreadable/.test(state.hold_reason || '')) return 'extraction_unavailable';
  return 'unclassified';
}
async function listDocuments(url, env, key, actor) {
  let cursor = { phase: 0, cursor: '' };
  if (url.searchParams.has('cursor')) cursor = await open(key, actor, 'cursor', url.searchParams.get('cursor'));
  if (![0, 1].includes(cursor.phase) || typeof cursor.cursor !== 'string' || cursor.cursor.length > 2000) throw new Error('invalid_reference');
  const prefix = PREFIXES[cursor.phase];
  const bucket = env.LINE_SLIP_EVIDENCE;
  const page = await bucket.list({ prefix, delimiter: '/', limit: PAGE_SIZE, ...(cursor.cursor ? { cursor: cursor.cursor } : {}) });
  const dirs = page.delimitedPrefixes || [];
  if (dirs.length > PAGE_SIZE) throw new Error('listing_invalid');
  const items = [];
  const identityCache = new Map();
  for (const dir of dirs) {
    if (!dir.startsWith(prefix) || !dir.endsWith('/')) continue;
    const id = dir.slice(prefix.length, -1);
    if (!safeId(id)) continue;
    // The retained manifest is authoritative for this view; do not show a second
    // active-queue entry for the same document.
    if (cursor.phase === 1 && await bucket.head(`${PREFIXES[0]}${id}/state.json`)) continue;
    let state;
    try { state = await manifest(bucket, cursor.phase, id); } catch { state = null; }
    if (!state) {
      items.push({ reference: id, customer: null, identity_state: 'unresolved', reason: 'metadata_unavailable', received_at: null, image_url: null });
      continue;
    }
    const uid = clean(state.private?.line_user_id);
    if (!identityCache.has(uid)) identityCache.set(uid, resolveCustomer(env, uid));
    const identity = await identityCache.get(uid);
    const token = imageKey(state, cursor.phase) ? await seal(key, actor, 'image', { phase: cursor.phase, id }) : null;
    items.push({ reference: id, ...identity, reason: reasonCode(state), retention_state: cursor.phase === 0 ? 'retained_pending_policy' : 'legacy_retention_policy', received_at: Number.isFinite(state.created_at_ms) && state.created_at_ms > 0 && state.created_at_ms < 8640000000000000 ? new Date(state.created_at_ms).toISOString() : null,
      image_url: token ? `${HELD_DOCUMENT_API}/image?id=${encodeURIComponent(token)}` : null, evidence_status: 'held_document_not_verified_payment' });
  }
  let next = null;
  if (page.truncated) {
    if (!page.cursor) throw new Error('listing_invalid');
    next = { phase: cursor.phase, cursor: page.cursor };
  } else if (cursor.phase === 0) next = { phase: 1, cursor: '' };
  return { ok: true, items, next_cursor: next ? await seal(key, actor, 'cursor', next) : null, read_only: true };
}

async function imageResponse(request, bucket, key, actor) {
  const token = new URL(request.url).searchParams.get('id') || '';
  const ref = await open(key, actor, 'image', token);
  const state = await manifest(bucket, ref.phase, ref.id);
  if (!state) return json({ ok: false, error: 'image_unavailable' }, 404);
  const image = imageKey(state, ref.phase);
  if (!image) return json({ ok: false, error: 'image_type_not_supported' }, 415);
  const object = await bucket.get(image.key);
  if (!object || !object.body) return json({ ok: false, error: 'image_unavailable' }, 404);
  if (!Number.isFinite(object.size) || object.size <= 0 || object.size > MAX_IMAGE || object.httpMetadata?.contentType !== image.type) return json({ ok: false, error: 'image_type_not_supported' }, 415);
  return new Response(request.method === 'HEAD' ? null : object.body, { headers: { ...headers, 'content-type': image.type, 'content-length': String(object.size), 'content-disposition': `inline; filename="held-document.${state.extension}"` } });
}

async function query(env, table, formula, fields) {
  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}`);
  url.searchParams.set('filterByFormula', formula);
  url.searchParams.set('maxRecords', '2');
  for (const field of fields) url.searchParams.append('fields[]', field);
  const response = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` }, signal: AbortSignal.timeout(900) });
  if (!response.ok) throw new Error('identity_unavailable');
  const data = await response.json();
  if (!Array.isArray(data.records) || data.offset) throw new Error('identity_unavailable');
  return data.records;
}
async function resolveCustomer(env, uid) {
  const unknown = { customer: null, identity_state: 'unresolved' };
  if (!/^U[a-f0-9]{32}$/i.test(uid) || !env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return unknown;
  try {
    const clients = await query(env, env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS || 'Clients', `{line_user_id}='${uid}'`, ['line_user_id']);
    if (clients.length !== 1 || clients[0]?.fields?.line_user_id !== uid) return { ...unknown, identity_state: clients.length > 1 ? 'ambiguous' : 'unresolved' };
    const staging = await query(env, env.AIRTABLE_TABLE_PRIVATE_CUSTOMERS_STAGING_ID || 'tblOs8yyLK09SKrCt', `AND({LINE User ID}='${uid}',{Import ID}='line_ofc_per_rename_v1_${uid.toLowerCase()}')`, ['LINE User ID', 'Import ID', 'Source Hash', 'Canonical Client', 'Current LINE Rename']);
    const rename = projectPaymentCustomerRename(staging, uid, clients[0].id);
    // No name-only fallback and no read-repair/profile endpoint calls.
    const name = rename?.per_rename || '';
    // Even a source-bound display field must not disclose a pasted contact or
    // credential in the queue. Dates/normal nicknames remain display-only.
    if (!name || /[\r\n\t<>@]/u.test(name) || /https?:|www\.|\b(?:bearer|authorization|password|secret|token|cookie)\b|\bsk-/iu.test(name)
      || /\d{6,}|\bU[a-f0-9]{32}\b|\brec[A-Za-z0-9]{14}\b/i.test(name) || name.replace(/\D/g, '').length >= 7) return unknown;
    return { customer: name, identity_state: 'exact_line_client_per_rename_v1' };
  } catch { return { ...unknown, identity_state: 'lookup_unavailable' }; }
}
