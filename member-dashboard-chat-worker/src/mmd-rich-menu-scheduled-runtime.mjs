import { resolveMemberEntitlements } from "../../auth-worker/src/member-entitlement-resolver.js";
import { syncLineOfcFollowers } from "./line-ofc-follower-sync.mjs";

const LINE_API = "https://api.line.me/v2/bot";
const LINE_DATA_API = "https://api-data.line.me/v2/bot";
const CLIENTS_TABLE = "tblVv58TCbwh5j1fS";
const ENTITLEMENTS_TABLE = "tblNImdF9PKAxhXGi";
const LIFF_ID = "2010862595-yT4DCEMc";
const MAX_IMAGE_BYTES = 1024 * 1024;
const SYNC_PATH = "/v1/internal/line/rich-menu/sync";
const THREE_LEVEL_PREPARE_PATH = "/v1/internal/line/rich-menu/three-level/prepare";
const THREE_LEVEL_ACTIVATE_PATH = "/v1/internal/line/rich-menu/three-level/activate";
const THREE_LEVEL_AUDIT_PATH = "/v1/internal/line/rich-menu/three-level/audit";
const VERSION = "mmd-rm3-20261004-v4.15";
const ROOT = "https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90";
const GUEST_PRIMARY_SHA256 = "3d8ce3eea915806f46bffb7119705a7251f71b8f2a892ff94f664e66f8fda86c";
const PUBLIC_PRIMARY_SHA256 = "2d1cfaee2865db81f3bc7cc3e3c95c13241861a8c0d5a59c7bdbc3a8e9c82957";
const PRIVATE_PRIMARY_SHA256 = "afc7a024ab6bca40d873aca18f17c0de5be56f6bfc4c701dffd9c75c870b9620";
const GUEST_REPAIR_NAME = `MMD Guest ${VERSION} artwork-${GUEST_PRIMARY_SHA256.slice(0, 8)}`;
const PUBLIC_REPAIR_NAME = `MMD Public ${VERSION} artwork-${PUBLIC_PRIMARY_SHA256.slice(0, 8)}`;
const PRIVATE_REPAIR_NAME = `MMD Private ${VERSION} artwork-${PRIVATE_PRIMARY_SHA256.slice(0, 8)}`;

function clean(v) { return String(v == null ? "" : v).trim(); }
function token(v) { return clean(v).toLowerCase().replace(/[\s-]+/g, "_"); }
function json(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }); }
function uri(label, value) { return { type: "uri", label, uri: value }; }
function msg(label, value) { return { type: "message", label, text: value }; }
function postback(label, data) { return { type: "postback", label, data }; }
function site(path, entry) { const u = new URL(path, "https://mmdbkk.com"); u.searchParams.set("source", "line"); u.searchParams.set("entry_route", entry); return u.toString(); }
function liff() { return `https://miniapp.line.me/${LIFF_ID}/?intent=status&view=home`; }
function signupLiff() { return `https://miniapp.line.me/${LIFF_ID}/?intent=signup&view=signup`; }
function liffReturn(path, entry) {
  const target = new URL(path, "https://mmdbkk.com");
  target.searchParams.set("source", "line");
  target.searchParams.set("entry_route", entry);
  const returnTo = `${target.pathname}${target.search}${target.hash}`;
  const u = new URL(`https://miniapp.line.me/${LIFF_ID}/`);
  u.searchParams.set("intent", "status");
  u.searchParams.set("return_to", returnTo);
  return u.toString();
}

