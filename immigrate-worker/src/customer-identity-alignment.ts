import type { Env } from "./types";

const AIRTABLE_API = "https://api.airtable.com/v0";
const CLIENTS_TABLE_DEFAULT = "tblVv58TCbwh5j1fS";
const REVIEWED_LINE_OFC_TABLE_DEFAULT = "tbl1u0foFBvgFpT9G";
const LIFF_RENEWAL_SESSIONS_TABLE_DEFAULT = "tblXjQFwo0A2cHseh";
const IDENTITY_AUDIT_TABLE_DEFAULT = "tbloDg9yx7ubS5QzW";
const RIGHTS_SOURCE = "my_mmd_entitlement_resolver_v1";

export type CustomerIdentityAlignmentStatus =
  | "verified_match"
  | "review_required"
  | "mismatch"
  | "insufficient_evidence"
  | "unavailable";

export interface CustomerIdentityAlignment {
  status: CustomerIdentityAlignmentStatus;
  checked_at: string;
  basis: string[];
  canonical_client: { status: "ready" | "missing"; line_tail: string | null };
  line_ofc: { status: "matched" | "mismatch" | "review_required" | "missing"; line_tail: string | null };
  liff: { status: "matched" | "review_required" | "missing"; line_tail: string | null };
  audit: { status: string; line_tail: string | null };
  rights_source: typeof RIGHTS_SOURCE;
  grants_access: false;
  grants_membership: false;
  grants_points: false;
}

type AirtableRecord = { id?: string; fields?: Record<string, unknown> };

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function asEnv(env: Env): Record<string, unknown> {
  return env as unknown as Record<string, unknown>;
}

function table(env: Env, keys: string[], fallback: string): string {
  const source = asEnv(env);
  for (const key of keys) {
    const value = text(source[key]);
    if (value) return value;
  }
  return fallback;
}

function isRecordId(value: unknown): boolean {
  return /^rec[A-Za-z0-9]{6,32}$/.test(text(value));
}

function canonicalLineId(value: unknown): string {
  const line = text(value);
  return /^U[a-f0-9]{32}$/i.test(line) ? line : "";
}

function lineTail(value: unknown): string | null {
  const line = canonicalLineId(value);
  return line ? line.slice(-6) : null;
}

function formulaString(value: unknown): string {
  return `"${text(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function recordLinks(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(isRecordId) : [];
}

async function listAirtable(
  env: Env,
  tableId: string,
  options: { filterByFormula: string; fields: string[]; maxRecords?: number },
): Promise<AirtableRecord[]> {
  const source = asEnv(env);
  const apiKey = text(source.AIRTABLE_API_KEY);
  const baseId = text(source.AIRTABLE_BASE_ID);
  if (!apiKey || !baseId) throw new Error("identity_alignment_airtable_not_configured");

  const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}`);
  url.searchParams.set("filterByFormula", options.filterByFormula);
  url.searchParams.set("maxRecords", String(options.maxRecords || 20));
  url.searchParams.set("pageSize", String(Math.min(options.maxRecords || 20, 100)));
  for (const field of options.fields) url.searchParams.append("fields[]", field);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`identity_alignment_airtable_${response.status}`);
  const body = await response.json().catch(() => null) as { records?: AirtableRecord[] } | null;
  if (!body || !Array.isArray(body.records)) throw new Error("identity_alignment_airtable_invalid");
  return body.records;
}

function unavailable(checkedAt: string): CustomerIdentityAlignment {
  return {
    status: "unavailable",
    checked_at: checkedAt,
    basis: [],
    canonical_client: { status: "missing", line_tail: null },
    line_ofc: { status: "missing", line_tail: null },
    liff: { status: "missing", line_tail: null },
    audit: { status: "unavailable", line_tail: null },
    rights_source: RIGHTS_SOURCE,
    grants_access: false,
    grants_membership: false,
    grants_points: false,
  };
}

