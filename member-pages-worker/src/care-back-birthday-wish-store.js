const AIRTABLE_API = "https://api.airtable.com/v0";
const DEFAULT_AIRTABLE_REQUEST_TIMEOUT_MS = 4000;
const MIN_AIRTABLE_REQUEST_TIMEOUT_MS = 500;
const MAX_AIRTABLE_REQUEST_TIMEOUT_MS = 10000;
const BIRTHDAY_WISHES_TABLE_ID = "tblvMJjYXy29mgDLb";
const CAMPAIGN_ID = "care_back";
const SOURCE = "line_liff";
const SOURCE_PATH = "/member/liff";
const DISPLAY_VERSION = "care_back_v1";
const WISH_STATUSES = new Set(["submitted", "completed", "revoked", "manual_review"]);
const LANGUAGES = new Set(["th", "en"]);

export class BirthdayWishStorageError extends Error {
  constructor(code = "BIRTHDAY_WISH_STORAGE_UNAVAILABLE") {
    super(code);
    this.code = code;
  }
}

export function getBirthdayWishStore(env = {}) {
  if (isTestStore(env.BIRTHDAY_WISH_STORE)) return env.BIRTHDAY_WISH_STORE;
  if (!String(env.AIRTABLE_API_KEY || "").trim() || !String(env.AIRTABLE_BASE_ID || "").trim()) return null;
  return new AirtableBirthdayWishStore(env);
}

class AirtableBirthdayWishStore {
  constructor(env) {
    this.env = env;
  }

  async getBirthdayWishByClaim({ claimId }) {
    const canonicalClaimId = requiredClaimId(claimId);
    const records = await this.list(
      `AND({campaign_id}=${formulaString(CAMPAIGN_ID)},ARRAYJOIN({Campaign Claim})=${formulaString(canonicalClaimId)})`,
      2,
    );
    return oneWish(records);
  }

  async getBirthdayWishByIdempotencyKey({ idempotencyKey }) {
    const key = requiredIdempotencyKey(idempotencyKey);
    const records = await this.list(
      `AND({campaign_id}=${formulaString(CAMPAIGN_ID)},{idempotency_key}=${formulaString(key)})`,
      2,
    );
    return oneWish(records);
  }

  async createBirthdayWish(input) {
    const claimId = requiredClaimId(input.claimId);
    const claimRecordId = requiredRecordId(input.claimRecordId);
    const idempotencyKey = requiredIdempotencyKey(input.idempotencyKey);
    const verifiedCustomerRefHash = requiredHash(input.verifiedCustomerRefHash);
    const wishText = optionalText(input.wishText, 600);
    const wishOption = optionalText(input.wishOption, 120);
    if (!wishText && !wishOption) throw new BirthdayWishStorageError("BIRTHDAY_WISH_CONTENT_REQUIRED");
    const language = LANGUAGES.has(input.language) ? input.language : "th";
    const now = validTimestamp(input.now) || new Date().toISOString();
    const wishId = `wish_${crypto.randomUUID().replace(/-/g, "")}`;
    const fields = {
      wish_id: wishId,
      "Campaign Claim": [claimRecordId],
      campaign_id: CAMPAIGN_ID,
      verified_customer_ref_hash: verifiedCustomerRefHash,
      wish_text: wishText || undefined,
      wish_option: wishOption || undefined,
      wish_status: "submitted",
      idempotency_key: idempotencyKey,
      submitted_at: now,
      source: SOURCE,
      source_path: SOURCE_PATH,
      language,
      display_version: DISPLAY_VERSION,
      payload_json: JSON.stringify({ schema_version: 1, campaign_id: CAMPAIGN_ID, claim_id: claimId, source: SOURCE }),
      created_at: now,
      updated_at: now,
    };
    const record = await this.write("POST", { body: { fields: compactFields(fields), typecast: false } });
    return sanitizeWishRecord(record);
  }

  async completeBirthdayWish({ recordId, publicDisplayText, completedAt }) {
    const id = requiredRecordId(recordId);
    const message = requiredText(publicDisplayText, 1000);
    const now = validTimestamp(completedAt) || new Date().toISOString();
    const record = await this.write("PATCH", {
      recordId: id,
      body: {
        fields: {
          wish_status: "completed",
          completed_at: now,
          public_display_text: message,
          updated_at: now,
        },
        typecast: false,
      },
    });
    return sanitizeWishRecord(record);
  }

