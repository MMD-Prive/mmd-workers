const AIRTABLE_API = "https://api.airtable.com/v0";
const CAMPAIGN_ID = "mmd_6th_anniversary_2026";

const CLAIM_FIELDS = {
  claimId: "flddYlHkG37pL7ARs",
  campaignId: "fldRePvxEF5crDKC0",
  identityHash: "fldLeWEhHgnFWSQdp",
  referenceDate: "fldNMO2IBmwAuACD8",
  memberId: "fldXfI6gzSK5Nbpab",
  clientId: "fld7CIL5wY6iDUTel",
  classification: "fldttJ2jWpHlTeWze",
  daysExpired: "fldpykEygLNtUiKFD",
  defaultMonths: "fldl8iJKQBzYaObcM",
  approvedMonths: "fldd2RhbrBdVIj8Iy",
  tierSnapshot: "fldUqErYUXmTSFS5s",
  startSnapshot: "fldThSDTcelwqQbxp",
  endSnapshot: "fldZwSabq13g8jntT",
  reason: "fldnNlEvT5ALItjbl",
  points: "fldM5tpNVhiINq1ps",
  paymentStatus: "fldCe1ktIWh7pUxOs",
  paymentRequired: "fld16BsV7z0k3gTpJ",
  paymentReference: "fldUG0zSmqZMWnAi2",
  reviewStatus: "fldTQgo4qZeXOTpUw",
  reviewedBy: "fldU33DL7Vgh5NwVx",
  approvedBy: "fldWW1hGgNbXuAcMt",
  reviewedAt: "fldruRSeTClScrCGa",
  approvedAt: "fldeI3QySsdPdz5BY",
  appliedBy: "fldjoyboTnG6qgFMk",
  appliedAt: "fldNB43vM7gumheXo",
  newExpiry: "fldwsfqmSQkZeKeQ0",
  claimStatus: "fldDthGzJRmHW13nW",
  payload: "fldy9BcPlwHIL9enJ",
  createdAt: "fldgtH2QUnskdovAl",
  updatedAt: "fldAZ2uR2j2VP4Gyd",
};

const AUDIT_FIELDS = {
  action: "fldJm0W0cL6vQH3pG",
  timestamp: "fldWQUyiizhJakk95",
  actor: "fld1SLfgMZrZRoK84",
  entityType: "flda0UF0K7aYI2G0Q",
  details: "fldcPkD8QHNS2O6rx",
  adminSessionId: "fldIKfvCRiOV4XN2j",
  requestId: "fldIJTCPhoL6RNJWP",
  eventType: "fldoAu14JWm4gUbe6",
  after: "fldcGk6eAA41bsxZX",
  reason: "fldeIkKKMmLN8QAnj",
  claimId: "fldVtBO0jBMcrVshF",
  idempotencyKey: "fldySzuIWzzCp56m2",
  before: "fld6y23ZJs9rOey6T",
};

export class AirtableClaimStore {
  constructor(env) {
    this.env = env;
    this.claimsTable = requiredConfig(env.AIRTABLE_TABLE_CAMPAIGN_CLAIMS, "campaign_claims_table_missing");
    this.auditTable = requiredConfig(env.AIRTABLE_TABLE_ACTIVITY_LOGS, "activity_logs_table_missing");
    if (env.CAMPAIGN_SCHEMA_VERSION !== "2026-08-final") throw new StoreError("campaign_schema_version_missing");
  }

  async findByIdentity(identityHash) {
    return this.#find(`AND({${CLAIM_FIELDS.campaignId}}='${CAMPAIGN_ID}',{${CLAIM_FIELDS.identityHash}}='${escapeFormula(identityHash)}')`);
  }

  async findById(claimId) {
    return this.#find(`AND({${CLAIM_FIELDS.campaignId}}='${CAMPAIGN_ID}',{${CLAIM_FIELDS.claimId}}='${escapeFormula(claimId)}')`);
  }

  async create(claim, audit) {
    requireAudit(audit);
    const existing = await this.findByIdentity(claim.identityHash);
    if (existing) return existing;
    const record = await this.#airtable(this.claimsTable, {
      method: "POST",
      body: JSON.stringify({ fields: claimFields(claim), typecast: false }),
    });
    await this.appendAudit({ ...audit, eventType: "claim_created", before: null, after: claim });
    return { ...claim, recordId: record.id };
  }

  async update(next, expectedUpdatedAt, audit) {
    requireAudit(audit);
    const current = await this.findById(next.claimId);
    if (!current) throw new StoreError("claim_not_found");
    if (current.updatedAt !== expectedUpdatedAt) throw new StoreError("claim_write_conflict");
    assertSnapshotsImmutable(current, next);
    await this.#airtable(`${this.claimsTable}/${encodeURIComponent(current.recordId)}`, {
      method: "PATCH",
      body: JSON.stringify({ fields: claimFields(next), typecast: false }),
    });
    await this.appendAudit({ ...audit, before: current, after: next });
    return next;
  }

  async appendAudit(audit) {
    requireAudit(audit);
    const fields = {
      [AUDIT_FIELDS.action]: audit.eventType,
      [AUDIT_FIELDS.timestamp]: String(audit.timestamp).slice(0, 10),
      [AUDIT_FIELDS.actor]: audit.actorId,
      [AUDIT_FIELDS.details]: JSON.stringify({ campaignId: audit.campaignId, claimId: audit.claimId, timestamp: audit.timestamp }),
      [AUDIT_FIELDS.adminSessionId]: audit.adminSessionId,
      [AUDIT_FIELDS.requestId]: audit.requestId,
      [AUDIT_FIELDS.eventType]: audit.eventType,
      [AUDIT_FIELDS.before]: JSON.stringify(audit.before ?? null),
      [AUDIT_FIELDS.after]: JSON.stringify(audit.after ?? null),
      [AUDIT_FIELDS.reason]: audit.reason || "",
      [AUDIT_FIELDS.claimId]: audit.claimId,
      [AUDIT_FIELDS.idempotencyKey]: audit.idempotencyKey || "",
    };
    await this.#airtable(this.auditTable, { method: "POST", body: JSON.stringify({ fields, typecast: false }) });
  }

  async #find(formula) {
    const query = new URLSearchParams({ maxRecords: "1", filterByFormula: formula });
    const data = await this.#airtable(`${this.claimsTable}?${query}`);
    const record = data.records?.[0];
    if (!record) return null;
    const payload = parsePayload(record.fields?.[CLAIM_FIELDS.payload]);
    return { ...payload, recordId: record.id };
  }

  async #airtable(path, init = {}) {
    const baseId = requiredConfig(this.env.AIRTABLE_BASE_ID, "airtable_base_id_missing");
    const token = requiredConfig(this.env.AIRTABLE_TOKEN, "airtable_token_missing");
    const url = new URL(`${AIRTABLE_API}/${encodeURIComponent(baseId)}/${path}`);
    url.searchParams.set("returnFieldsByFieldId", "true");
    const response = await fetch(url, {
      ...init,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new StoreError(`airtable_${response.status}`);
    return data;
  }
}

