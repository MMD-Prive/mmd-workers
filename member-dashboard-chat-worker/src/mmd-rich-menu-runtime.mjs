const LINE_API_BASE = "https://api.line.me/v2/bot";
const LINE_DATA_BASE = "https://api-data.line.me/v2/bot";
const CLIENTS_TABLE_FALLBACK = "tblVv58TCbwh5j1fS";
const ENTITLEMENTS_TABLE_FALLBACK = "tblNImdF9PKAxhXGi";
const MEMBER_LIFF_ID = "2010862595-yT4DCEMc";
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const HIDE_START_HOUR = 16;
const SHOW_START_HOUR = 23;
const MAX_LINE_RICH_MENU_IMAGE_BYTES = 1_000_000;
const BULK_USER_LIMIT = 500;
const MENU_VERSION = "2026-09-rm3-v1";
const HEALTH_PATH = "/__health/mmd-rich-menu";
const SYNC_PATH = "/v1/internal/line/rich-menu/sync";

const WEBFLOW_ASSET_ROOT = "https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90";

function text(value) {
  if (value && typeof value === "object" && !Array.isArray(value) && "name" in value) {
    return value.name == null ? "" : String(value.name).trim();
  }
  return value == null ? "" : String(value).trim();
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, private",
      "x-mmd-route-owner": "member-dashboard-chat-worker",
    },
  });
}

function memberLiffUrl(intent = "status", view = "profile") {
  const url = new URL(`https://liff.line.me/${MEMBER_LIFF_ID}`);
  url.searchParams.set("intent", intent);
  url.searchParams.set("view", view);
  return url.toString();
}

function siteUrl(path, params = {}) {
  const url = new URL(path, "https://mmdbkk.com");
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });
  return url.toString();
}

function messageAction(label, messageText) {
  return { type: "message", label, text: messageText };
}

function uriAction(label, uri) {
  return { type: "uri", label, uri };
}