  async createOrLoadBirthdayWish(input) {
    const canonical = await this.getBirthdayWishByClaim({ claimId: input.claimId });
    if (canonical) {
      assertBirthdayWishOwnership(canonical, input);
      return this.ensureCompleted(canonical, input);
    }

    const replay = await this.getBirthdayWishByIdempotencyKey({ idempotencyKey: input.idempotencyKey });
    if (replay) {
      assertBirthdayWishOwnership(replay, input, "BIRTHDAY_WISH_IDEMPOTENCY_CONFLICT");
      return this.ensureCompleted(replay, input);
    }

    const created = await this.createBirthdayWish(input);
    return this.ensureCompleted(created, input);
  }

  async ensureCompleted(wish, input) {
    if (wish.wish_status === "completed" || wish.wish_status === "revoked" || wish.wish_status === "manual_review") return wish;
    if (wish.wish_status !== "submitted") throw new BirthdayWishStorageError("BIRTHDAY_WISH_STORAGE_MALFORMED");
    return this.completeBirthdayWish({
      recordId: wish.record_id,
      publicDisplayText: requiredText(input.publicDisplayText, 1000),
      completedAt: input.now,
    });
  }

  async list(filterByFormula, maxRecords) {
    const payload = await this.write("GET", { query: { filterByFormula, maxRecords } });
    return Array.isArray(payload?.records) ? payload.records : [];
  }

