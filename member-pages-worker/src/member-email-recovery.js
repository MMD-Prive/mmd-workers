import { PUBLIC_JSON_BODY_MAX_BYTES, readBoundedJsonObject } from "./bounded-json.js";

const SESSION_COOKIE = "__Host-mmd_liff_session";
const SESSION_TTL_SECONDS = 15 * 60;
const RECOVERY_PATHS = new Set([
  "/member/api/liff/recovery",
  "/member/api/liff/recovery/",
]);
const APPROVED_ORIGINS = new Set([
  "https://mmdbkk.com",
  "https://www.mmdbkk.com",
  "https://mmdprive.webflow.io",
  "https://mmdprive.com",
]);
const BODY_KEYS = new Set(["email", "member_id_candidate", "phone", "telegram_username", "nickname"]);
const BROWSER_IDENTITY_FIELDS = new Set([
  "line_user_id",
  "lineUserId",
  "line_id",
  "sub",
  "member_id",
  "member_ref",
  "mmd_member_id",
  "tier",
  "points",
  "status",
  "membership_status",
  "payment_status",
  "private_access",
  "entitlements",
  "source_channel",
  "liff_session_id",
]);

const TABLES = {
  members: "Members",
  clients: "Clients",
  preSession: "MMD — Pre-Session Client Index",
  accessEvidence: "Client Access Evidence",
  lineOfc: "LINE OFC Client Import Staging",
  mergeRequests: "MMD — Identity Merge Requests",
};
const RIGHTS_SOURCE = "my_mmd_entitlement_resolver_v1";
const ACCESS_EVIDENCE_APPROVED_STATUS = "approved_evidence";

export function isMemberEmailRecoveryPath(url) {
  return RECOVERY_PATHS.has(normalizePath(url?.pathname || url || "/"));
}

