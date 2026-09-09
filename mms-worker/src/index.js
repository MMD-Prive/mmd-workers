import { DurableObject } from "cloudflare:workers";
import {
  applicationAirtableFields,
  applicationPayload,
  applicationTelegramMessage,
  catalog,
  matchTherapists,
  prebookingAirtableFields,
  prebookingPayload,
  sensitiveAirtableFields,
  uploadRequest,
} from "./core.mjs";

const WORKER_NAME = "mms-worker";
const JSON_LIMIT_BYTES = 64 * 1024;
const DEFAULT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
const UPLOAD_GRANT_TTL_MS = 15 * 60 * 1000;
const INTERNAL_HOST = "mms.internal";

export class MmsCoordinator extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS applications (
          application_id TEXT PRIMARY KEY,
          payload_json TEXT NOT NULL,
          application_token_hash TEXT NOT NULL,
          airtable_record_id TEXT,
          sensitive_record_id TEXT,
          sync_status TEXT NOT NULL DEFAULT 'pending',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS upload_grants (
          token_hash TEXT PRIMARY KEY,
          application_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          filename TEXT NOT NULL,
          content_type TEXT NOT NULL,
          expected_bytes INTEGER NOT NULL,
          r2_key TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          claimed_at INTEGER,
          consumed_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS prebookings (
          prebooking_id TEXT PRIMARY KEY,
          payload_json TEXT NOT NULL,
          matched_ids_json TEXT NOT NULL,
          airtable_record_id TEXT,
          sync_status TEXT NOT NULL DEFAULT 'pending',
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
    });
  }

  saveApplication(applicationId, payload, applicationTokenHash, now) {
    const existing = this.ctx.storage.sql.exec(
      "SELECT * FROM applications WHERE application_id = ?",
      applicationId,
    ).toArray()[0];
    if (existing) {
      if (existing.payload_json !== JSON.stringify(payload)) {
        return { created: false, conflict: true, record: applicationRow(existing) };
      }
      this.ctx.storage.sql.exec(
        `UPDATE applications
         SET application_token_hash = ?, updated_at = ?
         WHERE application_id = ?`,
        applicationTokenHash,
        now,
        applicationId,
      );
      return { created: false, conflict: false, record: this.getApplication(applicationId) };
    }

    this.ctx.storage.sql.exec(
      `INSERT INTO applications
        (application_id, payload_json, application_token_hash, sync_status, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?)`,
      applicationId,
      JSON.stringify(payload),
      applicationTokenHash,
      now,
      now,
    );
    return { created: true, record: { application_id: applicationId, sync_status: "pending", created_at: now, updated_at: now } };
  }

  getApplication(applicationId) {
    const row = this.ctx.storage.sql.exec(
      "SELECT * FROM applications WHERE application_id = ?",
      applicationId,
    ).toArray()[0];
    return row ? applicationRow(row) : null;
  }

  authorizeApplication(applicationId, applicationTokenHash) {
    const row = this.ctx.storage.sql.exec(
      "SELECT application_token_hash FROM applications WHERE application_id = ?",
      applicationId,
    ).toArray()[0];
    return Boolean(row && row.application_token_hash === applicationTokenHash);
  }

  setApplicationSync(applicationId, result, now) {
    this.ctx.storage.sql.exec(
      `UPDATE applications
       SET airtable_record_id = ?, sensitive_record_id = ?, sync_status = ?, updated_at = ?
       WHERE application_id = ?`,
      result.airtable_record_id || null,
      result.sensitive_record_id || null,
      result.sync_status || "pending",
      now,
      applicationId,
    );
    return this.getApplication(applicationId);
  }

  createUploadGrant(grant) {
    this.ctx.storage.sql.exec(
      `INSERT OR REPLACE INTO upload_grants
        (token_hash, application_id, kind, filename, content_type, expected_bytes, r2_key, expires_at, claimed_at, consumed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
      grant.token_hash,
      grant.application_id,
      grant.kind,
      grant.filename,
      grant.content_type,
      grant.expected_bytes,
      grant.r2_key,
      grant.expires_at,
    );
    return { ok: true, expires_at: grant.expires_at, r2_key: grant.r2_key };
  }

  claimUploadGrant(tokenHash, now) {
    const row = this.ctx.storage.sql.exec(
      "SELECT * FROM upload_grants WHERE token_hash = ?",
      tokenHash,
    ).toArray()[0];
    if (!row) return { ok: false, code: "UPLOAD_GRANT_NOT_FOUND" };
    if (Number(row.expires_at) < now) return { ok: false, code: "UPLOAD_GRANT_EXPIRED" };
    if (row.consumed_at) return { ok: false, code: "UPLOAD_GRANT_USED" };
    if (row.claimed_at) return { ok: false, code: "UPLOAD_GRANT_IN_USE" };
    this.ctx.storage.sql.exec("UPDATE upload_grants SET claimed_at = ? WHERE token_hash = ?", now, tokenHash);
    return { ok: true, grant: uploadGrantRow({ ...row, claimed_at: now }) };
  }

  completeUploadGrant(tokenHash, now) {
    this.ctx.storage.sql.exec(
      "UPDATE upload_grants SET consumed_at = ?, claimed_at = NULL WHERE token_hash = ?",
      now,
      tokenHash,
    );
    return { ok: true };
  }

  releaseUploadGrant(tokenHash) {
    this.ctx.storage.sql.exec(
      "UPDATE upload_grants SET claimed_at = NULL WHERE token_hash = ? AND consumed_at IS NULL",
      tokenHash,
    );
    return { ok: true };
  }

  savePrebooking(prebookingId, payload, matchedIds, status, now) {
    const existing = this.ctx.storage.sql.exec(
      "SELECT * FROM prebookings WHERE prebooking_id = ?",
      prebookingId,
    ).toArray()[0];
    if (existing) return { created: false, record: prebookingRow(existing) };
    this.ctx.storage.sql.exec(
      `INSERT INTO prebookings
        (prebooking_id, payload_json, matched_ids_json, sync_status, status, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?, ?)`,
      prebookingId,
      JSON.stringify(payload),
      JSON.stringify(matchedIds),
      status,
      now,
      now,
    );
    return { created: true, record: { prebooking_id: prebookingId, sync_status: "pending", status, created_at: now, updated_at: now } };
  }

  getPrebooking(prebookingId) {
    const row = this.ctx.storage.sql.exec(
      "SELECT * FROM prebookings WHERE prebooking_id = ?",
      prebookingId,
    ).toArray()[0];
    return row ? prebookingRow(row) : null;
  }

  setPrebookingSync(prebookingId, result, now) {
    this.ctx.storage.sql.exec(
      `UPDATE prebookings
       SET airtable_record_id = ?, sync_status = ?, status = ?, updated_at = ?
       WHERE prebooking_id = ?`,
      result.airtable_record_id || null,
      result.sync_status || "pending",
      result.status || "Pending Coordination",
      now,
      prebookingId,
    );
    return this.getPrebooking(prebookingId);
  }
}

export default {
  async fetch(request, env) {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);
    const path = normalizedPath(url.pathname);
    const cors = corsHeaders(request, env);
    const startedAt = Date.now();

    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors });
      }

      if ((path === "/health" || path === "/ping") && request.method === "GET") {
        return json({
          ok: true,
          worker: WORKER_NAME,
          runtime_scope: String(env.MMS_RUNTIME_SCOPE || "production"),
          bindings: {
            coordinator: Boolean(env.MMS_COORDINATOR),
            private_uploads: Boolean(env.MMS_PRIVATE_UPLOADS),
            airtable: Boolean(env.AIRTABLE_API_TOKEN),
            telegram: telegramConfigured(env),
          },
          time: new Date().toISOString(),
        }, 200, cors, requestId);
      }

      if (path === "/mms/api/catalog" && request.method === "GET") {
        return json({ ok: true, data: catalog() }, 200, cors, requestId);
      }

      if (path === "/mms/api/applications" && request.method === "POST") {
        requirePublicOrigin(request, env);
        return await handleApplication(request, env, cors, requestId);
      }

      if (path === "/mms/api/uploads/presign" && request.method === "POST") {
        requirePublicOrigin(request, env);
        return await handleUploadGrant(request, env, cors, requestId);
      }

      const uploadMatch = path.match(/^\/mms\/api\/uploads\/(mmsapp_[a-f0-9]{24})\/([A-Za-z0-9_-]{32,})$/);
      if (uploadMatch && request.method === "PUT") {
        requirePublicOrigin(request, env);
        return await handleUpload(request, env, cors, requestId, uploadMatch[1], uploadMatch[2]);
      }

      if (path === "/mms/api/therapists/match" && request.method === "POST") {
        await requireInternalRequest(request, env);
        return await handleMatching(request, env, cors, requestId);
      }

      if (path === "/mms/api/prebookings" && request.method === "POST") {
        await requireInternalRequest(request, env);
        return await handlePrebooking(request, env, cors, requestId);
      }

      const applicationReadMatch = path.match(/^\/internal\/mms\/applications\/(mmsapp_[a-f0-9]{24})$/);
      if (applicationReadMatch && request.method === "GET") {
        await requireInternalRequest(request, env);
        return await handleApplicationRead(env, cors, requestId, applicationReadMatch[1]);
      }

      const applicationSyncMatch = path.match(/^\/internal\/mms\/applications\/(mmsapp_[a-f0-9]{24})\/sync$/);
      if (applicationSyncMatch && request.method === "POST") {
        await requireInternalRequest(request, env);
        return await handleApplicationSync(env, cors, requestId, applicationSyncMatch[1]);
      }

      const prebookingReadMatch = path.match(/^\/internal\/mms\/prebookings\/(mmspre_[a-f0-9]{24})$/);
      if (prebookingReadMatch && request.method === "GET") {
        await requireInternalRequest(request, env);
        return await handlePrebookingRead(env, cors, requestId, prebookingReadMatch[1]);
      }

      return json({ ok: false, error: { code: "NOT_FOUND", message: "Route not found" } }, 404, cors, requestId);
    } catch (error) {
      const response = errorResponse(error, cors, requestId);
      console.error(JSON.stringify({
        event: "mms_worker_error",
        worker: WORKER_NAME,
        request_id: requestId,
        method: request.method,
        path,
        status: response.status,
        code: error?.code || error?.name || "INTERNAL_ERROR",
        duration_ms: Date.now() - startedAt,
      }));
      return response;
    }
  },
};

async function handleApplication(request, env, cors, requestId) {
  const payload = applicationPayload(await readJsonLimited(request));
  const applicationId = `mmsapp_${(await sha256Hex(`application:${payload.idempotency_key}`)).slice(0, 24)}`;
  const applicationToken = randomToken(32);
  const applicationTokenHash = await sha256Hex(applicationToken);
  const now = new Date().toISOString();
  const stub = coordinator(env, applicationId);
  const saved = await stub.saveApplication(applicationId, payload, applicationTokenHash, now);

  if (!saved.created) {
    if (saved.conflict) {
      throw httpError(409, "IDEMPOTENCY_CONFLICT", "Idempotency key was already used with different application data");
    }
    let retrySync = {
      sync_status: saved.record.sync_status,
      telegram_notify_status: saved.record.telegram_notify_status || "pending",
    };
    if (saved.record.sync_status !== "synced") {
      retrySync = await syncApplication(env, applicationId, saved.record.payload, saved.record.created_at);
      await stub.setApplicationSync(applicationId, retrySync, new Date().toISOString());
    }
    return json({
      ok: true,
      duplicate: true,
      application_ref: applicationId,
      application_id: applicationId,
      application_token: applicationToken,
      status: retrySync.sync_status === "synced" ? "already_received" : "pending_airtable_retry",
      storage: {
        coordinator: "persisted",
        airtable: retrySync.sync_status,
        telegram: retrySync.telegram_notify_status || "pending",
      },
      upload: { next: "/mms/api/uploads/presign", token_rotated: true },
      message: "Application already received. A replacement upload token was issued for this retry.",
    }, 200, cors, requestId);
  }

  const sync = await syncApplication(env, applicationId, payload, now);
  await stub.setApplicationSync(applicationId, sync, new Date().toISOString());
  const status = sync.sync_status === "synced" ? 201 : 202;
  return json({
    ok: true,
    application_ref: applicationId,
    application_id: applicationId,
    application_token: applicationToken,
    status: sync.sync_status === "synced" ? "accepted" : "pending_airtable_retry",
    storage: { coordinator: "persisted", airtable: sync.sync_status, telegram: sync.telegram_notify_status },
    upload: { next: "/mms/api/uploads/presign", token_returned_once: true },
  }, status, cors, requestId);
}

async function handleUploadGrant(request, env, cors, requestId) {
  const payload = uploadRequest(await readJsonLimited(request), { maxBytes: uploadMaxBytes(env) });
  const stub = coordinator(env, payload.application_ref);
  const authorized = await stub.authorizeApplication(
    payload.application_ref,
    await sha256Hex(payload.application_token),
  );
  if (!authorized) throw httpError(401, "APPLICATION_TOKEN_REJECTED", "Application upload access was rejected");

  const uploadToken = randomToken(32);
  const tokenHash = await sha256Hex(uploadToken);
  const expiresAt = Date.now() + UPLOAD_GRANT_TTL_MS;
  const extension = safeExtension(payload.filename, payload.content_type);
  const r2Key = `mms/applications/${payload.application_ref}/${payload.kind}/${crypto.randomUUID()}${extension}`;
  await stub.createUploadGrant({
    token_hash: tokenHash,
    application_id: payload.application_ref,
    kind: payload.kind,
    filename: payload.filename,
    content_type: payload.content_type,
    expected_bytes: payload.size,
    r2_key: r2Key,
    expires_at: expiresAt,
  });

  const publicBase = String(env.MMS_PUBLIC_BASE_URL || request.url).replace(/\/mms\/api\/uploads\/presign.*$/, "").replace(/\/$/, "");
  return json({
    ok: true,
    upload: {
      method: "PUT",
      url: `${publicBase}/mms/api/uploads/${payload.application_ref}/${uploadToken}`,
      content_type: payload.content_type,
      content_length: payload.size,
      expires_at: new Date(expiresAt).toISOString(),
    },
  }, 201, cors, requestId);
}

async function handleUpload(request, env, cors, requestId, applicationId, uploadToken) {
  if (!env.MMS_PRIVATE_UPLOADS) throw httpError(503, "UPLOAD_STORAGE_UNAVAILABLE", "Private upload storage is unavailable");
  const tokenHash = await sha256Hex(uploadToken);
  const stub = coordinator(env, applicationId);
  const claim = await stub.claimUploadGrant(tokenHash, Date.now());
  if (!claim.ok) throw httpError(409, claim.code, "Upload grant is invalid, expired, used, or already in progress");

  try {
    const grant = claim.grant;
    if (!request.body) throw httpError(400, "UPLOAD_BODY_REQUIRED", "Upload body is required");
    var uploadBody = request.body;
    var contentLength = optionalContentLength(request);
    if (contentLength === null) {
      uploadBody = await request.arrayBuffer();
      contentLength = uploadBody.byteLength;
    }
    const contentType = String(request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (contentLength !== grant.expected_bytes) throw httpError(400, "UPLOAD_SIZE_MISMATCH", "Upload size does not match the grant");
    if (contentLength > uploadMaxBytes(env)) throw httpError(413, "UPLOAD_TOO_LARGE", "Upload is too large");
    if (contentType !== grant.content_type) throw httpError(400, "UPLOAD_TYPE_MISMATCH", "Upload content type does not match the grant");

    await env.MMS_PRIVATE_UPLOADS.put(grant.r2_key, uploadBody, {
      httpMetadata: { contentType: grant.content_type },
      customMetadata: {
        application_id: applicationId,
        kind: grant.kind,
        original_name: grant.filename.slice(0, 160),
      },
    });
    await stub.completeUploadGrant(tokenHash, Date.now());
    const airtable = await attachUploadToApplication(env, applicationId, grant).catch(() => ({ status: "pending" }));
    return json({
      ok: true,
      application_ref: applicationId,
      application_id: applicationId,
      kind: grant.kind,
      storage: { r2: "stored", airtable: airtable.status },
    }, 201, cors, requestId);
  } catch (error) {
    await stub.releaseUploadGrant(tokenHash);
    throw error;
  }
}

async function handleMatching(request, env, cors, requestId) {
  const body = await readJsonLimited(request);
  const allowed = new Set(["recipient_gender", "zone", "skills"]);
  const unknown = Object.keys(body).filter((key) => !allowed.has(key));
  if (unknown.length) throw validationError([`unsupported fields: ${unknown.join(", ")}`]);
  const records = await airtableListAll(env, tableId(env, "THERAPISTS"));
  const result = matchTherapists(records, body);
  return json({ ok: true, data: result }, 200, cors, requestId);
}

async function handlePrebooking(request, env, cors, requestId) {
  const payload = prebookingPayload(await readJsonLimited(request));
  const prebookingId = `mmspre_${(await sha256Hex(`prebooking:${payload.idempotency_key}`)).slice(0, 24)}`;
  const now = new Date().toISOString();
  const coordinatorKey = `${payload.service_date}:${payload.service_time}:${payload.zone}`;
  let matchedIds = [];
  let status = "Pending Coordination";

  if (env.AIRTABLE_API_TOKEN) {
    const records = await airtableListAll(env, tableId(env, "THERAPISTS"));
    const matching = matchTherapists(records, payload);
    matchedIds = matching.matches.map((item) => item.therapist_id);
    if (matchedIds.length) status = "Options Ready";
  }

  const stub = coordinator(env, prebookingId);
  const saved = await stub.savePrebooking(prebookingId, payload, matchedIds, status, now);
  if (!saved.created) {
    return json({ ok: true, duplicate: true, prebooking: publicPrebooking(saved.record) }, 200, cors, requestId);
  }

  const lineUserHash = payload.line_user_id ? await sha256Hex(`line:${payload.line_user_id}`) : "";
  const fields = prebookingAirtableFields(payload, {
    prebooking_id: prebookingId,
    line_user_hash: lineUserHash,
    matched_therapist_ids: matchedIds,
    status,
    coordinator_key: coordinatorKey,
    created_at: now,
    updated_at: now,
  });
  const sync = await createAirtableRecordSafe(env, tableId(env, "PREBOOKINGS"), fields);
  const record = await stub.setPrebookingSync(prebookingId, {
    airtable_record_id: sync.record_id,
    sync_status: sync.status,
    status,
  }, new Date().toISOString());
  return json({
    ok: true,
    prebooking: publicPrebooking(record),
    matched_therapist_ids: matchedIds,
    storage: { coordinator: "persisted", airtable: sync.status },
  }, sync.status === "synced" ? 201 : 202, cors, requestId);
}

async function handleApplicationRead(env, cors, requestId, applicationId) {
  const record = await coordinator(env, applicationId).getApplication(applicationId);
  if (!record) throw httpError(404, "APPLICATION_NOT_FOUND", "Application not found");
  return json({ ok: true, application: internalApplication(record) }, 200, cors, requestId);
}

async function handleApplicationSync(env, cors, requestId, applicationId) {
  const stub = coordinator(env, applicationId);
  const record = await stub.getApplication(applicationId);
  if (!record) throw httpError(404, "APPLICATION_NOT_FOUND", "Application not found");
  const sync = await syncApplication(env, applicationId, record.payload, record.created_at);
  const updated = await stub.setApplicationSync(applicationId, sync, new Date().toISOString());
  return json({ ok: true, application: internalApplication(updated) }, sync.sync_status === "synced" ? 200 : 503, cors, requestId);
}

async function handlePrebookingRead(env, cors, requestId, prebookingId) {
  const record = await coordinator(env, prebookingId).getPrebooking(prebookingId);
  if (!record) throw httpError(404, "PREBOOKING_NOT_FOUND", "Prebooking not found");
  return json({ ok: true, prebooking: publicPrebooking(record) }, 200, cors, requestId);
}

async function syncApplication(env, applicationId, payload, submittedAt) {
  if (!env.AIRTABLE_API_TOKEN) {
    return { sync_status: "pending_airtable_secret", airtable_record_id: "", sensitive_record_id: "" };
  }

  try {
    const existing = await findAirtableRecord(env, tableId(env, "APPLICATIONS"), "Application ID", applicationId);
    const fields = applicationAirtableFields(payload, { application_id: applicationId, submitted_at: submittedAt });
    const applicationRecord = existing
      ? await airtableUpdate(env, tableId(env, "APPLICATIONS"), existing.id, fields)
      : await airtableCreate(env, tableId(env, "APPLICATIONS"), fields);

    let sensitiveRecordId = "";
    const sensitiveFields = sensitiveAirtableFields(payload, { application_id: applicationId, submitted_at: submittedAt });
    if (sensitiveFields) {
      const existingSensitive = await findAirtableRecord(env, tableId(env, "SENSITIVE_PROFILES"), "Therapist Application Ref", applicationId);
      const sensitive = existingSensitive
        ? await airtableUpdate(env, tableId(env, "SENSITIVE_PROFILES"), existingSensitive.id, sensitiveFields)
        : await airtableCreate(env, tableId(env, "SENSITIVE_PROFILES"), sensitiveFields);
      sensitiveRecordId = sensitive.id;
      await airtableUpdate(env, tableId(env, "APPLICATIONS"), applicationRecord.id, { "Sensitive Profile Ref": sensitiveRecordId });
    }

    const telegram = await syncApplicationTelegram(env, applicationRecord, payload, applicationId);

    return {
      sync_status: "synced",
      airtable_record_id: applicationRecord.id,
      sensitive_record_id: sensitiveRecordId,
      telegram_notify_status: telegram.status,
    };
  } catch (error) {
    console.error(JSON.stringify({ event: "mms_airtable_application_sync_failed", application_id: applicationId, code: error?.code || "AIRTABLE_ERROR" }));
    return { sync_status: "pending_airtable_retry", airtable_record_id: "", sensitive_record_id: "", telegram_notify_status: "pending" };
  }
}

async function syncApplicationTelegram(env, applicationRecord, payload, applicationId) {
  const previousStatus = selectName(applicationRecord.fields?.["Telegram Notify Status"]);
  if (previousStatus === "Sent") return { status: "sent" };
  if (!telegramConfigured(env)) {
    await airtableUpdate(env, tableId(env, "APPLICATIONS"), applicationRecord.id, {
      "Telegram Notify Status": "Skipped",
      "Telegram Notify Error": "Telegram secret or chat id is not configured",
    });
    return { status: "skipped" };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${String(env.TELEGRAM_BOT_TOKEN).trim()}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: String(env.MMS_TELEGRAM_CHAT_ID).trim(),
        text: applicationTelegramMessage(payload, { application_id: applicationId }),
        disable_web_page_preview: true,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok !== true) {
      const error = new Error(`TELEGRAM_HTTP_${response.status}`);
      error.code = `TELEGRAM_HTTP_${response.status}`;
      throw error;
    }
    const notifiedAt = new Date().toISOString();
    await airtableUpdate(env, tableId(env, "APPLICATIONS"), applicationRecord.id, {
      "Telegram Notify Status": "Sent",
      "Telegram Notified At": notifiedAt,
      "Telegram Notify Error": "",
    });
    return { status: "sent", notified_at: notifiedAt };
  } catch (error) {
    const code = String(error?.code || error?.name || "TELEGRAM_ERROR").slice(0, 120);
    console.error(JSON.stringify({ event: "mms_telegram_application_notify_failed", application_id: applicationId, code }));
    await airtableUpdate(env, tableId(env, "APPLICATIONS"), applicationRecord.id, {
      "Telegram Notify Status": "Failed",
      "Telegram Notify Error": code,
    });
    return { status: "failed" };
  }
}

function telegramConfigured(env) {
  return Boolean(String(env.TELEGRAM_BOT_TOKEN || "").trim() && String(env.MMS_TELEGRAM_CHAT_ID || "").trim());
}

function selectName(value) {
  return value && typeof value === "object" && typeof value.name === "string" ? value.name : String(value || "");
}

async function attachUploadToApplication(env, applicationId, grant) {
  if (!env.AIRTABLE_API_TOKEN) return { status: "pending_airtable_secret" };
  const record = await findAirtableRecord(env, tableId(env, "APPLICATIONS"), "Application ID", applicationId);
  if (!record) return { status: "pending_application_sync" };
  if (grant.kind === "profile_photo") {
    await airtableUpdate(env, tableId(env, "APPLICATIONS"), record.id, { "Profile Photo R2 Key": grant.r2_key });
  } else {
    const existing = parseStringArray(record.fields?.["Certificate R2 Keys"]);
    await airtableUpdate(env, tableId(env, "APPLICATIONS"), record.id, {
      "Certificate R2 Keys": JSON.stringify([...new Set([...existing, grant.r2_key])]),
    });
  }
  return { status: "synced" };
}

async function createAirtableRecordSafe(env, table, fields) {
  if (!env.AIRTABLE_API_TOKEN) return { status: "pending_airtable_secret", record_id: "" };
  try {
    const record = await airtableCreate(env, table, fields);
    return { status: "synced", record_id: record.id };
  } catch (error) {
    console.error(JSON.stringify({ event: "mms_airtable_prebooking_sync_failed", code: error?.code || "AIRTABLE_ERROR" }));
    return { status: "pending_airtable_retry", record_id: "" };
  }
}

async function airtableCreate(env, table, fields) {
  return airtableFetch(env, table, { method: "POST", body: JSON.stringify({ fields, typecast: false }) });
}

async function airtableUpdate(env, table, recordId, fields) {
  return airtableFetch(env, `${table}/${recordId}`, { method: "PATCH", body: JSON.stringify({ fields, typecast: false }) });
}

async function findAirtableRecord(env, table, field, value) {
  const query = new URLSearchParams({ maxRecords: "1", filterByFormula: `{${field}}='${airtableEscape(value)}'` });
  const data = await airtableFetch(env, `${table}?${query}`);
  return Array.isArray(data.records) ? data.records[0] || null : null;
}

async function airtableListAll(env, table) {
  if (!env.AIRTABLE_API_TOKEN) throw httpError(503, "AIRTABLE_NOT_CONFIGURED", "Therapist inventory is not connected yet");
  const records = [];
  let offset = "";
  for (let page = 0; page < 5; page += 1) {
    const query = new URLSearchParams({ pageSize: "100" });
    if (offset) query.set("offset", offset);
    const data = await airtableFetch(env, `${table}?${query}`);
    records.push(...(Array.isArray(data.records) ? data.records : []));
    offset = String(data.offset || "");
    if (!offset) break;
  }
  return records;
}

async function airtableFetch(env, path, init = {}) {
  if (!env.AIRTABLE_API_TOKEN) throw httpError(503, "AIRTABLE_NOT_CONFIGURED", "Airtable is not configured");
  const baseId = String(env.AIRTABLE_BASE_ID || "").trim();
  if (!/^app[A-Za-z0-9]{14}$/.test(baseId)) throw httpError(503, "AIRTABLE_BASE_INVALID", "Airtable base is not configured");
  const response = await fetch(`https://api.airtable.com/v0/${baseId}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_API_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = httpError(502, "AIRTABLE_REQUEST_FAILED", "Airtable request failed");
    error.airtable_status = response.status;
    throw error;
  }
  return data;
}

