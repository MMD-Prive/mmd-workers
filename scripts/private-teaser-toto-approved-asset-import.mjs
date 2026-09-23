import process from "node:process";

const env = process.env;
const required = [
  "ADMIN_LOGIN_CREDENTIAL",
  "AIRTABLE_API_KEY",
  "GITHUB_TOKEN",
  "GITHUB_REPOSITORY",
];
for (const key of required) {
  if (!String(env[key] || "").trim()) throw new Error(`${key} is required`);
}
for (const secret of [env.ADMIN_LOGIN_CREDENTIAL, env.AIRTABLE_API_KEY, env.GITHUB_TOKEN]) {
  console.log(`::add-mask::${secret}`);
}

const ORIGIN = String(env.ORIGIN || "https://mmdbkk.com").replace(/\/$/, "");
const BASE_ID = String(env.AIRTABLE_BASE_ID || "appsV1ILPRfIjkaYg");
const MODELS_TABLE = String(env.MODELS_TABLE || "tblI4B0bI446vp9GX");
const MEDIA_TABLE = String(env.MEDIA_TABLE || "tblrpQXhHnbTU9RhW");
const TARGET_MODEL_KEY = String(env.TARGET_MODEL_KEY || "toto").trim().toLowerCase();
const REAL_MEMBER_TOKEN_PRESENT = Boolean(String(env.REAL_MEMBER_LIFF_ID_TOKEN || "").trim());

