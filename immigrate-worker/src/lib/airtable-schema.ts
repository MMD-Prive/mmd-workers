import type { Env } from "../types";

export type AirtableFieldValue =
  | string
  | number
  | boolean
  | string[]
  | Array<Record<string, unknown>>
  | null
  | undefined;

export type AirtableFields = Record<string, AirtableFieldValue>;

export type AirtableWriteResult = {
  table: string;
  action: "created" | "updated" | "skipped" | "error";
  record_id?: string;
  error?: string;
};

type AirtableRecord = {
  id?: string;
  fields?: AirtableFields;
};

function toStr(value: unknown): string {
  return String(value ?? "").trim();
}

export function airtableWritesEnabled(env: Env): boolean {
  return (
    String(env.ENABLE_AIRTABLE_SYNC || "false").toLowerCase() === "true" &&
    Boolean(env.AIRTABLE_API_KEY && env.AIRTABLE_BASE_ID)
  );
}

export function airtableTable(env: Env, key: string): string {
  const tables: Record<string, string> = {
    clients: env.AIRTABLE_TABLE_CLIENTS || "Clients",
    sessions: env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX",
    jobs: env.AIRTABLE_TABLE_JOBS || "tbl0jxIjN8QYwGABX",
    payments: env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ",
    internal_notes: env.AIRTABLE_TABLE_PRIVATE_PROFILE_NOTES || "Internal Notes",
    activity_logs: env.AIRTABLE_TABLE_ACTIVITY_LOGS || "Activity Logs",
    model_history_imports: env.AIRTABLE_TABLE_MODEL_HISTORY_IMPORTS || "Model History Imports",
  };
  return tables[key] || key;
}

export function encodeFormulaValue(value: string): string {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function compactFields(fields: AirtableFields): AirtableFields {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined && value !== ""),
  );
}

async function airtableRequest(
  env: Env,
  table: string,
  init?: {
    method?: string;
    query?: Record<string, string>;
    body?: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const url = new URL(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(table)}`);
  if (init?.query) {
    for (const [key, value] of Object.entries(init.query)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    method: init?.method || "GET",
    headers: {
      authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
      "content-type": "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });

  const text = await response.text();
  const data = (() => {
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { raw: text };
    }
  })();

  if (!response.ok) {
    throw new Error(`Airtable ${response.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

function parseUnknownFieldName(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.match(/Unknown field name:\s+\\"([^"]+)\\"/)?.[1] ||
    message.match(/Unknown field name:\s+"([^"]+)"/)?.[1] ||
    ""
  );
}

export async function createRecordWithFallbacks(
  env: Env,
  table: string,
  fields: AirtableFields,
): Promise<AirtableWriteResult> {
  const candidate = compactFields(fields);
  while (true) {
    try {
      const result = await airtableRequest(env, table, {
        method: "POST",
        body: { fields: candidate },
      });
      return { table, action: "created", record_id: toStr(result.id) };
    } catch (error) {
      const unknownField = parseUnknownFieldName(error);
      if (unknownField && unknownField in candidate) {
        delete candidate[unknownField];
        if (Object.keys(candidate).length) continue;
      }
      return {
        table,
        action: "error",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export async function patchRecordWithFallbacks(
  env: Env,
  table: string,
  recordId: string,
  fields: AirtableFields,
): Promise<AirtableWriteResult> {
  const candidate = compactFields(fields);
  while (true) {
    try {
      const result = await airtableRequest(env, `${table}/${encodeURIComponent(recordId)}`, {
        method: "PATCH",
        body: { fields: candidate },
      });
      return { table, action: "updated", record_id: toStr(result.id) || recordId };
    } catch (error) {
      const unknownField = parseUnknownFieldName(error);
      if (unknownField && unknownField in candidate) {
        delete candidate[unknownField];
        if (Object.keys(candidate).length) continue;
      }
      return {
        table,
        action: "error",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

async function findFirstRecord(
  env: Env,
  table: string,
  formula: string,
): Promise<AirtableRecord | null> {
  const result = await airtableRequest(env, table, {
    query: {
      maxRecords: "1",
      filterByFormula: formula,
    },
  });
  const records = Array.isArray(result.records) ? result.records : [];
  return (records[0] as AirtableRecord | undefined) || null;
}

export async function upsertRecordWithFallbacks(
  env: Env,
  table: string,
  formula: string,
  fields: AirtableFields,
): Promise<AirtableWriteResult> {
  try {
    const existing = await findFirstRecord(env, table, formula);
    if (existing?.id) {
      return await patchRecordWithFallbacks(env, table, existing.id, fields);
    }
  } catch {
    return await createRecordWithFallbacks(env, table, fields);
  }

  return await createRecordWithFallbacks(env, table, fields);
}
