import crypto from "node:crypto";
import process from "node:process";

const env = process.env;
const required = [
  "REAL_MEMBER_LIFF_ID_TOKEN",
  "AIRTABLE_API_KEY",
  "GITHUB_TOKEN",
  "GITHUB_REPOSITORY",
];
for (const key of required) {
  if (!String(env[key] || "").trim()) {
    throw new Error(`${key} is required; refusing synthetic or unaudited real-member acceptance`);
  }
}

for (const secret of [env.REAL_MEMBER_LIFF_ID_TOKEN, env.AIRTABLE_API_KEY, env.GITHUB_TOKEN]) {
  console.log(`::add-mask::${secret}`);
}

const ORIGIN = env.ORIGIN || "https://www.mmdbkk.com";
const MODEL_SLUG = String(env.MODEL_SLUG || "toto").trim();
const PREVIEW_KIND = String(env.PREVIEW_KIND || "private_pic").trim();
const WORK_LANE = String(env.WORK_LANE || "companion").trim();
const BASE = env.AIRTABLE_BASE_ID || "appsV1ILPRfIjkaYg";
const TABLES = {
  clients: env.CLIENTS_TABLE || "tblVv58TCbwh5j1fS",
  entitlements: env.ENTITLEMENTS_TABLE || "tblNImdF9PKAxhXGi",
  grants: env.GRANTS_TABLE || "tblbP1csaTYfffS01",
  media: env.MEDIA_TABLE || "tblrpQXhHnbTU9RhW",
  consumption: env.CONSUMPTION_TABLE || "tblcjjCW0pXvlhNQQ",
};

if (!["private_pic", "private_clip"].includes(PREVIEW_KIND)) throw new Error("preview kind is outside the real-member E2E contract");
if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(MODEL_SLUG)) throw new Error("model slug is invalid");

const formulaEscape = (value) => String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const oneLink = (value) => Array.isArray(value) && value.length === 1;
const emptyLink = (value) => !value || (Array.isArray(value) && value.length === 0);
const mask = (value) => {
  if (value) console.log(`::add-mask::${value}`);
  return value;
};

async function airtableRequest(url) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}`, Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Airtable read failed HTTP ${response.status}`);
  return response.json();
}

async function allRecords(table, fields = []) {
  const records = [];
  let offset = "";
  for (let page = 0; page < 25; page += 1) {
    const url = new URL(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", "100");
    for (const field of fields) url.searchParams.append("fields[]", field);
    if (offset) url.searchParams.set("offset", offset);
    const body = await airtableRequest(url);
    records.push(...(body.records || []));
    offset = String(body.offset || "");
    if (!offset) break;
  }
  return records;
}

async function recordById(table, id) {
  return airtableRequest(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}/${encodeURIComponent(id)}`);
}

async function recordsByFormula(table, formula, maxRecords = 10) {
  const url = new URL(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}`);
  url.searchParams.set("maxRecords", String(maxRecords));
  url.searchParams.set("filterByFormula", formula);
  return (await airtableRequest(url)).records || [];
}