async function requireInternalRequest(request, env) {
  const hostname = new URL(request.url).hostname.toLowerCase();
  if (hostname === String(env.MMS_INTERNAL_HOST || INTERNAL_HOST).toLowerCase()) return;
  const configured = String(env.MMS_INTERNAL_TOKEN || "");
  const supplied = String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (configured && supplied && await timingSafeEqual(configured, supplied)) return;
  throw httpError(404, "NOT_FOUND", "Route not found");
}

function requirePublicOrigin(request, env) {
  const origin = request.headers.get("origin");
  if (origin && allowedOrigins(env).has(origin)) return;
  throw httpError(403, "ORIGIN_NOT_ALLOWED", "Origin is not allowed");
}

function coordinator(env, name) {
  if (!env.MMS_COORDINATOR) throw httpError(503, "COORDINATOR_UNAVAILABLE", "MMS coordinator is unavailable");
  return env.MMS_COORDINATOR.get(env.MMS_COORDINATOR.idFromName(name));
}

function tableId(env, suffix) {
  const value = String(env[`AIRTABLE_${suffix}_TABLE_ID`] || "").trim();
  if (!/^tbl[A-Za-z0-9]{14}$/.test(value)) throw httpError(503, "AIRTABLE_TABLE_INVALID", `Airtable ${suffix.toLowerCase()} table is not configured`);
  return value;
}