export const MMD_RICH_MENU_SPECS = Object.freeze({
  guest: Object.freeze({
    key: "guest",
    name: `MMD3 Guest ${MENU_VERSION}`,
    chatBarText: "MMD",
    frame: Object.freeze({ left: 0.49, top: 0.16, right: 0.985, bottom: 0.75 }),
    imageCandidates: Object.freeze([
      `${WEBFLOW_ASSET_ROOT}/6a9ef89d2b35f4308fb3de8e_Rich%20Menu%20Guest-p-1080.png`,
      `${WEBFLOW_ASSET_ROOT}/6a9ef89d2b35f4308fb3de8e_Rich%20Menu%20Guest-p-800.png`,
    ]),
    actions: Object.freeze([
      uriAction("START HERE", siteUrl("/public/access", { source: "line", entry_route: "rich_menu_guest" })),
      uriAction("PUBLIC MODELS", siteUrl("/profiles", { source: "line", entry_route: "rich_menu_guest_models" })),
      uriAction("BOOKING", siteUrl("/booking", { source: "line", entry_route: "rich_menu_guest_booking" })),
      uriAction("PUBLIC SERVICES", siteUrl("/services/companion", { source: "line", entry_route: "rich_menu_guest_services" })),
      uriAction("ABOUT MMD", siteUrl("/tmib", { source: "line", entry_route: "rich_menu_guest_about" })),
      messageAction("SUPPORT", "Hi Per"),
    ]),
  }),
  public: Object.freeze({
    key: "public",
    name: `MMD3 Public Member ${MENU_VERSION}`,
    chatBarText: "MMD",
    frame: Object.freeze({ left: 0.45, top: 0.215, right: 0.99, bottom: 0.755 }),
    imageCandidates: Object.freeze([
      `${WEBFLOW_ASSET_ROOT}/6a9ef89d845a6bc6a34f52c2_Rich%20Menu%20Public-p-1080.png`,
      `${WEBFLOW_ASSET_ROOT}/6a9ef89d845a6bc6a34f52c2_Rich%20Menu%20Public-p-800.png`,
    ]),
    actions: Object.freeze([
      messageAction("คุยกับ PER", "Hi Per"),
      uriAction("PUBLIC MODELS", siteUrl("/profiles", { source: "line", entry_route: "rich_menu_public_models" })),
      uriAction("BOOKING", siteUrl("/booking", { source: "line", entry_route: "rich_menu_public_booking" })),
      uriAction("MY MMD", memberLiffUrl("status", "profile")),
      uriAction("PRIVE ACCESS", siteUrl("/membership", { source: "line", entry_route: "rich_menu_prive_access" })),
      messageAction("SUPPORT", "Support"),
    ]),
  }),
  private: Object.freeze({
    key: "private",
    name: `MMD3 Prive Member ${MENU_VERSION}`,
    chatBarText: "MMD",
    frame: Object.freeze({ left: 0.45, top: 0.17, right: 0.995, bottom: 0.78 }),
    imageCandidates: Object.freeze([
      `${WEBFLOW_ASSET_ROOT}/6a9ef89de09b20e8750bdf5d_Rich%20Menu%20Private-p-1080.png`,
      `${WEBFLOW_ASSET_ROOT}/6a9ef89de09b20e8750bdf5d_Rich%20Menu%20Private-p-800.png`,
    ]),
    actions: Object.freeze([
      messageAction("KENJI AI", "Hi Kenji"),
      uriAction("MODEL CARDS", siteUrl("/member/private", { source: "line", entry_route: "rich_menu_model_cards" })),
      uriAction("BOOKING", siteUrl("/find", { source: "line", entry_route: "rich_menu_private_booking" })),
      uriAction("MY MMD", memberLiffUrl("status", "profile")),
      uriAction("PRIVE UPDATE", siteUrl("/member/private", { source: "line", entry_route: "rich_menu_prive_update" })),
      messageAction("SUPPORT", "Support"),
    ]),
  }),
});

export function bangkokParts(now = new Date()) {
  const shifted = new Date(now.getTime() + BANGKOK_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

export function isMmdRichMenuHidden(now = new Date()) {
  const { hour } = bangkokParts(now);
  return hour >= HIDE_START_HOUR && hour < SHOW_START_HOUR;
}

function bangkokDateKey(now = new Date()) {
  const p = bangkokParts(now);
  return `${String(p.year).padStart(4, "0")}${String(p.month).padStart(2, "0")}${String(p.day).padStart(2, "0")}`;
}

function pngDimensions(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 24) return null;
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 24));
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < signature.length; i += 1) if (bytes[i] !== signature[i]) return null;
  const view = new DataView(buffer);
  return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
}

function richMenuBoundsFromFrame(width, height, frame, column, row) {
  const x0 = Math.round(width * frame.left);
  const x1 = Math.round(width * frame.right);
  const y0 = Math.round(height * frame.top);
  const y1 = Math.round(height * frame.bottom);
  const gridWidth = x1 - x0;
  const gridHeight = y1 - y0;
  const colStart = x0 + Math.round((gridWidth * column) / 3);
  const colEnd = x0 + Math.round((gridWidth * (column + 1)) / 3);
  const rowStart = y0 + Math.round((gridHeight * row) / 2);
  const rowEnd = y0 + Math.round((gridHeight * (row + 1)) / 2);
  return {
    x: Math.max(0, colStart),
    y: Math.max(0, rowStart),
    width: Math.max(1, Math.min(width, colEnd) - Math.max(0, colStart)),
    height: Math.max(1, Math.min(height, rowEnd) - Math.max(0, rowStart)),
  };
}

