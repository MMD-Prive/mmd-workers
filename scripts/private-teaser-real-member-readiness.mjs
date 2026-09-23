import crypto from "node:crypto";
import process from "node:process";

const {
  ADMIN_LOGIN_CREDENTIAL = "",
  AIRTABLE_API_KEY = "",
  AIRTABLE_BASE_ID = "appsV1ILPRfIjkaYg",
  GOOGLE_CLIENT_ID = "",
  GOOGLE_CLIENT_SECRET = "",
  GOOGLE_REFRESH_TOKEN = "",
  ORIGIN = "https://mmdbkk.com",
  REAL_MEMBER_LIFF_ID_TOKEN = "",
  TOTO_DRIVE_FILE_ID = "1IjPrKwGw42QDGooNccn237jXWo_8STw_",
  TOTO_EXPECTED_SHA256 = "08725c3258dd12bb2f6072cc3779046c45ac19c618338d59dcb0918cea813693",
  TOTO_EXPECTED_SIZE = "83386",
  GITHUB_REPOSITORY = "",
  GITHUB_SHA = "",
  GITHUB_TOKEN = "",
  MODELS_TABLE = "tblI4B0bI446vp9GX",
  MEDIA_TABLE = "tblrpQXhHnbTU9RhW",
  RULES_TABLE = "tblSbxUGTFqd2CgPy",
} = process.env;

const publicSlug = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 100);

const selectName = (value) =>
  value && typeof value === "object" ? String(value.name || "") : String(value || "");

async function allRecords(table, fields = []) {
  if (!AIRTABLE_API_KEY) return [];
  const records = [];
  let offset = "";
  for (let page = 0; page < 20; page += 1) {
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", "100");
    for (const field of fields) url.searchParams.append("fields[]", field);
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Airtable readiness read failed HTTP ${response.status}`);
    const body = await response.json();
    records.push(...(body.records || []));
    offset = String(body.offset || "");
    if (!offset) break;
  }
  return records;
}

async function ownerSessionReady() {
  const credential = String(ADMIN_LOGIN_CREDENTIAL || "").replace(/[\r\n\u2028\u2029]/g, "").trim();
  if (!credential) return false;
  const login = await fetch(new URL("/internal/admin/login/session", ORIGIN), {
    method: "POST",
    redirect: "manual",
    headers: {
      Origin: ORIGIN,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      credential,
      next: "/internal/admin/mmd-review",
    }),
  });
  if (login.status !== 303) return false;
  const cookies = typeof login.headers.getSetCookie === "function"
    ? login.headers.getSetCookie()
    : [login.headers.get("set-cookie") || ""];
  const cookie = cookies.map((value) => String(value || "").split(";", 1)[0]).filter(Boolean).join("; ");
  if (!/mmd_admin_gate_v1=/.test(cookie)) return false;
  const auth = await fetch(new URL("/v1/admin/auth/me", ORIGIN), {
    headers: { Cookie: cookie, Origin: ORIGIN, Accept: "application/json" },
  });
  const body = await auth.json().catch(() => ({}));
  return auth.ok && body?.ok === true && body?.authenticated === true && body?.scope === "internal_admin";
}

async function driveFileReadiness() {
  const clientId = String(GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = String(GOOGLE_CLIENT_SECRET || "").trim();
  const refreshToken = String(GOOGLE_REFRESH_TOKEN || "").trim();
  if (!clientId || !clientSecret || !refreshToken) {
    return { auth_ready: false, file_state: "credential_missing", hash_match: false, size_match: false };
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const tokenBody = await tokenResponse.json().catch(() => ({}));
  const accessToken = String(tokenBody?.access_token || "").trim();
  if (!tokenResponse.ok || !accessToken) {
    return { auth_ready: false, file_state: `oauth_${tokenResponse.status}`, hash_match: false, size_match: false };
  }

  const metadataResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(TOTO_DRIVE_FILE_ID)}?fields=id,name,mimeType,size&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
  );
  const metadata = await metadataResponse.json().catch(() => ({}));
  if (!metadataResponse.ok) {
    return { auth_ready: true, file_state: `metadata_${metadataResponse.status}`, hash_match: false, size_match: false };
  }

  const mediaResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(TOTO_DRIVE_FILE_ID)}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!mediaResponse.ok) {
    return { auth_ready: true, file_state: `media_${mediaResponse.status}`, hash_match: false, size_match: false };
  }
  const bytes = Buffer.from(await mediaResponse.arrayBuffer());
  const digest = crypto.createHash("sha256").update(bytes).digest("hex");
  const expectedSize = Number(TOTO_EXPECTED_SIZE);
  return {
    auth_ready: true,
    file_state: String(metadata?.name || "") === "2568-12-13 04.06.02.jpg" && String(metadata?.mimeType || "") === "image/jpeg"
      ? "exact_file_readable"
      : "metadata_mismatch",
    hash_match: digest === TOTO_EXPECTED_SHA256,
    size_match: bytes.byteLength === expectedSize && Number(metadata?.size || 0) === expectedSize,
  };
}

async function postIssueReceipt(result) {
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY) return;
  const checkedAt = new Date().toISOString();
  const body = [
    "## Private Teaser Viewer V1 — REAL MEMBER E2E READINESS",
    "",
    `- source_sha: \`${GITHUB_SHA}\``,
    `- checked_at: \`${checkedAt}\``,
    `- production environment real-member token: \`${result.token_present}\``,
    `- owner admin session credential: \`${result.owner_session_ready}\``,
    `- Google OAuth usable for exact TOTO Drive file: \`${result.drive_file_state}\``,
    `- exact TOTO Drive SHA-256 match: \`${result.drive_hash_match}\``,
    `- exact TOTO Drive size match: \`${result.drive_size_match}\``,
    `- Airtable audit credential: \`${result.airtable_present}\``,
    `- TOTO canonical model: \`${result.model_state}\``,
    `- active sellable offer rules: \`${result.active_offer_rule_count}\``,
    `- approved teaser-safe assets: \`${result.approved_teaser_asset_count}\``,
    `- **ready_for_owner_authenticated_toto_import: \`${result.asset_import_ready}\`**`,
    `- **ready_for_real_grant_consume: \`${result.ready}\`**`,
    "- mutation performed: `false`",
  ].join("\n");

  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_REPOSITORY}/issues/325/comments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body }),
    },
  );
  if (!response.ok) throw new Error(`GitHub readiness receipt failed HTTP ${response.status}`);
}