export async function handleMemberEmailRecovery(request, env = {}) {
  if (request.method === "OPTIONS") {
    if (!isApprovedOrigin(request)) return json({ ok: false, error: { code: "ORIGIN_NOT_ALLOWED", message: "Same-origin request required." } }, 403);
    return withCors(request, new Response(null, { status: 204, headers: apiHeaders("POST,OPTIONS") }));
  }
  if (request.method !== "POST") return methodNotAllowed("POST");
  if (!isApprovedOrigin(request)) return json({ ok: false, error: { code: "ORIGIN_NOT_ALLOWED", message: "Same-origin request required." } }, 403);
  if (!hasSessionBindings(env)) return unavailable("LIFF_IDENTITY_FOUNDATION_NOT_CONFIGURED");
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) return unavailable("IDENTITY_RECOVERY_STORAGE_NOT_CONFIGURED");

  const parsed = await readJson(request);
  if (!parsed.ok) return parsed.response;
  if (hasUnexpectedKeys(parsed.body, BODY_KEYS) || hasBrowserIdentityClaims(parsed.body)) return browserIdentityRejected();

  const email = normalizeEmail(parsed.body.email);
  const memberIdCandidate = normalizeMemberId(parsed.body.member_id_candidate);
  const phone = normalizePhone(parsed.body.phone);
  const telegramUsername = normalizeTelegramUsername(parsed.body.telegram_username);
  const nickname = normalizeNickname(parsed.body.nickname);
  if (!email && !memberIdCandidate && !phone && !telegramUsername && !nickname) {
    return json({ ok: false, error: { code: "RECOVERY_IDENTITY_REQUIRED", message: "กรอกอีเมล เบอร์โทร หรือชื่อเล่นที่เคยให้ MMD ไว้ครับ" } }, 400);
  }
  if (parsed.body.email && !email) {
    return json({ ok: false, error: { code: "RECOVERY_EMAIL_INVALID", message: "อีเมลไม่ถูกต้องครับ" } }, 400);
  }
  if (parsed.body.member_id_candidate && !memberIdCandidate) {
    return json({ ok: false, error: { code: "RECOVERY_MEMBER_ID_INVALID", message: "Member ID ไม่ถูกต้องครับ" } }, 400);
  }
  if (parsed.body.phone && !phone) {
    return json({ ok: false, error: { code: "RECOVERY_PHONE_INVALID", message: "เบอร์โทรไม่ถูกต้องครับ" } }, 400);
  }
  if (parsed.body.telegram_username && !telegramUsername) {
    return json({ ok: false, error: { code: "RECOVERY_TELEGRAM_INVALID", message: "Telegram username ไม่ถูกต้องครับ" } }, 400);
  }
  if (parsed.body.nickname && !nickname) {
    return json({ ok: false, error: { code: "RECOVERY_NICKNAME_INVALID", message: "ชื่อเล่นไม่ถูกต้องครับ" } }, 400);
  }

  const auth = await authenticateAndRotate(request, env);
  if (!auth.ok) return auth.response;
  if (auth.session.member_exists === true && auth.session.member_id) {
    return commitJson(env, auth, {
      ok: true,
      data: {
        state: "already_linked",
        verification_required: false,
        next_action: "open_my_mmd",
        grants: noGrants(),
      },
    }, 200);
  }

  const lineUserId = canonicalLineId(auth.session.line_user_id);
  if (!lineUserId) return commitError(env, auth, "RECOVERY_LINE_IDENTITY_MISSING", "เปิดหน้านี้ใหม่ผ่าน LINE ของ MMD เพื่อยืนยันตัวตนครับ", 409);

  try {
    const result = await inspectRecoveryEvidence(env, { lineUserId, email, memberIdCandidate, phone, telegramUsername, nickname });
    const merge = await persistMergeRequest(env, {
      lineUserId,
      email,
      memberIdCandidate,
      phone,
      telegramUsername,
      nickname,
      result,
      sessionRecordId: safeRecordId(auth.session.gateway_record_id || auth.session.renewal_session_record_id),
    });

    auth.session.identity_recovery_state = result.state;
    auth.session.identity_recovery_request_id = merge.merge_request_id;
    auth.session.identity_recovery_checked_at = new Date().toISOString();
    if (result.state === "known_identity") auth.session.next_screen_key = email ? "renew_member_lookup" : "manual_review";
    if (result.state === "review_required") auth.session.next_screen_key = "manual_review";

    return commitJson(env, auth, {
      ok: true,
      data: {
        state: result.state,
        merge_request_id: merge.merge_request_id,
        verification_required: result.state === "known_identity" && Boolean(email),
        verification_channel: result.state === "known_identity" && email ? "email" : null,
        verification_available: false,
        next_action: result.state === "known_identity" && email
          ? "email_verification_pending"
          : "manual_review",
        grants: noGrants(),
      },
    }, 200);
  } catch (error) {
    console.warn({ event: "member_email_recovery_failed", failure_class: safeFailure(error) });
    return commitError(env, auth, "IDENTITY_RECOVERY_UNAVAILABLE", "ตอนนี้ MMD ยังตรวจข้อมูลเดิมไม่สำเร็จครับ กรุณาลองใหม่อีกครั้ง", 503);
  }
}