async function readJsonLimited(request) {
  const contentType = String(request.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("application/json")) throw httpError(415, "JSON_REQUIRED", "application/json is required");
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > JSON_LIMIT_BYTES) throw httpError(413, "JSON_TOO_LARGE", "JSON body is too large");
  if (!request.body) throw httpError(400, "JSON_REQUIRED", "JSON body is required");

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > JSON_LIMIT_BYTES) {
      await reader.cancel();
      throw httpError(413, "JSON_TOO_LARGE", "JSON body is too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, position);
    position += chunk.byteLength;
  }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object required");
    return parsed;
  } catch {
    throw httpError(400, "INVALID_JSON", "A valid JSON object is required");
  }
}

function optionalContentLength(request) {
  const value = String(request.headers.get("content-length") || "");
  if (!value) return null;
  if (!/^\d+$/.test(value)) throw httpError(400, "INVALID_CONTENT_LENGTH", "Content-Length is invalid");
  return Number(value);
}

function uploadMaxBytes(env) {
  const value = Number(env.MMS_UPLOAD_MAX_BYTES || DEFAULT_UPLOAD_MAX_BYTES);
  return Number.isInteger(value) && value > 0 && value <= 25 * 1024 * 1024 ? value : DEFAULT_UPLOAD_MAX_BYTES;
}

