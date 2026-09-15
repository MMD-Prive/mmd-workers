const AIRTABLE_API = "https://api.airtable.com/v0";
const BASE_ID_DEFAULT = "appsV1ILPRfIjkaYg";
const CONSOLE_INBOX_TABLE_DEFAULT = "tblFHmfpB2TTrzO2e";
const STAGING_TABLE_DEFAULT = "tblOs8yyLK09SKrCt";
const CLIENTS_TABLE_DEFAULT = "tblVv58TCbwh5j1fS";
const CONTACT_BACKFILL_VERSION = "line_ofc_contacts_v2_all_identities";
const COORDINATOR_NAME = "console-inbox-v2-all-identities";
const IDENTITY_PREFIX = "identity:";
const LINE_USER_ID_RE = /^U[0-9a-f]{32}$/i;
const DEFAULT_AIRTABLE_DELAY_MS = 230;

const STAGING_FIELDS = Object.freeze({
  importId: "fld7PhMqb4TS2efKp",
  status: "fldhoCFkMCaP5PmVF",
  lineUserId: "fldjanE2xn2N46F5R",
  email: "fldM3fQVrBJ3Skbpg",
  phone: "fldJuo7H1dW9klyM4",
  displayName: "fldB6Ni6TmR25ISDF",
  telegramUsername: "fldf7YqtNtHD48I76",
  telegramUserId: "fldYIe6WVFuvFnq49",
  currentLineRename: "fldOC1bxBGpBrf3U1",
  rawLineNotes: "fld6ix2RCC78F9mMM",
  serviceHistoryJson: "fldKpsGdjEm7lX0d9",
  sourceHash: "fldYR6KgXdkReO5ui",
  importedAt: "fldGKl8Z1muNPTLlp",
  canonicalClient: "fldtJMOL83srrdD1u",
  reviewNote: "fldwosm9YOwpxouwX",
});

const CLIENT_FIELDS = Object.freeze({
  name: "fldrHqkGQzvBLRxlP",
  mmdClientName: "fld7bPB3pWS2wteUU",
  nickname: "fldqPiCmuxLkXjy1P",
  lineUserId: "fld5HfSGChKFbd4uh",
  lineDisplayName: "fldb7vkM1FWswNm3l",
  email: "fldQ8TKFjyxs0Cjrk",
  emailCompat: "fldbAlmCs8VpI9Clw",
  phone: "fldNI0R5d9Y3ILPcO",
  telegramUsername: "fldLPIcKLrZBQr9iU",
  notes: "fldi31lnaFk9A9Xrp",
  source: "fldVblHUMiCnKTK42",
  primaryChannel: "fldE694L5TyVx3KSw",
});

export const LINE_OFC_CONSOLE_BACKFILL_PATH = "/v1/admin/kenji/control/line-ofc/backfill";

export function isLineOfcConsoleBackfillRequest(path, method) {
  return path === LINE_OFC_CONSOLE_BACKFILL_PATH && ["GET", "POST"].includes(String(method).toUpperCase());
}

export async function handleLineOfcConsoleBackfill(request, env, actor) {
  if (!env.LINE_OFC_BACKFILL_COORDINATOR) return json({ ok: false, error: "backfill_not_configured" }, 503);
  const id = env.LINE_OFC_BACKFILL_COORDINATOR.idFromName(COORDINATOR_NAME);
  const url = new URL(request.url);
  const upstream = new Request("https://line-ofc-backfill.internal" + url.pathname + url.search, {
    method: request.method,
    headers: {
      "Content-Type": "application/json",
      "X-MMD-Actor-Id": clean(actor?.id || "unknown", 180),
      "X-MMD-Actor-Role": clean(actor?.role || "unknown", 80),
    },
    body: request.method === "POST" ? await request.text() : undefined,
  });
  return env.LINE_OFC_BACKFILL_COORDINATOR.get(id).fetch(upstream);
}

export async function kickLineOfcConsoleContactBackfill(env) {
  if (!env?.LINE_OFC_BACKFILL_COORDINATOR) return { ok: false, skipped: "backfill_not_configured" };
  const id = env.LINE_OFC_BACKFILL_COORDINATOR.idFromName(COORDINATOR_NAME);
  const stub = env.LINE_OFC_BACKFILL_COORDINATOR.get(id);
  const statusResponse = await stub.fetch(new Request("https://line-ofc-backfill.internal" + LINE_OFC_CONSOLE_BACKFILL_PATH));
  if (!statusResponse.ok) return { ok: false, skipped: "status_unavailable" };
  const statusPayload = await statusResponse.json();
  const job = statusPayload?.job || {};
  if (["running", "paused", "completed"].includes(job.status)) {
    return { ok: true, skipped: job.status, job };
  }
  const action = job.status === "failed" ? "resume" : "start";
  const startResponse = await stub.fetch(new Request("https://line-ofc-backfill.internal" + LINE_OFC_CONSOLE_BACKFILL_PATH, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-MMD-Actor-Id": "system:scheduled-line-ofc-contact-backfill",
      "X-MMD-Actor-Role": "system",
    },
    body: JSON.stringify({ action, scan_batch_size: 100, materialize_batch_size: 1 }),
  }));
  return startResponse.json();
}

