const STAGING_TABLE = "LINE OFC Client Import Staging";
const SOURCE = "line_oa_renamed_name_fast_trust";
const RANK = { vip: 1, svip: 2, black_card: 3 };
const HARD_STOP = new Set(["blocked", "suspended", "revoked"]);

export async function buildFastTrustEntitlement(env = {}, lineUserId = "", listRecords, canonicalRecords = []) {
  const lineId = canonicalLineId(lineUserId);
  if (!lineId || typeof listRecords !== "function") return null;
  if (hasExplicitHardStop(canonicalRecords)) return null;

  const table = String(
    env.AIRTABLE_TABLE_LINE_OFC_STAGING
      || env.AIRTABLE_LINE_OFC_CLIENT_IMPORT_STAGING_TABLE_ID
      || STAGING_TABLE,
  ).trim();
  if (!table) return null;

  const records = await listRecords(table, {
    filterByFormula: `{line_user_id}=${formulaString(lineId)}`,
    maxRecords: 20,
  });
  const candidates = (Array.isArray(records) ? records : []).flatMap((record) => {
    const renamed = String(record?.fields?.line_renamed_name || "").replace(/\s+/g, " ").trim();
    const tier = trustedTierFromRenamedName(renamed);
    return tier ? [{ tier, renamed }] : [];
  });
  if (!candidates.length) return null;

  candidates.sort((a, b) => RANK[b.tier] - RANK[a.tier]);
  const winner = candidates[0];
  return {
    id: `fasttrust_${winner.tier}`,
    fields: {
      entitlement_id: `fasttrust_${winner.tier}`,
      capability: winner.tier,
      member_lifecycle_status: "active",
      member_status: "active",
      access_status: "active",
      relationship_tier: winner.tier,
      source: SOURCE,
      source_ref: `${SOURCE}:${winner.tier}`,
      line_renamed_name: winner.renamed,
      fast_trust: true,
    },
  };
}

export function trustedTierFromRenamedName(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (/(?:^|[^A-Za-z0-9])black\s*card$/i.test(text)) return "black_card";
  if (/(?:^|[^A-Za-z0-9])svip$/i.test(text)) return "svip";
  if (/(?:^|[^A-Za-z0-9])vip$/i.test(text)) return "vip";
  return null;
}

export function hasExplicitHardStop(records = []) {
  for (const record of Array.isArray(records) ? records : []) {
    const fields = record?.fields || record || {};
    for (const value of [fields.member_lifecycle_status, fields.member_status, fields.access_status, fields.status]) {
      if (HARD_STOP.has(token(value))) return true;
    }
  }
  return false;
}

function canonicalLineId(value) {
  const id = String(value || "").trim();
  return /^U[0-9a-f]{32}$/i.test(id) ? id : "";
}
function formulaString(value) {
  return `'${String(value || "").replace(/'/g, "\\'")}'`;
}
function token(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