function safeExtension(filename, contentType) {
  const extension = String(filename || "").toLowerCase().match(/\.(jpg|jpeg|png|webp|pdf)$/)?.[0];
  if (extension) return extension === ".jpeg" ? ".jpg" : extension;
  return ({ "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf" })[contentType] || "";
}

function publicPrebooking(record) {
  return {
    prebooking_id: record.prebooking_id,
    status: record.status,
    sync_status: record.sync_status,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

function internalApplication(record) {
  return {
    application_id: record.application_id,
    payload: record.payload,
    sync_status: record.sync_status,
    airtable_record_id: record.airtable_record_id || "",
    sensitive_record_id: record.sensitive_record_id || "",
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

function applicationRow(row) {
  return {
    application_id: String(row.application_id),
    payload: parseObject(row.payload_json),
    airtable_record_id: String(row.airtable_record_id || ""),
    sensitive_record_id: String(row.sensitive_record_id || ""),
    sync_status: String(row.sync_status || "pending"),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function prebookingRow(row) {
  return {
    prebooking_id: String(row.prebooking_id),
    payload: parseObject(row.payload_json),
    matched_therapist_ids: parseStringArray(row.matched_ids_json),
    airtable_record_id: String(row.airtable_record_id || ""),
    sync_status: String(row.sync_status || "pending"),
    status: String(row.status || "Pending Coordination"),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function uploadGrantRow(row) {
  return {
    application_id: String(row.application_id),
    kind: String(row.kind),
    filename: String(row.filename),
    content_type: String(row.content_type),
    expected_bytes: Number(row.expected_bytes),
    r2_key: String(row.r2_key),
    expires_at: Number(row.expires_at),
  };
}

function parseObject(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseStringArray(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken(bytes) {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const value of values) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function timingSafeEqual(left, right) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  const [aDigest, bDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", a),
    crypto.subtle.digest("SHA-256", b),
  ]);
  if (typeof crypto.subtle.timingSafeEqual === "function") {
    return crypto.subtle.timingSafeEqual(aDigest, bDigest);
  }
  const x = new Uint8Array(aDigest);
  const y = new Uint8Array(bDigest);
  let difference = 0;
  for (let index = 0; index < x.length; index += 1) difference |= x[index] ^ y[index];
  return difference === 0;
}

function normalizedPath(pathname) {
  return pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
}

function allowedOrigins(env) {
  return new Set(String(env.ALLOWED_ORIGINS || "https://mmdbkk.com,https://www.mmdbkk.com,https://mmdprive.webflow.io")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean));
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin");
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Idempotency-Key",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
  if (origin && allowedOrigins(env).has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(body, status, cors, requestId) {
  return Response.json(body, {
    status,
    headers: {
      ...cors,
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "X-Request-ID": requestId,
    },
  });
}

function errorResponse(error, cors, requestId) {
  const status = Number(error?.status || (error?.name === "ValidationError" ? 400 : 500));
  const code = String(error?.code || (error?.name === "ValidationError" ? "VALIDATION_ERROR" : "INTERNAL_ERROR"));
  const details = error?.name === "ValidationError" && Array.isArray(error.details) ? error.details : undefined;
  return json({
    ok: false,
    error: {
      code,
      message: status >= 500 ? "MMS service is temporarily unavailable" : String(error?.message || "Request failed"),
      ...(details ? { details } : {}),
    },
  }, status, cors, requestId);
}

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function validationError(details) {
  const error = new Error(details.join("; "));
  error.name = "ValidationError";
  error.details = details;
  return error;
}

function airtableEscape(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