export async function inspectRecoveryEvidence(env = {}, { lineUserId, email = "", memberIdCandidate = "", phone = "", telegramUsername = "", nickname = "" } = {}) {
  const lineId = canonicalLineId(lineUserId);
  if (!lineId) throw new Error("invalid_line_identity");
  const normalizedEmail = normalizeEmail(email);
  const memberHint = normalizeMemberId(memberIdCandidate);
  const normalizedPhone = normalizePhone(phone);
  const normalizedTelegramUsername = normalizeTelegramUsername(telegramUsername);
  const normalizedNickname = normalizeNickname(nickname);
  if (!normalizedEmail && !memberHint && !normalizedPhone && !normalizedTelegramUsername && !normalizedNickname) throw new Error("recovery_identity_required");

  const memberTable = tableName(env.AIRTABLE_TABLE_MEMBERS, TABLES.members);
  const clientTable = tableName(env.AIRTABLE_TABLE_CLIENTS, TABLES.clients);
  const preSessionTable = tableName(env.AIRTABLE_TABLE_PRE_SESSION_CLIENT_INDEX, TABLES.preSession);
  const accessEvidenceTable = tableName(env.AIRTABLE_TABLE_CLIENT_ACCESS_EVIDENCE, TABLES.accessEvidence);
  const lineOfcTable = tableName(env.AIRTABLE_TABLE_LINE_OFC_CLIENT_IMPORT_STAGING, TABLES.lineOfc);

  const memberEmailField = String(env.AIRTABLE_MEMBERS_EMAIL_FIELD || "Contact Email").trim();
  const memberIdField = String(env.AIRTABLE_MEMBERS_MEMBER_ID_FIELD || "member_id").trim();
  const clientEmailFields = csvFields(env.AIRTABLE_CLIENTS_EMAIL_FIELDS || "Contact Email,email");
  const clientPhoneFields = csvFields(env.AIRTABLE_CLIENTS_PHONE_FIELDS || "Phone Number,phone");
  const clientTelegramFields = csvFields(env.AIRTABLE_CLIENTS_TELEGRAM_FIELDS || "telegram_username,Telegram Username");
  const clientNicknameFields = csvFields(env.AIRTABLE_CLIENTS_NAME_FIELDS || "Client Name,Client Name (Display),mmd_client_name,nickname,username");
  const preSessionNicknameFields = csvFields(env.AIRTABLE_PRE_SESSION_NAME_FIELDS || "preferred_name,normalized_name,line_display_name");
  const accessEvidenceEmailField = String(env.AIRTABLE_CLIENT_ACCESS_EVIDENCE_EMAIL_FIELD || "identity_email").trim();
  const accessEvidenceClientField = String(env.AIRTABLE_CLIENT_ACCESS_EVIDENCE_CLIENT_FIELD || "client").trim();
  const accessEvidenceReviewStatusField = String(env.AIRTABLE_CLIENT_ACCESS_EVIDENCE_REVIEW_STATUS_FIELD || "review_status").trim();
  const lineOfcPhoneFields = csvFields(env.AIRTABLE_LINE_OFC_PHONE_FIELDS || "phone_candidate,Phone");
  const lineOfcTelegramFields = csvFields(env.AIRTABLE_LINE_OFC_TELEGRAM_FIELDS || "telegram_username_candidate,telegram_username,Telegram Username");
  const lineOfcNicknameFields = csvFields(env.AIRTABLE_LINE_OFC_NAME_FIELDS || "normalized_name,line_display_name,line_renamed_name,Display Name,Current LINE Rename");

  const queries = [];
  queries.push(normalizedEmail
    ? airtableList(env, memberTable, { filterByFormula: `LOWER({${memberEmailField}})=${formulaString(normalizedEmail)}`, maxRecords: 3 })
    : memberHint
      ? airtableList(env, memberTable, { filterByFormula: `{${memberIdField}}=${formulaString(memberHint)}`, maxRecords: 3 })
      : Promise.resolve([]));
  queries.push(normalizedEmail
    ? airtableList(env, clientTable, { filterByFormula: emailFormula(clientEmailFields, normalizedEmail), maxRecords: 3 })
    : Promise.resolve([]));
  queries.push(normalizedEmail
    ? airtableList(env, preSessionTable, { filterByFormula: `LOWER({identity_email})=${formulaString(normalizedEmail)}`, maxRecords: 6 })
    : Promise.resolve([]));
  queries.push(normalizedEmail
    ? airtableList(env, accessEvidenceTable, { filterByFormula: `LOWER({${accessEvidenceEmailField}})=${formulaString(normalizedEmail)}`, maxRecords: 12 })
    : Promise.resolve([]));
  queries.push(normalizedEmail
    ? airtableList(env, lineOfcTable, { filterByFormula: `LOWER({email_candidate})=${formulaString(normalizedEmail)}`, maxRecords: 6 })
    : Promise.resolve([]));
  queries.push(normalizedPhone
    ? airtableListOptional(env, clientTable, { filterByFormula: phoneFormula(clientPhoneFields, normalizedPhone), maxRecords: 3 })
    : Promise.resolve([]));
  queries.push(normalizedTelegramUsername
    ? airtableListOptional(env, clientTable, { filterByFormula: exactTextFormula(clientTelegramFields, normalizedTelegramUsername), maxRecords: 3 })
    : Promise.resolve([]));
  queries.push(normalizedPhone
    ? airtableListOptional(env, lineOfcTable, { filterByFormula: phoneFormula(lineOfcPhoneFields, normalizedPhone), maxRecords: 6 })
    : Promise.resolve([]));
  queries.push(normalizedTelegramUsername
    ? airtableListOptional(env, lineOfcTable, { filterByFormula: exactTextFormula(lineOfcTelegramFields, normalizedTelegramUsername), maxRecords: 6 })
    : Promise.resolve([]));
  queries.push(normalizedNickname
    ? airtableListOptional(env, clientTable, { filterByFormula: exactTextFormula(clientNicknameFields, normalizedNickname), maxRecords: 3 })
    : Promise.resolve([]));
  queries.push(normalizedNickname
    ? airtableListOptional(env, preSessionTable, { filterByFormula: exactTextFormula(preSessionNicknameFields, normalizedNickname), maxRecords: 6 })
    : Promise.resolve([]));
  queries.push(normalizedNickname
    ? airtableListOptional(env, lineOfcTable, { filterByFormula: exactTextFormula(lineOfcNicknameFields, normalizedNickname), maxRecords: 6 })
    : Promise.resolve([]));

  const [
    members,
    clients,
    preSession,
    rawAccessEvidence,
    lineOfc,
    clientsPhone,
    clientsTelegram,
    lineOfcPhone,
    lineOfcTelegram,
    clientsNickname,
    preSessionNickname,
    lineOfcNickname,
  ] = await Promise.all(queries);
  const accessEvidence = approvedLinkedAccessEvidence(rawAccessEvidence, normalizedEmail, {
    emailField: accessEvidenceEmailField,
    clientField: accessEvidenceClientField,
    reviewStatusField: accessEvidenceReviewStatusField,
  });

  let memberHintMatches = [];
  if (normalizedEmail && memberHint) {
    memberHintMatches = await airtableList(env, memberTable, {
      filterByFormula: `{${memberIdField}}=${formulaString(memberHint)}`,
      maxRecords: 3,
    });
  }

  const memberIds = recordIds(members);
  const directClientIds = recordIds(clients);
  const phoneClientIds = recordIds(clientsPhone);
  const telegramClientIds = recordIds(clientsTelegram);
  const nicknameClientIds = recordIds(clientsNickname);
  const accessClientIds = accessEvidenceClientIds(accessEvidence, accessEvidenceClientField);
  const clientIds = uniqueRecordIds([...directClientIds, ...phoneClientIds, ...telegramClientIds, ...nicknameClientIds, ...accessClientIds]);
  const preSessionIds = uniqueRecordIds([...recordIds(preSession), ...recordIds(preSessionNickname)]);
  const memberHintIds = recordIds(memberHintMatches);
  const canonicalAmbiguous = memberIds.length > 1
    || clientIds.length > 1
    || memberHintIds.length > 1
    || preSessionNickname.length > 1
    || lineOfcPhone.length > 1
    || lineOfcTelegram.length > 1
    || lineOfcNickname.length > 1;
  const hintConflict = memberIds.length === 1 && memberHintIds.length === 1 && memberIds[0] !== memberHintIds[0];
  const known = members.length
    + clients.length
    + preSession.length
    + accessEvidence.length
    + lineOfc.length
    + memberHintMatches.length
    + clientsPhone.length
    + clientsTelegram.length
    + lineOfcPhone.length
    + lineOfcTelegram.length
    + clientsNickname.length
    + preSessionNickname.length
    + lineOfcNickname.length > 0;

  if (canonicalAmbiguous || hintConflict) {
    return {
      state: "review_required",
      match_type: "ambiguous",
      confidence: 0,
      candidateMemberIds: uniqueRecordIds([...memberIds, ...memberHintIds]).slice(0, 2),
      candidateClientIds: clientIds.slice(0, 2),
      preSessionIds: preSessionIds.slice(0, 2),
      evidenceSources: evidenceSources({ members, clients, preSession, accessEvidence, lineOfc, memberHintMatches, clientsPhone, clientsTelegram, lineOfcPhone, lineOfcTelegram, clientsNickname, preSessionNickname, lineOfcNickname }),
    };
  }

  if (!known) {
    return {
      state: "review_required",
      match_type: "not_found",
      confidence: 0,
      candidateMemberIds: [],
      candidateClientIds: [],
      preSessionIds: [],
      evidenceSources: [],
    };
  }

  const match = strongestMatch({ members, clients, preSession, accessEvidence, lineOfc, memberHintMatches, clientsPhone, clientsTelegram, lineOfcPhone, lineOfcTelegram, clientsNickname, preSessionNickname, lineOfcNickname });
  return {
    state: "known_identity",
    match_type: match.type,
    confidence: match.confidence,
    candidateMemberIds: uniqueRecordIds([...memberIds, ...memberHintIds]).slice(0, 1),
    candidateClientIds: clientIds.slice(0, 1),
    preSessionIds: preSessionIds.slice(0, 1),
    evidenceSources: evidenceSources({ members, clients, preSession, accessEvidence, lineOfc, memberHintMatches, clientsPhone, clientsTelegram, lineOfcPhone, lineOfcTelegram, clientsNickname, preSessionNickname, lineOfcNickname }),
  };
}