function canonicalEntitlements(records, clientId) {
  return records
    .filter((record) => Array.isArray(record.fields?.client) && record.fields.client.includes(clientId))
    .map((record) => ({
      id: record.id,
      client: record.fields?.client || [],
      capability: record.fields?.capability || null,
      access_status: record.fields?.access_status || null,
      member_status: record.fields?.member_status || null,
      member_lifecycle_status: record.fields?.member_lifecycle_status || null,
      payment_ref: record.fields?.payment_ref || "",
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function entitlementSnapshot(clientId) {
  const records = await allRecords(TABLES.entitlements, [
    "client",
    "capability",
    "access_status",
    "member_status",
    "member_lifecycle_status",
    "payment_ref",
  ]);
  const canonical = canonicalEntitlements(records, clientId);
  return {
    count: canonical.length,
    fingerprint: sha256(JSON.stringify(canonical)),
  };
}

function decodeJwtSubject(token) {
  const parts = String(token || "").split(".");
  if (parts.length < 2) throw new Error("real LINE ID token is not a JWT");
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  const sub = String(payload.sub || "").trim();
  if (!/^U[0-9A-Za-z_-]{20,80}$/.test(sub)) throw new Error("LINE ID token subject is invalid");
  return sub;
}

async function requestJson(path, options = {}) {
  const response = await fetch(new URL(path, ORIGIN), options);
  let body = null;
  try { body = await response.json(); } catch {}
  return { response, body };
}

function responseCookies(response) {
  if (typeof response.headers.getSetCookie === "function") return response.headers.getSetCookie();
  const raw = response.headers.get("set-cookie");
  return raw ? [raw] : [];
}

function sessionCookieFrom(response) {
  for (const cookie of responseCookies(response)) {
    const first = String(cookie || "").split(";")[0].trim();
    if (first.startsWith("__Host-mmd_liff_session=")) return first;
  }
  return "";
}

async function postReceipt() {
  const checkedAt = new Date().toISOString();
  const receipt = [
    "## ✅ Private Teaser Viewer V1 — REAL MEMBER GRANT/CONSUME ACCEPTED",
    "",
    `- source_sha: \`${env.GITHUB_SHA}\``,
    `- checked_at: \`${checkedAt}\``,
    `- model_slug: \`${MODEL_SLUG}\``,
    `- preview_kind: \`${PREVIEW_KIND}\``,
    "- identity: real LINE ID token → verified MY MMD session",
    "- availability: eligible with an Owner-approved teaser-safe asset",
    "- grant: exactly one Client + one Model + one Media Asset",
    "- grant basis: `verified_prebooking_eligibility`",
    "- grant Payment link: empty",
    "- storage exposure: no public/signed R2 URL",
    "- status before consume: 200 and non-mutating",
    "- consume: 200, protected bytes delivered once",
    "- replay status + replay consume: 410 `PREVIEW_CONSUMED`",
    "- Airtable consumption audit: exactly one matching consumed row",
    "- grant mirror: consumed / view_count=1 / signed_url_status=consumed",
    "- member entitlement fingerprint: unchanged before vs after",
    "- raw LINE ID, Client ID, preview token, media bytes: not recorded in receipt",
  ].join("\n");

  const response = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/issues/325/comments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body: receipt }),
    },
  );
  if (!response.ok) throw new Error(`GitHub acceptance receipt failed HTTP ${response.status}`);
}

const lineUserId = decodeJwtSubject(env.REAL_MEMBER_LIFF_ID_TOKEN);

const start = await requestJson("/member/api/liff/start", {
  method: "POST",
  headers: {
    Origin: ORIGIN,
    Accept: "application/json",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    id_token: env.REAL_MEMBER_LIFF_ID_TOKEN,
    intent: "status",
    liff_intent: "status",
  }),
});
if (start.response.status !== 200 || start.body?.ok !== true) {
  throw new Error(`real LIFF session start failed HTTP ${start.response.status}`);
}
if (start.response.headers.get("x-mmd-route-owner") !== "member-dashboard-chat-worker") {
  throw new Error("real LIFF session started through an unexpected route owner");
}
if (start.response.headers.get("x-mmd-upstream-service") !== "member-pages-worker") {
  throw new Error("real LIFF session did not reach member-pages-worker");
}
const sessionCookie = mask(sessionCookieFrom(start.response));
if (!sessionCookie) throw new Error("verified LIFF session cookie was not issued");

const clients = await recordsByFormula(TABLES.clients, `{line_user_id}='${formulaEscape(lineUserId)}'`, 2);
if (clients.length !== 1) throw new Error(`real member must resolve to exactly one Client; got ${clients.length}`);
const clientId = mask(clients[0].id);
const beforeEntitlement = await entitlementSnapshot(clientId);

const availabilityUrl = new URL("/api/member/app/private-teaser/availability", ORIGIN);
availabilityUrl.searchParams.set("model_slug", MODEL_SLUG);
availabilityUrl.searchParams.set("work_lane", WORK_LANE);
const availability = await requestJson(availabilityUrl, {
  headers: { Origin: ORIGIN, Cookie: sessionCookie, Accept: "application/json" },
});
if (availability.response.status !== 200 || availability.body?.ok !== true || availability.body?.availability?.eligible !== true) {
  throw new Error(`real member/model is not teaser-eligible; HTTP ${availability.response.status}`);
}
const availableCount = PREVIEW_KIND === "private_clip"
  ? Number(availability.body.availability.clip_count || 0)
  : Number(availability.body.availability.pic_count || 0);
if (availableCount < 1) throw new Error(`no approved ${PREVIEW_KIND} teaser asset is available for ${MODEL_SLUG}`);
console.log(`PASS availability: ${MODEL_SLUG} has ${availableCount} eligible ${PREVIEW_KIND} asset(s)`);