  async write(method, { recordId = "", body, query } = {}) {
    const table = String(this.env.AIRTABLE_TABLE_CARE_BACK_BIRTHDAY_WISHES || BIRTHDAY_WISHES_TABLE_ID).trim();
    if (!table) throw new BirthdayWishStorageError("BIRTHDAY_WISH_STORAGE_NOT_CONFIGURED");
    const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(String(this.env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table)}${recordId ? `/${encodeURIComponent(recordId)}` : ""}`);
    if (query?.filterByFormula) url.searchParams.set("filterByFormula", query.filterByFormula);
    if (query?.maxRecords) url.searchParams.set("maxRecords", String(query.maxRecords));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs(this.env));
    try {
      const response = await fetch(url.toString(), {
        method,
        headers: {
          Authorization: `Bearer ${this.env.AIRTABLE_API_KEY}`,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || typeof payload !== "object") {
        const code = response.status === 401 || response.status === 403
          ? "BIRTHDAY_WISH_STORAGE_FORBIDDEN"
          : "BIRTHDAY_WISH_STORAGE_UNAVAILABLE";
        throw new BirthdayWishStorageError(code);
      }
      return payload;
    } catch (error) {
      if (error instanceof BirthdayWishStorageError) throw error;
      throw new BirthdayWishStorageError();
    } finally {
      clearTimeout(timeout);
    }
  }
}

function isTestStore(value) {
  return Boolean(value
    && typeof value.getBirthdayWishByClaim === "function"
    && typeof value.getBirthdayWishByIdempotencyKey === "function"
    && typeof value.createBirthdayWish === "function"
    && typeof value.completeBirthdayWish === "function"
    && typeof value.createOrLoadBirthdayWish === "function");
}

function oneWish(records) {
  if (records.length > 1) throw new BirthdayWishStorageError("BIRTHDAY_WISH_CONFLICT");
  if (!records.length) return null;
  return sanitizeWishRecord(records[0]);
}

function sanitizeWishRecord(record) {
  const recordId = requiredRecordId(record?.id);
  const fields = record?.fields;
  if (!fields || typeof fields !== "object") throw new BirthdayWishStorageError("BIRTHDAY_WISH_STORAGE_MALFORMED");
  const wishId = String(fields.wish_id || "").trim();
  const claimLinks = Array.isArray(fields["Campaign Claim"]) ? fields["Campaign Claim"] : [];
  const claimRecordId = claimLinks.length === 1 ? requiredRecordId(claimLinks[0]) : "";
  const campaignId = String(fields.campaign_id || "").trim();
  const status = String(fields.wish_status || "").trim();
  const language = String(fields.language || "").trim();
  const idempotencyKey = String(fields.idempotency_key || "").trim();
  const verifiedCustomerRefHash = String(fields.verified_customer_ref_hash || "").trim().toLowerCase();
  const submittedAt = validTimestamp(fields.submitted_at);
  const completedAt = validTimestamp(fields.completed_at);
  const publicDisplayText = optionalText(fields.public_display_text, 1000);
  const displayVersion = String(fields.display_version || "").trim();
  if (!/^wish_[a-f0-9]{32}$/i.test(wishId)
    || !claimRecordId
    || campaignId !== CAMPAIGN_ID
    || !WISH_STATUSES.has(status)
    || !LANGUAGES.has(language)
    || !/^[A-Za-z0-9][A-Za-z0-9._~-]{15,127}$/.test(idempotencyKey)
    || !/^[a-f0-9]{64}$/.test(verifiedCustomerRefHash)
    || !submittedAt
    || String(fields.source || "").trim() !== SOURCE
    || String(fields.source_path || "").trim() !== SOURCE_PATH
    || displayVersion !== DISPLAY_VERSION
    || (status === "completed" && (!completedAt || !publicDisplayText))) {
    throw new BirthdayWishStorageError("BIRTHDAY_WISH_STORAGE_MALFORMED");
  }
  return {
    record_id: recordId,
    claim_record_id: claimRecordId,
    wish_id: wishId,
    campaign_id: CAMPAIGN_ID,
    wish_text: optionalText(fields.wish_text, 600),
    wish_option: optionalText(fields.wish_option, 120),
    wish_status: status,
    submitted_at: submittedAt,
    completed_at: completedAt,
    public_display_text: publicDisplayText,
    language,
    display_version: displayVersion,
    idempotency_key: idempotencyKey,
    verified_customer_ref_hash: verifiedCustomerRefHash,
  };
}

export function assertBirthdayWishOwnership(wish, input, claimConflictCode = "BIRTHDAY_WISH_CLAIM_CONFLICT") {
  if (wish.claim_record_id !== requiredRecordId(input.claimRecordId)) {
    throw new BirthdayWishStorageError(claimConflictCode);
  }
  if (wish.verified_customer_ref_hash !== requiredHash(input.verifiedCustomerRefHash)) {
    throw new BirthdayWishStorageError("BIRTHDAY_WISH_IDENTITY_CONFLICT");
  }
}

function requiredClaimId(value) {
  const claimId = String(value || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{3,79}$/.test(claimId)) throw new BirthdayWishStorageError("BIRTHDAY_WISH_CLAIM_INVALID");
  return claimId;
}

function requiredRecordId(value) {
  const recordId = String(value || "").trim();
  if (!/^rec[A-Za-z0-9]{14}$/.test(recordId)) throw new BirthdayWishStorageError("BIRTHDAY_WISH_STORAGE_MALFORMED");
  return recordId;
}

function requiredIdempotencyKey(value) {
  const key = String(value || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._~-]{15,127}$/.test(key)) throw new BirthdayWishStorageError("BIRTHDAY_WISH_IDEMPOTENCY_INVALID");
  return key;
}

function requiredHash(value) {
  const hash = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new BirthdayWishStorageError("BIRTHDAY_WISH_IDENTITY_INVALID");
  return hash;
}

function optionalText(value, maxLength) {
  if (value === undefined || value === null || value === "") return "";
  const text = String(value).replace(/\r\n?/g, "\n").trim();
  if ([...text].length > maxLength || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
    throw new BirthdayWishStorageError("BIRTHDAY_WISH_STORAGE_MALFORMED");
  }
  return text;
}

function requiredText(value, maxLength) {
  const text = optionalText(value, maxLength);
  if (!text) throw new BirthdayWishStorageError("BIRTHDAY_WISH_CONTENT_REQUIRED");
  return text;
}

function validTimestamp(value) {
  const input = String(value || "").trim();
  if (!input) return "";
  const timestamp = new Date(input);
  if (Number.isNaN(timestamp.getTime()) || timestamp.toISOString() !== input) {
    throw new BirthdayWishStorageError("BIRTHDAY_WISH_STORAGE_MALFORMED");
  }
  return input;
}

function compactFields(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && value !== ""));
}

function requestTimeoutMs(env) {
  const configured = Number(env.AIRTABLE_REQUEST_TIMEOUT_MS);
  if (!Number.isInteger(configured)) return DEFAULT_AIRTABLE_REQUEST_TIMEOUT_MS;
  return Math.min(MAX_AIRTABLE_REQUEST_TIMEOUT_MS, Math.max(MIN_AIRTABLE_REQUEST_TIMEOUT_MS, configured));
}

function formulaString(value) {
  return `'${String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

export const BIRTHDAY_WISH_SCHEMA = Object.freeze({
  table_id: BIRTHDAY_WISHES_TABLE_ID,
  campaign_id: CAMPAIGN_ID,
  source: SOURCE,
  source_path: SOURCE_PATH,
  display_version: DISPLAY_VERSION,
});
