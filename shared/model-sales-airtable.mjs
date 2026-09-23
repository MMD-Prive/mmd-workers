import { normalizeModelSalesRule, resolveModelSalesOffer } from "./model-sales-control-v1.mjs";

const AIRTABLE_API = "https://api.airtable.com/v0";
const TABLE_FALLBACK = "MMD — Model Offer Rules";
const MAX_RULES = 500;

export async function resolveModelSalesOfferFromAirtable(env = {}, input = {}, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const rules = await loadModelSalesRules(env, fetchImpl);
  const modelId = clean(input.model_id || input.modelId, 100);
  const modelKey = clean(input.model_key || input.modelKey, 160).toLowerCase();
  const configured = rules
    .map((record, index) => normalizeModelSalesRule(record, index))
    .filter(Boolean)
    .filter((rule) => modelMatches(rule, modelId, modelKey));

  const resolved = resolveModelSalesOffer({ ...input, rules });
  return {
    ...resolved,
    configured_rule_count: configured.length,
    configured_active_rule_count: configured.filter((rule) => ["active","approved","live","published"].includes(rule.status)).length,
    source: "airtable_model_offer_rules",
  };
}

export async function loadModelSalesRules(env = {}, fetchImpl = fetch) {
  const apiKey = clean(env.AIRTABLE_API_KEY, 1200);
  const baseId = clean(env.AIRTABLE_BASE_ID, 200);
  const table = clean(
    env.AIRTABLE_TABLE_MODEL_OFFER_RULES_ID ||
    env.AIRTABLE_TABLE_MODEL_OFFER_RULES ||
    TABLE_FALLBACK,
    200
  );
  if (!apiKey || !baseId || !table) throw new Error("model_sales_source_unavailable");

  const records = [];
  let offset = "";
  do {
    const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    let response;
    try {
      response = await fetchImpl(url.toString(), {
        method: "GET",
        headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
      });
    } catch (_) {
      throw new Error("model_sales_source_unavailable");
    }
    if (!response.ok) throw new Error("model_sales_source_unavailable");
    const data = await response.json().catch(() => ({}));
    records.push(...(Array.isArray(data?.records) ? data.records : []));
    offset = clean(data?.offset, 200);
  } while (offset && records.length < MAX_RULES);

  return records.slice(0, MAX_RULES);
}

function modelMatches(rule, modelId, modelKey) {
  if (modelId && Array.isArray(rule.model_ids) && rule.model_ids.includes(modelId)) return true;
  return Boolean(modelKey && rule.model_key && rule.model_key === modelKey);
}

function clean(value, max = 500) {
  return String(value == null ? "" : value).trim().slice(0, max);
}