export class LineOfcConsoleBackfillCoordinator {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    if (request.method === "GET") return json({ ok: true, job: await this.status() });
    if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

    const body = await readJson(request);
    const action = clean(body.action).toLowerCase() || "start";
    if (!["start", "resume", "pause"].includes(action)) return json({ ok: false, error: "invalid_request" }, 400);

    const current = await this.status();
    if (action === "pause") {
      if (current.status === "running") await this.state.storage.put("status", "paused");
      return json({ ok: true, job: await this.status() });
    }
    if (current.status === "running") return json({ ok: true, duplicate: true, job: current });
    if (action === "start" && !["idle", "completed", "failed"].includes(current.status)) {
      return json({ ok: false, error: "job_already_exists" }, 409);
    }

    const isStart = action === "start";
    const jobId = isStart ? `line_ofc_contacts_${crypto.randomUUID()}` : current.job_id;
    const next = {
      version: CONTACT_BACKFILL_VERSION,
      job_id: jobId,
      status: "running",
      phase: isStart ? "scan" : current.phase || "scan",
      scan_batch_size: clampInteger(body.scan_batch_size ?? body.batch_size, isStart ? 100 : current.scan_batch_size, 1, 100),
      materialize_batch_size: clampInteger(body.materialize_batch_size, isStart ? 1 : current.materialize_batch_size, 1, 3),
      processed_messages: isStart ? 0 : current.processed_messages,
      valid_messages: isStart ? 0 : current.valid_messages,
      skipped_invalid_messages: isStart ? 0 : current.skipped_invalid_messages,
      unique_candidates: isStart ? 0 : current.unique_candidates,
      materialized: isStart ? 0 : current.materialized,
      matched: isStart ? 0 : current.matched,
      updated_clients: isStart ? 0 : current.updated_clients,
      staged_unmatched: isStart ? 0 : current.staged_unmatched,
      review_required: isStart ? 0 : current.review_required,
      conflicts: isStart ? 0 : current.conflicts,
      failed: isStart ? 0 : current.failed,
      scan_cursor: isStart ? "" : current.scan_cursor,
      materialize_cursor: isStart ? "" : current.materialize_cursor,
      started_at: isStart ? new Date().toISOString() : current.started_at,
      updated_at: new Date().toISOString(),
      completed_at: isStart ? "" : current.completed_at,
      actor_id: request.headers.get("X-MMD-Actor-Id") || current.actor_id || "unknown",
      actor_role: request.headers.get("X-MMD-Actor-Role") || current.actor_role || "unknown",
      last_error: "",
    };
    await this.write(next);
    await this.state.storage.setAlarm(Date.now());
    return json({ ok: true, job: next }, 202);
  }

  async alarm() {
    const job = await this.status();
    if (job.status !== "running") return;
    try {
      if (job.phase === "materialize") await this.materializeAlarm(job);
      else await this.scanAlarm(job);
    } catch (error) {
      await this.write({
        ...job,
        status: "failed",
        updated_at: new Date().toISOString(),
        failed: job.failed + 1,
        last_error: safeError(error),
      });
    }
  }

  async scanAlarm(job) {
    const page = await listConsolePage(this.env, job.scan_cursor, job.scan_batch_size);
    const grouped = new Map();
    let validMessages = 0;
    let skippedInvalid = 0;

    for (const record of page.records || []) {
      const evidence = extractLineOfcIdentityEvidence(record);
      if (!evidence) {
        skippedInvalid += 1;
        continue;
      }
      validMessages += 1;
      grouped.set(evidence.line_user_id, mergeLineOfcIdentity(grouped.get(evidence.line_user_id), evidence));
    }

    const storageKeys = [...grouped.keys()].map((lineUserId) => identityStorageKey(job.job_id, lineUserId));
    const existing = storageKeys.length ? await this.state.storage.get(storageKeys) : new Map();
    const writes = {};
    let uniqueAdded = 0;
    for (const [lineUserId, pageIdentity] of grouped) {
      const key = identityStorageKey(job.job_id, lineUserId);
      const previous = existing.get(key);
      if (!previous) uniqueAdded += 1;
      writes[key] = mergeLineOfcIdentity(previous, pageIdentity);
    }
    if (Object.keys(writes).length) await this.state.storage.put(writes);

    const hasNext = Boolean(page.offset);
    const next = {
      ...job,
      status: "running",
      phase: hasNext ? "scan" : "materialize",
      processed_messages: job.processed_messages + (page.records?.length || 0),
      valid_messages: job.valid_messages + validMessages,
      skipped_invalid_messages: job.skipped_invalid_messages + skippedInvalid,
      unique_candidates: job.unique_candidates + uniqueAdded,
      scan_cursor: page.offset || "",
      materialize_cursor: hasNext ? job.materialize_cursor : "",
      updated_at: new Date().toISOString(),
    };
    await this.write(next);
    await this.state.storage.setAlarm(Date.now() + (hasNext ? 500 : 1000));
  }

  async materializeAlarm(job) {
    const prefix = identityStoragePrefix(job.job_id);
    const options = { prefix, limit: job.materialize_batch_size };
    if (job.materialize_cursor) options.startAfter = job.materialize_cursor;
    const identities = await this.state.storage.list(options);
    if (!identities.size) {
      await this.write({
        ...job,
        status: "completed",
        phase: "completed",
        updated_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        last_error: "",
      });
      return;
    }

    let cursor = job.materialize_cursor;
    let materialized = 0;
    let matched = 0;
    let updatedClients = 0;
    let stagedUnmatched = 0;
    let reviewRequired = 0;
    let conflicts = 0;

    for (const [key, identity] of identities) {
      const outcome = await materializeIdentity(this.env, identity);
      cursor = key;
      materialized += 1;
      if (outcome.matched) matched += 1;
      if (outcome.updated_client) updatedClients += 1;
      if (outcome.staged_unmatched) stagedUnmatched += 1;
      if (outcome.review_required) reviewRequired += 1;
      if (outcome.conflict) conflicts += 1;
    }

    const next = {
      ...job,
      status: "running",
      phase: "materialize",
      materialize_cursor: cursor,
      materialized: job.materialized + materialized,
      matched: job.matched + matched,
      updated_clients: job.updated_clients + updatedClients,
      staged_unmatched: job.staged_unmatched + stagedUnmatched,
      review_required: job.review_required + reviewRequired,
      conflicts: job.conflicts + conflicts,
      updated_at: new Date().toISOString(),
      last_error: "",
    };
    await this.write(next);
    await this.state.storage.setAlarm(Date.now() + 1000);
  }

  async status() {
    const keys = [
      "version", "job_id", "status", "phase", "scan_batch_size", "materialize_batch_size",
      "processed_messages", "valid_messages", "skipped_invalid_messages", "unique_candidates",
      "materialized", "matched", "updated_clients", "staged_unmatched", "review_required",
      "conflicts", "failed", "scan_cursor", "materialize_cursor", "started_at", "updated_at",
      "completed_at", "actor_id", "actor_role", "last_error",
    ];
    const values = await this.state.storage.get(keys);
    return {
      version: values.get("version") || CONTACT_BACKFILL_VERSION,
      job_id: values.get("job_id") || "",
      status: values.get("status") || "idle",
      phase: values.get("phase") || "scan",
      scan_batch_size: Number(values.get("scan_batch_size") || 100),
      materialize_batch_size: Number(values.get("materialize_batch_size") || 1),
      processed_messages: Number(values.get("processed_messages") || 0),
      valid_messages: Number(values.get("valid_messages") || 0),
      skipped_invalid_messages: Number(values.get("skipped_invalid_messages") || 0),
      unique_candidates: Number(values.get("unique_candidates") || 0),
      materialized: Number(values.get("materialized") || 0),
      matched: Number(values.get("matched") || 0),
      updated_clients: Number(values.get("updated_clients") || 0),
      staged_unmatched: Number(values.get("staged_unmatched") || 0),
      review_required: Number(values.get("review_required") || 0),
      conflicts: Number(values.get("conflicts") || 0),
      failed: Number(values.get("failed") || 0),
      scan_cursor: values.get("scan_cursor") || "",
      materialize_cursor: values.get("materialize_cursor") || "",
      started_at: values.get("started_at") || "",
      updated_at: values.get("updated_at") || "",
      completed_at: values.get("completed_at") || "",
      actor_id: values.get("actor_id") || "",
      actor_role: values.get("actor_role") || "",
      last_error: values.get("last_error") || "",
    };
  }

  async write(job) {
    await this.state.storage.put(job);
  }
}

