const AIRTABLE_API = "https://api.airtable.com/v0";

export const PER_RENAME_CLIENT_SEARCH_VERSION = "per-rename-client-search-v2-multi-candidate";
export const DEFAULT_PRE_SESSION_CLIENT_INDEX_TABLE = "tblwn6I9VWie5d7Ui";
const DEFAULT_CLIENTS_TABLE = "tblVv58TCbwh5j1fS";

const INDEX_FIELDS = [
  "identity_key",
  "source_type",
  "source_record_id",
  "preferred_name",
  "line_user_id",
  "line_display_name",
  "linked_client",
  "resolution_status",
  "session_lookup_status",
  "confidence",
  "current_rights_source",
];

const CLIENT_FIELDS = [
  "Client Name",
  "Client Name (Display)",
  "mmd_client_name",
  "nickname",
  "username",
  "line_user_id",
  "line_display_name",
  "telegram_username",
  "email",
  "Contact Email",
  "Phone Number",
];

export async function enrichLineageWithPerRename(request, response, env = {}) {
  if (!isLookupPost(request) || response.status !== 200) return response;

  const payload = await request.json().catch(() => ({}));
  const query = clean(payload?.query).slice(0, 160);
  if (!query) return response;

  const body = await response.clone().json().catch(() => null);
  if (!body?.ok) return response;

  try {
    const resolved = await resolvePerRenameAlias(env, query);
    if (resolved.state === "none") return withSearchHeader(response, "none");

    if (resolved.state === "multiple") {
      const headers = lineageHeaders(response.headers, "multiple");
      return new Response(JSON.stringify({
        ...body,
        records: resolved.records,
        items: resolved.records,
        count: resolved.records.length,
        manual_fallback: false,
        per_rename_alias: true,
        per_rename_alias_multiple: true,
        per_rename_search_version: PER_RENAME_CLIENT_SEARCH_VERSION,
        lineage_warnings: unique([
          ...(Array.isArray(body.lineage_warnings)
            ? body.lineage_warnings.filter((value) => value !== "manual_public_only_pending_reconcile")
            : []),
          "per_rename_multiple_canonical_clients_operator_selection_required",
        ]),
      }), { status: response.status, statusText: response.statusText, headers });
    }

    if (resolved.state === "ambiguous") {
      const headers = lineageHeaders(response.headers, "ambiguous");
      return new Response(JSON.stringify({
        ...body,
        records: [],
        items: [],
        count: 0,
        manual_fallback: true,
        per_rename_alias: false,
        per_rename_alias_ambiguous: true,
        lineage_warnings: unique([
          ...(Array.isArray(body.lineage_warnings) ? body.lineage_warnings : []),
          "per_rename_alias_ambiguous_refine_search",
        ]),
      }), { status: response.status, statusText: response.statusText, headers });
    }

    const headers = lineageHeaders(response.headers, "resolved");
    return new Response(JSON.stringify({
      ...body,
      records: [resolved.record],
      items: [resolved.record],
      count: 1,
      manual_fallback: false,
      per_rename_alias: true,
      per_rename_search_version: PER_RENAME_CLIENT_SEARCH_VERSION,
      lineage_warnings: unique([
        ...(Array.isArray(body.lineage_warnings)
          ? body.lineage_warnings.filter((value) => value !== "manual_public_only_pending_reconcile")
          : []),
        "per_rename_alias_resolved_to_canonical_client",
      ]),
    }), { status: response.status, statusText: response.statusText, headers });
  } catch (error) {
    const headers = new Headers(response.headers);
    headers.set("X-MMD-Per-Rename-Search", "unavailable");
    headers.set("X-MMD-Per-Rename-Search-Version", PER_RENAME_CLIENT_SEARCH_VERSION);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

export async function resolvePerRenameAlias(env, query) {
  requireStorage(env);
  const rows = await searchAuthoritativePerRenameRows(env, query);
  if (!rows.length) return { state: "none" };

  const matches = rows
    .map((row) => authoritativeMatch(row, query))
    .filter(Boolean);
  if (!matches.length) return { state: "none" };

  const bestQuality = Math.max(...matches.map((match) => match.quality));
  const best = matches.filter((match) => match.quality === bestQuality);
  const linkedIds = unique(best.flatMap((match) => match.client_ids));

  if (!linkedIds.length) return { state: "none" };

  if (linkedIds.length !== 1) {
    // If the same exact Per Rename resolves to more than one canonical Client,
    // fail closed. A broad search, however, should return every canonical choice
    // so the operator can select the intended client instead of seeing a fake
    // name-only REVIEW result.
    if (bestQuality >= 300) {
      return {
        state: "ambiguous",
        client_ids: linkedIds,
        matched_names: unique(best.map((match) => match.per_name)),
        reason: "exact_per_rename_collision",
      };
    }

    const records = [];
    for (const clientId of linkedIds) {
      const sameClient = best.filter((match) => match.client_ids.includes(clientId));
      const chosen = sameClient.sort(compareMatches)[0];
      const client = await fetchCanonicalClient(env, clientId);
      if (!client?.id || !chosen) {
        return {
          state: "ambiguous",
          client_ids: linkedIds,
          matched_names: unique(best.map((match) => match.per_name)),
          reason: "canonical_fetch_incomplete",
        };
      }
      records.push(toCanonicalPerRenameRecord(client, chosen, query));
    }

    records.sort((a, b) => {
      const byName = String(a.client_name || "").localeCompare(String(b.client_name || ""), "th");
      if (byName) return byName;
      return String(a.client_id || "").localeCompare(String(b.client_id || ""));
    });

    return {
      state: "multiple",
      records,
      client_ids: linkedIds,
      matched_names: unique(best.map((match) => match.per_name)),
    };
  }

  const clientId = linkedIds[0];
  const sameClient = best.filter((match) => match.client_ids.includes(clientId));
  const chosen = sameClient.sort(compareMatches)[0];
  const client = await fetchCanonicalClient(env, clientId);
  if (!client?.id) return { state: "none" };

  return {
    state: "resolved",
    record: toCanonicalPerRenameRecord(client, chosen, query),
  };
}

export async function searchAuthoritativePerRenameRows(env, query) {
  requireStorage(env);
  const table = clean(env.AIRTABLE_TABLE_PRE_SESSION_CLIENT_INDEX_ID || env.AIRTABLE_TABLE_PRE_SESSION_CLIENT_INDEX) || DEFAULT_PRE_SESSION_CLIENT_INDEX_TABLE;
  const tokens = searchTokens(query).slice(0, 6);
  if (!tokens.length) return [];

  const searchable = ["preferred_name", "line_display_name", "line_user_id"];
  const tokenChecks = tokens.map((token) => {
    const needle = formulaString(token);
    const checks = searchable.map((field) => `IFERROR(SEARCH(\"${needle}\",LOWER({${field}}&\"\")),0)>0`);
    return `OR(${checks.join(",")})`;
  });

  const params = new URLSearchParams();
  params.set("pageSize", "50");
  params.set("maxRecords", "50");
  params.set("filterByFormula", tokenChecks.length === 1 ? tokenChecks[0] : `AND(${tokenChecks.join(",")})`);
  for (const field of INDEX_FIELDS) params.append("fields[]", field);

  const url = `${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}?${params.toString()}`;
  const result = await fetch(url, {
    headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}`, Accept: "application/json" },
  });
  if (!result.ok) throw new Error(`airtable_${table}_${result.status}`);

  const data = await result.json().catch(() => ({}));
  return Array.isArray(data.records) ? data.records : [];
}

function authoritativeMatch(record, query) {
  const fields = record?.fields || {};
  const identityKey = clean(fields.identity_key);
  const sourceType = normalizeAlias(fields.source_type);
  const resolution = normalizeAlias(fields.resolution_status);
  const lookup = normalizeAlias(fields.session_lookup_status);
  const clientIds = linkIds(fields.linked_client);
  const perName = firstText(fields.preferred_name);
  const lineDisplay = firstText(fields.line_display_name);
  const lineUserId = firstText(fields.line_user_id);

  if (!identityKey.toLowerCase().startsWith("line_ofc_per_rename:")) return null;
  if (sourceType !== "line ofc staging" && sourceType !== "line_ofc_staging") return null;
  if (resolution !== "linked") return null;
  if (lookup !== "canonical ready" && lookup !== "canonical_ready") return null;
  if (clientIds.length !== 1 || !perName || !lineUserId) return null;

  const q = normalizeAlias(query);
  const qTokens = searchTokens(query);
  const aliases = [perName, lineDisplay, lineUserId].filter(Boolean);
  const normalizedAliases = aliases.map(normalizeAlias).filter(Boolean);
  const aliasTokens = new Set(aliases.flatMap(searchTokens));

  let quality = 0;
  if (normalizedAliases.includes(q)) quality = 300;
  else if (qTokens.length && qTokens.every((token) => aliasTokens.has(token))) quality = 240;
  else if (normalizedAliases.some((alias) => alias.startsWith(q) || q.startsWith(alias))) quality = 200;
  else if (normalizedAliases.some((alias) => q.length >= 3 && alias.includes(q))) quality = 180;
  if (!quality) return null;

  return {
    record_id: clean(record?.id),
    quality,
    per_name: perName,
    line_display_name: lineDisplay,
    line_user_id: lineUserId,
    source_record_id: firstText(fields.source_record_id),
    confidence: firstText(fields.confidence, "verified"),
    client_ids: clientIds,
  };
}

async function fetchCanonicalClient(env, clientId) {
  const table = clean(env.AIRTABLE_TABLE_CLIENTS_ID || env.AIRTABLE_TABLE_CLIENTS) || DEFAULT_CLIENTS_TABLE;
  const params = new URLSearchParams();
  for (const field of CLIENT_FIELDS) params.append("fields[]", field);
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}/${encodeURIComponent(clientId)}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}`, Accept: "application/json" },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`airtable_${table}_${response.status}`);
  return response.json();
}

function toCanonicalPerRenameRecord(record, match, query) {
  const fields = record?.fields || {};
  const canonicalName = firstText(fields["Client Name (Display)"], fields["Client Name"], fields.mmd_client_name, fields.nickname, fields.username);
  const perName = match.per_name;
  return {
    client_id: record.id,
    member_id: "",
    member_email: firstText(fields["Contact Email"], fields.email),
    remembered_name: perName,
    current_line_rename: perName,
    per_rename: perName,
    canonical_name: canonicalName,
    client_name: perName || canonicalName || query,
    aliases: unique([
      perName,
      match.line_display_name,
      fields.nickname,
      fields.mmd_client_name,
      fields["Client Name (Display)"],
      fields["Client Name"],
      fields.line_display_name,
      fields.username,
      fields.email,
      fields["Contact Email"],
      fields["Phone Number"],
      match.line_user_id,
    ]),
    matched_on: "per_rename",
    matched_value: perName,
    lookup_chain: ["pre_session_client_index", "per_rename", "canonical_client"],
    username: firstText(fields.username),
    phone: firstText(fields["Phone Number"]),
    package_code: "",
    tier: "",
    membership_status: "",
    purchased_history: "Canonical Client resolved from authoritative Per Rename identity",
    line_record_id: match.record_id,
    line_user_id: match.line_user_id,
    line_display_name: firstText(match.line_display_name, fields.line_display_name),
    legacy_tags: ["per_rename", "canonical_client_linked"],
    customer_telegram_username: firstText(fields.telegram_username),
    customer_telegram_status: "missing",
    confidence: 100,
    lineage_source: "line_ofc_per_rename_linked_client",
    entitlement_snapshot_source: "none",
    identity_status: "canonical_client_linked",
    manual_public_only: false,
    per_rename_authoritative: true,
    per_rename_source_record_id: match.source_record_id,
  };
}

function compareMatches(a, b) {
  if (b.quality !== a.quality) return b.quality - a.quality;
  return a.per_name.localeCompare(b.per_name, "th");
}

function lineageHeaders(source, state) {
  const headers = new Headers(source);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("X-MMD-Per-Rename-Search", state);
  headers.set("X-MMD-Per-Rename-Search-Version", PER_RENAME_CLIENT_SEARCH_VERSION);
  return headers;
}

function withSearchHeader(response, state) {
  const headers = new Headers(response.headers);
  headers.set("X-MMD-Per-Rename-Search", state);
  headers.set("X-MMD-Per-Rename-Search-Version", PER_RENAME_CLIENT_SEARCH_VERSION);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function isLookupPost(request) {
  try {
    return request.method.toUpperCase() === "POST" && normalizePath(new URL(request.url).pathname) === "/v1/admin/clients/lineage-lookup";
  } catch {
    return false;
  }
}

function requireStorage(env) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) throw new Error("per_rename_storage_not_ready");
}

function searchTokens(value) {
  return normalizeAlias(value).split(" ").map(clean).filter(Boolean);
}

function normalizeAlias(value) {
  return clean(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}@._+]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formulaString(value) {
  return clean(value).replace(/\\/g, "\\\\").replace(/\"/g, '\\"');
}

function linkIds(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  const one = clean(value);
  return one ? [one] : [];
}

function firstText(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const found = value.find((item) => clean(item));
      if (found !== undefined) return clean(found);
    } else if (clean(value)) return clean(value);
  }
  return "";
}

function unique(values) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const text = clean(value);
    const key = normalizeAlias(text);
    if (!text || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function normalizePath(value) {
  const pathname = String(value || "/").replace(/\/{2,}/g, "/");
  return pathname.length > 1 ? pathname.replace(/\/+$/g, "") : pathname;
}

function clean(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if ("name" in value) return String(value.name ?? "").trim();
    if ("value" in value) return String(value.value ?? "").trim();
  }
  return String(value ?? "").trim();
}