function clean(value, max = 1000) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
function formula(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function airtable(url, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("authorization", `Bearer ${env.AIRTABLE_API_KEY}`);
  headers.set("accept", "application/json");
  const response = await fetch(url, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Airtable request failed HTTP ${response.status}`);
  return body;
}
async function recordsByFormula(table, filterByFormula, maxRecords = 10) {
  const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(table)}`);
  url.searchParams.set("filterByFormula", filterByFormula);
  url.searchParams.set("maxRecords", String(maxRecords));
  return (await airtable(url)).records || [];
}
async function allRecords(table, fields = []) {
  const records = [];
  let offset = "";
  for (let page = 0; page < 20; page += 1) {
    const url = new URL(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", "100");
    for (const field of fields) url.searchParams.append("fields[]", field);
    if (offset) url.searchParams.set("offset", offset);
    const body = await airtable(url);
    records.push(...(body.records || []));
    offset = clean(body.offset, 500);
    if (!offset) break;
  }
  return records;
}
async function recordById(table, id) {
  return airtable(`https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(table)}/${encodeURIComponent(id)}`);
}
function extractApprovedFilename(notes) {
  const text = String(notes || "");
  if (!/private\s+teaser/i.test(text) || !/verified\s*line|line[-\s]*verified/i.test(text)) {
    throw new Error("TOTO notes do not contain the required Private Teaser + verified LINE owner approval");
  }
  const match = text.match(/for\s+file\s+(.+?):\s*verified\s+LINE/i);
  if (!match) throw new Error("TOTO notes do not identify one approved source filename");
  const fileName = clean(match[1], 240);
  if (!fileName || /[\x00-\x1f/\\]/.test(fileName)) throw new Error("approved filename is invalid");
  console.log(`::add-mask::${fileName}`);
  return fileName;
}
function sessionCookie(response) {
  const values = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") || ""];
  for (const value of values) {
    const first = String(value || "").split(";")[0].trim();
    if (first.startsWith("mmd_admin_gate_v1=")) return first;
  }
  return "";
}
async function adminJson(path, cookie, body) {
  const response = await fetch(`${ORIGIN}${path}`, {
    method: body === undefined ? "GET" : "POST",
    redirect: "manual",
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? { accept: "application/json" } : {
        origin: ORIGIN,
        accept: "application/json",
        "content-type": "application/json",
      }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => null);
  return { response, data };
}
async function postReceipt(lines) {
  const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/issues/325/comments`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ body: lines.join("\n") }),
  });
  if (!response.ok) throw new Error(`GitHub receipt failed HTTP ${response.status}`);
}

const models = await recordsByFormula(
  MODELS_TABLE,
  `LOWER({unique_key})='${formula(TARGET_MODEL_KEY)}'`,
  3,
);
if (models.length !== 1) throw new Error(`TOTO canonical model lookup must resolve once; got ${models.length}`);
const model = models[0];
const modelId = clean(model.id, 100);
console.log(`::add-mask::${modelId}`);
const modelFields = model.fields || {};
if (clean(modelFields.folder_approval_status, 120) !== "Approved Folder Inventory") {
  throw new Error("TOTO model folder is not canonical Approved Folder Inventory");
}
if (!clean(modelFields.drive_folder_id, 200)) throw new Error("TOTO model has no canonical Drive folder binding");
const approvedFileName = extractApprovedFilename(modelFields.notes);

const loginBody = new URLSearchParams({
  credential: env.ADMIN_LOGIN_CREDENTIAL,
  next: "/internal/admin/mmd-review",
});
const login = await fetch(`${ORIGIN}/internal/admin/login/session`, {
  method: "POST",
  redirect: "manual",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: loginBody,
});
if (login.status !== 303) throw new Error(`owner login failed HTTP ${login.status}`);
const cookie = sessionCookie(login);
if (!cookie) throw new Error("owner login did not issue mmd_admin_gate_v1");
console.log(`::add-mask::${cookie}`);
console.log("PASS owner session established");

let routeReady = false;
for (let attempt = 0; attempt < 18; attempt += 1) {
  const probe = await adminJson("/v1/admin/private-media/import-approved-drive", cookie, {
    model_id: modelId,
    file_name: "__private_teaser_route_probe__.jpg",
  });
  if (probe.response.status === 409 && probe.data?.error === "private_teaser_source_not_owner_approved") {
    routeReady = true;
    break;
  }
  if (![404, 503].includes(probe.response.status)) {
    throw new Error(`unexpected import route probe HTTP ${probe.response.status}`);
  }
  await sleep(5000);
}
if (!routeReady) throw new Error("approved Drive import route did not become live");
console.log("PASS approved Drive import route is live; probe was non-mutating");

const mediaRows = await allRecords(MEDIA_TABLE, [
  "Model",
  "file_name",
  "review_status",
  "teaser_safe",
  "private_safe",
  "public_safe",
  "flash_safe",
  "media_type",
]);
const matching = mediaRows.filter((record) => {
  const f = record.fields || {};
  return Array.isArray(f.Model) &&
    f.Model.length === 1 &&
    f.Model[0] === modelId &&
    clean(f.file_name, 240) === approvedFileName &&
    ["pending_review", "approved"].includes(clean(f.review_status, 80));
});
if (matching.length > 1) throw new Error("multiple active private-media rows exist for the approved TOTO source");

let mediaRecord = matching[0] || null;
let imported = false;
if (!mediaRecord) {
  let importedResult = null;
  for (let attempt = 0; attempt < 18; attempt += 1) {
    importedResult = await adminJson("/v1/admin/private-media/import-approved-drive", cookie, {
      model_id: modelId,
      file_name: approvedFileName,
    });
    if (importedResult.response.status === 200 && importedResult.data?.ok === true) break;
    // This exact error is emitted before planPrivateUpload, so retrying cannot
    // duplicate an Airtable media row or private R2 object while workers converge.
    if (
      importedResult.response.status === 404 &&
      importedResult.data?.error === "approved_drive_media_unavailable"
    ) {
      await sleep(5000);
      continue;
    }
    throw new Error(`approved Drive import failed HTTP ${importedResult.response.status}`);
  }
  if (importedResult?.response.status !== 200 || importedResult.data?.ok !== true) {
    throw new Error("approved Drive source did not become available before retry window closed");
  }
  const mediaRecordId = clean(importedResult.data.media_asset_id, 100);
  if (!/^rec[a-zA-Z0-9]+$/.test(mediaRecordId)) throw new Error("import did not return a canonical media record");
  console.log(`::add-mask::${mediaRecordId}`);
  mediaRecord = await recordById(MEDIA_TABLE, mediaRecordId);
  imported = true;
}
console.log(`::add-mask::${mediaRecord.id}`);

let fields = mediaRecord.fields || {};
if (clean(fields.file_name, 240) !== approvedFileName) throw new Error("media filename readback mismatch");
if (!Array.isArray(fields.Model) || fields.Model.length !== 1 || fields.Model[0] !== modelId) throw new Error("media Model binding mismatch");
if (!["flash_preview", "private_gallery"].includes(clean(fields.media_type, 80))) throw new Error("media type is outside Private Teaser policy");
if (fields.public_safe === true) throw new Error("private teaser source became public-safe");

if (!(fields.review_status === "approved" && fields.teaser_safe === true)) {
  if (fields.review_status !== "pending_review") {
    throw new Error(`approved source is in unexpected review state: ${clean(fields.review_status, 80)}`);
  }
  const inspectResponse = await fetch(`${ORIGIN}/v1/admin/private-media/file`, {
    method: "POST",
    headers: {
      cookie,
      origin: ORIGIN,
      "content-type": "application/json",
    },
    body: JSON.stringify({ model_id: modelId, media_asset_id: mediaRecord.id }),
  });
  if (inspectResponse.status !== 200) throw new Error(`private media inspection failed HTTP ${inspectResponse.status}`);
  const digest = clean(inspectResponse.headers.get("x-mmd-media-sha256"), 80);
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("private media inspection did not return a verified digest");
  const inspectedBytes = await inspectResponse.arrayBuffer();
  if (!inspectedBytes.byteLength) throw new Error("private media inspection returned no bytes");
  console.log("PASS exact imported private bytes inspected; bytes not logged");

  const decision = await adminJson("/v1/admin/private-media/decision", cookie, {
    model_id: modelId,
    media_asset_id: mediaRecord.id,
    expected_status: "pending_review",
    media_sha256: digest,
    decision: "approve",
    teaser_safe: true,
    note: "Owner-approved exact Drive Private Teaser source; canonical consent carried from Model notes.",
  });
  if (decision.response.status !== 200 || decision.data?.ok !== true || decision.data?.teaser_safe !== true) {
    throw new Error(`Private Teaser approval failed HTTP ${decision.response.status}`);
  }
  fields = (await recordById(MEDIA_TABLE, mediaRecord.id)).fields || {};
}

if (
  fields.review_status !== "approved" ||
  fields.private_safe !== true ||
  fields.flash_safe !== true ||
  fields.teaser_safe !== true ||
  fields.public_safe === true
) throw new Error("final Private Teaser safety flags are not canonical");

const finalCount = (await allRecords(MEDIA_TABLE, ["Model","review_status","teaser_safe","media_type"]))
  .filter((record) => {
    const f = record.fields || {};
    return Array.isArray(f.Model) &&
      f.Model.includes(modelId) &&
      f.review_status === "approved" &&
      f.teaser_safe === true &&
      ["flash_preview", "private_gallery"].includes(clean(f.media_type, 80));
  }).length;
if (finalCount < 1) throw new Error("no approved teaser-safe TOTO asset exists after operation");

await postReceipt([
  "## ✅ Private Teaser Viewer V1 — TOTO APPROVED ASSET READY",
  "",
  `- source_sha: \`${env.GITHUB_SHA}\``,
  `- checked_at: \`${new Date().toISOString()}\``,
  "- model: `TOTO`",
  "- source: canonical approved Model Drive binding + owner consent note",
  `- imported_new_private_asset: \`${imported}\``,
  "- storage: private R2 only",
  "- review: canonical owner private-media inspection + decision",
  "- final flags: `approved / private_safe=true / flash_safe=true / teaser_safe=true / public_safe=false`",
  `- approved_teaser_asset_count: \`${finalCount}\``,
  `- real_member_e2e_token_present: \`${REAL_MEMBER_TOKEN_PRESENT}\``,
  "- Drive file ID, source filename, media record IDs and image bytes: not recorded in receipt",
]);

console.log(`PRIVATE_TEASER_TOTO_ASSET=READY; imported=${imported}; teaser_assets=${finalCount}; real_member_token_present=${REAL_MEMBER_TOKEN_PRESENT}`);