async function persistMergeRequest(env, { lineUserId, email, memberIdCandidate, phone = "", telegramUsername = "", nickname = "", result, sessionRecordId = "" }) {
  const table = tableName(env.AIRTABLE_TABLE_IDENTITY_MERGE_REQUESTS, TABLES.mergeRequests);
  const idempotencyKey = await keyedDigest(env, `identity-recovery:${lineUserId}:${email || "-"}:${memberIdCandidate || "-"}:${phone || "-"}:${telegramUsername || "-"}:${nickname || "-"}`);
  const mergeRequestId = `IMR-${idempotencyKey.slice(0, 20).toUpperCase()}`;
  const existing = await airtableList(env, table, {
    filterByFormula: `{idempotency_key}=${formulaString(idempotencyKey)}`,
    maxRecords: 2,
  });
  if (existing.length > 1) throw new Error("merge_request_ambiguous");
  if (existing.length === 1) {
    return { merge_request_id: String(existing[0]?.fields?.merge_request_id || mergeRequestId), record_id: existing[0].id, resumed: true };
  }

  const now = new Date().toISOString();
  const fields = {
    merge_request_id: mergeRequestId,
    status: result.state === "known_identity" ? "pending_verification" : "review_required",
    line_user_id: lineUserId,
    line_identity_ref_hash: await keyedDigest(env, `line:${lineUserId}`),
    line_user_id_tail: lineUserId.slice(-6),
    match_type: result.match_type,
    match_confidence: result.confidence,
    verification_method: result.state === "known_identity" && email ? "email_otp" : "admin_review",
    current_rights_source: RIGHTS_SOURCE,
    idempotency_key: idempotencyKey,
    source_path: "/member/api/liff/recovery",
    evidence_summary: result.evidenceSources.join(", ").slice(0, 1000),
    payload_json: JSON.stringify({
      state: result.state,
      match_type: result.match_type,
      match_confidence: result.confidence,
      evidence_sources: result.evidenceSources,
      email_hash: email ? (await keyedDigest(env, `email:${email}`)).slice(0, 24) : null,
      phone_hash: phone ? (await keyedDigest(env, `phone:${phone}`)).slice(0, 24) : null,
      telegram_username_hash: telegramUsername ? (await keyedDigest(env, `telegram:${telegramUsername}`)).slice(0, 24) : null,
      nickname_hint: nickname || null,
      member_id_hint_tail: memberIdCandidate ? memberIdCandidate.slice(-4) : null,
      access_mutated: false,
      points_mutated: false,
      membership_mutated: false,
    }),
    created_at: now,
    updated_at: now,
  };
  if (email) fields.identity_email = email;
  if (phone) fields.identity_phone = phone;
  if (telegramUsername) fields.telegram_username = telegramUsername;
  if (sessionRecordId) fields["LIFF Renewal Session"] = [sessionRecordId];
  if (result.preSessionIds.length) fields["Pre-Session Candidate"] = result.preSessionIds;
  if (result.candidateClientIds.length) fields["Candidate Client"] = result.candidateClientIds;
  if (result.candidateMemberIds.length) fields["Candidate Member"] = result.candidateMemberIds;

  const created = await airtableCreate(env, table, fields);
  return { merge_request_id: mergeRequestId, record_id: created.id, resumed: false };
}