// No automatic retry: this POST creates a one-use grant.
const grant = await requestJson("/api/member/app/private-teaser/grant", {
  method: "POST",
  headers: {
    Origin: ORIGIN,
    Cookie: sessionCookie,
    Accept: "application/json",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model_slug: MODEL_SLUG,
    work_lane: WORK_LANE,
    preview_kind: PREVIEW_KIND,
  }),
});
if (grant.response.status !== 200 || grant.body?.ok !== true || !grant.body?.grant?.viewer_url) {
  throw new Error(`real teaser grant failed HTTP ${grant.response.status}`);
}
const viewerUrl = String(grant.body.grant.viewer_url);
if (!viewerUrl.startsWith("/my-mmd/private-preview/view#t=")) throw new Error("grant viewer URL is outside the MY MMD viewer");
if (/^https?:\/\//i.test(viewerUrl) || /private-model-media|r2\.cloudflarestorage|X-Amz-/i.test(viewerUrl)) {
  throw new Error("grant exposed a host or private storage locator");
}
const token = mask(decodeURIComponent(viewerUrl.slice(viewerUrl.indexOf("#t=") + 3)));
if (!token) throw new Error("grant did not return a usable one-use token");
const tokenHash = sha256(token);

const grantRows = await recordsByFormula(TABLES.grants, `{preview_token_hash}='${formulaEscape(tokenHash)}'`, 2);
if (grantRows.length !== 1) throw new Error(`preview token hash must resolve to exactly one grant; got ${grantRows.length}`);
const grantRecord = grantRows[0];
mask(grantRecord.id);
const gf = grantRecord.fields || {};
if (!oneLink(gf.Client) || gf.Client[0] !== clientId) throw new Error("grant Client binding mismatch");
if (!oneLink(gf.Model) || !oneLink(gf["Media Asset"])) throw new Error("grant must bind one Model and one Media Asset");
if (!emptyLink(gf.Payment)) throw new Error("pre-booking teaser grant unexpectedly linked Payment");
if (gf.grant_status !== "active" || gf.required_gate !== "verified_prebooking_eligibility") throw new Error("grant lifecycle/gate mismatch");
if (Boolean(gf.deposit_verified) !== false || String(gf.official_verification_ref || "") !== "") throw new Error("grant incorrectly depends on payment verification");
if (Number(gf.view_limit || 0) !== 1 || Number(gf.view_count || 0) !== 0) throw new Error("one-view grant counters are invalid");
if (gf.signed_url_status !== "not_issued") throw new Error("grant unexpectedly issued a signed storage URL");
if (String(gf.preview_token_hash || "") !== tokenHash) throw new Error("stored preview token hash mismatch");

const expiresMs = Date.parse(String(gf.expires_at || ""));
const ttlMs = expiresMs - Date.now();
if (!Number.isFinite(expiresMs) || ttlMs <= 0 || ttlMs > 16 * 60 * 1000) throw new Error("grant TTL is outside the 15-minute policy window");

const payload = JSON.parse(String(gf.payload_json || "{}"));
if (payload.access_lane !== "private_teaser" || payload.authorization_basis !== "verified_prebooking_eligibility") throw new Error("grant authorization basis mismatch");
if (payload.preview_kind !== PREVIEW_KIND || payload.token_storage !== "sha256_hash_only") throw new Error("grant payload policy mismatch");

const modelId = mask(gf.Model[0]);
const mediaId = mask(gf["Media Asset"][0]);
const media = await recordById(TABLES.media, mediaId);
const mf = media.fields || {};
if (!oneLink(mf.Model) || mf.Model[0] !== modelId) throw new Error("media Model binding mismatch");
if (mf.review_status !== "approved" || mf.teaser_safe !== true) throw new Error("media is not Owner-approved teaser-safe");
if (!["flash_preview", "private_gallery"].includes(String(mf.media_type || ""))) throw new Error("media type is outside teaser policy");
if (!["image/jpeg", "image/png", "image/webp", "video/mp4"].includes(String(mf.file_type || ""))) throw new Error("media MIME is outside teaser policy");
console.log("PASS grant audit: one Client + one Model + one Media Asset; Payment empty; one-view policy locked");

