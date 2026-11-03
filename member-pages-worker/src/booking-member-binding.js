// Read-only freshness check for the session's existing LINE -> member binding.
// The production auth schema is Members.line_id + member_id (see auth-worker's
// wrangler.toml and normalizeMemberRecord). Never resolve through email/contact,
// invent a binding, or repair/rotate any stored identity here. Preserve auth's
// documented mmd_rec_<record.id> identity only for the exact current LINE row.
// IMPORTANT: a fresh Members.line_id may itself be a historical recovery write.
// Agreement with this row is NOT independent proof of that binding's provenance.
const DEADLINE_MS = 3000;
const MAX_PAGES = 20;
const unavailable = () => ({ ok: false, status: 503, error: "public_identity_unavailable" });
const reviewRequired = () => ({ ok: false, status: 403, error: "public_identity_review_required" });
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

function normalizedMemberId(value) {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f]/.test(value)) return "";
  const id = value.trim();
  return id && id.length <= 160 ? id : "";
}

function currentMemberId(row, configuredMemberField) {
  // These are the known normalizeMemberRecord aliases, not contact heuristics.
  // A conflicting explicit ID cannot disappear behind field priority/fallback.
  const ids = new Set();
  for (const name of new Set([configuredMemberField, "member_id", "Member ID", "auth_member_id"])) {
    const value = row.fields[name];
    if (value === undefined || value === null || value === "") continue;
    const id = normalizedMemberId(value);
    if (!id) return "";
    ids.add(id);
  }
  if (ids.size > 1) return "";
  return ids.size === 1 ? [...ids][0] : "mmd_rec_" + row.id;
}

function configured(env, name, fallback) {
  const value = env[name] === undefined ? fallback : env[name];
  if (typeof value !== "string" || !value.trim() || /[{}\u0000-\u001f\u007f]/.test(value)) throw Error("identity_configuration");
  return value.trim();
}

export async function verifyBookingMemberBinding(env, verifiedLineUserId, sessionMemberId) {
  const memberId = normalizedMemberId(sessionMemberId);
  // LINE IDs are checked without lowercasing, trimming or taking a browser hint.
  if (typeof verifiedLineUserId !== "string" || !/^U[0-9a-f]{32}$/i.test(verifiedLineUserId) || !memberId) return reviewRequired();
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return unavailable();
  const controller = new AbortController();
  let timer;
  try {
    // Race the complete operation, including response bodies and all pages. An
    // AbortSignal alone does not bound a service binding that ignores aborts.
    return await Promise.race([
      readCurrentBinding(env, verifiedLineUserId, memberId, controller.signal),
      new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve(unavailable()); }, DEADLINE_MS); }),
    ]);
  } catch { return unavailable(); }
  finally { clearTimeout(timer); controller.abort(); }
}

async function readCurrentBinding(env, uid, memberId, signal) {
  const table = env.AIRTABLE_TABLE_MEMBERS_ID === undefined
    ? configured(env, "AIRTABLE_TABLE_MEMBERS", "Members")
    : configured(env, "AIRTABLE_TABLE_MEMBERS_ID", "Members");
  const lineField = configured(env, "AIRTABLE_MEMBERS_LINE_USER_ID_FIELD", "line_id");
  const memberField = configured(env, "AIRTABLE_MEMBERS_MEMBER_ID_FIELD", "member_id");
  if (lineField === memberField) throw Error("identity_configuration");
  const offsets = new Set();
  const rows = [];
  let offset = "";
  for (let pageCount = 0; pageCount < MAX_PAGES; pageCount++) {
    if (signal.aborted) throw Error("identity_timeout");
    const params = new URLSearchParams({ filterByFormula: `{${lineField}}=${JSON.stringify(uid)}`, pageSize: "100" });
    // Read the exact-LINE row, as auth does. Optional normalization aliases may
    // not exist in every schema, so listing them in fields[] would yield 422.
    // No contact/email value participates in the lookup or identity decision.
    if (offset) params.set("offset", offset);
    const url = `https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table)}?${params}`;
    const init = { method: "GET", headers: { authorization: "Bearer " + env.AIRTABLE_API_KEY }, signal, redirect: "error" };
    const response = await (env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(new Request(url, init)) : fetch(url, init));
    if (signal.aborted || !response.ok) throw Error("identity_unavailable");
    const page = await response.json();
    if (signal.aborted || !object(page) || !Array.isArray(page.records)) throw Error("identity_malformed");
    if (Object.hasOwn(page, "offset") && (typeof page.offset !== "string" || !page.offset || page.offset.length > 4096)) throw Error("identity_incomplete");
    for (const row of page.records) {
      if (!object(row) || typeof row.id !== "string" || !/^rec[A-Za-z0-9]{14,24}$/.test(row.id) || !object(row.fields)) throw Error("identity_malformed");
      // Do not filter away contradictory or incomplete same-query evidence.
      if (row.fields[lineField] !== uid || currentMemberId(row, memberField) !== memberId) return reviewRequired();
      rows.push(row);
      // Even duplicate rows pointing at the same member are not a unique result.
      if (rows.length > 1) return reviewRequired();
    }
    if (!Object.hasOwn(page, "offset")) return rows.length === 1 ? { ok: true, memberId } : reviewRequired();
    offset = page.offset;
    if (offsets.has(offset)) throw Error("identity_incomplete");
    offsets.add(offset);
  }
  throw Error("identity_incomplete");
}