function strongestMatch({ members, clients, preSession, accessEvidence, lineOfc, memberHintMatches, clientsPhone = [], clientsTelegram = [], lineOfcPhone = [], lineOfcTelegram = [], clientsNickname = [], preSessionNickname = [], lineOfcNickname = [] }) {
  if (members.length || memberHintMatches.length) return { type: "exact_member_email", confidence: 100 };
  if (clients.length) return { type: "exact_client_email", confidence: 95 };
  if (clientsPhone.length) return { type: "exact_client_phone", confidence: 92 };
  if (clientsNickname.length) return { type: "exact_client_nickname", confidence: 70 };
  if (clientsTelegram.length) return { type: "exact_client_telegram", confidence: 92 };
  if (accessEvidence.length) return { type: "client_access_evidence", confidence: 90 };
  if (preSession.length) return { type: "pre_session_email", confidence: 85 };
  if (preSessionNickname.length) return { type: "pre_session_nickname", confidence: 65 };
  if (lineOfc.length) return { type: "line_ofc_email", confidence: 80 };
  if (lineOfcPhone.length) return { type: "line_ofc_phone", confidence: 78 };
  if (lineOfcNickname.length) return { type: "line_ofc_nickname", confidence: 60 };
  if (lineOfcTelegram.length) return { type: "line_ofc_telegram", confidence: 78 };
  return { type: "manual_review_hint", confidence: 0 };
}