export async function deriveCustomerIdentityAlignment(
  env: Env,
  clientId: string,
): Promise<CustomerIdentityAlignment> {
  const checkedAt = new Date().toISOString();
  if (!isRecordId(clientId)) return unavailable(checkedAt);

  try {
    const source = asEnv(env);
    const clientsTable = table(env, ["AIRTABLE_TABLE_CLIENTS", "AIRTABLE_TABLE_CLIENTS_ID"], CLIENTS_TABLE_DEFAULT);
    const clientLineField = text(source.AIRTABLE_CLIENT_FIELD_LINE_USER_ID) || "line_user_id";
    const clientRows = await listAirtable(env, clientsTable, {
      filterByFormula: `RECORD_ID()=${formulaString(clientId)}`,
      fields: [clientLineField],
      maxRecords: 1,
    });
    const canonicalLine = canonicalLineId(clientRows[0]?.fields?.[clientLineField]);
    const canonicalTail = lineTail(canonicalLine);

    if (!canonicalLine) {
      return {
        ...unavailable(checkedAt),
        status: "insufficient_evidence",
        canonical_client: { status: "missing", line_tail: null },
        audit: { status: "not_checked", line_tail: null },
      };
    }

    const lineOfcTable = table(
      env,
      ["AIRTABLE_TABLE_LINE_OFC_CLIENT_IMPORT_STAGING_ID", "AIRTABLE_TABLE_LINE_OFC_CLIENT_IMPORT_STAGING"],
      REVIEWED_LINE_OFC_TABLE_DEFAULT,
    );
    const liffTable = table(
      env,
      ["AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS_ID", "AIRTABLE_TABLE_LIFF_RENEWAL_SESSIONS"],
      LIFF_RENEWAL_SESSIONS_TABLE_DEFAULT,
    );
    const auditTable = table(
      env,
      ["AIRTABLE_TABLE_LIFF_IDENTITY_RESOLUTION_AUDIT_ID", "AIRTABLE_TABLE_LIFF_IDENTITY_RESOLUTION_AUDIT"],
      IDENTITY_AUDIT_TABLE_DEFAULT,
    );

    const [ofcRows, liffRows, auditRows] = await Promise.all([
      listAirtable(env, lineOfcTable, {
        filterByFormula: `AND({matched_client_id}=${formulaString(clientId)},{review_status}="committed",{decision}="link_existing_client")`,
        fields: ["line_user_id", "matched_client_id", "review_status", "decision", "match_type"],
        maxRecords: 20,
      }),
      listAirtable(env, liffTable, {
        filterByFormula: `{line_user_id}=${formulaString(canonicalLine)}`,
        fields: ["line_user_id", "Client", "identity_linked_at"],
        maxRecords: 20,
      }),
      listAirtable(env, auditTable, {
        filterByFormula: `{canonical_client_id}=${formulaString(clientId)}`,
        fields: ["line_user_id_tail", "canonical_identity_status", "review_status", "final_status"],
        maxRecords: 10,
      }),
    ]);

    const ofcLines = ofcRows.map((row) => canonicalLineId(row.fields?.line_user_id)).filter(Boolean);
    const ofcExact = ofcLines.some((line) => line === canonicalLine);
    const ofcMismatch = ofcLines.some((line) => line !== canonicalLine);
    const ofcTail = lineTail(ofcExact ? canonicalLine : ofcLines[0]);

    const liffExactRow = liffRows.find((row) => {
      const line = canonicalLineId(row.fields?.line_user_id);
      const linkedClients = recordLinks(row.fields?.Client);
      return line === canonicalLine && linkedClients.includes(clientId);
    });
    const liffExact = Boolean(liffExactRow);
    const liffTail = lineTail(liffExactRow?.fields?.line_user_id);

    const audit = auditRows[0]?.fields || {};
    const auditTail = text(audit.line_user_id_tail).slice(-6) || null;
    const auditStatus = text(audit.final_status || audit.canonical_identity_status || audit.review_status) || "missing";

    const basis = [
      "canonical_client",
      ofcRows.length ? "reviewed_line_ofc" : "",
      liffRows.length ? "verified_liff_session" : "",
      auditRows.length ? "identity_resolution_audit" : "",
    ].filter(Boolean);

    let status: CustomerIdentityAlignmentStatus = "insufficient_evidence";
    if (ofcMismatch) status = "mismatch";
    else if (ofcExact && liffExact) status = "verified_match";
    else if (ofcRows.length || liffRows.length || auditRows.length) status = "review_required";

    return {
      status,
      checked_at: checkedAt,
      basis,
      canonical_client: { status: "ready", line_tail: canonicalTail },
      line_ofc: {
        status: ofcMismatch ? "mismatch" : ofcExact ? "matched" : ofcRows.length ? "review_required" : "missing",
        line_tail: ofcTail,
      },
      liff: {
        status: liffExact ? "matched" : liffRows.length ? "review_required" : "missing",
        line_tail: liffTail,
      },
      audit: { status: auditStatus, line_tail: auditTail },
      rights_source: RIGHTS_SOURCE,
      grants_access: false,
      grants_membership: false,
      grants_points: false,
    };
  } catch {
    return unavailable(checkedAt);
  }
}

export async function augmentClientIntelligenceWithIdentityAlignment(
  response: Response,
  env: Env,
  clientId: string,
): Promise<Response> {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) return response;
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload || payload.ok === false) return response;

  const identity = payload.identity && typeof payload.identity === "object" && !Array.isArray(payload.identity)
    ? { ...(payload.identity as Record<string, unknown>) }
    : {};
  identity.alignment = await deriveCustomerIdentityAlignment(env, clientId);

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, private");
  headers.set("x-mmd-identity-alignment", "read-only-v1");
  return new Response(JSON.stringify({ ...payload, identity }), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