const statusUrl = new URL("/api/member/app/private-preview/status", ORIGIN);
statusUrl.searchParams.set("t", token);
const beforeStatus = await requestJson(statusUrl, {
  headers: { Origin: ORIGIN, Cookie: sessionCookie, Accept: "application/json" },
});
if (beforeStatus.response.status !== 200 || beforeStatus.body?.ok !== true) throw new Error("pre-consume status failed");
if (beforeStatus.body?.preview?.kind !== PREVIEW_KIND || Number(beforeStatus.body?.preview?.viewLimit) !== 1 || beforeStatus.body?.preview?.accessLane !== "private_teaser") {
  throw new Error("pre-consume status contract mismatch");
}
const grantAfterStatus = await recordById(TABLES.grants, grantRecord.id);
if (grantAfterStatus.fields?.grant_status !== "active" || Number(grantAfterStatus.fields?.view_count || 0) !== 0) {
  throw new Error("status check mutated the grant");
}
const preLogs = (await allRecords(TABLES.consumption)).filter(
  (record) => Array.isArray(record.fields?.Grant) && record.fields.Grant.includes(grantRecord.id),
);
if (preLogs.length !== 0) throw new Error("status check unexpectedly created a consumption audit row");
console.log("PASS status is non-consuming");

// No automatic retry: this POST irreversibly consumes the one-use grant.
const consumeResponse = await fetch(new URL("/api/member/app/private-preview/consume", ORIGIN), {
  method: "POST",
  headers: {
    Origin: ORIGIN,
    Cookie: sessionCookie,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ t: token }),
});
const mediaBytes = new Uint8Array(await consumeResponse.arrayBuffer());
if (consumeResponse.status !== 200) throw new Error(`consume failed HTTP ${consumeResponse.status}`);
if (consumeResponse.headers.get("x-mmd-preview-consumed") !== "true") throw new Error("consume response did not confirm one-use consumption");
if (consumeResponse.headers.get("x-mmd-preview-kind") !== PREVIEW_KIND) throw new Error("consume response kind mismatch");
if (!/no-store/i.test(consumeResponse.headers.get("cache-control") || "")) throw new Error("consume response is cacheable");
if (mediaBytes.byteLength < 1) throw new Error("consume delivered no protected bytes");
console.log(`PASS consume delivered ${mediaBytes.byteLength} protected byte(s); payload not printed`);

const replayStatus = await requestJson(statusUrl, {
  headers: { Origin: ORIGIN, Cookie: sessionCookie, Accept: "application/json" },
});
if (replayStatus.response.status !== 410 || replayStatus.body?.error?.code !== "PREVIEW_CONSUMED") {
  throw new Error("replay status did not fail closed as PREVIEW_CONSUMED");
}
const replayConsume = await requestJson("/api/member/app/private-preview/consume", {
  method: "POST",
  headers: {
    Origin: ORIGIN,
    Cookie: sessionCookie,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ t: token }),
});
if (replayConsume.response.status !== 410 || replayConsume.body?.error?.code !== "PREVIEW_CONSUMED") {
  throw new Error("replay consume did not fail closed as PREVIEW_CONSUMED");
}

const consumedGrant = await recordById(TABLES.grants, grantRecord.id);
const cgf = consumedGrant.fields || {};
if (cgf.grant_status !== "consumed" || Number(cgf.view_count || 0) !== 1 || cgf.signed_url_status !== "consumed") {
  throw new Error("grant mirror did not confirm exactly one consumption");
}
if (!emptyLink(cgf.Payment)) throw new Error("consumption unexpectedly linked Payment");

const matchingLogs = (await allRecords(TABLES.consumption)).filter(
  (record) => Array.isArray(record.fields?.Grant) && record.fields.Grant.includes(grantRecord.id),
);
if (matchingLogs.length !== 1) throw new Error(`expected exactly one consumption audit row; got ${matchingLogs.length}`);
const log = matchingLogs[0].fields || {};
if (log.outcome !== "consumed" || log.media_kind !== PREVIEW_KIND) throw new Error("consumption audit outcome/kind mismatch");
if (!oneLink(log.Client) || log.Client[0] !== clientId) throw new Error("consumption audit Client mismatch");
if (!oneLink(log.Model) || log.Model[0] !== modelId) throw new Error("consumption audit Model mismatch");
if (!oneLink(log["Media Asset"]) || log["Media Asset"][0] !== mediaId) throw new Error("consumption audit Media Asset mismatch");
if (!log.consumed_at) throw new Error("consumption audit timestamp missing");

const afterEntitlement = await entitlementSnapshot(clientId);
if (afterEntitlement.count !== beforeEntitlement.count || afterEntitlement.fingerprint !== beforeEntitlement.fingerprint) {
  throw new Error("member entitlement state changed during teaser E2E");
}
console.log("PASS post-consumption audit: one row, Payment empty, entitlements unchanged, replay locked");

await postReceipt();
console.log("PRIVATE_TEASER_REAL_MEMBER_E2E=PRODUCTION_ACCEPTED");
