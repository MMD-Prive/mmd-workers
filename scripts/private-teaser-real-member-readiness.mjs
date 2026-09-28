import process from "node:process";

const {
  AIRTABLE_API_KEY = "",
  AIRTABLE_BASE_ID = "appsV1ILPRfIjkaYg",
  REAL_MEMBER_LIFF_ID_TOKEN = "",
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

async function postIssueReceipt(result) {
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY) return;
  const checkedAt = new Date().toISOString();
  const body = [
    "## Private Teaser Viewer V1 — REAL MEMBER E2E READINESS",
    "",
    `- source_sha: \`${GITHUB_SHA}\``,
    `- checked_at: \`${checkedAt}\``,
    `- production environment real-member token: \`${result.token_present}\``,
    `- Airtable audit credential: \`${result.airtable_present}\``,
    `- TOTO canonical model: \`${result.model_state}\``,
    `- active sellable offer rules: \`${result.active_offer_rule_count}\``,
    `- approved teaser-safe assets: \`${result.approved_teaser_asset_count}\``,
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
  airtable_present: Boolean(String(AIRTABLE_API_KEY || "").trim()),
  model_state: "unchecked",
  active_offer_rule_count: null,
  approved_teaser_asset_count: null,
  ready: false,
};

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

result.ready = result.token_present &&
  result.airtable_present &&
  result.model_state === "found" &&
  Number(result.active_offer_rule_count || 0) > 0 &&
  Number(result.approved_teaser_asset_count || 0) > 0;

await postIssueReceipt(result);

console.log(`Private Teaser real-member readiness: ${result.ready ? "READY" : "BLOCKED"}`);
console.log(
  `TOTO model=${result.model_state}; token=${result.token_present}; Airtable=${result.airtable_present}; active_rules=${result.active_offer_rule_count}; approved_teaser_assets=${result.approved_teaser_asset_count}`,
);