export function buildMmdRichMenuDraft(spec, width, height) {
  if (!spec || !Array.isArray(spec.actions) || spec.actions.length !== 6) throw new Error("rich_menu_spec_invalid");
  const areas = spec.actions.map((action, index) => ({
    bounds: richMenuBoundsFromFrame(width, height, spec.frame, index % 3, Math.floor(index / 3)),
    action,
  }));
  return {
    size: { width, height },
    selected: true,
    name: spec.name,
    chatBarText: spec.chatBarText,
    areas,
  };
}

function lineHeaders(env = {}, extra = {}) {
  const token = text(env.LINE_CHANNEL_ACCESS_TOKEN);
  if (!token) throw new Error("line_channel_access_token_missing");
  return { Authorization: `Bearer ${token}`, ...extra };
}

async function lineRequest(env, url, options = {}, allowStatuses = []) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...lineHeaders(env),
      ...(options.headers || {}),
    },
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch (_) { body = raw || null; }
  if (!response.ok && !allowStatuses.includes(response.status)) {
    const detail = typeof body === "object" && body ? text(body.message || body.error) : text(body);
    throw new Error(`line_api_${response.status}${detail ? `:${detail.slice(0, 160)}` : ""}`);
  }
  return { response, body };
}

async function listRichMenus(env) {
  const { body } = await lineRequest(env, `${LINE_API_BASE}/richmenu/list`, { method: "GET" });
  return Array.isArray(body?.richmenus) ? body.richmenus : [];
}

async function fetchLineReadyImage(spec) {
  let lastReason = "rich_menu_image_unavailable";
  for (const url of spec.imageCandidates) {
    try {
      const response = await fetch(url, { method: "GET" });
      if (!response.ok) {
        lastReason = `rich_menu_image_http_${response.status}`;
        continue;
      }
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_LINE_RICH_MENU_IMAGE_BYTES) {
        lastReason = `rich_menu_image_too_large_${buffer.byteLength}`;
        continue;
      }
      const dimensions = pngDimensions(buffer);
      if (!dimensions) {
        lastReason = "rich_menu_image_not_png";
        continue;
      }
      const { width, height } = dimensions;
      if (width < 800 || width > 2500 || height < 250 || width / height < 1.45) {
        lastReason = `rich_menu_image_dimensions_invalid_${width}x${height}`;
        continue;
      }
      return { buffer, width, height, url, bytes: buffer.byteLength };
    } catch (error) {
      lastReason = text(error?.message || error) || lastReason;
    }
  }
  throw new Error(lastReason);
}

async function createRichMenu(env, spec, image) {
  const draft = buildMmdRichMenuDraft(spec, image.width, image.height);
  const { body } = await lineRequest(env, `${LINE_API_BASE}/richmenu`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(draft),
  });
  const richMenuId = text(body?.richMenuId);
  if (!richMenuId) throw new Error("line_rich_menu_create_missing_id");
  try {
    await lineRequest(env, `${LINE_DATA_BASE}/richmenu/${encodeURIComponent(richMenuId)}/content`, {
      method: "POST",
      headers: { "content-type": "image/png" },
      body: image.buffer,
    });
    return { richMenuId, created: true, width: image.width, height: image.height, bytes: image.bytes };
  } catch (error) {
    await lineRequest(env, `${LINE_API_BASE}/richmenu/${encodeURIComponent(richMenuId)}`, { method: "DELETE" }, [404]).catch(() => null);
    throw error;
  }
}

async function ensureRichMenus(env) {
  const existing = await listRichMenus(env);
  const result = {};
  for (const spec of Object.values(MMD_RICH_MENU_SPECS)) {
    const found = existing.find((item) => text(item?.name) === spec.name);
    if (found?.richMenuId) {
      result[spec.key] = { richMenuId: found.richMenuId, created: false };
      continue;
    }
    const image = await fetchLineReadyImage(spec);
    result[spec.key] = await createRichMenu(env, spec, image);
  }
  return result;
}