export function isCanonicalLineUserId(value) {
  return LINE_USER_ID_RE.test(clean(value));
}

export function extractLineOfcIdentityEvidence(record) {
  const fields = record?.fields || {};
  const payload = parsePayload(fields.payload_json);
  const lineUserId = clean(
    fields.line_user_id
      || payload.line_user_id
      || payload?.identity?.line_user_id
      || payload?.member?.line_user_id,
    80,
  );
  if (!isCanonicalLineUserId(lineUserId)) return null;

  const seenAt = clean(fields.created_at || record.createdTime || new Date().toISOString(), 80);
  const evidence = emptyIdentity(lineUserId);
  evidence.message_count = 1;
  evidence.first_seen_at = seenAt;
  evidence.last_seen_at = seenAt;

  addCandidate(evidence.line_ids, fields.line_id || payload.line_id || payload?.member?.line_id, "structured", seenAt, 4);
  addCandidate(evidence.emails, fields.member_email || payload.member_email || payload.email || payload?.member?.email, "structured", seenAt, 6, normalizeEmail);
  addCandidate(evidence.phones, fields.member_phone || payload.member_phone || payload.phone || payload?.member?.phone, "structured", seenAt, 6, normalizePhone);
  addCandidate(evidence.telegram_usernames, fields.telegram_username || payload.telegram_username || payload?.telegram?.username, "structured", seenAt, 6, normalizeTelegramUsername);
  addCandidate(evidence.telegram_ids, fields.telegram_id || payload.telegram_id || payload?.telegram?.id, "structured", seenAt, 4);

  addNameCandidate(evidence.names, fields.line_renamed_name, "line_renamed_name", seenAt, 8);
  addNameCandidate(evidence.names, fields.member_name, "member_name", seenAt, 7);
  addNameCandidate(evidence.names, fields.line_display_name, "line_display_name", seenAt, 6);
  addNameCandidate(evidence.names, payload.line_renamed_name || payload?.identity?.line_renamed_name, "payload_line_renamed_name", seenAt, 7);
  addNameCandidate(evidence.names, payload.member_name || payload?.member?.name, "payload_member_name", seenAt, 6);
  addNameCandidate(evidence.names, payload.line_display_name || payload?.identity?.line_display_name, "payload_line_display_name", seenAt, 5);

  for (const id of recordLinkIds(fields["Canonical Client"] || fields.canonical_client)) {
    if (!evidence.canonical_client_ids.includes(id)) evidence.canonical_client_ids.push(id);
  }

  const contactText = [fields.admin_note, fields.raw_note, payload.contact_note, payload.admin_note]
    .map((value) => clean(value, 12000))
    .filter(Boolean)
    .join("\n");
  for (const email of extractEmails(contactText)) addCandidate(evidence.emails, email, "note", seenAt, 2, normalizeEmail);
  for (const phone of extractLabeledPhones(contactText)) addCandidate(evidence.phones, phone, "note", seenAt, 2, normalizePhone);
  for (const username of extractLabeledTelegramUsernames(contactText)) addCandidate(evidence.telegram_usernames, username, "note", seenAt, 3, normalizeTelegramUsername);
  for (const name of extractLabeledNames(contactText)) addNameCandidate(evidence.names, name, "note_label", seenAt, 4);

  const tagName = usableTagName(fields.legacy_tags);
  addNameCandidate(evidence.names, tagName, "legacy_label", seenAt, 1);
  return evidence;
}