const MENUS = Object.freeze({
  guest: {
    name: `MMD Guest ${VERSION}`,
    frame: { left: .49, top: .16, right: .985, bottom: .75 },
    repairName: GUEST_REPAIR_NAME,
    images: [
      {
        url: `${ROOT}/6ab373e94a52accb54062a99_Rich%20Menu%20Guest%20v4.1%20LINE.png?versionId=_NVnI6XjyjYKc2WXR.0RjR34IkKj75eA`,
        bytes: 347487,
        sha256: GUEST_PRIMARY_SHA256,
      },
    ],
    actions: [
      uri("START HERE", signupLiff()),
      uri("PUBLIC MODELS", liffReturn("/profiles", "rich_menu_guest_models")),
      uri("BOOKING", liffReturn("/booking", "rich_menu_guest_booking")),
      uri("PUBLIC SERVICES", liffReturn("/services/companion", "rich_menu_guest_services")),
      uri("MMD STORIES", liffReturn("/tmib", "rich_menu_guest_stories")),
      postback("SUPPORT", "mmd_action=support&audience=guest&intent=ใช้บริการยังไง"),
    ],
  },
  public: {
    name: `MMD Public ${VERSION}`,
    frame: { left: .45, top: .215, right: .99, bottom: .755 },
    repairName: PUBLIC_REPAIR_NAME,
    images: [
      {
        url: `${ROOT}/6a9ef89d845a6bc6a34f52c2_Rich%20Menu%20Public-p-1080.png?versionId=vZj_Lsl1geNEDlhqsXC4b4iaFEZ5uzKk`,
        bytes: 409143,
        sha256: PUBLIC_PRIMARY_SHA256,
      },
    ],
    actions: [
      msg("คุยกับ PER", "Hi Per"),
      uri("PUBLIC MODELS", liffReturn("/profiles", "rich_menu_public_models")),
      uri("BOOKING", liffReturn("/booking", "rich_menu_public_booking")),
      uri("MY MMD", liff()),
      uri("PRIVE ACCESS", liffReturn("/sigil/start", "rich_menu_prive_access")),
      postback("SUPPORT", "mmd_action=support&audience=public&intent=ใช้บริการยังไง"),
    ],
  },
  private: {
    name: `MMD Private ${VERSION}`,
    // The artwork reserves the left-hand side for the Private character.  The
    // active cells are the right-side 3×2 grid only; a full-canvas grid made
    // taps on the character trigger the wrong action.
    frame: { left: .43, top: .15, right: .99, bottom: .76 },
    repairName: PRIVATE_REPAIR_NAME,
    images: [
      {
        url: `${ROOT}/6a9ef89de09b20e8750bdf5d_Rich%20Menu%20Private-p-1080.png?versionId=pf8SCzdglxtzEEhD1obnZYhmsY.7rzvJ`,
        bytes: 439105,
        sha256: PRIVATE_PRIMARY_SHA256,
      },
    ],
    actions: [
      postback("KENJI AI", "mmd_action=kenji_ai&audience=private&source=private_rich_menu"),
      uri("MODEL CARDS", liffReturn("/sigil/booking?mode=search&scope=private", "rich_menu_model_cards")),
      uri("BOOKING", liffReturn("/sigil/booking?mode=booking&scope=private", "rich_menu_private_booking")),
      uri("MY MMD", liff()),
      uri("PRIVE UPDATE", liff()),
      postback("SUPPORT", "mmd_action=kenji_ai&entry=support&audience=private&source=private_rich_menu"),
    ],
  },
});

const DESTINATIONS = Object.fromEntries(Object.entries(MENUS).map(([key, spec]) => [key, spec.actions.map(action => ({ ...action }))]));
for (const [key, spec] of Object.entries(MENUS)) spec.actions = replyActions(key, spec.actions);

export function getMmdRichMenuDestinationMap() {
  return Object.fromEntries(Object.entries(DESTINATIONS).map(([key, actions]) => [key, actions.map(action => ({ ...action }))]));
}

// Every navigation tap enters the reply webhook; destinations remain server-owned.
function replyActions(key, actions) {
  return actions.map((action, index) =>
    postback(action.label, `mmd_action=rich_menu&menu=${key}&button=${index}`));
}

export function getMmdRichMenuActionMap() {
  return Object.fromEntries(Object.entries(MENUS).map(([key, spec]) => [key, replyActions(key, spec.actions)]));
}

export function getMmdRichMenuImageSources() {
  return Object.fromEntries(Object.entries(MENUS).map(([key, spec]) => [
    key,
    spec.images.map((source) => imageSource(source).url),
  ]));
}

export function getMmdRichMenuTapFrames() {
  return Object.fromEntries(Object.entries(MENUS).map(([key, spec]) => [
    key,
    { ...spec.frame },
  ]));
}
export function getMmdRichMenuVersion() {
  return VERSION;
}

function targetForClassification(result, lineUserId) {
  if (result.private.includes(lineUserId)) return "private";
  if (result.public.includes(lineUserId)) return "public";
  return "guest";
}

