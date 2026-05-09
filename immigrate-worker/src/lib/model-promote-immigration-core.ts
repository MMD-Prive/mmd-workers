import type { Env } from "../types";

type AirtableScalar = string | number | boolean | string[] | null | undefined;
type AirtableFields = Record<string, AirtableScalar>;

type AirtableRecord = {
  id: string;
  fields?: AirtableFields;
};

type PromoteModelInput = {
  draft_id?: string;
  source_record_id?: string;
  model_name?: string;
  display_name?: string;
  nickname?: string;
  phone?: string;
  line_user_id?: string;
  line_id?: string;
  telegram_username?: string;
  age?: number | string;
  consent_status?: string;
  verification_status?: string;
  source?: string;
  note?: string;
  operator_note?: string;
  promoted_by?: string;
  payload_json?: Record<string, unknown>;
};

type PromoteModelOutput = {
  contract_version: "model_promote_immigration_v1";
  draft_id: string;
  model_record_id: string;
  model_name: string;
  promotion_status: "promoted";
  promoted_at: string;
  promoted_by: string;
};

function toStr(value: unknown): string {
  return String(value ?? "").trim();
}

function toNum(value: unknown): number | undefined {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    const s = toStr(value);
    if (s) return s;
  }
  return "";
}

function pickField(fields: AirtableFields | undefined, keys: string[]): string {
  for (const key of keys) {
    const value = fields?.[key];
    const s = toStr(value);
    if (s) return s;
  }
  return "";
}

async function getDraftById(env: Env, draftId: string): Promise<AirtableRecord | null> {
  throw new Error("Implement getDraftById(env, draftId) with Airtable GET models/draft/{recordId}");
}

async function findDraftBySourceRecordId(env: Env, sourceRecordId: string): Promise<AirtableRecord | null> {
  throw new Error("Implement findDraftBySourceRecordId(env, sourceRecordId) with Airtable filterByFormula");
}

async function createModelRecord(env: Env, fields: AirtableFields): Promise<{ id: string }> {
  throw new Error("Implement createModelRecord(env, fields) with Airtable POST Models");
}

async function updateModelDraft(env: Env, draftId: string, fields: AirtableFields): Promise<void> {
  throw new Error("Implement updateModelDraft(env, draftId, fields) with Airtable PATCH models/draft/{recordId}");
}

async function createActivityLog(env: Env, fields: AirtableFields): Promise<void> {
  throw new Error("Implement createActivityLog(env, fields) with Airtable POST Activity Logs");
}

export async function promoteModelImmigration(
  env: Env,
  input: PromoteModelInput,
): Promise<PromoteModelOutput> {
  const promotedAt = new Date().toISOString();

  const draft = input.draft_id
    ? await getDraftById(env, input.draft_id)
    : input.source_record_id
      ? await findDraftBySourceRecordId(env, input.source_record_id)
      : null;

  const modelName = firstString(
    input.model_name,
    input.display_name,
    input.nickname,
    pickField(draft?.fields, ["model_name", "Model Name", "display_name", "Display Name", "nickname"]),
  );

  if (!modelName) {
    throw new Error("missing_model_name");
  }

  const normalized = {
    draft_id: firstString(input.draft_id, draft?.id),
    source_record_id: firstString(
      input.source_record_id,
      pickField(draft?.fields, ["source_record_id", "Source Record ID"]),
    ),
    model_name: modelName,
    phone: firstString(input.phone, pickField(draft?.fields, ["phone", "Phone", "Phone Number"])),
    line_user_id: firstString(input.line_user_id, pickField(draft?.fields, ["line_user_id", "LINE User ID"])),
    line_id: firstString(input.line_id, pickField(draft?.fields, ["line_id", "LINE ID"])),
    telegram_username: firstString(
      input.telegram_username,
      pickField(draft?.fields, ["telegram_username", "Telegram Username"]),
    ),
    age: toNum(input.age ?? draft?.fields?.age ?? draft?.fields?.Age),
    consent_status: firstString(
      input.consent_status,
      pickField(draft?.fields, ["consent_status", "Consent Status"]),
      "pending_review",
    ),
    verification_status: firstString(
      input.verification_status,
      pickField(draft?.fields, ["verification_status", "Verification Status"]),
      "draft_promoted",
    ),
    source: firstString(input.source, pickField(draft?.fields, ["source", "Source"]), "model_immigration"),
    note: firstString(input.note, input.operator_note, pickField(draft?.fields, ["note", "Notes", "operator_note"])),
    promoted_by: firstString(input.promoted_by, "admin"),
    promoted_at: promotedAt,
    payload_json: {
      ...(input.payload_json || {}),
      draft_fields_snapshot: draft?.fields || null,
      source_record_id: input.source_record_id || "",
    },
  };

  const modelRecord = await createModelRecord(env, {
    "Model Name": normalized.model_name,
    "Phone Number": normalized.phone,
    line_user_id: normalized.line_user_id,
    line_id: normalized.line_id,
    telegram_username: normalized.telegram_username,
    Age: normalized.age,
    consent_status: normalized.consent_status,
    verification_status: normalized.verification_status,
    source: normalized.source,
    notes_raw: JSON.stringify(
      {
        migration_layer: "immigrate-worker",
        boundary:
          "Model promotion from immigration draft. Core model truth starts at promoted model record.",
        draft_id: normalized.draft_id,
        source_record_id: normalized.source_record_id,
        promoted_at: normalized.promoted_at,
        promoted_by: normalized.promoted_by,
        note: normalized.note,
        payload_json: normalized.payload_json,
      },
      null,
      2,
    ),
  });

  if (!modelRecord.id) {
    throw new Error("missing_model_record_id");
  }

  if (normalized.draft_id) {
    await updateModelDraft(env, normalized.draft_id, {
      promotion_status: "promoted",
      promoted_model_id: modelRecord.id,
      promoted_at: normalized.promoted_at,
      promoted_by: normalized.promoted_by,
    });
  }

  await createActivityLog(env, {
    title: `Model promoted: ${normalized.model_name}`,
    scope: "model_immigration",
    action: "promote_model_immigration",
    target_id: modelRecord.id,
    notes: JSON.stringify(
      {
        draft_id: normalized.draft_id,
        source_record_id: normalized.source_record_id,
        model_record_id: modelRecord.id,
        promoted_at: normalized.promoted_at,
        promoted_by: normalized.promoted_by,
      },
      null,
      2,
    ),
  });

  return {
    contract_version: "model_promote_immigration_v1",
    draft_id: normalized.draft_id,
    model_record_id: modelRecord.id,
    model_name: normalized.model_name,
    promotion_status: "promoted",
    promoted_at: normalized.promoted_at,
    promoted_by: normalized.promoted_by,
  };
}
