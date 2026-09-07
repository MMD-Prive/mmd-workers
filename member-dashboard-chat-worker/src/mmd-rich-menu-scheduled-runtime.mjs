import { resolveMemberEntitlements } from "../../auth-worker/src/member-entitlement-resolver.js";

const LINE_API = "https://api.line.me/v2/bot";
const LINE_DATA_API = "https://api-data.line.me/v2/bot";
const CLIENTS_TABLE = "tblVv58TCbwh5j1fS";
const ENTITLEMENTS_TABLE = "tblNImdF9PKAxhXGi";
const LIFF_ID = "2010862595-yT4DCEMc";
const MAX_IMAGE_BYTES = 1024 * 1024;
const SYNC_PATH = "/v1/internal/line/rich-menu/sync";
const VERSION = "mmd-rm3-20260908-v1";
const ROOT = "https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90";

function clean(v) { return String(v == null ? "" : v).trim(); }
function token(v) { return clean(v).toLowerCase().replace(/[\s-]+/g, "_"); }
function json(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }); }
function uri(label, value) { return { type: "uri", label, uri: value }; }
function msg(label, value) { return { type: "message", label, text: value }; }
function site(path, entry) { const u = new URL(path, "https://mmdbkk.com"); u.searchParams.set("source", "line"); u.searchParams.set("entry_route", entry); return u.toString(); }
function liff() { return `https://liff.line.me/${LIFF_ID}?intent=status&view=profile`; }

const MENUS = Object.freeze({
  guest: {
    name: `MMD Guest ${VERSION}`,
    frame: { left: .49, top: .16, right: .985, bottom: .75 },
    images: [
      `${ROOT}/6a9ef89d2b35f4308fb3de8e_Rich%20Menu%20Guest-p-1080.png`,
      `${ROOT}/6a9ef89d2b35f4308fb3de8e_Rich%20Menu%20Guest-p-800.png`,
    ],
    actions: [
      uri("START HERE", site("/public/access", "rich_menu_guest")),
      uri("PUBLIC MODELS", site("/profiles", "rich_menu_guest_models")),
      uri("BOOKING", site("/booking", "rich_menu_guest_booking")),
      uri("PUBLIC SERVICES", site("/services/companion", "rich_menu_guest_services")),
      uri("ABOUT MMD", site("/tmib", "rich_menu_guest_about")),
      msg("SUPPORT", "Hi Per"),
    ],
  },
  public: {
    name: `MMD Public ${VERSION}`,
    frame: { left: .45, top: .215, right: .99, bottom: .755 },
    images: [
      `${ROOT}/6a9ef89d845a6bc6a34f52c2_Rich%20Menu%20Public-p-1080.png`,
      `${ROOT}/6a9ef89d845a6bc6a34f52c2_Rich%20Menu%20Public-p-800.png`,
    ],
    actions: [
      msg("คุยกับ PER", "Hi Per"),
      uri("PUBLIC MODELS", site("/profiles", "rich_menu_public_models")),
      uri("BOOKING", site("/booking", "rich_menu_public_booking")),
      uri("MY MMD", liff()),
      uri("PRIVE ACCESS", site("/member/membership", "rich_menu_prive_access")),
      msg("SUPPORT", "Support"),
    ],
  },
  private: {
    name: `MMD Private ${VERSION}`,
    frame: { left: .0, top: .0, right: 1, bottom: 1 },
    images: [
      `${ROOT}/6a9ef89de09b20e8750bdf5d_Rich%20Menu%20Private-p-1080.png`,
      `${ROOT}/6a9ef89de09b20e8750bdf5d_Rich%20Menu%20Private-p-800.png`,
    ],
    actions: [
      msg("KENJI AI", "Hi Kenji"),
      uri("MODEL CARDS", site("/member/private", "rich_menu_model_cards")),
      uri("BOOKING", site("/booking", "rich_menu_private_booking")),
      uri("MY MMD", liff()),
      uri("PRIVE UPDATE", site("/member/private", "rich_menu_prive_update")),
      msg("SUPPORT", "Support"),
    ],
  },
});

export function bangkokHour(now = new Date()) { return new Date(now.getTime() + 7 * 3600_000).getUTCHours(); }
export function isMmdRichMenuHidden(now = new Date()) { const h = bangkokHour(now); return h >= 16 && h < 23; }

function pngSize(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 24) return null;
  const b = new Uint8Array(buffer, 0, 8); const sig = [137,80,78,71,13,10,26,10];
  if (sig.some((v, i) => b[i] !== v)) return null;
  const d = new DataView(buffer); return { width: d.getUint32(16, false), height: d.getUint32(20, false) };
}