export function getMmdRichMenuFiveStateMatrix(now = new Date()) {
  const at = now instanceof Date ? now : new Date(now);
  const cases = [
    {
      state: "guest",
      id: "U-state-guest",
      client: { fields: { line_user_id: "U-state-guest", "Verification Status": "pending" } },
      entitlements: [],
    },
    {
      state: "public",
      id: "U-state-public",
      client: { fields: { line_user_id: "U-state-public", "Verification Status": "verified" } },
      entitlements: [],
    },
    {
      state: "private",
      id: "U-state-private",
      client: { fields: { line_user_id: "U-state-private", "Verification Status": "verified" } },
      entitlements: [{ fields: { line_user_id: "U-state-private", capability: "private_premium", member_lifecycle_status: "active", expire_at: "2099-12-31T00:00:00Z" } }],
    },
    {
      state: "expired",
      id: "U-state-expired",
      client: { fields: { line_user_id: "U-state-expired", "Verification Status": "verified" } },
      entitlements: [{ fields: { line_user_id: "U-state-expired", capability: "private_standard", member_lifecycle_status: "expired", expire_at: "2020-01-01T00:00:00Z" } }],
    },
    {
      state: "blocked",
      id: "U-state-blocked",
      client: { fields: { line_user_id: "U-state-blocked", "Verification Status": "verified" } },
      entitlements: [{ fields: { line_user_id: "U-state-blocked", capability: "private_premium", member_lifecycle_status: "blocked", expire_at: "2099-12-31T00:00:00Z" } }],
    },
  ];

  return Object.fromEntries(cases.map((entry) => {
    const classified = classifyMmdUsers([entry.client], entry.entitlements, at);
    return [entry.state, targetForClassification(classified, entry.id)];
  }));
}

export function bangkokHour(now = new Date()) { return new Date(now.getTime() + 7 * 3600_000).getUTCHours(); }
// Menus stay reachable 24h; selected:false sets the initially collapsed display.
export function isMmdRichMenuHidden(_now = new Date()) { return false; }

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
  return { size: { width, height }, selected: false, name: spec.name, chatBarText: "MMD", areas: spec.actions.map((action, i) => ({ bounds: area(width, height, spec.frame, i), action })) };
}

function imageSource(source) {
  if (typeof source === "string") return { url: source, bytes: 0, sha256: "" };
  return {
    url: clean(source?.url),
    bytes: Number(source?.bytes || 0),
    sha256: clean(source?.sha256).toLowerCase(),
  };
}

async function imageIntegrity(buffer, source) {
  const descriptor = imageSource(source);
  const digest = await sha256Hex(buffer);
  return {
    ok: (!descriptor.bytes || descriptor.bytes === buffer.byteLength) &&
      (!descriptor.sha256 || descriptor.sha256 === digest),
    bytes: buffer.byteLength,
    sha256: digest,
  };
}

function lineHeaders(env, extra = {}) { const t = clean(env.LINE_CHANNEL_ACCESS_TOKEN); if (!t) throw new Error("line_channel_access_token_missing"); return { authorization: `Bearer ${t}`, ...extra }; }
async function line(env, url, init = {}, allowed = []) { const r = await fetch(url, { ...init, headers: { ...lineHeaders(env), ...(init.headers || {}) } }); const raw = await r.text(); let body = null; try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; } if (!r.ok && !allowed.includes(r.status)) throw new Error(`line_${r.status}:${clean(body?.message || body).slice(0,160)}`); return { r, body }; }

async function imageFor(spec) {
  let why = "image_unavailable";
  for (const source of spec.images) {
    const descriptor = imageSource(source);
    const r = await fetch(descriptor.url).catch(() => null); if (!r?.ok) { why = `image_http_${r?.status || 0}`; continue; }
    const buffer = await r.arrayBuffer(); if (buffer.byteLength > MAX_IMAGE_BYTES) { why = `image_too_large_${buffer.byteLength}`; continue; }
    const size = pngSize(buffer); if (!size) { why = "image_not_png"; continue; }
    if (size.width < 800 || size.width > 2500 || size.height < 250 || size.width / size.height < 1.45) { why = `image_bad_size_${size.width}x${size.height}`; continue; }
    const integrity = await imageIntegrity(buffer, descriptor);
    if (!integrity.ok) { why = "image_integrity_mismatch"; continue; }
    return { buffer, ...size };
  }
  throw new Error(why);
}

