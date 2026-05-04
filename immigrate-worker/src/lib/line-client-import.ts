import type { AirtableFields } from "./airtable-schema";

export type LineClientImportInput = {
  client_name?: string;
  nickname?: string;
  mmd_client_name?: string;
  line_user_id?: string;
  email?: string;
  phone?: string;
  memberstack_id?: string;
  dashboard_url?: string;
  payment_url?: string;
  model_console_url?: string;
  notes?: string;
};

function toStr(value: unknown): string {
  return String(value ?? "").trim();
}

export function clientLookupFormula(input: LineClientImportInput): string {
  const lineUserId = toStr(input.line_user_id).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const email = toStr(input.email).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const clientName = toStr(input.client_name).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  if (lineUserId && email) return `OR({line_user_id}="${lineUserId}",{email}="${email}")`;
  if (lineUserId) return `{line_user_id}="${lineUserId}"`;
  if (email) return `{email}="${email}"`;
  return `{Client Name}="${clientName || "unknown"}"`;
}

export function buildLineClientFields(input: LineClientImportInput): AirtableFields {
  const notes = [
    toStr(input.notes),
    input.dashboard_url ? `dashboard_url=${input.dashboard_url}` : "",
    input.payment_url ? `payment_url=${input.payment_url}` : "",
    input.model_console_url ? `model_console_url=${input.model_console_url}` : "",
  ].filter(Boolean);

  return {
    "Client Name": toStr(input.client_name) || toStr(input.nickname) || "MMD Client",
    nickname: toStr(input.nickname || input.client_name),
    mmd_client_name: toStr(input.mmd_client_name || input.client_name),
    line_user_id: toStr(input.line_user_id),
    email: toStr(input.email).toLowerCase(),
    "Phone Number": toStr(input.phone),
    memberstack_id: toStr(input.memberstack_id),
    source: "line",
    primary_channel: "line",
    Status: "Active",
    notes_raw: notes.join("\n"),
    dashboard_url: toStr(input.dashboard_url),
    payment_url: toStr(input.payment_url),
  };
}