export function mergeLineOfcIdentity(previous, incoming) {
  if (!previous) return structuredCloneSafe(incoming);
  if (!incoming) return structuredCloneSafe(previous);
  if (clean(previous.line_user_id).toLowerCase() !== clean(incoming.line_user_id).toLowerCase()) {
    throw new Error("identity_line_user_id_mismatch");
  }
  const merged = structuredCloneSafe(previous);
  merged.message_count = Number(previous.message_count || 0) + Number(incoming.message_count || 0);
  merged.first_seen_at = earliestIso(previous.first_seen_at, incoming.first_seen_at);
  merged.last_seen_at = latestIso(previous.last_seen_at, incoming.last_seen_at);
  merged.canonical_client_ids = uniqueStrings([...(previous.canonical_client_ids || []), ...(incoming.canonical_client_ids || [])], 10);
  for (const key of ["emails", "phones", "telegram_usernames", "telegram_ids", "line_ids", "names"]) {
    merged[key] = mergeCandidateBuckets(previous[key], incoming[key], key === "names" ? 24 : 12);
  }
  return merged;
}

export function selectIdentitySnapshot(identity) {
  const lineUserId = clean(identity?.line_user_id, 80);
  const name = selectCandidate(identity?.names);
  const email = selectCandidate(identity?.emails);
  const phone = selectCandidate(identity?.phones);
  const telegramUsername = selectCandidate(identity?.telegram_usernames);
  const telegramId = selectCandidate(identity?.telegram_ids);
  const lineId = selectCandidate(identity?.line_ids);
  const aliases = sortedCandidateValues(identity?.names, 20);
  const emailCandidates = sortedCandidateValues(identity?.emails, 10);
  const phoneCandidates = sortedCandidateValues(identity?.phones, 10);
  const telegramCandidates = sortedCandidateValues(identity?.telegram_usernames, 10);
  const displayName = name || `LINE OFC • ${lineUserId.slice(-6)}`;
  const conflictTypes = [];
  if (emailCandidates.length > 1) conflictTypes.push("multiple_email_candidates");
  if (phoneCandidates.length > 1) conflictTypes.push("multiple_phone_candidates");
  if (telegramCandidates.length > 1) conflictTypes.push("multiple_telegram_candidates");
  if ((identity?.canonical_client_ids || []).length > 1) conflictTypes.push("multiple_canonical_client_links");
  if (!name) conflictTypes.push("missing_customer_name");
  return {
    line_user_id: lineUserId,
    line_id: lineId,
    display_name: displayName,
    has_customer_name: Boolean(name),
    aliases,
    email,
    email_candidates: emailCandidates,
    phone,
    phone_candidates: phoneCandidates,
    telegram_username: telegramUsername,
    telegram_username_candidates: telegramCandidates,
    telegram_id: telegramId,
    canonical_client_ids: uniqueStrings(identity?.canonical_client_ids || [], 10),
    message_count: Number(identity?.message_count || 0),
    first_seen_at: clean(identity?.first_seen_at, 80),
    last_seen_at: clean(identity?.last_seen_at, 80),
    conflict_types: conflictTypes,
  };
}