function area(width, height, frame, index) {
  const col = index % 3, row = Math.floor(index / 3);
  const x0 = Math.round(width * frame.left), x1 = Math.round(width * frame.right);
  const y0 = Math.round(height * frame.top), y1 = Math.round(height * frame.bottom);
  const xs = x0 + Math.round((x1 - x0) * col / 3), xe = x0 + Math.round((x1 - x0) * (col + 1) / 3);
  const ys = y0 + Math.round((y1 - y0) * row / 2), ye = y0 + Math.round((y1 - y0) * (row + 1) / 2);
  return { x: xs, y: ys, width: Math.max(1, xe - xs), height: Math.max(1, ye - ys) };
}

function draft(spec, width, height) {
  return { size: { width, height }, selected: true, name: spec.name, chatBarText: "MMD", areas: spec.actions.map((action, i) => ({ bounds: area(width, height, spec.frame, i), action })) };
}

function lineHeaders(env, extra = {}) { const t = clean(env.LINE_CHANNEL_ACCESS_TOKEN); if (!t) throw new Error("line_channel_access_token_missing"); return { authorization: `Bearer ${t}`, ...extra }; }
async function line(env, url, init = {}, allowed = []) { const r = await fetch(url, { ...init, headers: { ...lineHeaders(env), ...(init.headers || {}) } }); const raw = await r.text(); let body = null; try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; } if (!r.ok && !allowed.includes(r.status)) throw new Error(`line_${r.status}:${clean(body?.message || body).slice(0,160)}`); return { r, body }; }

async function imageFor(spec) {
  let why = "image_unavailable";
  for (const url of spec.images) {
    const r = await fetch(url).catch(() => null); if (!r?.ok) { why = `image_http_${r?.status || 0}`; continue; }
    const buffer = await r.arrayBuffer(); if (buffer.byteLength > MAX_IMAGE_BYTES) { why = `image_too_large_${buffer.byteLength}`; continue; }
    const size = pngSize(buffer); if (!size) { why = "image_not_png"; continue; }
    if (size.width < 800 || size.width > 2500 || size.height < 250 || size.width / size.height < 1.45) { why = `image_bad_size_${size.width}x${size.height}`; continue; }
    return { buffer, ...size };
  }
  throw new Error(why);
}

async function ensureMenus(env) {
  const listed = await line(env, `${LINE_API}/richmenu/list`, { method: "GET" });
  const rows = Array.isArray(listed.body?.richmenus) ? listed.body.richmenus : [];
  const out = {};
  for (const [key, spec] of Object.entries(MENUS)) {
    const existing = rows.find((x) => clean(x.name) === spec.name);
    if (existing?.richMenuId) { out[key] = existing.richMenuId; continue; }
    const image = await imageFor(spec);
    const created = await line(env, `${LINE_API}/richmenu`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(draft(spec, image.width, image.height)) });
    const id = clean(created.body?.richMenuId); if (!id) throw new Error("rich_menu_id_missing");
    try { await line(env, `${LINE_DATA_API}/richmenu/${encodeURIComponent(id)}/content`, { method: "POST", headers: { "content-type": "image/png" }, body: image.buffer }); }
    catch (e) { await line(env, `${LINE_API}/richmenu/${encodeURIComponent(id)}`, { method: "DELETE" }, [404]).catch(() => null); throw e; }
    out[key] = id;
  }
  return out;
}

async function airtableAll(env, table, fields = []) {
  const key = clean(env.AIRTABLE_API_KEY), base = clean(env.AIRTABLE_BASE_ID); if (!key || !base) throw new Error("airtable_config_missing");
  const rows = []; let offset = "";
  do {
    const u = new URL(`https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`); u.searchParams.set("pageSize", "100"); if (offset) u.searchParams.set("offset", offset); fields.forEach(f => u.searchParams.append("fields[]", f));
    const r = await fetch(u, { headers: { authorization: `Bearer ${key}` } }); if (!r.ok) throw new Error(`airtable_${r.status}`); const p = await r.json(); rows.push(...(p.records || [])); offset = clean(p.offset);
  } while (offset);
  return rows;
}

function lineId(row) { return clean(row?.fields?.line_user_id || row?.fields?.["LINE User ID"]); }
function verified(row) { return clean(row?.fields?.["Verification Status"]).toLowerCase() === "verified"; }