function normalizedAction(action = {}) {
  const out = { type: clean(action.type), label: clean(action.label) };
  if (out.type === "uri") out.uri = clean(action.uri);
  if (out.type === "message") out.text = clean(action.text);
  if (out.type === "postback") {
    out.data = clean(action.data);
    if (action.displayText != null) out.displayText = clean(action.displayText);
  }
  return out;
}

function menuObjectMatches(row, spec) {
  const width = Number(row?.size?.width || 0);
  const height = Number(row?.size?.height || 0);
  if (!width || !height || clean(row?.name) !== spec.name) return false;
  const expected = draft(spec, width, height);
  if (row?.selected !== expected.selected) return false;
  const areas = Array.isArray(row?.areas) ? row.areas : [];
  if (areas.length !== expected.areas.length) return false;
  if (clean(row?.chatBarText) !== expected.chatBarText) return false;
  return areas.every((item, index) => {
    const want = expected.areas[index];
    const bounds = item?.bounds || {};
    return Number(bounds.x) === want.bounds.x &&
      Number(bounds.y) === want.bounds.y &&
      Number(bounds.width) === want.bounds.width &&
      Number(bounds.height) === want.bounds.height &&
      JSON.stringify(normalizedAction(item?.action)) === JSON.stringify(normalizedAction(want.action));
  });
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function menuImageCheck(env, richMenuId, spec) {
  if (!clean(richMenuId)) return { match: false, reason: "missing_menu" };
  const response = await fetch(`${LINE_DATA_API}/richmenu/${encodeURIComponent(richMenuId)}/content`, {
    headers: lineHeaders(env),
  }).catch(() => null);
  if (!response?.ok) return { match: false, reason: `line_http_${response?.status || 0}` };
  const actual = await response.arrayBuffer();
  const actualHash = await sha256Hex(actual);
  const pinned = spec.images.map(imageSource);
  if (pinned.length && pinned.every((source) => source.bytes > 0 && /^[a-f0-9]{64}$/.test(source.sha256))) {
    const sourceFingerprints = pinned.map(({ bytes, sha256 }) => ({ bytes, sha256 }));
    const match = pinned.some(({ bytes, sha256 }) => actual.byteLength === bytes && actualHash === sha256);
    return {
      match,
      reason: match ? "" : "pinned_content_mismatch",
      actual_bytes: actual.byteLength,
      actual_sha256: actualHash,
      expected_bytes: pinned[0].bytes,
      source_fingerprints: sourceFingerprints,
    };
  }
  let expectedBytes = 0;
  let validSources = 0;
  let invalidPinnedSources = 0;
  let sameSize = false;
  const sourceFingerprints = [];
  // Upload may use the CDN fallback if the primary image host is temporarily unavailable.
  // Accept only a byte-exact match against one of the approved artwork sources.
  for (const configuredSource of spec.images) {
    const descriptor = imageSource(configuredSource);
    const source = await fetch(descriptor.url).catch(() => null);
    if (!source?.ok) continue;
    const expected = await source.arrayBuffer();
    const size = pngSize(expected);
    if (expected.byteLength > MAX_IMAGE_BYTES || !size || size.width < 800 || size.width > 2500 || size.height < 250 || size.width / size.height < 1.45) continue;
    const integrity = await imageIntegrity(expected, descriptor);
    if (!integrity.ok) { invalidPinnedSources += 1; continue; }
    validSources += 1;
    const expectedHash = integrity.sha256;
    sourceFingerprints.push({ bytes: expected.byteLength, sha256: expectedHash });
    if (!expectedBytes) expectedBytes = expected.byteLength;
    if (actual.byteLength !== expected.byteLength) continue;
    sameSize = true;
    if (actualHash === expectedHash) return {
      match: true,
      reason: "",
      actual_bytes: actual.byteLength,
      actual_sha256: actualHash,
      source_fingerprints: sourceFingerprints,
    };
  }
  return {
    match: false,
    reason: !validSources ? (invalidPinnedSources ? "source_integrity_mismatch" : "source_unavailable") : sameSize ? "content_mismatch" : "byte_length_mismatch",
    actual_bytes: actual.byteLength,
    actual_sha256: actualHash,
    expected_bytes: expectedBytes,
    source_fingerprints: sourceFingerprints,
  };
}

export async function prepareMmdRichMenus(env, options = {}) {
  const menuSpecs = options.menuSpecs || MENUS;
  const selectedNames = {};
  await ensureMenus(env, menuSpecs, { repairImages: true, selectedNames });
  return {
    ok: true,
    prepared: true,
    version: VERSION,
    menu_names: selectedNames,
    customer_assignments_changed: false,
    default_menu_changed: false,
  };
}

export async function auditMmdRichMenus(env, now = new Date(), menuSpecs = MENUS) {
  const listed = await line(env, `${LINE_API}/richmenu/list`, { method: "GET" });
  const rows = Array.isArray(listed.body?.richmenus) ? listed.body.richmenus : [];
  const checks = {};
  const ids = {};

  for (const [key, spec] of Object.entries(menuSpecs)) {
    const row = rows.find((item) => clean(item?.name) === clean(spec.repairName)) ||
      rows.find((item) => clean(item?.name) === spec.name);
    const expectedSpec = row && clean(row?.name) === clean(spec.repairName) ? { ...spec, name: spec.repairName } : spec;
    ids[key] = clean(row?.richMenuId);
    const image = row ? await menuImageCheck(env, ids[key], spec).catch(() => ({ match: false, reason: "check_error" })) : { match: false, reason: "missing_menu" };
    checks[key] = {
      present: Boolean(ids[key]),
      object_match: Boolean(row && menuObjectMatches(row, expectedSpec)),
      image_match: image.match,
      image_issue: image.reason,
      image_actual_bytes: image.actual_bytes || 0,
      image_expected_bytes: image.expected_bytes || 0,
      image_actual_sha256: image.actual_sha256 || "",
      image_source_fingerprints: image.source_fingerprints || [],
      action_labels: spec.actions.map((action) => action.label),
      action_types: spec.actions.map((action) => action.type),
    };
  }

  const defaultResult = await line(env, `${LINE_API}/user/all/richmenu`, { method: "GET" }, [404]);
  const defaultId = defaultResult.r.status === 404 ? "" : clean(defaultResult.body?.richMenuId);
  const hidden = isMmdRichMenuHidden(now);
  const defaultState = !defaultId ? "none" : defaultId === ids.guest ? "guest" : "unexpected";
  const schedulePolicyMatch = hidden ? defaultState === "none" : defaultState === "guest";
  const fiveState = getMmdRichMenuFiveStateMatrix(now);
  const matrixMatch =
    fiveState.guest === "guest" &&
    fiveState.public === "public" &&
    fiveState.private === "private" &&
    fiveState.expired === "public" &&
    fiveState.blocked === "public";
  const menusOk = Object.values(checks).every((item) => item.present && item.object_match && item.image_match);

  return {
    ok: menusOk && schedulePolicyMatch && matrixMatch,
    version: VERSION,
    menus: checks,
    hidden_by_schedule: hidden,
    default_state: defaultState,
    schedule_policy_match: schedulePolicyMatch,
    five_state_matrix: fiveState,
    five_state_matrix_match: matrixMatch,
    physical_tap_verified: false,
  };
}
async function approvedLineImageFallback(env, rows, key, spec) {
  const prefix = key === "guest" ? "MMD Guest " : key === "public" ? "MMD Public " : key === "private" ? "MMD Private " : "";
  const pinned = spec.images.map(imageSource).filter((source) =>
    source.bytes > 0 && /^[a-f0-9]{64}$/.test(source.sha256));
  if (!prefix || !pinned.length) return null;

  for (const row of rows) {
    const richMenuId = clean(row?.richMenuId);
    if (!richMenuId || !clean(row?.name).startsWith(prefix)) continue;
    const response = await fetch(`${LINE_DATA_API}/richmenu/${encodeURIComponent(richMenuId)}/content`, {
      headers: lineHeaders(env),
    }).catch(() => null);
    if (!response?.ok) continue;
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_IMAGE_BYTES) continue;
    const size = pngSize(buffer);
    if (!size || size.width < 800 || size.width > 2500 || size.height < 250 || size.width / size.height < 1.45) continue;
    const digest = await sha256Hex(buffer);
    if (!pinned.some((source) => source.bytes === buffer.byteLength && source.sha256 === digest)) continue;
    return { buffer, ...size };
  }
  return null;
}