export function buildClientPatch(clientRecord, snapshot) {
  const fields = clientRecord?.fields || {};
  const patch = {};
  const currentLineId = clean(fields.line_user_id || fields[CLIENT_FIELDS.lineUserId], 80);
  if (currentLineId && currentLineId.toLowerCase() !== snapshot.line_user_id.toLowerCase()) {
    return { fields: {}, conflict: "client_line_user_id_conflict" };
  }
  if (!currentLineId) patch[CLIENT_FIELDS.lineUserId] = snapshot.line_user_id;
  if (!clean(fields["Contact Email"] || fields.email || fields[CLIENT_FIELDS.email]) && snapshot.email && snapshot.email_candidates.length === 1) {
    patch[CLIENT_FIELDS.email] = snapshot.email;
    patch[CLIENT_FIELDS.emailCompat] = snapshot.email;
  }
  if (!clean(fields["Phone Number"] || fields.phone || fields[CLIENT_FIELDS.phone]) && snapshot.phone && snapshot.phone_candidates.length === 1) {
    patch[CLIENT_FIELDS.phone] = snapshot.phone;
  }
  if (!clean(fields.telegram_username || fields[CLIENT_FIELDS.telegramUsername]) && snapshot.telegram_username && snapshot.telegram_username_candidates.length === 1) {
    patch[CLIENT_FIELDS.telegramUsername] = snapshot.telegram_username;
  }
  if (!clean(fields.line_display_name || fields[CLIENT_FIELDS.lineDisplayName]) && snapshot.has_customer_name) {
    patch[CLIENT_FIELDS.lineDisplayName] = snapshot.display_name;
  }
  if (!clean(fields.mmd_client_name || fields[CLIENT_FIELDS.mmdClientName]) && snapshot.has_customer_name) {
    patch[CLIENT_FIELDS.mmdClientName] = snapshot.display_name;
  }
  if (!clean(fields.nickname || fields[CLIENT_FIELDS.nickname]) && snapshot.has_customer_name) {
    patch[CLIENT_FIELDS.nickname] = snapshot.display_name;
  }
  if (!clean(fields.source || fields[CLIENT_FIELDS.source])) patch[CLIENT_FIELDS.source] = "line_ofc_client_backfill";
  if (!clean(fields.primary_channel || fields[CLIENT_FIELDS.primaryChannel])) patch[CLIENT_FIELDS.primaryChannel] = "LINE OFC";
  return { fields: patch, conflict: "" };
}

export async function buildStagingRecordFields(identity, resolution, now = new Date().toISOString()) {
  const snapshot = selectIdentitySnapshot(identity);
  const conflicts = uniqueStrings([...(snapshot.conflict_types || []), ...(resolution?.conflict_types || [])], 20);
  const matchedClientId = clean(resolution?.client?.id, 80);
  const status = conflicts.length ? "review_required" : matchedClientId ? "matched" : "staged";
  const importId = `line_ofc_identity_${snapshot.line_user_id.toLowerCase()}`;
  const safeSnapshot = {
    schema: CONTACT_BACKFILL_VERSION,
    line_user_id: snapshot.line_user_id,
    line_id: snapshot.line_id || null,
    display_name: snapshot.display_name,
    aliases: snapshot.aliases,
    email_candidates: snapshot.email_candidates,
    phone_candidates: snapshot.phone_candidates,
    telegram_username_candidates: snapshot.telegram_username_candidates,
    telegram_id: snapshot.telegram_id || null,
    message_count: snapshot.message_count,
    first_seen_at: snapshot.first_seen_at || null,
    last_seen_at: snapshot.last_seen_at || null,
    matched_client_id: matchedClientId || null,
    match_type: resolution?.match_type || "unmatched",
    conflicts,
    raw_conversation_copied: false,
  };
  const sourceHash = await sha256Text(JSON.stringify(safeSnapshot));
  const reviewParts = [
    `Aggregated ${snapshot.message_count} LINE OFC message record(s) by exact LINE user ID.`,
    "Contact fields are candidate data; raw conversation text was not copied.",
  ];
  if (conflicts.length) reviewParts.push(`Review: ${conflicts.join(", ")}.`);
  else if (!matchedClientId) reviewParts.push("No exact Canonical Client match; staged only.");
  else reviewParts.push(`Exact match: ${resolution.match_type}.`);

  const fields = {
    [STAGING_FIELDS.importId]: importId,
    [STAGING_FIELDS.status]: status,
    [STAGING_FIELDS.lineUserId]: snapshot.line_user_id,
    [STAGING_FIELDS.displayName]: snapshot.display_name,
    [STAGING_FIELDS.currentLineRename]: snapshot.display_name,
    [STAGING_FIELDS.rawLineNotes]: `Contact backfill only · ${snapshot.message_count} source message(s) · raw conversation omitted`,
    [STAGING_FIELDS.serviceHistoryJson]: JSON.stringify(safeSnapshot),
    [STAGING_FIELDS.sourceHash]: sourceHash,
    [STAGING_FIELDS.importedAt]: now,
    [STAGING_FIELDS.reviewNote]: clean(reviewParts.join(" "), 10000),
  };
  if (snapshot.email) fields[STAGING_FIELDS.email] = snapshot.email;
  if (snapshot.phone) fields[STAGING_FIELDS.phone] = snapshot.phone;
  if (snapshot.telegram_username) fields[STAGING_FIELDS.telegramUsername] = snapshot.telegram_username;
  if (snapshot.telegram_id) fields[STAGING_FIELDS.telegramUserId] = snapshot.telegram_id;
  if (matchedClientId) fields[STAGING_FIELDS.canonicalClient] = [matchedClientId];
  return { import_id: importId, fields, status, snapshot, conflicts };
}