export function classifyMmdUsers(clients, entitlements, now = new Date()) {
  const byLine = new Map(); for (const row of entitlements) { const id = lineId(row); if (!id) continue; const a = byLine.get(id) || []; a.push(row); byLine.set(id, a); }
  const result = { guest: [], public: [], private: [] };
  for (const client of clients) {
    const id = lineId(client); if (!id) continue;
    if (!verified(client)) { result.guest.push(id); continue; }
    const snapshot = resolveMemberEntitlements(byLine.get(id) || [], { now: now.toISOString() });
    if (snapshot.access.private_visibility_envelope !== "none") result.private.push(id); else result.public.push(id);
  }
  return result;
}

async function users(env, now) {
  const [clients, ents] = await Promise.all([
    airtableAll(env, clean(env.AIRTABLE_TABLE_CLIENTS_ID) || CLIENTS_TABLE, ["line_user_id", "Verification Status"]),
    airtableAll(env, clean(env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS_ID) || ENTITLEMENTS_TABLE),
  ]);
  return classifyMmdUsers(clients, ents, now);
}

async function chunksApply(items, fn) { const unique = [...new Set(items.filter(Boolean))]; for (let i = 0; i < unique.length; i += 500) await fn(unique.slice(i, i + 500)); }
async function bulkLink(env, id, ids) { return chunksApply(ids, chunk => line(env, `${LINE_API}/richmenu/bulk/link`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ richMenuId: id, userIds: chunk }) })); }
async function bulkUnlink(env, ids) { return chunksApply(ids, chunk => line(env, `${LINE_API}/richmenu/bulk/unlink`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userIds: chunk }) })); }

export async function showMmdRichMenus(env, now = new Date()) {
  const [menus, group] = await Promise.all([ensureMenus(env), users(env, now)]);
  await line(env, `${LINE_API}/user/all/richmenu/${encodeURIComponent(menus.guest)}`, { method: "POST" });
  await Promise.all([bulkUnlink(env, group.guest), bulkLink(env, menus.public, group.public), bulkLink(env, menus.private, group.private)]);
  return { visible: true, counts: { guest_known: group.guest.length, public: group.public.length, private: group.private.length } };
}

export async function hideMmdRichMenus(env) {
  await line(env, `${LINE_API}/user/all/richmenu`, { method: "DELETE" }, [404]);
  await line(env, `${LINE_API}/richmenu/batch`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operations: [{ type: "unlinkAll" }] }) }, [409]);
  return { visible: false };
}

export async function reconcileMmdRichMenus(env, now = new Date()) { return isMmdRichMenuHidden(now) ? hideMmdRichMenus(env) : showMmdRichMenus(env, now); }

function internal(request, env) { const a = clean(request.headers.get("authorization")); return Boolean(clean(env.INTERNAL_TOKEN) && a === `Bearer ${clean(env.INTERNAL_TOKEN)}`); }
export function isMmdRichMenuScheduledRequest(request) { try { return request.method === "POST" && new URL(request.url).pathname === SYNC_PATH; } catch { return false; } }
export async function handleMmdRichMenuScheduledRequest(request, env) {
  if (!internal(request, env)) return json({ ok: false, error: "internal_auth_required" }, 401);
  const body = await request.json().catch(() => ({})); const id = clean(body.line_user_id || body.lineUserId); if (!id) return json({ ok: false, error: "line_user_id_missing" }, 400);
  if (isMmdRichMenuHidden()) { await line(env, `${LINE_API}/user/${encodeURIComponent(id)}/richmenu`, { method: "DELETE" }, [404]); return json({ ok: true, target: "hidden" }); }
  const menus = await ensureMenus(env); const group = await users(env, new Date()); const target = group.private.includes(id) ? "private" : group.public.includes(id) ? "public" : "guest";
  if (target === "guest") await line(env, `${LINE_API}/user/${encodeURIComponent(id)}/richmenu`, { method: "DELETE" }, [404]); else await line(env, `${LINE_API}/user/${encodeURIComponent(id)}/richmenu/${encodeURIComponent(menus[target])}`, { method: "POST" });
  return json({ ok: true, target });
}

export async function handleMmdRichMenuScheduled(event, env, ctx) {
  const now = new Date(event?.scheduledTime || Date.now());
  const p = reconcileMmdRichMenus(env, now).catch(e => console.error("mmd_rich_menu_schedule_failed", clean(e?.message || e)));
  if (ctx?.waitUntil) ctx.waitUntil(p); else await p;
}