function evidenceSources({ members, clients, preSession, accessEvidence, lineOfc, memberHintMatches, clientsPhone = [], clientsTelegram = [], lineOfcPhone = [], lineOfcTelegram = [], clientsNickname = [], preSessionNickname = [], lineOfcNickname = [] }) {
  const sources = [];
  if (members.length) sources.push("members_email");
  if (memberHintMatches.length) sources.push("members_member_id");
  if (clients.length) sources.push("clients_email");
  if (clientsPhone.length) sources.push("clients_phone");
  if (clientsNickname.length) sources.push("clients_nickname");
  if (clientsTelegram.length) sources.push("clients_telegram_username");
  if (preSession.length) sources.push("pre_session_identity_seed");
  if (preSessionNickname.length) sources.push("pre_session_nickname");
  if (accessEvidence.length) sources.push("client_access_evidence");
  if (lineOfc.length) sources.push("line_ofc_email_candidate");
  if (lineOfcPhone.length) sources.push("line_ofc_phone_candidate");
  if (lineOfcNickname.length) sources.push("line_ofc_nickname_candidate");
  if (lineOfcTelegram.length) sources.push("line_ofc_telegram_candidate");
  return sources;
}

function approvedLinkedAccessEvidence(records, normalizedEmail, { emailField, clientField, reviewStatusField }) {
  return (Array.isArray(records) ? records : []).filter((record) => {
    const fields = record?.fields || {};
    if (normalizeEmail(fields[emailField]) !== normalizedEmail) return false;
    if (String(fields[reviewStatusField] || "").trim() !== ACCESS_EVIDENCE_APPROVED_STATUS) return false;
    return linkedRecordIds(fields[clientField]).length === 1;
  });
}

function accessEvidenceClientIds(records, clientField) {
  return uniqueRecordIds((Array.isArray(records) ? records : []).flatMap((record) => linkedRecordIds(record?.fields?.[clientField])));
}

function linkedRecordIds(value) {
  if (!Array.isArray(value)) return [];
  return uniqueRecordIds(value.map((item) => safeRecordId(typeof item === "object" ? item?.id : item)));
}

function noGrants() {
  return { membership: false, tier: false, points: false, entitlement: false, private_access: false };
}

