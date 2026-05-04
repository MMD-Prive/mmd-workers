import type { AirtableFields } from "./airtable-schema";

export type ModelNotePayload = {
  model_name?: unknown;
  model_record_id?: unknown;
  model_history_note?: unknown;
  model_note?: unknown;
  private_profile_note?: unknown;
  model_history_source?: unknown;
  model_history_status?: unknown;
  model_history_payload_json?: unknown;
  payload_json?: unknown;
};

export type ModelNoteArtifacts = {
  has_notes: boolean;
  note: string;
  source: string;
  status: string;
  internal_note_fields: AirtableFields;
  model_history_fields: AirtableFields;
};

function toStr(value: unknown): string {
  return String(value ?? "").trim();
}

function asJson(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

export function buildModelNoteArtifacts(payload: ModelNotePayload): ModelNoteArtifacts {
  const note = toStr(payload.model_history_note || payload.model_note || payload.private_profile_note);
  const source = toStr(payload.model_history_source) || "create-links";
  const status = toStr(payload.model_history_status) || (note ? "pending_import" : "missing");
  const modelName = toStr(payload.model_name);
  const modelRecordId = toStr(payload.model_record_id);
  const payloadJson = asJson(payload.model_history_payload_json || payload.payload_json);

  return {
    has_notes: Boolean(note || payloadJson),
    note,
    source,
    status,
    internal_note_fields: {
      Name: modelName ? `Model note - ${modelName}` : "Model note",
      model_name: modelName,
      model_record_id: modelRecordId,
      note_summary: note.slice(0, 500),
      raw_note: note,
      payload_json: payloadJson,
      import_source: source,
      updated_at: new Date().toISOString(),
    },
    model_history_fields: {
      Name: modelName ? `Model History Import - ${modelName}` : "Model History Import",
      model_name: modelName,
      model_record_id: modelRecordId,
      source,
      status,
      note,
      payload_json: payloadJson,
      imported_at: new Date().toISOString(),
    },
  };
}