const result = {
  token_present: Boolean(String(REAL_MEMBER_LIFF_ID_TOKEN || "").trim()),
  owner_session_ready: false,
  drive_file_state: "unchecked",
  drive_hash_match: false,
  drive_size_match: false,
  airtable_present: Boolean(String(AIRTABLE_API_KEY || "").trim()),
  model_state: "unchecked",
  active_offer_rule_count: null,
  approved_teaser_asset_count: null,
  asset_import_ready: false,
  ready: false,
};

try {
  result.owner_session_ready = await ownerSessionReady();
} catch {
  result.owner_session_ready = false;
}

try {
  const drive = await driveFileReadiness();
  result.drive_file_state = drive.file_state;
  result.drive_hash_match = drive.hash_match;
  result.drive_size_match = drive.size_match;
} catch (error) {
  result.drive_file_state = `source_unavailable:${String(error?.message || error).slice(0, 80)}`;
}

if (AIRTABLE_API_KEY) {
  try {
    const models = await allRecords(MODELS_TABLE, ["working_name"]);
    const matches = models.filter((record) => publicSlug(record.fields?.working_name) === "toto");
    result.model_state = matches.length === 1 ? "found" : matches.length === 0 ? "missing" : "ambiguous";

    if (matches.length === 1) {
      const modelId = matches[0].id;
      const media = await allRecords(MEDIA_TABLE, ["Model", "media_type", "review_status", "teaser_safe", "file_type"]);
      result.approved_teaser_asset_count = media.filter((record) => {
        const f = record.fields || {};
        return Array.isArray(f.Model) &&
          f.Model.includes(modelId) &&
          f.review_status === "approved" &&
          f.teaser_safe === true &&
          ["flash_preview", "private_gallery"].includes(String(f.media_type || "")) &&
          ["image/jpeg", "image/png", "image/webp", "video/mp4"].includes(String(f.file_type || ""));
      }).length;

      const rules = await allRecords(RULES_TABLE, ["Model", "status", "sales_visibility"]);
      result.active_offer_rule_count = rules.filter((record) => {
        const f = record.fields || {};
        return Array.isArray(f.Model) &&
          f.Model.includes(modelId) &&
          ["active", "approved", "live", "published"].includes(selectName(f.status).toLowerCase()) &&
          selectName(f.sales_visibility).toLowerCase() !== "off";
      }).length;
    }
  } catch (error) {
    result.model_state = "source_unavailable";
    result.read_error = String(error?.message || error).slice(0, 160);
  }
}

result.asset_import_ready = result.owner_session_ready &&
  result.airtable_present &&
  result.model_state === "found" &&
  Number(result.active_offer_rule_count || 0) > 0 &&
  Number(result.approved_teaser_asset_count || 0) === 0 &&
  result.drive_file_state === "exact_file_readable" &&
  result.drive_hash_match &&
  result.drive_size_match;

result.ready = result.token_present &&
  result.airtable_present &&
  result.model_state === "found" &&
  Number(result.active_offer_rule_count || 0) > 0 &&
  Number(result.approved_teaser_asset_count || 0) > 0;

await postIssueReceipt(result);

console.log(`Private Teaser real-member readiness: ${result.ready ? "READY" : "BLOCKED"}`);
console.log(
  `TOTO model=${result.model_state}; token=${result.token_present}; owner=${result.owner_session_ready}; drive=${result.drive_file_state}; drive_hash=${result.drive_hash_match}; Airtable=${result.airtable_present}; active_rules=${result.active_offer_rule_count}; approved_teaser_assets=${result.approved_teaser_asset_count}; import_ready=${result.asset_import_ready}`,
);
