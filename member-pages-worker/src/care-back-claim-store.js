const AIRTABLE_API = "https://api.airtable.com/v0";
const CAMPAIGN_ID = "6-years-care-back";
const CAMPAIGN_NAME = "6 YEARS CARE BACK";
const LANDING_PATH = "/promotion/6-years-care-back";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const TABLE_DEFAULTS = Object.freeze({
  CLAIMS: "MMD — Campaign Claims",
  PROMO_CODES: "MMD — Promo Codes",
});

export class CareBackStoreError extends Error {
  constructor(code = "CARE_BACK_STORAGE_UNAVAILABLE") {
    super(code);
    this.code = code;
  }
}

export function getCareBackStore(env = {}) {
  if (env.CARE_BACK_STORE && typeof env.CARE_BACK_STORE.openOrResume === "function") return env.CARE_BACK_STORE;
  if (!String(env.AIRTABLE_API_KEY || "").trim() || !String(env.AIRTABLE_BASE_ID || "").trim()) return null;
  return new AirtableCareBackStore(env);
}

class AirtableCareBackStore {
  constructor(env) { this.env = env; }

  async openOrResume({ identityHash, memberId }) {
    const identity = requiredHash(identityHash);
    const member = requiredMemberId(memberId);
    const secret = String(this.env.CARE_BACK_CODE_SECRET || this.env.LIFF_SESSION_SECRET || "");
    if (secret.length < 32) throw new CareBackStoreError("CARE_BACK_CODE_SECRET_MISSING");

    const derived = await deriveClaimAndCode(identity, secret);
    const claims = await this.list(tableName(this.env, "CLAIMS"), `AND({campaign_id}=${formulaString(CAMPAIGN_ID)},{line_user_id_hash}=${formulaString(identity)})`, 2);
    if (claims.length > 1) throw new CareBackStoreError("CARE_BACK_CLAIM_CONFLICT");

    let claim = claims[0] || null;
    let resumed = Boolean(claim);
    if (claim) {
      const fields = claim.fields || {};
      if (String(fields.matched_member_id || "") !== member) throw new CareBackStoreError("CARE_BACK_MEMBER_CONFLICT");
    } else {
      const now = new Date().toISOString();
      claim = await this.create(tableName(this.env, "CLAIMS"), {
        claim_id: derived.claimId,
        campaign_id: CAMPAIGN_ID,
        line_user_id_hash: identity,
        campaign_reference_date: now,
        matched_member_id: member,
        match_status: "matched",
        review_status: "pending",
        claim_status: "identity_verified",
        created_at: now,
        updated_at: now,
        payload_json: JSON.stringify({ schema_version: 1, source: "liff_verified", benefit_policy: "pending_approval" }),
      });
    }

    const codes = await this.list(tableName(this.env, "PROMO_CODES"), `{code}=${formulaString(derived.code)}`, 2);
    if (codes.length > 1) throw new CareBackStoreError("CARE_BACK_CODE_CONFLICT");
    let promo = codes[0] || null;
    if (promo) {
      const fields = promo.fields || {};
      const linkedClaimId = promoClaimId(fields.payload_json);
      if (String(fields.campaign_code || "") !== CAMPAIGN_ID || linkedClaimId !== derived.claimId) {
        throw new CareBackStoreError("CARE_BACK_CODE_CONFLICT");
      }
    } else {
      promo = await this.create(tableName(this.env, "PROMO_CODES"), {
        code: derived.code,
        campaign_code: CAMPAIGN_ID,
        campaign_name: CAMPAIGN_NAME,
        issued_channel: "line",
        landing_path: LANDING_PATH,
        status: "draft",
        max_uses: 1,
        used_count: 0,
        benefit_type: "none",
        created_by: "member-pages-worker",
        created_at: new Date().toISOString(),
        payload_json: JSON.stringify({ schema_version: 1, claim_id: String(claim.fields?.claim_id || derived.claimId), policy_state: "pending_review" }),
      });
      resumed = false;
    }

    const claimFields = claim.fields || {};
    const promoFields = promo.fields || {};
    return {
      campaign_id: CAMPAIGN_ID,
      claim_reference: String(claimFields.claim_id || derived.claimId),
      claim_status: safeClaimStatus(claimFields.claim_status),
      review_status: safeReviewStatus(claimFields.review_status),
      personal_code: String(promoFields.code || derived.code),
      code_status: safeCodeStatus(promoFields.status),
      resumed,
    };
  }

  async list(table, filterByFormula, maxRecords) {
    const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(String(this.env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table)}`);
    url.searchParams.set("filterByFormula", filterByFormula);
    url.searchParams.set("maxRecords", String(maxRecords));
    return this.request(url, { method: "GET" }).then((payload) => Array.isArray(payload.records) ? payload.records : []);
  }

  async create(table, fields) {
    const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(String(this.env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table)}`);
    const payload = await this.request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ records: [{ fields }], typecast: false }),
    });
    const record = payload.records?.[0];
    if (!record?.fields) throw new CareBackStoreError("CARE_BACK_STORAGE_MALFORMED");
    return record;
  }

  async request(url, init) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(url.toString(), {
        ...init,
        headers: { Authorization: `Bearer ${this.env.AIRTABLE_API_KEY}`, ...(init.headers || {}) },
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || typeof payload !== "object") throw new CareBackStoreError();
      return payload;
    } catch (error) {
      if (error instanceof CareBackStoreError) throw error;
      throw new CareBackStoreError();
    } finally {
      clearTimeout(timeout);
    }
  }
}

export async function deriveClaimAndCode(identityHash, secret) {
  const digest = await hmacBytes(secret, `care-back:v1:${requiredHash(identityHash)}`);
  const suffix = [...digest.slice(0, 7)].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  const code = [...digest.slice(7, 13)].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
  return { claimId: `CB6-2026-${suffix}`, code };
}

async function hmacBytes(secret, value) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

function requiredHash(value) {
  const hash = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new CareBackStoreError("CARE_BACK_IDENTITY_INVALID");
  return hash;
}

function requiredMemberId(value) {
  const memberId = String(value || "").trim();
  if (!memberId || memberId.length > 160 || /[\u0000-\u001f\u007f]/.test(memberId)) throw new CareBackStoreError("CARE_BACK_MEMBER_INVALID");
  return memberId;
}

function tableName(env, key) { return String(env[`AIRTABLE_TABLE_CARE_BACK_${key}`] || TABLE_DEFAULTS[key]).trim(); }
function formulaString(value) { return `'${String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`; }
function promoClaimId(value) {
  try {
    const parsed = JSON.parse(String(value || ""));
    return String(parsed?.claim_id || "");
  } catch {
    return "";
  }
}
function safeClaimStatus(value) { return ["identity_verified", "matched", "manual_review", "benefit_approved", "benefit_applied", "blocked", "rejected"].includes(String(value)) ? String(value) : "identity_verified"; }
function safeReviewStatus(value) { return ["pending", "in_review", "approved", "blocked", "not_required"].includes(String(value)) ? String(value) : "pending"; }
function safeCodeStatus(value) { return ["draft", "active", "expired", "used", "revoked", "invalid"].includes(String(value)) ? String(value) : "draft"; }
