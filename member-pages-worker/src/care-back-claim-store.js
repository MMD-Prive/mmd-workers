const AIRTABLE_API = "https://api.airtable.com/v0";
const CAMPAIGN_ID = "6-years-care-back";
const CAMPAIGN_NAME = "6 YEARS CARE BACK";
const LANDING_PATH = "/promotion/6-years-care-back";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const COUPON_VALIDITY_MONTHS = 2;
const COUPON_MAX_DISCOUNT_PERCENT = 10;
const CURRENT_MEMBER_EXTENSION_DAYS = 180;
const RENEWED_MEMBER_EXTENSION_DAYS = 90;
const RENEWED_MEMBER_BONUS_POINTS = 150;
const NEW_MEMBER_WELCOME_POINTS = 66;
const POINTS_RATE_THB = 100;
const BIRTHDAY_PHASE_END_AT = "2026-08-31T16:59:59.999Z";
const CONTINUATION_PHASE_END_AT = "2026-09-30T16:59:59.999Z";

const TABLE_DEFAULTS = Object.freeze({
  CLAIMS: "MMD — Campaign Claims",
  PROMO_CODES: "MMD — Promo Codes",
  BENEFIT_APPLICATIONS: "MMD — Campaign Benefit Applications",
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

  async readCouponWallet({ identityHash, memberId, now = new Date() }) {
    const identity = requiredHash(identityHash);
    const member = requiredMemberId(memberId);
    const secret = String(this.env.CARE_BACK_CODE_SECRET || this.env.LIFF_SESSION_SECRET || "");
    if (secret.length < 32) throw new CareBackStoreError("CARE_BACK_CODE_SECRET_MISSING");
    const derived = await deriveClaimAndCode(identity, secret);
    const claims = await this.list(tableName(this.env, "CLAIMS"), `AND({campaign_id}=${formulaString(CAMPAIGN_ID)},{line_user_id_hash}=${formulaString(identity)})`, 2);
    if (claims.length > 1) throw new CareBackStoreError("CARE_BACK_CLAIM_CONFLICT");
    if (!claims.length) return couponWallet({}, customerCoupon("draft", "", "", "verification_required", "ยังไม่มีคูปองที่ออกให้กับบัญชีนี้"));
    const claimFields = claims[0].fields || {};
    if (String(claimFields.matched_member_id || "") !== member) throw new CareBackStoreError("CARE_BACK_MEMBER_CONFLICT");
    const codes = await this.list(tableName(this.env, "PROMO_CODES"), `{code}=${formulaString(derived.code)}`, 2);
    if (codes.length > 1) throw new CareBackStoreError("CARE_BACK_CODE_CONFLICT");
    const promoFields = codes[0]?.fields || {};
    if (codes[0] && (String(promoFields.campaign_code || "") !== CAMPAIGN_ID || promoClaimId(promoFields.payload_json) !== derived.claimId)) {
      throw new CareBackStoreError("CARE_BACK_CODE_CONFLICT");
    }
    const clock = requiredClock(now);
    const status = safeCodeStatus(promoFields.status);
    const activatedAt = safeTimestamp(promoFields.activated_at);
    const expiresAt = safeTimestamp(promoFields.expires_at);
    const walletState = normalizedUseCount(promoFields.used_count) >= 1 || status === "used"
      ? "used"
      : ["revoked", "invalid"].includes(status)
        ? status
        : status === "expired" || (expiresAt && Date.parse(expiresAt) <= clock.getTime())
          ? "expired"
          : status === "active"
            ? "ready"
            : "verification_required";
    const coupon = customerCoupon(status, activatedAt, expiresAt, walletState, "");
    return couponWallet(promoFields, coupon);
  }

  async openOrResume({ identityHash, memberId, memberProfile, wishSubmitted = false, now = new Date() }) {
    const identity = requiredHash(identityHash);
    const member = requiredMemberId(memberId);
    const secret = String(this.env.CARE_BACK_CODE_SECRET || this.env.LIFF_SESSION_SECRET || "");
    if (secret.length < 32) throw new CareBackStoreError("CARE_BACK_CODE_SECRET_MISSING");

    const clock = requiredClock(now);
    const derived = await deriveClaimAndCode(identity, secret);
    const observed = observedMemberState(memberProfile);
    const claims = await this.list(tableName(this.env, "CLAIMS"), `AND({campaign_id}=${formulaString(CAMPAIGN_ID)},{line_user_id_hash}=${formulaString(identity)})`, 2);
    if (claims.length > 1) throw new CareBackStoreError("CARE_BACK_CLAIM_CONFLICT");

    let claim = claims[0] || null;
    let resumed = Boolean(claim);
    let campaignPhase = null;
    if (claim) {
      const fields = claim.fields || {};
      if (String(fields.matched_member_id || "") !== member) throw new CareBackStoreError("CARE_BACK_MEMBER_CONFLICT");
      campaignPhase = storedCampaignPhase(fields.payload_json) || legacyCampaignPhase(fields.campaign_reference_date);
    } else {
      campaignPhase = currentCampaignPhase(clock);
      if (!campaignPhase) throw new CareBackStoreError("CARE_BACK_CAMPAIGN_CLOSED");
      const createdAt = clock.toISOString();
      const claimPolicy = initialClaimPolicy(observed);
      claim = await this.create(tableName(this.env, "CLAIMS"), {
        claim_id: derived.claimId,
        campaign_id: CAMPAIGN_ID,
        line_user_id_hash: identity,
        campaign_reference_date: createdAt,
        matched_member_id: member,
        match_status: claimPolicy.match_status,
        classification_group: claimPolicy.classification_group,
        default_months: claimPolicy.default_months,
        membership_tier_snapshot: observed.tier || undefined,
        payment_status: claimPolicy.payment_status,
        payment_required: claimPolicy.payment_required,
        review_status: claimPolicy.review_status,
        claim_status: claimPolicy.claim_status,
        created_at: createdAt,
        updated_at: createdAt,
        payload_json: JSON.stringify({
          schema_version: 3,
          source: "liff_verified",
          observed_membership_status: observed.status,
          coupon_policy: couponPolicySnapshot(),
          membership_benefit: claimPolicy.membership_benefit,
          points_policy: pointsPolicySnapshot(claimPolicy),
          campaign_phase: campaignPhase.id,
          campaign_phase_end_at: campaignPhase.ends_at,
        }),
      });
    }

    const claimFields = claim.fields || {};
    const claimPolicy = resolvedClaimPolicy(claimFields, observed);
    const normalizedClaim = await this.ensureClaimPolicy(claim, claimPolicy, observed);
    claim = normalizedClaim.record;

    const codes = await this.list(tableName(this.env, "PROMO_CODES"), `{code}=${formulaString(derived.code)}`, 2);
    if (codes.length > 1) throw new CareBackStoreError("CARE_BACK_CODE_CONFLICT");
    let promo = codes[0] || null;
    if (promo) {
      const fields = promo.fields || {};
      const linkedClaimId = promoClaimId(fields.payload_json);
      if (String(fields.campaign_code || "") !== CAMPAIGN_ID || linkedClaimId !== derived.claimId) {
        throw new CareBackStoreError("CARE_BACK_CODE_CONFLICT");
      }
    } else if (couponIssuanceGatePassed(claimPolicy, observed, wishSubmitted)) {
      const coupon = couponStateFor(claimPolicy, observed, {}, clock, wishSubmitted);
      promo = await this.create(tableName(this.env, "PROMO_CODES"), compactFields({
        code: derived.code,
        campaign_code: CAMPAIGN_ID,
        campaign_name: CAMPAIGN_NAME,
        issued_channel: "line",
        landing_path: LANDING_PATH,
        status: coupon.status,
        activated_at: coupon.activated_at || undefined,
        expires_at: coupon.expires_at || undefined,
        max_uses: 1,
        used_count: 0,
        package_scope: ["all"],
        benefit_type: "discount_percent",
        created_by: "member-pages-worker",
        created_at: clock.toISOString(),
        payload_json: JSON.stringify({
          schema_version: 3,
          claim_id: String(claim.fields?.claim_id || derived.claimId),
          policy_state: coupon.policy_state,
          wish_submitted: Boolean(wishSubmitted),
          coupon_policy: couponPolicySnapshot(),
        }),
      }));
      resumed = false;
    }

    if (promo) {
      const normalizedPromo = await this.ensurePromoPolicy(promo, claimPolicy, observed, wishSubmitted, clock);
      promo = normalizedPromo.record;
    }
    const finalClaimFields = claim.fields || {};
    const promoFields = promo?.fields || {};
    const effectiveWishSubmitted = Boolean(wishSubmitted) || promoWishSubmitted(promoFields.payload_json);
    const coupon = couponStateFor(claimPolicy, observed, promoFields, clock, effectiveWishSubmitted);
    const approvedDiscountPercent = coupon.customer_state === "ready" ? validatedApprovedDiscount(promoFields) : null;

    if (claimPolicy.membership_benefit?.kind === "membership_extension"
      && claimPolicy.membership_benefit.state === "pending_application"
      && finalClaimFields.claim_status !== "benefit_applied") {
      await this.ensureBenefitApplication({
        claim,
        claimId: String(finalClaimFields.claim_id || derived.claimId),
        benefit: claimPolicy.membership_benefit,
      });
    }

    return {
      campaign_id: CAMPAIGN_ID,
      claim_record_id: String(claim.id || ""),
      claim_reference: String(finalClaimFields.claim_id || derived.claimId),
      claim_status: safeClaimStatus(finalClaimFields.claim_status),
      review_status: safeReviewStatus(finalClaimFields.review_status),
      classification_group: safeClassificationGroup(finalClaimFields.classification_group),
      payment_status: safePaymentStatus(finalClaimFields.payment_status),
      payment_required: Boolean(finalClaimFields.payment_required),
      personal_code: promo ? String(promoFields.code || derived.code) : "",
      code_status: safeCodeStatus(promoFields.status),
      activated_at: safeTimestamp(promoFields.activated_at) || null,
      expires_at: safeTimestamp(promoFields.expires_at) || null,
      approved_discount_percent: approvedDiscountPercent,
      discount_percent: 0,
      coupon_state: coupon.customer_state,
      coupon_message: coupon.customer_message,
      membership_benefit: safeMembershipBenefit(claimPolicy.membership_benefit),
      points_policy: safePointsPolicy(claimPolicy.points_policy),
      personalized_benefits: personalizedBenefits(claimPolicy, coupon, approvedDiscountPercent),
      coupon_wallet: couponWallet(promoFields, coupon),
      campaign_phase: safeCampaignPhase(campaignPhase?.id),
      campaign_phase_ends_at: safeTimestamp(campaignPhase?.ends_at),
      wish_submitted: effectiveWishSubmitted,
      resumed,
    };
  }

  async approveCouponDiscount({
    identityHash,
    memberId,
    memberProfile,
    modelLevel,
    jobFormat,
    publicModelPercent = null,
    now = new Date(),
  }) {
    const identity = requiredHash(identityHash);
    const member = requiredMemberId(memberId);
    const clock = requiredClock(now);
    const secret = String(this.env.CARE_BACK_CODE_SECRET || this.env.LIFF_SESSION_SECRET || "");
    if (secret.length < 32) throw new CareBackStoreError("CARE_BACK_CODE_SECRET_MISSING");
    const derived = await deriveClaimAndCode(identity, secret);
    const claims = await this.list(tableName(this.env, "CLAIMS"), `AND({campaign_id}=${formulaString(CAMPAIGN_ID)},{line_user_id_hash}=${formulaString(identity)})`, 2);
    if (claims.length !== 1) throw new CareBackStoreError(claims.length > 1 ? "CARE_BACK_CLAIM_CONFLICT" : "CARE_BACK_CLAIM_REQUIRED");
    const claim = claims[0];
    const claimFields = claim.fields || {};
    if (String(claimFields.matched_member_id || "") !== member) throw new CareBackStoreError("CARE_BACK_MEMBER_CONFLICT");
    const observed = observedMemberState(memberProfile);
    const claimPolicy = resolvedClaimPolicy(claimFields, observed);

    const codes = await this.list(tableName(this.env, "PROMO_CODES"), `{code}=${formulaString(derived.code)}`, 2);
    if (codes.length !== 1) throw new CareBackStoreError(codes.length > 1 ? "CARE_BACK_CODE_CONFLICT" : "CARE_BACK_COUPON_REQUIRED");
    const promo = codes[0];
    const fields = promo.fields || {};
    if (String(fields.campaign_code || "") !== CAMPAIGN_ID || promoClaimId(fields.payload_json) !== derived.claimId) {
      throw new CareBackStoreError("CARE_BACK_CODE_CONFLICT");
    }
    if (!promoWishSubmitted(fields.payload_json)) throw new CareBackStoreError("CARE_BACK_WISH_REQUIRED");
    if (!couponIssuanceGatePassed(claimPolicy, observed, true)) throw new CareBackStoreError("CARE_BACK_ELIGIBILITY_UNRESOLVED");

    const coupon = couponStateFor(claimPolicy, observed, fields, clock, true);
    if (coupon.customer_state !== "ready" || safeCodeStatus(fields.status) !== "active") {
      throw new CareBackStoreError(`CARE_BACK_COUPON_${String(coupon.customer_state || "UNAVAILABLE").toUpperCase()}`);
    }

    const normalizedModelLevel = normalizeModelLevel(modelLevel);
    const normalizedJobFormat = normalizeJobFormat(jobFormat);
    if (!normalizedModelLevel || !normalizedJobFormat) throw new CareBackStoreError("CARE_BACK_DISCOUNT_CONTEXT_UNRESOLVED");
    const approved = approvedDiscountFor(normalizedModelLevel, normalizedJobFormat, publicModelPercent);
    if (!approved) throw new CareBackStoreError("CARE_BACK_DISCOUNT_CONTEXT_UNRESOLVED");

    const payload = promoPayload(fields.payload_json);
    const desired = compactFields({
      model_level: normalizedModelLevel,
      job_format: normalizedJobFormat,
      approved_discount_percent: approved,
      benefit_type: "discount_percent",
      benefit_value: null,
      payload_json: JSON.stringify({
        ...payload,
        schema_version: 3,
        claim_id: derived.claimId,
        policy_state: "ready",
        wish_submitted: true,
        coupon_policy: couponPolicySnapshot(),
        discount_authority: "backend_verified",
      }),
    });
    const updated = needsPatch(fields, desired)
      ? await this.patch(tableName(this.env, "PROMO_CODES"), promo.id, desired)
      : promo;
    const updatedFields = updated.fields || {};
    return {
      code: String(updatedFields.code || derived.code),
      status: safeCodeStatus(updatedFields.status),
      model_level: normalizeModelLevel(updatedFields.model_level),
      job_format: normalizeJobFormat(updatedFields.job_format),
      approved_discount_percent: validatedApprovedDiscount(updatedFields),
      activated_at: safeTimestamp(updatedFields.activated_at) || null,
      expires_at: safeTimestamp(updatedFields.expires_at) || null,
      single_use: true,
    };
  }

  async ensureClaimPolicy(claim, policy, observed) {
    const fields = claim.fields || {};
    const desired = compactFields({
      match_status: policy.match_status,
      classification_group: policy.classification_group,
      default_months: policy.default_months,
      membership_tier_snapshot: fields.membership_tier_snapshot || observed.tier || undefined,
      payment_status: policy.payment_status,
      payment_required: policy.payment_required,
      review_status: policy.review_status,
      claim_status: policy.claim_status,
    });
    if (!needsPatch(fields, desired)) return { record: claim, changed: false };
    return {
      record: await this.patch(tableName(this.env, "CLAIMS"), claim.id, { ...desired, updated_at: new Date().toISOString() }),
      changed: true,
    };
  }

  async ensurePromoPolicy(promo, claimPolicy, observed, wishSubmitted = false, now = new Date()) {
    const fields = promo.fields || {};
    const effectiveWishSubmitted = Boolean(wishSubmitted) || promoWishSubmitted(fields.payload_json);
    const desiredCoupon = couponStateFor(claimPolicy, observed, fields, now, effectiveWishSubmitted);
    const existingApproved = validatedApprovedDiscount(fields);
    const payload = promoPayload(fields.payload_json);
    const desired = compactFields({
      status: desiredCoupon.status,
      activated_at: desiredCoupon.activated_at || undefined,
      expires_at: desiredCoupon.expires_at || undefined,
      max_uses: 1,
      used_count: normalizedUseCount(fields.used_count),
      package_scope: ["all"],
      benefit_type: "discount_percent",
      benefit_value: null,
      approved_discount_percent: existingApproved,
      payload_json: JSON.stringify({
        ...payload,
        schema_version: 3,
        claim_id: promoClaimId(fields.payload_json),
        policy_state: desiredCoupon.policy_state,
        wish_submitted: effectiveWishSubmitted,
        coupon_policy: couponPolicySnapshot(),
      }),
    });
    if (!needsPatch(fields, desired)) return { record: promo, changed: false };
    return { record: await this.patch(tableName(this.env, "PROMO_CODES"), promo.id, desired), changed: true };
  }

  async ensureBenefitApplication({ claim, claimId, benefit }) {
    const idempotencyKey = `${CAMPAIGN_ID}:${claimId}:${benefit.kind}`;
    const records = await this.list(tableName(this.env, "BENEFIT_APPLICATIONS"), `{idempotency_key}=${formulaString(idempotencyKey)}`, 2);
    if (records.length > 1) throw new CareBackStoreError("CARE_BACK_BENEFIT_CONFLICT");
    if (records.length) return records[0];
    const now = new Date().toISOString();
    return this.create(tableName(this.env, "BENEFIT_APPLICATIONS"), {
      idempotency_key: idempotencyKey,
      claim_id: claimId,
      campaign_id: CAMPAIGN_ID,
      benefit_type: benefit.kind,
      status: "pending",
      before_json: JSON.stringify({ requested_extension_days: benefit.days }),
      retry_count: 0,
      request_id: idempotencyKey,
      created_at: now,
      updated_at: now,
      "Campaign Claim": claim?.id ? [claim.id] : undefined,
    });
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

  async patch(table, recordId, fields) {
    const id = String(recordId || "").trim();
    if (!/^rec[A-Za-z0-9]{14}$/.test(id)) throw new CareBackStoreError("CARE_BACK_STORAGE_MALFORMED");
    const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(String(this.env.AIRTABLE_BASE_ID))}/${encodeURIComponent(table)}/${encodeURIComponent(id)}`);
    const payload = await this.request(url, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fields, typecast: false }),
    });
    if (!payload?.fields) throw new CareBackStoreError("CARE_BACK_STORAGE_MALFORMED");
    return payload;
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

export function addCalendarMonths(value, months = COUPON_VALIDITY_MONTHS) {
  const source = requiredClock(value);
  const amount = Number(months);
  if (!Number.isInteger(amount) || amount <= 0 || amount > 24) throw new CareBackStoreError("CARE_BACK_VALIDITY_INVALID");
  const day = source.getUTCDate();
  const target = new Date(Date.UTC(
    source.getUTCFullYear(),
    source.getUTCMonth() + amount,
    1,
    source.getUTCHours(),
    source.getUTCMinutes(),
    source.getUTCSeconds(),
    source.getUTCMilliseconds(),
  ));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString();
}

export function resolveApprovedDiscount({ modelLevel, jobFormat, publicModelPercent = null } = {}) {
  const level = normalizeModelLevel(modelLevel);
  const format = normalizeJobFormat(jobFormat);
  if (!level || !format) return null;
  return approvedDiscountFor(level, format, publicModelPercent) || null;
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
function compactFields(fields) { return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)); }
function promoPayload(value) {
  try {
    const parsed = JSON.parse(String(value || ""));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
function promoClaimId(value) { return String(promoPayload(value)?.claim_id || ""); }
function observedMemberState(profile) {
  const status = ["active", "grace", "expired", "under_review"].includes(String(profile?.membership_status || ""))
    ? String(profile.membership_status)
    : "under_review";
  const tier = ["Member", "Standard", "Premium", "Black Card"].includes(String(profile?.tier || ""))
    ? String(profile.tier)
    : "Member";
  return { status, tier };
}

function requiredClock(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new CareBackStoreError("CARE_BACK_CLOCK_INVALID");
  return date;
}

function currentCampaignPhase(now) {
  const time = requiredClock(now).getTime();
  if (time <= Date.parse(BIRTHDAY_PHASE_END_AT)) return { id: "birthday", ends_at: BIRTHDAY_PHASE_END_AT };
  if (time <= Date.parse(CONTINUATION_PHASE_END_AT)) return { id: "continuation", ends_at: CONTINUATION_PHASE_END_AT };
  return null;
}

function storedCampaignPhase(value) {
  const parsed = promoPayload(value);
  const id = safeCampaignPhase(parsed?.campaign_phase);
  if (!id || id === "legacy") return null;
  return { id, ends_at: safeTimestamp(parsed?.campaign_phase_end_at) };
}

function legacyCampaignPhase(referenceDate) {
  const date = safeTimestamp(referenceDate);
  const phase = date ? currentCampaignPhase(new Date(date)) : null;
  return phase || { id: "legacy", ends_at: "" };
}

function initialClaimPolicy(observed) {
  if (observed.status === "active" || observed.status === "grace") {
    return {
      match_status: "matched",
      classification_group: "current_member",
      default_months: 6,
      payment_status: "not_required",
      payment_required: false,
      review_status: "not_required",
      claim_status: "benefit_approved",
      membership_benefit: { kind: "membership_extension", days: CURRENT_MEMBER_EXTENSION_DAYS, state: "pending_application" },
      points_policy: {
        reconciliation_state: "pending",
        rate_thb_per_point: POINTS_RATE_THB,
        renewal_bonus_points: 0,
        renewal_bonus_state: "not_offered",
      },
    };
  }
  if (observed.status === "expired") {
    return {
      match_status: "matched",
      classification_group: "inactive_expired",
      default_months: 3,
      payment_status: "pending",
      payment_required: true,
      review_status: "not_required",
      claim_status: "payment_pending",
      membership_benefit: { kind: "membership_extension", days: RENEWED_MEMBER_EXTENSION_DAYS, state: "renewal_required" },
      points_policy: {
        reconciliation_state: "pending",
        rate_thb_per_point: POINTS_RATE_THB,
        renewal_bonus_points: RENEWED_MEMBER_BONUS_POINTS,
        renewal_bonus_state: "renewal_required",
      },
    };
  }
  return {
    match_status: "manual_review",
    classification_group: "manual_review",
    default_months: undefined,
    payment_status: "not_required",
    payment_required: false,
    review_status: "pending",
    claim_status: "manual_review",
    membership_benefit: null,
    points_policy: {
      reconciliation_state: "manual_review",
      rate_thb_per_point: POINTS_RATE_THB,
      renewal_bonus_points: 0,
      renewal_bonus_state: "not_offered",
    },
  };
}

function resolvedClaimPolicy(fields, observed) {
  const existingGroup = String(fields.classification_group || "");
  if (["current_member", "active_member"].includes(existingGroup)) return initialClaimPolicy(observed);
  if (["inactive_expired", "former_member", "recently_expired", "long_expired"].includes(existingGroup)) {
    const policy = initialClaimPolicy({ ...observed, status: "expired" });
    const paymentVerified = String(fields.payment_status || "") === "verified";
    const membershipRestored = observed.status === "active" || observed.status === "grace";
    return {
      ...policy,
      payment_status: paymentVerified ? "verified" : "pending",
      claim_status: paymentVerified && membershipRestored ? "benefit_approved" : "payment_pending",
      membership_benefit: {
        ...policy.membership_benefit,
        state: paymentVerified && membershipRestored ? "pending_application" : "renewal_required",
      },
      points_policy: {
        ...policy.points_policy,
        renewal_bonus_state: paymentVerified && membershipRestored ? "pending_application" : "renewal_required",
      },
    };
  }
  if (existingGroup === "new_member") {
    const paymentVerified = String(fields.payment_status || "") === "verified";
    const reviewApproved = String(fields.review_status || "") === "approved";
    const membershipActivated = observed.status === "active" || observed.status === "grace";
    const approved = paymentVerified && reviewApproved && membershipActivated;
    return {
      match_status: "matched",
      classification_group: "new_member",
      default_months: Number(fields.default_months) || 6,
      payment_status: paymentVerified ? "verified" : "pending",
      payment_required: true,
      review_status: reviewApproved ? "approved" : "pending",
      claim_status: approved ? "benefit_approved" : (paymentVerified ? "manual_review" : "payment_pending"),
      membership_benefit: null,
      points_policy: {
        reconciliation_state: approved ? "pending" : "manual_review",
        rate_thb_per_point: POINTS_RATE_THB,
        renewal_bonus_points: NEW_MEMBER_WELCOME_POINTS,
        renewal_bonus_state: approved ? "pending_application" : "payment_required",
      },
    };
  }
  return initialClaimPolicy(observed);
}

function couponStateFor(claimPolicy, observed, promoFields, now = new Date(), wishSubmitted = false) {
  const clock = requiredClock(now);
  const currentStatus = safeCodeStatus(promoFields.status);
  const used = normalizedUseCount(promoFields.used_count) >= 1 || currentStatus === "used";
  const terminal = used ? "used" : (["revoked", "invalid", "expired"].includes(currentStatus) ? currentStatus : "");
  const isEligibleNow = couponIssuanceGatePassed(claimPolicy, observed, wishSubmitted);
  const rawActivatedAt = safeTimestamp(promoFields.activated_at);
  const rawCreatedAt = safeTimestamp(promoFields.created_at);
  const rawExpiresAt = safeTimestamp(promoFields.expires_at);
  const expired = rawExpiresAt && Date.parse(rawExpiresAt) <= clock.getTime();

  if (terminal === "used") return customerCoupon("used", rawActivatedAt, rawExpiresAt, "used", "ใช้สิทธิ์นี้แล้ว");
  if (terminal === "expired" || expired) return customerCoupon("expired", rawActivatedAt, rawExpiresAt, "expired", "สิทธิ์นี้หมดอายุแล้ว");
  if (terminal) return customerCoupon(terminal, rawActivatedAt, rawExpiresAt, terminal, "สิทธิ์นี้ไม่พร้อมใช้งาน");
  if (!wishSubmitted) {
    return customerCoupon("draft", "", "", "wish_required", "ส่งคำอวยพรวันเกิดถึง MMD สำเร็จก่อน จึงจะเปิดคูปองส่วนตัวได้");
  }
  if (isEligibleNow) {
    const activation = rawActivatedAt || rawCreatedAt || clock.toISOString();
    const canonicalExpiry = addCalendarMonths(activation, COUPON_VALIDITY_MONTHS);
    return customerCoupon("active", activation, canonicalExpiry, "ready", "คูปองส่วนตัวของคุณพร้อมใช้แล้ว");
  }
  if (claimPolicy.membership_benefit?.state === "renewal_required") {
    return customerCoupon("draft", "", "", "renewal_required", "คูปองจะพร้อมใช้หลังต่ออายุสมาชิกและระบบยืนยันเรียบร้อยแล้ว");
  }
  return customerCoupon("draft", "", "", "verification_required", "คูปองจะพร้อมใช้หลัง MMD ยืนยันสถานะสมาชิกเรียบร้อยแล้ว");
}

function couponIssuanceGatePassed(claimPolicy, observed, wishSubmitted) {
  if (!wishSubmitted) return false;
  const membershipVerified = observed.status === "active" || observed.status === "grace";
  const paymentVerified = claimPolicy.payment_required
    ? claimPolicy.payment_status === "verified"
    : claimPolicy.payment_status === "not_required";
  const reviewVerified = claimPolicy.review_status === "approved" || claimPolicy.review_status === "not_required";
  const claimApproved = ["benefit_approved", "applying", "benefit_applied"].includes(String(claimPolicy.claim_status || ""));
  return membershipVerified
    && paymentVerified
    && reviewVerified
    && claimApproved
    && claimPolicy.membership_benefit?.state !== "renewal_required";
}

function normalizeModelLevel(value) {
  const key = String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (["public", "public model", "public models"].includes(key)) return "Public Models";
  if (["standard", "standard model", "standard models"].includes(key)) return "Standard Models";
  if (["premium", "premium model", "premium models"].includes(key)) return "Premium";
  if (["em", "ems", "exclusive model", "exclusive models"].includes(key)) return "EMs";
  if (["gw", "gws", "gorgeous world", "gorgeous worlds"].includes(key)) return "GWs";
  return "";
}

function normalizeJobFormat(value) {
  const key = String(value || "").trim().toUpperCase();
  return key === "PN" || key === "VIP" ? key : "";
}

function approvedDiscountFor(modelLevel, jobFormat, publicModelPercent = null) {
  if (modelLevel === "Public Models") {
    const candidate = Number(publicModelPercent);
    return Number.isFinite(candidate) && candidate >= 3 && candidate <= 5 ? candidate : 0;
  }
  if (modelLevel === "Standard Models") return jobFormat === "PN" ? 5 : jobFormat === "VIP" ? 7 : 0;
  if (["Premium", "EMs", "GWs"].includes(modelLevel)) return jobFormat === "PN" ? 5 : jobFormat === "VIP" ? 10 : 0;
  return 0;
}

function validatedApprovedDiscount(fields = {}) {
  const level = normalizeModelLevel(fields.model_level);
  const format = normalizeJobFormat(fields.job_format);
  const stored = Number(fields.approved_discount_percent);
  if (!level || !format || !Number.isFinite(stored) || stored <= 0 || stored > COUPON_MAX_DISCOUNT_PERCENT) return null;
  const expected = approvedDiscountFor(level, format, level === "Public Models" ? stored : null);
  return expected === stored ? stored : null;
}

function personalizedBenefits(claimPolicy, coupon, approvedDiscountPercent = null) {
  const benefits = [];
  const membership = safeMembershipBenefit(claimPolicy?.membership_benefit);
  if (membership) benefits.push({ type: "membership_extension", value: membership.days, unit: "days", state: membership.state });
  const points = safePointsPolicy(claimPolicy?.points_policy);
  if (points?.renewal_bonus_points > 0) {
    benefits.push({ type: "points_bonus", value: points.renewal_bonus_points, unit: "points", state: points.renewal_bonus_state });
  }
  if (Number.isFinite(approvedDiscountPercent) && approvedDiscountPercent > 0) {
    benefits.push({ type: "personal_coupon", value: approvedDiscountPercent, unit: "percent", state: coupon.customer_state });
  }
  return benefits;
}

function couponWallet(promoFields, coupon) {
  const code = /^[A-HJ-NP-Z2-9]{6}$/.test(String(promoFields?.code || "")) ? String(promoFields.code) : "";
  const approved = coupon.customer_state === "ready" ? validatedApprovedDiscount(promoFields) : null;
  return {
    status: coupon.customer_state,
    code,
    approved_discount_percent: approved,
    discount_percent: approved || 0,
    activated_at: code ? safeTimestamp(promoFields?.activated_at) || null : null,
    expires_at: code ? safeTimestamp(promoFields?.expires_at) || null : null,
    single_use: true,
  };
}

function customerCoupon(status, activatedAt, expiresAt, customerState, message) {
  return {
    status,
    activated_at: activatedAt || null,
    expires_at: expiresAt || null,
    customer_state: customerState,
    customer_message: message,
    policy_state: customerState,
  };
}

function couponPolicySnapshot() {
  return {
    benefit_type: "discount_percent",
    max_discount_percent: COUPON_MAX_DISCOUNT_PERCENT,
    rate_authority: "approved_discount_percent",
    rate_basis: "model_level_x_job_format_x_customer_eligibility",
    public_model_discount_band: [3, 5],
    validity_months: COUPON_VALIDITY_MONTHS,
    single_use: true,
    eligible_service_only: true,
    requires_completed_birthday_wish: true,
    not_applicable_to: ["membership_fee", "renewal_fee", "tips", "payment_verification", "black_card_approval"],
  };
}

function pointsPolicySnapshot(claimPolicy) {
  const policy = safePointsPolicy(claimPolicy?.points_policy);
  return policy || {
    reconciliation_state: "pending",
    rate_thb_per_point: POINTS_RATE_THB,
    renewal_bonus_points: 0,
    renewal_bonus_state: "not_offered",
  };
}

function promoWishSubmitted(value) { return promoPayload(value)?.wish_submitted === true; }
function needsPatch(current, desired) {
  return Object.entries(desired).some(([key, value]) => JSON.stringify(current?.[key] ?? null) !== JSON.stringify(value ?? null));
}
function normalizedUseCount(value) {
  const count = Number(value);
  return Number.isInteger(count) && count >= 0 ? count : 0;
}
function safeTimestamp(value) {
  const raw = String(value || "").trim();
  const time = Date.parse(raw);
  return raw && Number.isFinite(time) ? new Date(time).toISOString() : "";
}
function safeMembershipBenefit(value) {
  if (value?.kind !== "membership_extension" || !Number.isInteger(value.days) || value.days <= 0) return null;
  return { type: "membership_extension", days: value.days, state: String(value.state || "pending_application") };
}
function safePointsPolicy(value) {
  const rate = Number(value?.rate_thb_per_point);
  const points = Number(value?.renewal_bonus_points);
  const reconciliationState = String(value?.reconciliation_state || "");
  const bonusState = String(value?.renewal_bonus_state || "");
  if (!Number.isInteger(rate) || rate <= 0 || !Number.isInteger(points) || points < 0) return null;
  if (!["pending", "manual_review", "verified", "reconciliation_required"].includes(reconciliationState)) return null;
  if (!["not_offered", "renewal_required", "payment_required", "pending_application", "applied"].includes(bonusState)) return null;
  return {
    reconciliation_state: reconciliationState,
    rate_thb_per_point: rate,
    renewal_bonus_points: points,
    renewal_bonus_state: bonusState,
  };
}
function safeCampaignPhase(value) { return ["birthday", "continuation", "legacy"].includes(String(value)) ? String(value) : ""; }
function safeClaimStatus(value) { return ["identity_verified", "matched", "manual_review", "payment_pending", "benefit_approved", "applying", "benefit_applied", "blocked", "rejected"].includes(String(value)) ? String(value) : "identity_verified"; }
function safeReviewStatus(value) { return ["pending", "in_review", "approved", "blocked", "not_required"].includes(String(value)) ? String(value) : "pending"; }
function safePaymentStatus(value) { return ["pending", "verified", "not_required", "rejected"].includes(String(value)) ? String(value) : "pending"; }
function safeClassificationGroup(value) { return ["current_member", "recently_expired", "inactive_expired", "former_member", "new_member", "manual_review"].includes(String(value)) ? String(value) : "manual_review"; }
function safeCodeStatus(value) { return ["draft", "active", "expired", "used", "revoked", "invalid"].includes(String(value)) ? String(value) : "draft"; }