function emailFormula(fields, email) {
  const checks = fields.map((field) => `LOWER({${field}})=${formulaString(email)}`);
  return checks.length > 1 ? `OR(${checks.join(",")})` : checks[0] || "FALSE()";
}
function phoneFormula(fields, phone) {
  const checks = fields.map((field) => `REGEX_REPLACE({${field}}&"","[^0-9]","")=${formulaString(phone)}`);
  return checks.length > 1 ? `OR(${checks.join(",")})` : checks[0] || "FALSE()";
}
function exactTextFormula(fields, value) {
  const checks = fields.map((field) => `LOWER({${field}}&"")=${formulaString(String(value || "").toLowerCase())}`);
  return checks.length > 1 ? `OR(${checks.join(",")})` : checks[0] || "FALSE()";
}
function recordIds(records) { return uniqueRecordIds((Array.isArray(records) ? records : []).map((record) => safeRecordId(record?.id))); }
function uniqueRecordIds(ids) { return [...new Set((Array.isArray(ids) ? ids : []).map(safeRecordId).filter(Boolean))]; }
function safeRecordId(value) { const id = String(value || "").trim(); return /^rec[A-Za-z0-9]{6,32}$/.test(id) ? id : ""; }
function tableName(value, fallback) { return String(value || fallback).trim() || fallback; }
function csvFields(value) { return String(value || "").split(",").map((item) => item.trim()).filter(Boolean); }
function normalizeEmail(value) { const email = String(value || "").trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : ""; }
function normalizeMemberId(value) { const id = String(value || "").trim(); return id && id.length <= 160 && /^[A-Za-z0-9._~-]+$/.test(id) ? id : ""; }
function normalizePhone(value) { const phone = String(value || "").replace(/[^0-9]/g, ""); return phone.length >= 7 && phone.length <= 15 ? phone : ""; }
function normalizeTelegramUsername(value) {
  let username = String(value || "").trim().toLowerCase();
  username = username.replace(/^https?:\/\/(?:www\.)?t\.me\//, "").replace(/^@/, "").split(/[\s/?#]/)[0];
  return /^[a-z0-9_]{5,32}$/.test(username) ? username : "";
}
function normalizeNickname(value) {
  const text = String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  return text.length >= 2 && text.length <= 80 ? text : "";
}
function canonicalLineId(value) { const id = String(value || "").trim(); return /^U[0-9a-f]{32}$/i.test(id) ? id : ""; }
function formulaString(value) { return `'${String(value || "").replace(/'/g, "\\'")}'`; }
function normalizePath(pathname) { return String(pathname || "/").toLowerCase().replace(/\/{2,}/g, "/"); }
function hasSessionBindings(env) { return Boolean(env.LIFF_IDENTITY_KV && String(env.LIFF_SESSION_SECRET || "").length >= 16); }
function hasUnexpectedKeys(body, allowed) { return Object.keys(body || {}).some((key) => !allowed.has(key)); }
function hasBrowserIdentityClaims(body) { return Object.keys(body || {}).some((key) => BROWSER_IDENTITY_FIELDS.has(key)); }
function isApprovedOrigin(request) { return APPROVED_ORIGINS.has(request.headers.get("origin") || ""); }
function exactToken(value, maxLength = 8192) { const text = String(value || "").trim(); return text && text.length <= maxLength && /^[A-Za-z0-9._~-]+$/.test(text) ? text : ""; }
function cookieValue(request, name) { for (const part of (request.headers.get("cookie") || "").split(";")) { const [key, ...rest] = part.trim().split("="); if (key === name) return exactToken(rest.join("="), 8192); } return ""; }
function sessionCookie(value, maxAge) { return `${SESSION_COOKIE}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`; }
function browserIdentityRejected() { return json({ ok: false, error: { code: "BROWSER_IDENTITY_REJECTED", message: "Browser-supplied identity fields are not accepted." } }, 400); }
function authFailure(code, message) { return { ok: false, response: json({ ok: false, error: { code, message } }, 401) }; }
function methodNotAllowed(method) { return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: `${method} required` } }, 405, { allow: method }); }
function unavailable(code) { return json({ ok: false, error: { code, message: "MMD service is temporarily unavailable." } }, 503); }
function safeFailure(error) { return String(error?.message || error || "unknown").toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 80) || "unknown"; }