async function materializeIdentity(env, identity) {
  const snapshot = selectIdentitySnapshot(identity);
  const resolution = await resolveCanonicalClient(env, snapshot);
  let updatedClient = false;
  const conflictTypes = [...(resolution.conflict_types || [])];

  if (resolution.client && !conflictTypes.length) {
    const planned = buildClientPatch(resolution.client, snapshot);
    if (planned.conflict) conflictTypes.push(planned.conflict);
    else if (Object.keys(planned.fields).length) {
      await patchClient(env, resolution.client.id, planned.fields);
      updatedClient = true;
    }
  }

  const effectiveResolution = { ...resolution, conflict_types: conflictTypes };
  const staging = await buildStagingRecordFields(identity, effectiveResolution);
  await upsertContactStaging(env, staging.import_id, staging.fields);
  const conflict = staging.conflicts.length > 0;
  return {
    matched: Boolean(resolution.client),
    updated_client: updatedClient,
    staged_unmatched: !resolution.client,
    review_required: staging.status === "review_required",
    conflict,
  };
}

async function resolveCanonicalClient(env, snapshot) {
  const byId = new Map();
  const reasons = new Map();
  const conflicts = [];

  const add = (record, reason) => {
    if (!record?.id) return;
    byId.set(record.id, record);
    if (!reasons.has(record.id)) reasons.set(record.id, new Set());
    reasons.get(record.id).add(reason);
  };

  if (snapshot.canonical_client_ids.length > 1) conflicts.push("multiple_canonical_client_links");
  if (snapshot.canonical_client_ids.length === 1) {
    const record = await fetchClientById(env, snapshot.canonical_client_ids[0]);
    add(record, "console_canonical_link");
  }

  for (const record of await findClientsByLineId(env, snapshot.line_user_id)) add(record, "exact_line_user_id");

  if (!byId.size) {
    if (snapshot.email && snapshot.email_candidates.length === 1) {
      for (const record of await findClientsByEmail(env, snapshot.email)) add(record, "exact_email");
    }
    if (snapshot.phone && snapshot.phone_candidates.length === 1) {
      for (const record of await findClientsByPhone(env, snapshot.phone)) add(record, "exact_phone");
    }
    if (snapshot.telegram_username && snapshot.telegram_username_candidates.length === 1) {
      for (const record of await findClientsByTelegram(env, snapshot.telegram_username)) add(record, "exact_telegram_username");
    }
  }

  if (byId.size > 1) conflicts.push("multiple_exact_client_matches");
  const client = byId.size === 1 ? [...byId.values()][0] : null;
  if (client) {
    const currentLine = clean(client.fields?.line_user_id || client.fields?.[CLIENT_FIELDS.lineUserId], 80);
    if (currentLine && currentLine.toLowerCase() !== snapshot.line_user_id.toLowerCase()) conflicts.push("client_line_user_id_conflict");
  }
  const matchType = client ? [...(reasons.get(client.id) || [])].sort().join("+") : "unmatched";
  return { client, match_type: matchType, conflict_types: uniqueStrings(conflicts, 20) };
}

async function listConsolePage(env, offset, pageSize) {
  const q = new URLSearchParams({ pageSize: String(pageSize) });
  if (offset) q.set("offset", offset);
  return airtable(env, consoleInboxTable(env) + "?" + q.toString());
}

async function fetchClientById(env, recordId) {
  if (!recordId) return null;
  try {
    return await airtable(env, `${clientsTable(env)}/${encodeURIComponent(recordId)}`);
  } catch (error) {
    if (safeError(error).includes("airtable_404")) return null;
    throw error;
  }
}

async function findClientsByLineId(env, lineUserId) {
  if (!lineUserId) return [];
  return findClients(env, `{line_user_id}="${escapeFormula(lineUserId)}"`);
}

async function findClientsByEmail(env, email) {
  if (!email) return [];
  const escaped = escapeFormula(email.toLowerCase());
  return findClients(env, `OR(LOWER({Contact Email})="${escaped}",LOWER({email})="${escaped}")`);
}

async function findClientsByPhone(env, phone) {
  const digits = clean(phone).replace(/\D/g, "");
  if (!digits) return [];
  const variants = uniqueStrings([digits, toThailandCountryDigits(digits)], 4).filter(Boolean);
  const comparisons = variants.map((value) => `REGEX_REPLACE({Phone Number},"[^0-9]","")="${escapeFormula(value)}"`);
  return findClients(env, comparisons.length > 1 ? `OR(${comparisons.join(",")})` : comparisons[0]);
}

async function findClientsByTelegram(env, username) {
  const normalized = normalizeTelegramUsername(username);
  if (!normalized) return [];
  return findClients(env, `LOWER(SUBSTITUTE({telegram_username},"@",""))="${escapeFormula(normalized.toLowerCase())}"`);
}

async function findClients(env, formula) {
  const q = new URLSearchParams({ maxRecords: "3", filterByFormula: formula });
  const data = await airtable(env, clientsTable(env) + "?" + q.toString());
  return data.records || [];
}