async function setDefaultRichMenu(env, richMenuId) {
  await lineRequest(env, `${LINE_API_BASE}/user/all/richmenu/${encodeURIComponent(richMenuId)}`, { method: "POST" });
}

async function clearDefaultRichMenu(env) {
  await lineRequest(env, `${LINE_API_BASE}/user/all/richmenu`, { method: "DELETE" }, [404]);
}

function chunks(items, size = BULK_USER_LIMIT) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function bulkLinkUsers(env, richMenuId, userIds = []) {
  for (const userIdsChunk of chunks([...new Set(userIds.filter(Boolean))])) {
    await lineRequest(env, `${LINE_API_BASE}/richmenu/bulk/link`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ richMenuId, userIds: userIdsChunk }),
    });
  }
}

async function bulkUnlinkUsers(env, userIds = []) {
  for (const userIdsChunk of chunks([...new Set(userIds.filter(Boolean))])) {
    await lineRequest(env, `${LINE_API_BASE}/richmenu/bulk/unlink`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userIds: userIdsChunk }),
    });
  }
}

async function unlinkAllUsers(env, now = new Date()) {
  const resumeRequestKey = `mmd_hide_${bangkokDateKey(now)}`;
  const { response } = await lineRequest(env, `${LINE_API_BASE}/richmenu/batch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operations: [{ type: "unlinkAll" }], resumeRequestKey }),
  }, [409]);
  return { accepted: response.status === 202, status: response.status, resumeRequestKey };
}

function airtableTable(env = {}, name, fallback) {
  return text(env[name] || fallback);
}

async function airtableListAll(env = {}, tableId = "", fields = []) {
  const apiKey = text(env.AIRTABLE_API_KEY);
  const baseId = text(env.AIRTABLE_BASE_ID);
  if (!apiKey || !baseId || !tableId) throw new Error("airtable_config_missing");
  const all = [];
  let offset = "";
  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableId)}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    fields.forEach((field) => url.searchParams.append("fields[]", field));
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) throw new Error(`airtable_read_${response.status}`);
    const payload = await response.json().catch(() => ({}));
    all.push(...(Array.isArray(payload?.records) ? payload.records : []));
    offset = text(payload?.offset);
  } while (offset);
  return all;
}

function verificationStatus(client = {}) {
  return text(client?.fields?.["Verification Status"]).toLowerCase();
}

function lineUserId(record = {}) {
  return text(record?.fields?.line_user_id || record?.fields?.["LINE User ID"] || record?.fields?.lineUserId);
}

function normalize(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function privateCapability(fields = {}) {
  const candidates = [
    fields.capability,
    fields.entitlement_level,
    fields.package_code,
    fields.target_package_label,
    fields.relationship_tier,
    fields.tier,
    fields["Membership Tier"],
  ].map(normalize).filter(Boolean);
  return candidates.some((value) => (
    value.includes("private_standard")
    || value.includes("standard_private")
    || value === "standard"
    || value.includes("private_premium")
    || value.includes("premium_private")
    || value === "premium"
    || value === "vip"
    || value === "svip"
    || value === "black"
    || value.includes("black_card")
    || value.includes("blackcard")
  ));
}

function entitlementIsPrivateActive(record = {}, now = new Date()) {
  const fields = record?.fields || {};
  if (!privateCapability(fields)) return false;

  const memberStatus = normalize(fields.member_lifecycle_status || fields.member_status || fields["Membership Status"]);
  const accessStatus = normalize(fields.access_status || fields.status);
  const combined = `${memberStatus} ${accessStatus}`;
  if (/blocked|suspend|revok|grace|expired|inactive|cancel/.test(combined)) return false;

  const expires = text(fields.expire_at || fields.end_date || fields["Membership Expiry"]);
  const expiresAt = expires ? Date.parse(expires) : NaN;
  if (Number.isFinite(expiresAt) && expiresAt <= now.getTime()) return false;

  const validStatus = [memberStatus, accessStatus].some((status) => (
    status === "active"
    || status === "current"
    || status === "expiring_soon"
    || status === "expiringsoon"
    || status.startsWith("active_")
    || status.startsWith("current_")
  ));
  if (validStatus) return true;

  // Match the canonical entitlement resolver's fail-closed fallback: an otherwise
  // recognized private entitlement with no explicit status is current only while
  // it has a future expiry. Grace never creates a new private menu assignment.
  return !memberStatus && !accessStatus && Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

export function classifyMmdRichMenuUsers(clients = [], entitlements = [], now = new Date()) {
  const entitlementsByLine = new Map();
  for (const entitlement of entitlements) {
    const id = lineUserId(entitlement);
    if (!id) continue;
    const rows = entitlementsByLine.get(id) || [];
    rows.push(entitlement);
    entitlementsByLine.set(id, rows);
  }

  const guest = new Set();
  const publicMember = new Set();
  const privateMember = new Set();

  for (const client of clients) {
    const id = lineUserId(client);
    if (!id) continue;
    if (verificationStatus(client) !== "verified") {
      guest.add(id);
      continue;
    }
    const privateActive = (entitlementsByLine.get(id) || []).some((row) => entitlementIsPrivateActive(row, now));
    if (privateActive) privateMember.add(id);
    else publicMember.add(id);
  }

  return {
    guest: [...guest],
    public: [...publicMember],
    private: [...privateMember],
  };
}

async function readClassifiedUsers(env, now = new Date()) {
  const clientsTable = airtableTable(env, "AIRTABLE_TABLE_CLIENTS_ID", CLIENTS_TABLE_FALLBACK);
  const entitlementsTable = airtableTable(env, "AIRTABLE_TABLE_MEMBER_ENTITLEMENTS_ID", ENTITLEMENTS_TABLE_FALLBACK);
  const [clients, entitlements] = await Promise.all([
    airtableListAll(env, clientsTable, ["line_user_id", "Verification Status"]),
    airtableListAll(env, entitlementsTable),
  ]);
  return classifyMmdRichMenuUsers(clients, entitlements, now);
}

export async function showMmdRichMenus(env = {}, now = new Date()) {
  const menus = await ensureRichMenus(env);
  const users = await readClassifiedUsers(env, now);
  await setDefaultRichMenu(env, menus.guest.richMenuId);
  await Promise.all([
    bulkUnlinkUsers(env, users.guest),
    bulkLinkUsers(env, menus.public.richMenuId, users.public),
    bulkLinkUsers(env, menus.private.richMenuId, users.private),
  ]);
  return {
    ok: true,
    visible: true,
    created: {
      guest: Boolean(menus.guest.created),
      public: Boolean(menus.public.created),
      private: Boolean(menus.private.created),
    },
    counts: {
      known_guest: users.guest.length,
      public_member: users.public.length,
      private_member: users.private.length,
    },
  };
}

export async function hideMmdRichMenus(env = {}, now = new Date()) {
  await clearDefaultRichMenu(env);
  const batch = await unlinkAllUsers(env, now);
  return { ok: true, visible: false, batch_status: batch.status, batch_accepted: batch.accepted };
}

export async function reconcileMmdRichMenus(env = {}, now = new Date()) {
  return isMmdRichMenuHidden(now) ? hideMmdRichMenus(env, now) : showMmdRichMenus(env, now);
}

function getBearerToken(request) {
  const auth = text(request?.headers?.get("authorization"));
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return text(match?.[1]);
}

function hasInternalAuth(request, env = {}) {
  const expected = text(env.INTERNAL_TOKEN);
  const bearer = getBearerToken(request);
  return Boolean(expected && bearer && expected === bearer);
}

async function syncOneUser(request, env, now = new Date()) {
  if (!hasInternalAuth(request, env)) return json({ ok: false, error: "internal_auth_required" }, 401);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ ok: false, error: "invalid_json" }, 400);
  const id = text(body.line_user_id || body.lineUserId || body.user_id || body.userId);
  if (!id) return json({ ok: false, error: "line_user_id_missing" }, 400);

  if (isMmdRichMenuHidden(now)) {
    await lineRequest(env, `${LINE_API_BASE}/user/${encodeURIComponent(id)}/richmenu`, { method: "DELETE" }, [404]);
    return json({ ok: true, target: "hidden", visible: false });
  }

  const menus = await ensureRichMenus(env);
  let target = normalize(body.rich_menu_target || body.richMenuTarget || body.target);
  if (target === "public_member") target = "public";
  if (target === "private_member") target = "private";
  if (!target || !["guest", "public", "private"].includes(target)) {
    const clients = await airtableListAll(env, airtableTable(env, "AIRTABLE_TABLE_CLIENTS_ID", CLIENTS_TABLE_FALLBACK), ["line_user_id", "Verification Status"]);
    const entitlements = await airtableListAll(env, airtableTable(env, "AIRTABLE_TABLE_MEMBER_ENTITLEMENTS_ID", ENTITLEMENTS_TABLE_FALLBACK));
    const classified = classifyMmdRichMenuUsers(clients.filter((row) => lineUserId(row) === id), entitlements.filter((row) => lineUserId(row) === id), now);
    target = classified.private.includes(id) ? "private" : classified.public.includes(id) ? "public" : "guest";
  }

  if (target === "guest") {
    await lineRequest(env, `${LINE_API_BASE}/user/${encodeURIComponent(id)}/richmenu`, { method: "DELETE" }, [404]);
  } else {
    await lineRequest(env, `${LINE_API_BASE}/user/${encodeURIComponent(id)}/richmenu/${encodeURIComponent(menus[target].richMenuId)}`, { method: "POST" });
  }
  return json({ ok: true, target, visible: true });
}

export function isMmdRichMenuRequest(request) {
  if (!request) return false;
  try {
    const url = new URL(request.url);
    return (request.method === "GET" && url.pathname === HEALTH_PATH)
      || (request.method === "POST" && url.pathname === SYNC_PATH);
  } catch (_) {
    return false;
  }
}

export async function handleMmdRichMenuRequest(request, env = {}, ctx) {
  const url = new URL(request.url);
  const now = new Date();
  if (request.method === "POST" && url.pathname === SYNC_PATH) return syncOneUser(request, env, now);

  if (request.method === "GET" && url.pathname === HEALTH_PATH) {
    const hidden = isMmdRichMenuHidden(now);
    const reconcile = request.headers.get("x-mmd-rich-menu-reconcile") === "1";
    let result = null;
    if (reconcile) {
      try {
        result = await reconcileMmdRichMenus(env, now);
      } catch (error) {
        return json({
          ok: false,
          route: "mmd_rich_menu_health",
          hidden,
          error: text(error?.message || error),
        }, 503);
      }
    }
    const p = bangkokParts(now);
    return json({
      ok: true,
      worker: "member-dashboard-chat-worker",
      route: "mmd_rich_menu_health",
      bangkok_now: `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}T${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}:${String(p.second).padStart(2, "0")}+07:00`,
      hidden,
      schedule: { timezone: "Asia/Bangkok", hide_at: "16:00", show_at: "23:00" },
      reconciled: Boolean(result),
      ...(result ? { result } : {}),
    });
  }

  return json({ ok: false, error: "not_found" }, 404);
}

export async function handleMmdRichMenuScheduled(event, env = {}, ctx) {
  const now = new Date(event?.scheduledTime || Date.now());
  const run = reconcileMmdRichMenus(env, now).catch((error) => {
    console.error("mmd_rich_menu_scheduled_failed", text(error?.message || error));
    throw error;
  });
  if (ctx?.waitUntil) ctx.waitUntil(run);
  else await run;
}