async function authenticateAndRotate(request, env) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return authFailure("LIFF_SESSION_REQUIRED", "Authenticated LIFF session required.");
  const hash = await keyedDigest(env, `session:${token}`);
  const key = `liff:session:${hash}`;
  const session = await env.LIFF_IDENTITY_KV.get(key, "json");
  if (!session || Number(session.expires_at || 0) <= Date.now()) {
    if (session) await env.LIFF_IDENTITY_KV.delete(key);
    return authFailure("LIFF_SESSION_INVALID", "LIFF session is invalid or expired.");
  }
  const newToken = randomToken(32);
  const newHash = await keyedDigest(env, `session:${newToken}`);
  session.rotation = Number(session.rotation || 0) + 1;
  session.expires_at = Date.now() + SESSION_TTL_SECONDS * 1000;
  return { ok: true, session, key, newToken, newHash };
}
async function commitRotatedSession(env, auth) {
  try {
    await env.LIFF_IDENTITY_KV.put(`liff:session:${auth.newHash}`, JSON.stringify(auth.session), { expirationTtl: SESSION_TTL_SECONDS });
    await env.LIFF_IDENTITY_KV.delete(auth.key);
    return { ok: true };
  } catch {
    return { ok: false, response: unavailable("LIFF_GATEWAY_STORAGE_UNAVAILABLE") };
  }
}
async function commitJson(env, auth, payload, status) {
  const committed = await commitRotatedSession(env, auth);
  if (!committed.ok) return committed.response;
  return withCors({ headers: new Headers({ origin: "https://mmdbkk.com" }) }, json(payload, status, { cookies: [sessionCookie(auth.newToken, SESSION_TTL_SECONDS)] }));
}
async function commitError(env, auth, code, message, status) { return commitJson(env, auth, { ok: false, error: { code, message } }, status); }
async function keyedDigest(env, value) {
  const digest = await crypto.subtle.sign("HMAC", await hmacKey(env), new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function hmacKey(env) { return crypto.subtle.importKey("raw", new TextEncoder().encode(String(env.LIFF_SESSION_SECRET)), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]); }
function randomToken(byteLength) { const bytes = new Uint8Array(byteLength); crypto.getRandomValues(bytes); return base64Url(bytes); }
function base64Url(bytes) { let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
async function readJson(request) { const parsed = await readBoundedJsonObject(request, PUBLIC_JSON_BODY_MAX_BYTES); return parsed.ok ? { ok: true, body: parsed.value } : { ok: false, response: json({ ok: false, error: { code: parsed.code, message: parsed.message } }, parsed.status) }; }

async function airtableList(env, tableNameValue, params = {}) {
  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(tableNameValue)}`);
  if (params.filterByFormula) url.searchParams.set("filterByFormula", params.filterByFormula);
  if (params.maxRecords) url.searchParams.set("maxRecords", String(params.maxRecords));
  const response = await airtableFetch(env, new Request(url.toString(), { headers: airtableHeaders(env) }));
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(data.records)) throw new Error(`airtable_${response.status || "malformed"}`);
  return data.records;
}
async function airtableListOptional(env, tableNameValue, params = {}) {
  try {
    return await airtableList(env, tableNameValue, params);
  } catch (error) {
    if (String(error?.message || "").includes("airtable_422")) return [];
    throw error;
  }
}
async function airtableCreate(env, tableNameValue, fields) {
  const url = `https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(tableNameValue)}`;
  const response = await airtableFetch(env, new Request(url, {
    method: "POST",
    headers: { ...airtableHeaders(env), "content-type": "application/json" },
    body: JSON.stringify({ records: [{ fields }], typecast: false }),
  }));
  const data = await response.json().catch(() => ({}));
  const record = Array.isArray(data.records) ? data.records[0] : null;
  if (!response.ok || !record?.id) throw new Error(`airtable_create_${response.status || "malformed"}`);
  return record;
}
function airtableHeaders(env) { return { Authorization: `Bearer ${env.AIRTABLE_API_KEY}`, accept: "application/json" }; }
function airtableFetch(env, request) { return env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(request) : fetch(request); }
function apiHeaders(methods = "POST,OPTIONS") { return { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-methods": methods, "access-control-allow-headers": "content-type", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" }; }
function json(body, status = 200, options = {}) { const headers = new Headers(apiHeaders()); if (options.allow) headers.set("allow", options.allow); for (const cookie of options.cookies || []) headers.append("set-cookie", cookie); return new Response(JSON.stringify(body), { status, headers }); }
function withCors(request, response) { const headers = new Headers(response.headers); const origin = request.headers.get("origin") || ""; if (APPROVED_ORIGINS.has(origin)) headers.set("access-control-allow-origin", origin); headers.set("vary", "Origin"); return new Response(response.body, { status: response.status, statusText: response.statusText, headers }); }