async function patchClient(env, recordId, fields) {
  return airtable(env, `${clientsTable(env)}/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
}

async function upsertContactStaging(env, importId, fields) {
  const q = new URLSearchParams({ maxRecords: "2", filterByFormula: `{Import ID}="${escapeFormula(importId)}"` });
  const found = await airtable(env, stagingTable(env) + "?" + q.toString());
  if ((found.records || []).length > 1) throw new Error("duplicate_contact_staging_import_id");
  const id = found.records?.[0]?.id;
  return airtable(env, stagingTable(env) + (id ? `/${encodeURIComponent(id)}` : ""), {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify({ fields }),
  });
}

async function airtable(env, path, init = {}) {
  const token = clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 2000);
  const base = clean(env.AIRTABLE_BASE_ID || BASE_ID_DEFAULT);
  if (!token || !base) throw new Error("airtable_not_configured");
  const delay = clampInteger(env.LINE_OFC_BACKFILL_AIRTABLE_DELAY_MS, DEFAULT_AIRTABLE_DELAY_MS, 0, 2000);
  if (delay) await sleep(delay);
  const fetcher = env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch.bind(env.AIRTABLE_HTTP) : fetch;
  const response = await fetcher(AIRTABLE_API + "/" + base + "/" + path, {
    ...init,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  if (!response.ok) throw new Error("airtable_" + response.status);
  return response.json();
}

function emptyIdentity(lineUserId) {
  return {
    schema: CONTACT_BACKFILL_VERSION,
    line_user_id: clean(lineUserId, 80),
    message_count: 0,
    first_seen_at: "",
    last_seen_at: "",
    canonical_client_ids: [],
    emails: {},
    phones: {},
    telegram_usernames: {},
    telegram_ids: {},
    line_ids: {},
    names: {},
  };
}

function addNameCandidate(bucket, value, source, seenAt, weight) {
  const name = normalizeName(value);
  if (!isUsableName(name)) return;
  addCandidate(bucket, name, source, seenAt, weight, (item) => normalizeName(item).toLocaleLowerCase("th-TH"));
  const key = normalizeName(name).toLocaleLowerCase("th-TH");
  if (bucket[key]) bucket[key].value = name;
}

function addCandidate(bucket, rawValue, source, seenAt, weight = 1, normalizer = (value) => clean(value, 500)) {
  const normalized = normalizer(rawValue);
  if (!normalized) return;
  const key = clean(normalized, 500).toLowerCase();
  if (!key) return;
  const current = bucket[key] || { value: normalized, count: 0, weight: 0, structured_count: 0, first_seen_at: seenAt, last_seen_at: seenAt, sources: [] };
  current.value = current.value || normalized;
  current.count += 1;
  current.weight += Number(weight || 0);
  if (source === "structured") current.structured_count += 1;
  current.first_seen_at = earliestIso(current.first_seen_at, seenAt);
  current.last_seen_at = latestIso(current.last_seen_at, seenAt);
  current.sources = uniqueStrings([...(current.sources || []), clean(source, 80)], 8);
  bucket[key] = current;
}

function mergeCandidateBuckets(left = {}, right = {}, limit = 12) {
  const merged = structuredCloneSafe(left || {});
  for (const [key, value] of Object.entries(right || {})) {
    const current = merged[key];
    if (!current) {
      merged[key] = structuredCloneSafe(value);
      continue;
    }
    merged[key] = {
      value: current.value || value.value,
      count: Number(current.count || 0) + Number(value.count || 0),
      weight: Number(current.weight || 0) + Number(value.weight || 0),
      structured_count: Number(current.structured_count || 0) + Number(value.structured_count || 0),
      first_seen_at: earliestIso(current.first_seen_at, value.first_seen_at),
      last_seen_at: latestIso(current.last_seen_at, value.last_seen_at),
      sources: uniqueStrings([...(current.sources || []), ...(value.sources || [])], 8),
    };
  }
  const ranked = Object.entries(merged).sort((a, b) => compareCandidateEntries(b, a)).slice(0, limit);
  return Object.fromEntries(ranked);
}

function selectCandidate(bucket = {}) {
  const ranked = Object.entries(bucket || {}).sort((a, b) => compareCandidateEntries(b, a));
  return clean(ranked[0]?.[1]?.value, 500);
}

function sortedCandidateValues(bucket = {}, limit = 12) {
  return Object.entries(bucket || {})
    .sort((a, b) => compareCandidateEntries(b, a))
    .slice(0, limit)
    .map(([, value]) => clean(value?.value, 500))
    .filter(Boolean);
}

function compareCandidateEntries([keyA, a], [keyB, b]) {
  return Number(a?.weight || 0) - Number(b?.weight || 0)
    || Number(a?.structured_count || 0) - Number(b?.structured_count || 0)
    || Number(a?.count || 0) - Number(b?.count || 0)
    || String(a?.last_seen_at || "").localeCompare(String(b?.last_seen_at || ""))
    || String(keyB).localeCompare(String(keyA));
}

function extractEmails(text) {
  const matches = clean(text, 20000).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return uniqueStrings(matches.map(normalizeEmail).filter(Boolean), 10);
}

function extractLabeledPhones(text) {
  const values = [];
  const pattern = /(?:tel(?:ephone)?|phone|mobile|เบอร์(?:โทร)?|โทร(?:ศัพท์)?|มือถือ)\s*[:：]?\s*(\+?\d[\d\s().-]{7,20}\d)/gi;
  for (const match of clean(text, 20000).matchAll(pattern)) values.push(match[1]);
  return uniqueStrings(values.map(normalizePhone).filter(Boolean), 10);
}

function extractLabeledTelegramUsernames(text) {
  const values = [];
  const pattern = /telegram(?:\s*(?:username|user|id))?\s*[:：]?\s*@?([A-Z][A-Z0-9_]{4,31})/gi;
  for (const match of clean(text, 20000).matchAll(pattern)) values.push(match[1]);
  return uniqueStrings(values.map(normalizeTelegramUsername).filter(Boolean), 10);
}

function extractLabeledNames(text) {
  const values = [];
  const pattern = /(?:ชื่อเล่น|ชื่อไลน์|line\s*(?:display\s*)?name|nickname|customer\s*name|client\s*name)\s*[:：]\s*([^\n|;,]{1,80})/gi;
  for (const match of clean(text, 20000).matchAll(pattern)) values.push(normalizeName(match[1]));
  return uniqueStrings(values.filter(isUsableName), 12);
}

function normalizeEmail(value) {
  const email = clean(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function normalizePhone(value) {
  const raw = clean(value, 80);
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0066")) digits = digits.slice(2);
  if (digits.startsWith("66") && digits.length >= 10 && digits.length <= 12) digits = "0" + digits.slice(2);
  if (digits.startsWith("0") && digits.length >= 9 && digits.length <= 10) return digits;
  if (digits.length >= 8 && digits.length <= 15 && raw.trim().startsWith("+")) return "+" + digits;
  return "";
}

function normalizeTelegramUsername(value) {
  const username = clean(value, 80).replace(/^@+/, "");
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username) ? username : "";
}

function normalizeName(value) {
  return clean(value, 160).replace(/\s+/g, " ").replace(/^[,;|\s]+|[,;|\s]+$/g, "");
}

function isUsableName(value) {
  const name = normalizeName(value);
  if (!name || name.length < 2 || name.length > 160) return false;
  if (/^(unknown|guest|test|smoke|diagnostic|null|undefined|none)$/i.test(name)) return false;
  if (/(line_webhook|event:message|message:text|has_text|manual_history_seed|renewal_web|pricing_review)/i.test(name)) return false;
  if (/^https?:\/\//i.test(name) || normalizeEmail(name) || normalizePhone(name)) return false;
  if (/^[#\s,;|]+$/.test(name)) return false;
  return true;
}

function usableTagName(value) {
  const raw = clean(value, 1000);
  if (!raw || raw.includes("#")) return "";
  const candidate = raw.split(/[,;|]/).map(normalizeName).find(isUsableName);
  return candidate || "";
}

function parsePayload(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const text = clean(value, 100000);
  if (!text || text === "[redacted_payload_json]") return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function recordLinkIds(value) {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return uniqueStrings(items.map((item) => typeof item === "string" ? item : item?.id).filter((id) => /^rec[A-Za-z0-9]+$/.test(clean(id))), 10);
}

function identityStoragePrefix(jobId) {
  return `${IDENTITY_PREFIX}${safeToken(jobId)}:`;
}

function identityStorageKey(jobId, lineUserId) {
  return identityStoragePrefix(jobId) + clean(lineUserId, 80).toLowerCase();
}

function toThailandCountryDigits(digits) {
  const value = clean(digits).replace(/\D/g, "");
  return value.startsWith("0") ? "66" + value.slice(1) : value.startsWith("66") ? value : "";
}

function uniqueStrings(values, limit = 50) {
  const seen = new Set();
  const output = [];
  for (const raw of values || []) {
    const value = clean(raw, 1000);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    output.push(value);
    if (output.length >= limit) break;
  }
  return output;
}

function earliestIso(left, right) {
  if (!left) return clean(right, 80);
  if (!right) return clean(left, 80);
  return String(left) <= String(right) ? String(left) : String(right);
}

function latestIso(left, right) {
  if (!left) return clean(right, 80);
  if (!right) return clean(left, 80);
  return String(left) >= String(right) ? String(left) : String(right);
}

async function sha256Text(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function consoleInboxTable(env) { return clean(env.AIRTABLE_TABLE_CONSOLE_INBOX_ID) || CONSOLE_INBOX_TABLE_DEFAULT; }
function stagingTable(env) { return clean(env.AIRTABLE_LINE_OFC_CLIENT_IMPORT_STAGING_TABLE_ID) || STAGING_TABLE_DEFAULT; }
function clientsTable(env) { return clean(env.AIRTABLE_TABLE_CLIENTS_ID) || CLIENTS_TABLE_DEFAULT; }
function safeToken(value) { return clean(value).replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "unknown"; }
function escapeFormula(value) { return String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\""); }
function clean(value, max = 4000) { return String(value ?? "").trim().slice(0, max); }
function clampInteger(value, fallback, min, max) { const n = Number(value); return Number.isInteger(n) && n >= min && n <= max ? n : fallback; }
function safeError(error) { return clean(error instanceof Error ? error.message : String(error), 240); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function readJson(request) { try { const value = await request.json(); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid"); return value; } catch { return {}; } }
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Cache-Control": "no-store, private", "Content-Type": "application/json; charset=utf-8" } }); }