async function createMenu(env, spec, name, rows = [], key = "") {
  let image;
  try {
    image = await imageFor(spec);
  } catch (sourceError) {
    image = await approvedLineImageFallback(env, rows, key, spec);
    if (!image) throw sourceError;
  }
  const targetSpec = { ...spec, name };
  const created = await line(env, `${LINE_API}/richmenu`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(draft(targetSpec, image.width, image.height)) });
  const id = clean(created.body?.richMenuId); if (!id) throw new Error("rich_menu_id_missing");
  try { await line(env, `${LINE_DATA_API}/richmenu/${encodeURIComponent(id)}/content`, { method: "POST", headers: { "content-type": "image/png" }, body: image.buffer }); }
  catch (e) { await line(env, `${LINE_API}/richmenu/${encodeURIComponent(id)}`, { method: "DELETE" }, [404]).catch(() => null); throw e; }
  return id;
}

async function ensureMenus(env, menuSpecs = MENUS, options = {}) {
  const listed = await line(env, `${LINE_API}/richmenu/list`, { method: "GET" });
  const rows = Array.isArray(listed.body?.richmenus) ? listed.body.richmenus : [];
  const out = {};
  for (const [key, spec] of Object.entries(menuSpecs)) {
    const repaired = clean(spec.repairName) ? rows.find((x) => clean(x.name) === clean(spec.repairName)) : null;
    if (repaired?.richMenuId) {
      if (options.repairImages) {
        const expectedSpec = { ...spec, name: spec.repairName };
        const image = await menuImageCheck(env, repaired.richMenuId, spec);
        if (!menuObjectMatches(repaired, expectedSpec) || !image.match) throw new Error(`rich_menu_repair_invalid_${key}`);
      }
      out[key] = repaired.richMenuId;
      if (options.selectedNames) options.selectedNames[key] = spec.repairName;
      continue;
    }
    const existing = rows.find((x) => clean(x.name) === spec.name);
    if (existing?.richMenuId) {
      if (!options.repairImages || !clean(spec.repairName)) {
        out[key] = existing.richMenuId;
        if (options.selectedNames) options.selectedNames[key] = spec.name;
        continue;
      }
      const image = await menuImageCheck(env, existing.richMenuId, spec);
      if (menuObjectMatches(existing, spec) && image.match) {
        out[key] = existing.richMenuId;
        if (options.selectedNames) options.selectedNames[key] = spec.name;
        continue;
      }
      out[key] = await createMenu(env, spec, spec.repairName, rows, key);
      if (options.selectedNames) options.selectedNames[key] = spec.repairName;
      continue;
    }
    out[key] = await createMenu(env, spec, spec.name, rows, key);
    if (options.selectedNames) options.selectedNames[key] = spec.name;
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

export function validMmdLineUserId(value) { return /^U[0-9a-f]{32}$/i.test(clean(value)); }

async function chunksApply(items, fn) { const unique = [...new Set(items.map(clean).filter(validMmdLineUserId))]; for (let i = 0; i < unique.length; i += 500) await fn(unique.slice(i, i + 500)); }
async function bulkLink(env, id, ids) { return chunksApply(ids, chunk => line(env, `${LINE_API}/richmenu/bulk/link`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ richMenuId: id, userIds: chunk }) })); }
async function bulkUnlink(env, ids) { return chunksApply(ids, chunk => line(env, `${LINE_API}/richmenu/bulk/unlink`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userIds: chunk }) })); }