export function assertSnapshotsImmutable(before, after) {
  for (const key of ["identityHash", "claimCreatedAt", "eligibilityReferenceDate", "membershipTier",
    "membershipStartSnapshot", "membershipEndSnapshot", "membershipHistorySnapshot", "eligibility", "status", "pointsAward"]) {
    if (JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after?.[key] ?? null)) {
      throw new StoreError(`immutable_snapshot_${key}`);
    }
  }
}

function claimFields(claim) {
  const eligibility = claim.eligibility || {};
  const fields = {
    [CLAIM_FIELDS.claimId]: claim.claimId,
    [CLAIM_FIELDS.campaignId]: claim.campaignId,
    [CLAIM_FIELDS.identityHash]: claim.identityHash,
    [CLAIM_FIELDS.referenceDate]: `${claim.eligibilityReferenceDate}T00:00:00.000Z`,
    [CLAIM_FIELDS.memberId]: claim.memberId || "",
    [CLAIM_FIELDS.clientId]: claim.clientId || "",
    [CLAIM_FIELDS.classification]: claim.status,
    [CLAIM_FIELDS.daysExpired]: eligibility.daysExpired,
    [CLAIM_FIELDS.defaultMonths]: eligibility.fixedMonths ?? eligibility.maxMonths,
    [CLAIM_FIELDS.approvedMonths]: claim.approvedMonths,
    [CLAIM_FIELDS.tierSnapshot]: claim.membershipTier || "",
    [CLAIM_FIELDS.startSnapshot]: claim.membershipStartSnapshot,
    [CLAIM_FIELDS.endSnapshot]: claim.membershipEndSnapshot,
    [CLAIM_FIELDS.reason]: eligibility.reason || "",
    [CLAIM_FIELDS.points]: claim.pointsAward,
    [CLAIM_FIELDS.paymentStatus]: claim.paymentRequired ? (claim.paymentVerified ? "verified" : "pending") : "not_required",
    [CLAIM_FIELDS.paymentRequired]: Boolean(claim.paymentRequired),
    [CLAIM_FIELDS.paymentReference]: claim.paymentReference || "",
    [CLAIM_FIELDS.reviewStatus]: legacyReviewStatus(claim.reviewStatus),
    [CLAIM_FIELDS.reviewedBy]: claim.reviewedBy || "",
    [CLAIM_FIELDS.approvedBy]: claim.approvedBy || "",
    [CLAIM_FIELDS.reviewedAt]: claim.reviewedAt || null,
    [CLAIM_FIELDS.approvedAt]: claim.approvedAt || null,
    [CLAIM_FIELDS.appliedBy]: claim.appliedBy || "",
    [CLAIM_FIELDS.appliedAt]: claim.appliedAt || null,
    [CLAIM_FIELDS.newExpiry]: claim.newMembershipExpiry || null,
    [CLAIM_FIELDS.claimStatus]: claim.claimStatus,
    [CLAIM_FIELDS.payload]: JSON.stringify(claim),
    [CLAIM_FIELDS.createdAt]: claim.createdAt,
    [CLAIM_FIELDS.updatedAt]: claim.updatedAt,
  };
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== null && value !== undefined && value !== ""));
}

function legacyReviewStatus(status) { return ({ pending: "pending", manual_review: "in_review", benefit_approved: "approved",
  approved: "approved", rejected: "blocked", benefit_applied: "approved", apply_partially_failed: "in_review" })[status] || "pending"; }
function parsePayload(value) { try { const parsed = JSON.parse(String(value || "")); if (!parsed || typeof parsed !== "object") throw new Error(); return parsed; }
  catch { throw new StoreError("invalid_claim_payload"); } }
function requiredConfig(value, code) { const text = String(value || "").trim(); if (!text) throw new StoreError(code); return text; }
function escapeFormula(value) { return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }
function requireAudit(value) { for (const key of ["requestId", "actorId", "adminSessionId", "eventType", "claimId", "campaignId", "timestamp"]) {
  if (!String(value?.[key] || "").trim()) throw new StoreError(`audit_${key}_required`); } }

export class StoreError extends Error { constructor(code) { super(code); this.code = code; } }
