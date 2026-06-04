import type { DealLite, Env, UpsertAiRequest, UpsertAiResponse } from "../types";

const DEAL_FIELDS = [
  "deal_id",
  "client_id",
  "client_name",
  "channel",
  "client_tier",
  "occasion",
  "timing_label",
  "venue_name",
  "budget_amount_thb",
  "budget_signal",
  "history_signal",
  "high_value_client",
  "specific_model_requested",
  "ai_top_model",
  "ai_reply_draft",
  "ai_requires_per_review",
  "deal_status",
  "urgency_level",
] as const;

type AirtableValue = string | number | boolean | string[] | null | undefined;

interface AirtableRecord {
  id: string;
  fields?: Record<string, AirtableValue>;
}

interface AirtableListResponse {
  records?: AirtableRecord[];
  offset?: string;
}

function airtableUrl(env: Env): URL {
  return new URL(
    `https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(env.AIRTABLE_TABLE_DEALS)}`,
  );
}

function authHeaders(env: Env): HeadersInit {
  return {
    Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
    "content-type": "application/json",
  };
}

function getString(
  fields: Record<string, AirtableValue> | undefined,
  key: string,
): string | undefined {
  const value = fields?.[key];
  return typeof value === "string" ? value : undefined;
}

function getNumber(
  fields: Record<string, AirtableValue> | undefined,
  key: string,
): number | undefined {
  const value = fields?.[key];
  return typeof value === "number" ? value : undefined;
}

function getBoolean(
  fields: Record<string, AirtableValue> | undefined,
  key: string,
): boolean | undefined {
  const value = fields?.[key];
  return typeof value === "boolean" ? value : undefined;
}

function mapDeal(record: AirtableRecord): DealLite | null {
  const fields = record.fields;
  const deal_id = getString(fields, "deal_id");
  const client_name = getString(fields, "client_name");
  const channel = getString(fields, "channel");
  const client_tier = getString(fields, "client_tier");
  const deal_status = getString(fields, "deal_status");

  if (!deal_id || !client_name || !channel || !client_tier || !deal_status) {
    return null;
  }

  return {
    deal_id,
    client_id: getString(fields, "client_id"),
    client_name,
    channel: channel as DealLite["channel"],
    client_tier: client_tier as DealLite["client_tier"],
    occasion: getString(fields, "occasion"),
    timing_label: getString(fields, "timing_label"),
    venue_name: getString(fields, "venue_name"),
    budget_amount_thb: getNumber(fields, "budget_amount_thb"),
    budget_signal: getString(fields, "budget_signal") as
      | DealLite["budget_signal"]
      | undefined,
    history_signal: getString(fields, "history_signal") as
      | DealLite["history_signal"]
      | undefined,
    high_value_client: getBoolean(fields, "high_value_client"),
    specific_model_requested: getBoolean(fields, "specific_model_requested"),
    ai_top_model: getString(fields, "ai_top_model"),
    ai_reply_draft: getString(fields, "ai_reply_draft"),
    ai_requires_per_review: getBoolean(fields, "ai_requires_per_review"),
    deal_status: deal_status as DealLite["deal_status"],
    urgency_level: getString(fields, "urgency_level") as
      | DealLite["urgency_level"]
      | undefined,
  };
}

function toAirtableFields(payload: UpsertAiRequest): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );
}

async function findDealRecordId(env: Env, dealId: string): Promise<string | null> {
  const url = airtableUrl(env);
  url.searchParams.set("maxRecords", "1");
  url.searchParams.set("filterByFormula", `{deal_id} = '${dealId.replace(/'/g, "\\'")}'`);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: authHeaders(env),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable deal lookup failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as AirtableListResponse;
  return data.records?.[0]?.id ?? null;
}

export async function listDealsLite(env: Env): Promise<DealLite[]> {
  const all: DealLite[] = [];
  let offset: string | undefined;

  do {
    const url = airtableUrl(env);

    for (const field of DEAL_FIELDS) {
      url.searchParams.append("fields[]", field);
    }

    url.searchParams.set("pageSize", "100");

    if (offset) {
      url.searchParams.set("offset", offset);
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: authHeaders(env),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Airtable deals list failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as AirtableListResponse;

    for (const record of data.records ?? []) {
      const mapped = mapDeal(record);
      if (mapped) {
        all.push(mapped);
      }
    }

    offset = data.offset;
  } while (offset);

  return all;
}

export async function upsertDealAi(
  env: Env,
  payload: UpsertAiRequest,
): Promise<UpsertAiResponse> {
  const existingRecordId = await findDealRecordId(env, payload.deal_id);
  const fields = toAirtableFields(payload);

  const response = await fetch(
    existingRecordId ? `${airtableUrl(env).toString()}/${existingRecordId}` : airtableUrl(env).toString(),
    {
      method: existingRecordId ? "PATCH" : "POST",
      headers: authHeaders(env),
      body: JSON.stringify({ fields }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable deal upsert failed: ${response.status} ${text}`);
  }

  const record = (await response.json()) as AirtableRecord;

  return {
    ok: true,
    deal_id: payload.deal_id,
    updated: Boolean(existingRecordId),
    created: !existingRecordId,
    airtable_record_id: record.id,
  };
}