export async function showMmdRichMenus(env, now = new Date()) {
  const [menus, resolvedGroup] = await Promise.all([ensureMenus(env), users(env, now)]);
  const group = Object.fromEntries(Object.entries(resolvedGroup).map(([key, ids]) => [key, [...new Set(ids.map(clean).filter(validMmdLineUserId))]]));
  const skippedInvalid = Object.values(resolvedGroup).flat().filter(id => !validMmdLineUserId(id)).length;
  await line(env, `${LINE_API}/user/all/richmenu/${encodeURIComponent(menus.guest)}`, { method: "POST" });
  await Promise.all([bulkUnlink(env, group.guest), bulkLink(env, menus.public, group.public), bulkLink(env, menus.private, group.private)]);
  return { visible: true, skipped_invalid_line_ids: skippedInvalid, counts: { guest_known: group.guest.length, public: group.public.length, private: group.private.length } };
}

export async function hideMmdRichMenus(env) {
  await line(env, `${LINE_API}/user/all/richmenu`, { method: "DELETE" }, [404]);
  await line(env, `${LINE_API}/richmenu/batch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operations: [{ type: "unlinkAll" }] }),
  }, [409]);
  return { visible: false };
}

export async function reconcileMmdRichMenus(env, now = new Date()) {
  return isMmdRichMenuHidden(now) ? hideMmdRichMenus(env) : showMmdRichMenus(env, now);
}

function internal(request, env) { const a = clean(request.headers.get("authorization")); return Boolean(clean(env.INTERNAL_TOKEN) && a === `Bearer ${clean(env.INTERNAL_TOKEN)}`); }
export function isMmdRichMenuScheduledRequest(request) {
  try {
    const path = new URL(request.url).pathname;
    return (request.method === "POST" && (path === SYNC_PATH || path === THREE_LEVEL_PREPARE_PATH || path === THREE_LEVEL_ACTIVATE_PATH)) ||
      (request.method === "GET" && path === THREE_LEVEL_AUDIT_PATH);
  } catch {
    return false;
  }
}
export async function handleMmdRichMenuScheduledRequest(request, env) {
  if (!internal(request, env)) return json({ ok: false, error: "internal_auth_required" }, 401);
  const path = new URL(request.url).pathname;

  if (request.method === "POST" && path === THREE_LEVEL_PREPARE_PATH) {
    try {
      return json(await prepareMmdRichMenus(env));
    } catch (error) {
      return json({ ok: false, error: "rich_menu_prepare_failed", reason: clean(error?.message || error).slice(0, 120) }, 502);
    }
  }

  if (request.method === "POST" && path === THREE_LEVEL_ACTIVATE_PATH) {
    try {
      const result = await reconcileMmdRichMenus(env, new Date());
      return json({ ok: true, version: VERSION, active: result.visible, selected_default: result.visible ? false : null, counts: result.counts || {}, skipped_invalid_line_ids: result.skipped_invalid_line_ids || 0 });
    } catch (error) {
      return json({ ok: false, error: "rich_menu_activate_failed", reason: clean(error?.message || error).slice(0, 120) }, 502);
    }
  }

  if (request.method === "GET" && path === THREE_LEVEL_AUDIT_PATH) {
    try {
      const result = await auditMmdRichMenus(env, new Date());
      return json(result, result.ok ? 200 : 409);
    } catch (error) {
      return json({ ok: false, error: "rich_menu_audit_failed", reason: clean(error?.message || error).slice(0, 120) }, 502);
    }
  }

  const body = await request.json().catch(() => ({}));
  const id = clean(body.line_user_id || body.lineUserId);
  if (!id) return json({ ok: false, error: "line_user_id_missing" }, 400);
  if (!validMmdLineUserId(id)) return json({ ok: false, error: "line_user_id_invalid" }, 400);
  if (isMmdRichMenuHidden()) {
    await line(env, `${LINE_API}/user/${encodeURIComponent(id)}/richmenu`, { method: "DELETE" }, [404]);
    return json({ ok: true, target: "hidden" });
  }
  const menus = await ensureMenus(env);
  const group = await users(env, new Date());
  const target = group.private.includes(id) ? "private" : group.public.includes(id) ? "public" : "guest";
  if (target === "guest") await line(env, `${LINE_API}/user/${encodeURIComponent(id)}/richmenu`, { method: "DELETE" }, [404]);
  else await line(env, `${LINE_API}/user/${encodeURIComponent(id)}/richmenu/${encodeURIComponent(menus[target])}`, { method: "POST" });
  return json({ ok: true, target });
}

export async function handleMmdRichMenuScheduled(event, env, ctx) {
  const now = new Date(event?.scheduledTime || Date.now());
  const followerSync = syncLineOfcFollowers(env).then((result) => {
    console.log("line_ofc_follower_sync", JSON.stringify(result));
    return result;
  }).catch((error) => {
    console.error("line_ofc_follower_sync_failed", clean(error?.message || error));
    return { ok: false, error: clean(error?.message || error) };
  });
  const richMenuSync = reconcileMmdRichMenus(env, now).catch(e => console.error("mmd_rich_menu_schedule_failed", clean(e?.message || e)));
  const p = Promise.all([followerSync, richMenuSync]);
  if (ctx?.waitUntil) ctx.waitUntil(p); else await p;
}
