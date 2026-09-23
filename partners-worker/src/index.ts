import { resolveModelSalesOffer } from "../../shared/model-sales-control-v1.mjs";

import { authorityRuntimeHealth, queueAuthorityEvent } from "../../shared/posthog-authority-events.mjs";
type SecretName = "AIRTABLE_API_KEY" | "AUTH_SERVICE_PARTNERS_TO_TELEGRAM" | "TOKEN_SECRET" | "ADMIN_APPROVE_SECRET";
type OptionalVarName =
  | "PUBLIC_SITE_URL"
  | "TELEGRAM_PUBLIC_MODEL_THREAD_ID"
  | "TELEGRAM_ADMIN_THREAD_ID";
type RuntimeEnv = Env & Partial<Record<SecretName | OptionalVarName | "AIRTABLE_TABLE_SESSIONS" | "AIRTABLE_TABLE_PAYMENTS", string>>;

type AirtableFieldValue = string | number | boolean | string[] | null;
type AirtableFields = Record<string, AirtableFieldValue>;

type AirtableRecord = {
  id: string;
  createdTime?: string;
  fields: Record<string, unknown>;
};

type AirtableListOptions = {
  filterByFormula?: string;
  maxRecords?: number;
  pageSize?: number;
  sort?: Array<{ field: string; direction?: "asc" | "desc" }>;
};

type UploadedFileMetadata = {
  r2_key: string;
  file_name: string;
  file_type: string;
  file_size: number;
  file_category: FileCategory;
};

type TokenPayload = {
  pid: string;
  iat: number;
  exp: number;
};

type VerifiedPartner = {
  token: string;
  tokenHash: string;
  payload: TokenPayload;
  partnerRecord: AirtableRecord;
};

const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 10;
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const DEFAULT_PUBLIC_SITE_URL = "https://www.mmdbkk.com";

const ROLE_LAYERS = Object.freeze({
  partner_control: "YUKI",
  black_card_authority: "EWVON"
} as const);

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf"
]);

const FILE_CATEGORIES = [
  "photo",
  "portfolio",
  "comp_card",
  "company_profile",
  "identity",
  "rate_card",
  "proof",
  "other"
] as const;
type FileCategory = (typeof FILE_CATEGORIES)[number];

const ACCESS_SOURCES = [
  "staff_referral",
  "model_referral",
  "modeling_broker",
  "client_referral",
  "other"
] as const;
type AccessSource = (typeof ACCESS_SOURCES)[number];

const TALENT_TYPES = [
  "self",
  "model",
  "actor",
  "multiple_talents",
  "client_lead",
  "company",
  "other"
] as const;
type TalentType = (typeof TALENT_TYPES)[number];

const APPROVAL_ACTIONS = [
  "recognized",
  "not_recognized",
  "needs_follow_up",
  "archived"
] as const;
type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

const PARTNER_TYPE_BY_SOURCE: Record<AccessSource, string> = {
  staff_referral: "Staff Referral",
  model_referral: "Model Referral",
  modeling_broker: "Modeling / Broker",
  client_referral: "Client Referral",
  other: "Other"
};

const MODEL_PARTNERS = {
  partnerId: "fldXb55aiAjNPOUWc",
  partnerName: "fldpJWfASq7PfkMgC",
  legalName: "fldO1chenQdB94uUa",
  contactName: "flddLZj3pgQNXxKHc",
  contactPhone: "fldBgUcT9eTOiJZzK",
  lineId: "fldtg04Kz0yzYq8ZF",
  telegramId: "fldi6XKGQAWUEdr3A",
  email: "fldQfDU7ooQ8vkyAf",
  partnerType: "fldwcXd6wggLmJSld",
  tier: "fld4BPoOVpwqg4EA6",
  defaultCommissionType: "fld32fgg8dke6wl6h",
  defaultCommissionRate: "fldTfCPFFjXW2eABa",
  status: "fldajmg66pf2ifGPu",
  agreementVersion: "fldQTcAJAskgtjT0v",
  agreementAcceptedAt: "fldI5AAPvO1WDZHXD",
  agreementUrl: "flddkssuE1VAT8hMH",
  onboardedAt: "fld2tuVEslt5CNydU",
  notesInternal: "fldiPJbsdnuxYQAl5",
  payoutMethod: "fldZG3RdtM7OQoxXs",
  payoutAccountName: "fld7mg94lX8Jsv7X9",
  payoutAccountRef: "fldldqm0bZxPDPeh7",
  telegramUsername: "fldCqQx4XD7sf28SE",
  memberstackId: "fld0on55TLJYzGvPn",
  createdAt: "fld3Dv3I19Pqr15p3",
  notes: "fldOTiDA2xynDuiwu",
  activeReferralsCount: "fldardSj9P3zOByR3",
  partnerCode: "flduuCgXVvnt6U6ov",
  displayName: "fldel1xBpQlPfDoQT",
  defaultFlatAmountThb: "fldsIsiskggF0CO86",
  partnerScore: "Partner Score",
  approvalStatus: "fldwRzdtIoPbHKr7n",
  accessTokenHash: "fldoaCF4k4YqyuQ7Q",
  telegramVerificationStatus: "fldOPxUvKgAVW5a2M",
  telegramVerifiedAt: "fldDrOnCgqnnnQgA9"
} as const;

const SESSION_FIELDS = {
  referralSnapshotJson: "fldfqNBNKkmQdr6Fp",
  createdAt: "flduULqxy2FIuJuaf",
  commissionSnapshotJson: "fldcDwNS7e64vsPEN",
  commissionSnapshotLocked: "fldYgTgfGDpFQsKvZ",
  referralSnapshotId: "fldorSqZ8baZEs4NL",
  completionReview: "fldsX182wBo1TdD5f",
  payoutHoldReason: "fldLjo7Af3ISu9yf5",
  canonicalModel: "fldrXQAyOMPCvbOaY",
  lifecycle: "fld57fhdWqIcOy4Jp",
  status: "fldHAlxnRfpKucnNV",
  sessionId: "fldLTq2kZbyRv22IA",
  paymentRef: "fldojgjSQLaO0uQLX",
  paymentStatus: "fldTY5lE6m0kQf72n",
  clientName: "fldMvnQ0BzDfHUYjT",
  modelName: "flddVz6eoWRHrzIQr",
  jobDate: "fldpnqoIsUMfN7y3c",
  startTime: "fldBeG0FkWwa8kgnp",
  endTime: "fldiDSz0wW9Ct9I3P",
  locationName: "fldIiRpaxoafjTkFt",
  customerAckAt: "fldJSS5GNN7quJwa8",
  workLane: "fldzYGziqLqTQaoaK",
  workType: "fldZiv3GeiafJTuRv",
  partnerIdSnapshot: "fld0jkscGAtyX7i2J",
  partnerSnapshotJson: "fldxyZ7S3tjF8chGR",
  partnerConfirmationStatus: "fldrAQxUX4pRqz6qr",
  partnerConfirmedAt: "fldLonXanVTSybnpv",
  partnerConfirmationNote: "fldjAwRLqxhJ7GjJL",
  partnerConfirmationRevision: "fldhO72ZSYcyjbLzi",
  partnerNotificationStatus: "fldv1X9HIfgUjwpJw",
  partnerNotificationMessageId: "fldyG4XzAlMQz4gfG",
  partnerNotificationSentAt: "fldG2sWou0Zh18PHS",
  partnerNotificationError: "fldGLKYcQVPZelwue"
} as const;

const PAYMENT_FIELDS = {
  paymentRef: "fldOO6SY49iDw8VBZ",
  sessionId: "fld2wdhBvc8xrV6y5",
  verification: "fldJ7a0Ube9F0bmRy",
  statusFormula: "fld0aatroI5poWOSo",
  amount: "fldvCSwrUW8OMAooS",
  paymentDate: "fld3yAwxIu2dkw7fO",
  stage: "fldydUWHhqVLMkNSC",
  canonicalStage: "fldrr9g8ZZjqAbdKQ",
  status: "fldEJ1hmm7KwWuI6q"
} as const;

const PARTNER_MODEL_CHANGES = {
  requestKey: "fldOMAnz49TkPbbpI",
  partner: "fldn8qMa6MrehyJs0",
  model: "fldyOGhF8vPskWv60",
  action: "fldRNYS8yVF0TbSR9",
  status: "fldyfqdakvtibCrh1",
  payloadJson: "fldflEribxl5pm4Cc",
  shareWithMmd: "fldal8U4rg41RPbrR",
  idempotencyKey: "fldIwYPeVpMcJ4ba4",
  revision: "fld0J2r0fMxx9O4n0",
  submittedAt: "fld9vT5vQIhnl48wT",
  updatedAt: "fld3gpwvBl09LHGC1",
  actorRef: "fld6ukOGZ5atMjppP",
  partnerId: "fldjejXbPKCubhx1r"
} as const;

const PARTNER_ASSETS = {
  assetId: "fld3NklN2iKsZfyx2",
  requestId: "fldeqzo5t3Rn80Cxi",
  partner: "fldfFnmGzuABMx73p",
  referral: "fldOdLWYrfJTrqlh0",
  modelApplication: "fldrO5jXtRC2625K9",
  model: "fldziGhehbtACcMSy",
  talentName: "fld13S676s8rVItvM",
  talentType: "fld1GUaBYlsc0qItX",
  fileName: "fldan0RC2OmKOx9ZS",
  fileType: "fldRIWH1BoksjTifz",
  fileSize: "fldVSEnaet8QBVprU",
  fileCategory: "fldxP9Dz5R5n8qc0m",
  r2Key: "fldwREciD1379aRmj",
  r2Bucket: "fldNbFcAfD8iSUBvT",
  storageProvider: "flduFWON5ER5zwWZx",
  portfolioUrl: "fldluhKZtvnrJtrLI",
  uploadedAt: "fldeeR5njPazmDppA",
  reviewStatus: "fldU74rreSrrPPR34",
  visibility: "fldOnuGVGUV3s0iue",
  signedUrlStatus: "fldeRj8Qfh0Mtfnz4",
  notes: "fldG0NOMCIuDxdHNM",
  createdByWorker: "fldHxkxKp36tKRdx6",
  sourcePath: "fld8bzWD62f59lH3u",
  payloadJson: "fld9CgmkIQzqABY58"
} as const;

const MODEL_APPLICATIONS = {
  nickname: "fldUIqNSM6Z9dK8Tj",
  workingName: "fldY8Jf7H70Tn1S93",
  gender: "fldGNS9k0SerUKpc7",
  age: "fldSRAY0jIsd7Plq9",
  heightCm: "fldGbBKCkWXwdAtFV",
  instagram: "fldM9Gdb3dNpyzsdR",
  bkkDistrict: "fldtuglOxtS9Br9XF",
  notes: "fld0C1aLDZO43i7fw",
  source: "fld5APoGfvpSCVNgf",
  savedBy: "fldWsTFqvTN8GcB38",
  createdAt: "flddbmI6akcZSAPye",
  consentToPrivacy: "fldglLr49Qn1V16vI",
  applicationStatus: "fldj2yV7EPyRn2Nu9",
  telegramUsername: "fldvMlJWxzumVThiq"
} as const;

const MODEL_REFERRALS = {
  referralId: "fldenLL5DOtVnmIEl",
  partner: "fldOsYg1phEyAFCSm",
  model: "fldly8wh9tSrFCi5I",
  ownershipStatus: "fldsSc7kzCliSMuY0",
  commissionType: "fldWNADQGpDYMaQ7W",
  commissionRate: "fldi46wDSueF2l3Qc",
  effectiveFrom: "fldMAJjSMduugYf3j",
  effectiveUntil: "fld2VAsDihwPMaGxL",
  firstJobRemaining: "fld767RtINphBZ7zl",
  sourceChannel: "fldPTddSPe3MGAYZq",
  proofUrl: "fldJULUuXxbpBt0E8",
  referredAt: "fldc7673z0dV1UzlB",
  approvedAt: "fldsIcAJvkruAcvOQ",
  approvedBy: "fldACzN0obgw8XsRC",
  notes: "fldeiqvlZgqydhsWl",
  basisRule: "fld1z3yCANBbLCdg9",
  flatAmountThb: "fldYsSgr1gdRpbO5P",
  createdByWorker: "fldXIijjk2sLztl8L"
} as const;

const PARTNER_COMMISSIONS = {
  payoutReference: "fld73sxUx3RKAzQ4B",
  commissionSnapshotJson: "fld3D2F9Q5SvyQDS1",
  commissionSnapshotLocked: "fldUz9ZOYhZVyQC7n",
  commissionId: "fld9CRWLtjRTELNyO",
  partner: "fldJ51ma9I8IiDpZ2",
  referral: "fldDAnZBjat2nZXKu",
  model: "fldPi2NcDbiXburhw",
  job: "fldcjJBa4BQeo9YS6",
  sessionId: "fldn1Mu63EUWjGucK",
  paymentRef: "fld2rizdjbpsK3Ndh",
  currency: "fldSPTSsTIB2hdym5",
  basisAmount: "fldUxou05o9ml6Q2N",
  rateSnapshot: "fldmX48IYpxm7wf4b",
  typeSnapshot: "fldAuIvGgoDt6m6NY",
  commissionAmount: "fldAhFbvG0Ydcpnia",
  status: "fldaf1c3Ao5VNYgFa",
  earnedAt: "fld8d84IpuPIZPMEX",
  approvedAt: "fldZB1fjOdifqUGSV",
  paidAt: "fldwftk7yOwVeJXQ9",
  heldReason: "fldhD7qxjHXnp5IJC",
  voidReason: "fldMhwlnc5jJmqmwC",
  payoutStatus: "fldno1EAh01onIVbp",
  approvalStatus: "fldidxKqqHoOMUPgM",
  eligibilityStatus: "fldHm8VhVbPrHyvd7",
  approvedBy: "fldpzzkN73r2cJAag",
  commissionKey: "fld1BZvS9Z3Q4g9MN",
  commissionGroupKey: "fld6jiHNimU2kDTUb",
  splitIndex: "fldPaL3UchvFip1HS",
  splitPercent: "fldKGAFGPAdNyz55W",
  auditJson: "fldkqxeWAevskdt4y",
  jobId: "fldUcVyYC37ijCHz8"
} as const;

const MODEL_OFFER_RULES = {
  offerRuleKey: "fld0GTefOf9VSdTpU",
  model: "fldrvoIfq0sMWR70V",
  modelKey: "fldHlkHRqPr5e8pkn",
  offerType: "fldt5djzxVFQz43za",
  audienceScope: "fldVfrqaEkgI2uf5w",
  partnerSourceRateThb: "fldbgFiaSm4pWY9qU",
  customerSellRateThb: "fldSL0hGadzsxxvRu",
  priceVisibility: "fldiLyM0oyHVR6e2j",
  salesVisibility: "fldgc3dV6wWVTcu7c",
  scheduleType: "fldugUjwgRWbJGkpV",
  effectiveFromAt: "fldeJNUOSiHlEjUSh",
  effectiveUntilAt: "fldA4RxTfDNGlvgoe",
  daysOfWeek: "fldAFAhdX7YiiDDbg",
  startTimeLocal: "fldq1INJTObcAWVJl",
  endTimeLocal: "fldLed5vuLGmew0g4",
  priority: "flddWP3oD26iyic5d",
  status: "fldBpmlW8aO9AhDhX",
  requiresPerApproval: "fldlqnCByGm0rRypA",
  sourceActorType: "fldlSuF1vNPbZzqXW",
  sourcePartnerRef: "fldddYtvJbLgGSp8k",
  changeReason: "fldfcGGnnfgneFXCi",
  updatedBy: "fldElUophZssF3426",
  updatedAt: "fldexo1B74IGqbppn",
  notifyStatus: "fldpO3fYqBuM4rXY9",
  reviewedBy: "fldMNxut21hZCdFlR",
  reviewedAt: "fldzskaZcXGPhr8YT",
  version: "fldCMjmjsPImiCUDY"
} as const;

const MODELS = {
  workingName: "fldShiT60bmCxFxRu",
  nickname: "fld0maFkh4NHpsPxA",
  uniqueKey: "fldYvAbkENGQ4NaaI",
  status: "fldRcAE3bL8dKmURH",
  profilePhoto: "fldXWXqa3bnAgxN4Y",
  publicImageUrl: "fldC94pnSJxBsyAqS",
  heightCm: "fldIPz4nPoPvkIoK9",
  weightKg: "fldg1pTc20guk9WSY",
  skillsSummary: "fld8J3iaSiUfcBEwa",
  experienceSummary: "fldBfRNcEArZ7ninU",
  availabilityStatus: "fld6RuUDmGcGDc34i",
  availableNow: "fldwMpYGpA5RvC76m"
} as const;

const MODEL_OFFER_RULES = {
  client: "fldfTPnoIburvJLjx",
  clientIdentityKey: "fldfMAUujiQoeyvdv",
  ruleKey: "fld0GTefOf9VSdTpU",
  model: "fldrvoIfq0sMWR70V",
  modelKey: "fldHlkHRqPr5e8pkn",
  offerType: "fldt5djzxVFQz43za",
  requiresPerApproval: "fldlqnCByGm0rRypA",
  priceVisibility: "fldiLyM0oyHVR6e2j",
  status: "fldBpmlW8aO9AhDhX",
  internalOnly: "fldC5I6dm2h3JKkPf",
  reviewedBy: "fldMNxut21hZCdFlR",
  reviewedAt: "fldzskaZcXGPhr8YT",
  version: "fldCMjmjsPImiCUDY",
  audienceScope: "fldVfrqaEkgI2uf5w",
  partnerSourceRateThb: "fldbgFiaSm4pWY9qU",
  customerSellRateThb: "fldSL0hGadzsxxvRu",
  salesVisibility: "fldgc3dV6wWVTcu7c",
  scheduleType: "fldugUjwgRWbJGkpV",
  effectiveFromAt: "fldeJNUOSiHlEjUSh",
  effectiveUntilAt: "fldA4RxTfDNGlvgoe",
  daysOfWeek: "fldAFAhdX7YiiDDbg",
  startTimeLocal: "fldq1INJTObcAWVJl",
  endTimeLocal: "fldLed5vuLGmew0g4",
  priority: "flddWP3oD26iyic5d",
  sourceActorType: "fldlSuF1vNPbZzqXW",
  sourcePartnerRef: "fldddYtvJbLgGSp8k",
  changeReason: "fldfcGGnnfgneFXCi",
  updatedBy: "fldElUophZssF3426",
  updatedAt: "fldexo1B74IGqbppn",
  notifyStatus: "fldpO3fYqBuM4rXY9",
  notifyError: "fldTaTet5ErLVe50L"
} as const;

const PARTNER_SALES_AUDIENCES = new Set([
  "Public Member", "Elite", "Red Card", "Standard", "Premium", "VIP / Black Card", "SVIP", "Per Review"
]);
const PARTNER_SALES_SCHEDULES = new Set(["Always", "Date range", "Date + time range", "Weekly recurring"]);
const PARTNER_SALES_VISIBILITY = new Set(["on", "off"]);
const PARTNER_SALES_DAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);

const PARTNER_WORKING_SYSTEMS = new Set(["bridge", "co_partner", "profit_share"]);
type PartnerWorkingSystem = "bridge" | "co_partner" | "profit_share";

const WEBFLOW_PARTNER_FORM_ORIGIN = "https://mmdprive.webflow.io";
const WEBFLOW_PARTNER_FORM_SCRIPT_URL =
  "https://partners-worker.malemodel-bkk.workers.dev/webflow-sigil-partner-form.js";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const runtimeEnv = env as RuntimeEnv;
    const url = new URL(request.url);

    try {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders(request, runtimeEnv) });
      }

      if ((request.method === "GET" || request.method === "HEAD") && isLegacyTermsPage(url)) {
        const target = new URL(request.url);
        target.hostname = "www.mmdbkk.com";
        target.pathname = "/partner/terms";
        return Response.redirect(target.toString(), 302);
      }

      if ((request.method === "GET" || request.method === "HEAD") && isPartnerWebflowPage(url)) {
        return await handlePartnerWebflowPage(request, url);
      }

      if (request.method === "GET" && url.pathname === "/health") {
        return json(request, runtimeEnv, {
          ok: true,
          service: "partners-worker",
          control_layer: ROLE_LAYERS.partner_control,
          analytics: authorityRuntimeHealth(runtimeEnv, "partners-worker", ctx)
        });
      }

      if (
        request.method === "GET" &&
        (url.pathname === "/webflow-sigil-partner-form.js" ||
          url.pathname === "/assets/webflow-sigil-partner-form.js")
      ) {
        return javascriptResponse(WEBFLOW_SIGIL_PARTNER_FORM_JS);
      }

      if (request.method === "POST" && url.pathname === "/v1/partner/line/exchange") return await handlePartnerLineExchange(request, runtimeEnv);
      if (["GET", "HEAD"].includes(request.method) && url.pathname === "/v1/partner/line/login") {
        return new Response(null, { status: 302, headers: { Location: PARTNER_LINE_LOGIN_URL, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
      }
      if (["GET", "HEAD"].includes(request.method) && url.pathname === "/sigil/model/dashboard/partner-login") {
        return new Response(request.method === "HEAD" ? null : PARTNER_LINE_LOGIN, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY" } });
      }
      if (request.method === "POST" && url.pathname === "/v1/partner/upload") {
        return await handlePartnerUpload(request, runtimeEnv);
      }

      if (request.method === "POST" && url.pathname === "/v1/partner/request") {
        return await handlePartnerRequest(request, runtimeEnv, ctx);
      }

      if (
        request.method === "POST" &&
        (url.pathname === "/v1/apply/public-model" || url.pathname === "/apply/public-model")
      ) {
        return await handlePublicModelApplication(request, runtimeEnv, ctx);
      }

      if (request.method === "GET" && url.pathname === "/v1/partner/verify") {
        return await handlePartnerVerify(request, runtimeEnv);
      }

      if (request.method === "GET" && url.pathname === "/v1/partner/dashboard") {
        return await handlePartnerDashboard(request, runtimeEnv);
      }

      if (request.method === "POST" && url.pathname === "/v1/partner/telegram/connect") {
        return await handlePartnerTelegramConnect(request, runtimeEnv);
      }

      if (request.method === "POST" && url.pathname === "/v1/partner/sales/proposal") {
        return await handlePartnerSalesProposal(request, runtimeEnv);
      }

      if (request.method === "POST" && url.pathname === "/v1/partner/models/change") {
        return await handlePartnerModelChange(request, runtimeEnv);
      }
      if (request.method === "GET" && url.pathname === "/v1/partner/admin/model-changes/asset") return await handleOwnerPartnerImage(request, runtimeEnv);
      if (request.method === "GET" && url.pathname === "/v1/partner/public-model-image") return await handlePublicPartnerImage(request, runtimeEnv);
      if (request.method === "GET" && url.pathname === "/v1/partner/admin/model-changes") return await handleAdminModelChangeQueue(request, runtimeEnv);
      if (request.method === "POST" && url.pathname === "/v1/partner/admin/model-changes/decision") return await serializeOwnerMutation(request, runtimeEnv, () => handleAdminModelChangeDecision(request, runtimeEnv));

      if (request.method === "POST" && url.pathname === "/v1/partner/working-system") {
        return await handlePartnerWorkingSystemChange(request, runtimeEnv);
      }

      if (request.method === "GET" && url.pathname === "/v1/partner/admin/working-systems") {
        return await handleAdminWorkingSystemQueue(request, runtimeEnv);
      }

      if (request.method === "POST" && url.pathname === "/v1/partner/admin/working-systems/decision") {
        return await serializeOwnerMutation(request, runtimeEnv, () => handleAdminWorkingSystemDecision(request, runtimeEnv, ctx));
      }

      if (request.method === "GET" && url.pathname === "/v1/partner/admin/settlements") return await handleAdminPartnerSettlementQueue(request, runtimeEnv);
      if (request.method === "POST" && url.pathname === "/v1/partner/admin/agreement/capture") return await serializeOwnerMutation(request, runtimeEnv, () => handleAdminPartnerAgreementCapture(request, runtimeEnv));
      if (request.method === "POST" && url.pathname === "/v1/partner/admin/settlement/approve") return await serializeOwnerMutation(request, runtimeEnv, () => handleAdminPartnerSettlementSnapshot(request, runtimeEnv));

      if (request.method === "POST" && url.pathname === "/v1/partner/admin/ledger/materialize") {
        return await serializeOwnerMutation(request, runtimeEnv, () => handleAdminPartnerLedgerMaterialize(request, runtimeEnv, ctx));
      }

      if (request.method === "GET" && url.pathname === "/v1/partner/admin/ledger") {
        return await handleAdminPartnerLedgerQueue(request, runtimeEnv);
      }

      if (request.method === "POST" && url.pathname === "/v1/partner/admin/ledger/action") {
        return await serializeOwnerMutation(request, runtimeEnv, () => handleAdminPartnerLedgerAction(request, runtimeEnv, ctx));
      }

      if (request.method === "POST" && url.pathname === "/v1/partner/models/upload") {
        return await handlePartnerModelUpload(request, runtimeEnv);
      }

      if (request.method === "GET" && url.pathname === "/v1/partner/models/assets") {
        return await handlePartnerAssets(request, runtimeEnv);
      }
      if (request.method === "GET" && url.pathname === "/v1/partner/models/asset") {
        return await handlePartnerAssetRead(request, runtimeEnv);
      }

      if (request.method === "POST" && url.pathname === "/v1/partner/jobs/action") {
        return await handlePartnerJobAction(request, runtimeEnv);
      }

      if (request.method === "GET" && url.pathname === "/v1/partner/private-vault") {
        return await handlePartnerPrivateVaultGet(request, runtimeEnv);
      }

      if (request.method === "POST" && url.pathname === "/v1/partner/private-vault") {
        return await handlePartnerPrivateVaultPut(request, runtimeEnv);
      }

      if (request.method === "POST" && url.pathname === "/__internal/partner-job-confirm") {
        return await handlePartnerJobConfirmInternal(request, runtimeEnv);
      }

      if (request.method === "POST" && url.pathname === "/v1/partner/accept-terms") {
        return await handleAcceptTerms(request, runtimeEnv, ctx);
      }

      if (request.method === "POST" && url.pathname === "/v1/partner/approve") {
        return await handlePartnerApprove(request, runtimeEnv, ctx);
      }

      return errorResponse(request, runtimeEnv, "not_found", "Endpoint not found.", 404, false);
    } catch (error) {
      console.error("partners-worker fatal", error);
      return errorResponse(
        request,
        runtimeEnv,
        "internal_error",
        getErrorMessage(error) || "Internal error",
        500,
        true
      );
    }
  }
} satisfies ExportedHandler<Env>;

function corsHeaders(request: Request, env: RuntimeEnv): Headers {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Idempotency-Key",
    "Vary": "Origin"
  });

  const origin = request.headers.get("Origin") || "";
  const allowed = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (origin && allowed.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
  }

  return headers;
}

function json(request: Request, env: RuntimeEnv, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: corsHeaders(request, env)
  });
}

function javascriptResponse(source: string): Response {
  return new Response(source, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300"
    }
  });
}

function isPartnerWebflowPage(url: URL): boolean {
  if (url.hostname !== "www.mmdbkk.com") return false;
  return ["/partner/form", "/partner/form/", "/partner/terms", "/partner/terms/"].includes(url.pathname);
}

function isLegacyTermsPage(url: URL): boolean {
  const isTargetHost = url.hostname === "www.mmdbkk.com" || url.hostname === "mmdbkk.com";
  return isTargetHost && ["/terms", "/terms/", "/legal/terms", "/legal/terms/"].includes(url.pathname);
}

async function handlePartnerWebflowPage(request: Request, url: URL): Promise<Response> {
  const upstreamUrl = new URL(url.pathname + url.search, WEBFLOW_PARTNER_FORM_ORIGIN);
  const upstreamRequest = new Request(upstreamUrl.toString(), request);
  const upstreamResponse = await fetch(upstreamRequest);

  if (request.method === "HEAD") {
    return upstreamResponse;
  }

  const contentType = upstreamResponse.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("text/html")) {
    return upstreamResponse;
  }

  const source = await upstreamResponse.text();
  const scriptTag = `<script defer src="${WEBFLOW_PARTNER_FORM_SCRIPT_URL}"></script>`;
  const html = source.includes(WEBFLOW_PARTNER_FORM_SCRIPT_URL)
    ? source
    : source.replace(/<\/body>/i, `${scriptTag}</body>`);

  const headers = new Headers(upstreamResponse.headers);
  headers.delete("Content-Encoding");
  headers.delete("Content-Length");
  headers.delete("ETag");
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  headers.set("X-MMD-Partner-Bridge", "edge");

  return new Response(html, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers
  });
}

function errorResponse(
  request: Request,
  env: RuntimeEnv,
  code: string,
  message: string,
  status: number,
  retryable = false
): Response {
  return json(
    request,
    env,
    {
      ok: false,
      error: { code, message, status, retryable },
      meta: requestMeta()
    },
    status
  );
}

function requestMeta(): { request_id: string; ts: string } {
  return {
    request_id: `req_${crypto.randomUUID()}`,
    ts: new Date().toISOString()
  };
}

async function handlePartnerUpload(request: Request, env: RuntimeEnv): Promise<Response> {
  const assetBucket = (env as RuntimeEnv & { PARTNER_ASSETS?: R2Bucket }).PARTNER_ASSETS;
  if (!assetBucket) {
    return errorResponse(request, env, "uploads_unavailable", "File uploads are not enabled right now.", 503, true);
  }

  if (!request.headers.get("Content-Type")?.includes("multipart/form-data")) {
    return errorResponse(request, env, "invalid_content_type", "Expected multipart FormData.", 400, false);
  }

  const form = await request.formData();
  const rawRequestId = stringFromForm(form.get("request_id"));
  const requestId = rawRequestId ? validateRequestId(rawRequestId) : generateRequestId();
  if (!requestId) {
    return errorResponse(request, env, "invalid_request_id", "request_id must use prq_YYYYMMDD_xxxxxx format.", 400, false);
  }

  const rawCategory = stringFromForm(form.get("file_category")) || "other";
  const fileCategory = parseFileCategory(rawCategory);
  if (!fileCategory) {
    return errorResponse(request, env, "invalid_file_category", "Unsupported file_category.", 400, false);
  }

  const fileValue = form.get("file");
  if (!(fileValue instanceof File)) {
    return errorResponse(request, env, "file_missing", "A file field is required.", 400, false);
  }

  if (!ALLOWED_MIME_TYPES.has(fileValue.type)) {
    return errorResponse(request, env, "unsupported_file_type", "Only JPG, PNG, WebP, and PDF files are allowed.", 415, false);
  }

  if (fileValue.size > MAX_UPLOAD_SIZE) {
    return errorResponse(request, env, "file_too_large", "Maximum upload size is 20MB per file.", 413, false);
  }

  const r2Key = buildR2Key(requestId, fileValue.name);
  await assetBucket.put(r2Key, fileValue.stream(), {
    httpMetadata: { contentType: fileValue.type },
    customMetadata: {
      request_id: requestId,
      file_category: fileCategory,
      file_name: fileValue.name
    }
  });

  return json(request, env, {
    ok: true,
    request_id: requestId,
    r2_key: r2Key,
    file_name: fileValue.name,
    file_type: fileValue.type,
    file_size: fileValue.size,
    file_category: fileCategory
  });
}

async function handlePartnerRequest(request: Request, env: RuntimeEnv, ctx: ExecutionContext): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body.ok) {
    return errorResponse(request, env, "invalid_json", body.error, 400, false);
  }

  const requestId = resolveRequestId(body.value);
  const nameAlias = readString(body.value, "name_alias");
  const accessSource = parseAccessSource(readString(body.value, "access_source"));
  const valueBring = readString(body.value, "value_bring");
  const whyConsider = readString(body.value, "why_consider");
  const contact = readString(body.value, "contact");
  const experience = readString(body.value, "experience");
  const talentName = readString(body.value, "talent_name");
  const talentType = parseTalentType(readString(body.value, "talent_type"));
  const portfolioUrl = readString(body.value, "portfolio_url");
  const talentLocation = readString(body.value, "talent_location");
  const talentDetails = readString(body.value, "talent_details");
  const sourcePath = readString(body.value, "source_path") || "/partner/form";
  const files = normalizeUploadedFiles(body.value.files, requestId);

  if (!nameAlias || !accessSource || !valueBring || !whyConsider || !contact) {
    return errorResponse(
      request,
      env,
      "required_fields_missing",
      "name_alias, access_source, value_bring, why_consider, and contact are required.",
      400,
      false
    );
  }

  if (files.length > MAX_FILES_PER_REQUEST) {
    return errorResponse(request, env, "too_many_files", "Maximum 10 files per partner request.", 400, false);
  }

  const now = new Date().toISOString();
  const score = computePartnerScore(body.value, files);
  const contactParts = parseContact(contact);

  const partnerFields = buildPartnerFields({
    requestId,
    nameAlias,
    accessSource,
    valueBring,
    whyConsider,
    contact,
    contactParts,
    experience,
    talentName,
    talentType,
    portfolioUrl,
    talentLocation,
    talentDetails,
    sourcePath,
    files,
    score,
    now
  });

  const partnerRecord = await createPartnerRecord(env, partnerFields);

  const shouldCreateModelApplication =
    Boolean(talentName || talentType || portfolioUrl || talentLocation || talentDetails) || files.length > 0;
  const modelApplicationRecord = shouldCreateModelApplication
    ? await createAirtableRecord(
        env,
        env.AIRTABLE_TABLE_MODEL_APPLICATIONS,
        buildModelApplicationFields({
          requestId,
          nameAlias,
          accessSource,
          contact,
          contactParts,
          talentName,
          talentType,
          portfolioUrl,
          talentLocation,
          talentDetails,
          sourcePath,
          now
        }),
        true
      )
    : null;

  const shouldCreateReferral = shouldCreateModelApplication || Boolean(portfolioUrl);
  const referralRecord = shouldCreateReferral
    ? await createAirtableRecord(
        env,
        env.AIRTABLE_TABLE_MODEL_REFERRALS,
        buildReferralFields({
          requestId,
          partnerRecordId: partnerRecord.id,
          accessSource,
          portfolioUrl,
          talentName,
          talentType,
          talentLocation,
          talentDetails,
          now
        }),
        true
      )
    : null;

  const assetRecords: AirtableRecord[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    if (!file) continue;

    const fields = buildAssetFields({
      requestId,
      index,
      file,
      partnerRecordId: partnerRecord.id,
      referralRecordId: referralRecord?.id || null,
      modelApplicationRecordId: modelApplicationRecord?.id || null,
      talentName,
      talentType,
      portfolioUrl,
      sourcePath,
      now,
      bucketName: env.PARTNER_ASSETS_BUCKET_NAME
    });
    assetRecords.push(await createAirtableRecord(env, env.AIRTABLE_TABLE_PARTNER_ASSETS, fields, true));
  }

  ctx.waitUntil(
    sendTelegramMessage(env, buildNewRequestTelegramMessage({
      nameAlias,
      accessSource,
      contact,
      talentName,
      talentType,
      score,
      files,
      whyConsider,
      partnerRecordId: partnerRecord.id
    })).catch((error) => console.error("telegram new request failed", error))
  );

  return json(request, env, {
    ok: true,
    request_id: requestId,
    partner_record_id: partnerRecord.id,
    model_application_record_id: modelApplicationRecord?.id || null,
    referral_record_id: referralRecord?.id || null,
    asset_record_ids: assetRecords.map((record) => record.id),
    review_url: env.REVIEW_URL
  });
}

async function handlePublicModelApplication(
  request: Request,
  env: RuntimeEnv,
  ctx: ExecutionContext
): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body.ok) {
    return errorResponse(request, env, "invalid_json", body.error, 400, false);
  }

  const requestId = resolveRequestId(body.value);
  const nameAlias = readString(body.value, "name_alias");
  const talentName = readString(body.value, "talent_name") || nameAlias;
  const age = readNumberOrNull(body.value, "age");
  const talentLocation = readString(body.value, "talent_location");
  const identity = readString(body.value, "identity");
  const lineId = readString(body.value, "line_id");
  const phone = readString(body.value, "phone");
  const email = readString(body.value, "email");
  const portfolioUrl = readString(body.value, "portfolio_url");
  const height = readString(body.value, "height");
  const bodyProfile = readString(body.value, "body_profile");
  const workTypes = readStringArray(body.value, "work_types").length
    ? readStringArray(body.value, "work_types")
    : readStringArray(body.value, "work_type");
  const skills = readString(body.value, "skills");
  const availability = readString(body.value, "availability");
  const travelReady = readString(body.value, "travel_ready");
  const boundaries = readString(body.value, "boundaries");
  const whyConsider = readString(body.value, "why_consider");
  const extraNotes = readString(body.value, "notes");
  const consent = body.value.consent === true || readString(body.value, "consent") === "true";
  const sourcePath = readString(body.value, "source_path") || "/apply/public-model";
  const files = normalizeUploadedFiles(body.value.files, requestId);

  if (!nameAlias || !identity || !skills || !whyConsider) {
    return errorResponse(
      request,
      env,
      "required_fields_missing",
      "name_alias, identity, skills, and why_consider are required.",
      400,
      false
    );
  }

  if (!lineId && !phone && !email) {
    return errorResponse(
      request,
      env,
      "contact_missing",
      "At least one contact channel (line_id, phone, or email) is required.",
      400,
      false
    );
  }

  if (!consent) {
    return errorResponse(request, env, "consent_required", "Privacy consent is required.", 400, false);
  }

  if (age !== null && (age < 18 || age > 70)) {
    return errorResponse(request, env, "invalid_age", "Applicants must be between 18 and 70.", 400, false);
  }

  if (files.length > MAX_FILES_PER_REQUEST) {
    return errorResponse(request, env, "too_many_files", "Maximum 10 files per application.", 400, false);
  }

  const now = new Date().toISOString();
  const contact = [
    lineId ? `LINE: ${lineId}` : "",
    phone ? `Phone/WhatsApp: ${phone}` : "",
    email ? `Email: ${email}` : ""
  ].filter(Boolean).join(" | ");

  const applicationRecord = await createAirtableRecord(
    env,
    env.AIRTABLE_TABLE_MODEL_APPLICATIONS,
    buildPublicModelApplicationFields({
      requestId,
      nameAlias,
      talentName,
      age,
      talentLocation,
      identity,
      contact,
      portfolioUrl,
      height,
      bodyProfile,
      workTypes,
      skills,
      availability,
      travelReady,
      boundaries,
      whyConsider,
      extraNotes,
      sourcePath,
      files,
      now
    }),
    true
  );

  ctx.waitUntil(
    sendTelegramMessage(env, buildPublicModelTelegramMessage({
      nameAlias,
      talentName,
      age,
      height,
      talentLocation,
      contact,
      workTypes,
      files,
      whyConsider,
      applicationRecordId: applicationRecord.id
    }), "public_model").catch((error) => console.error("telegram public model application failed", error))
  );

  return json(request, env, {
    ok: true,
    request_id: requestId,
    model_application_record_id: applicationRecord.id,
    files_received: files.length
  });
}

async function handlePartnerApprove(request: Request, env: RuntimeEnv, ctx: ExecutionContext): Promise<Response> {
  const expectedAdminSecret = String(env.ADMIN_APPROVE_SECRET || env.TOKEN_SECRET || "").trim();
  const explicitAdminSecret = String(request.headers.get("x-mmd-admin-secret") || "").trim();
  const authorization = String(request.headers.get("authorization") || "").trim();
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
  const suppliedAdminSecret = explicitAdminSecret || String(bearerMatch?.[1] || "").trim();

  if (!expectedAdminSecret) {
    return errorResponse(request, env, "admin_auth_unavailable", "Partner approval authority is not configured.", 503, false);
  }
  if (!suppliedAdminSecret) {
    return errorResponse(request, env, "admin_auth_required", "Partner approval requires admin authorization.", 401, false);
  }
  if (!constantTimeStringEqual(suppliedAdminSecret, expectedAdminSecret)) {
    return errorResponse(request, env, "admin_auth_invalid", "Partner approval authorization is invalid.", 403, false);
  }

  const body = await readJsonObject(request);
  if (!body.ok) {
    return errorResponse(request, env, "invalid_json", body.error, 400, false);
  }

  const partnerRecordId = readString(body.value, "partner_record_id");
  const action = parseApprovalAction(readString(body.value, "action"));
  const note = readString(body.value, "note");

  if (!partnerRecordId || !action) {
    return errorResponse(request, env, "invalid_approval_request", "partner_record_id and a valid action are required.", 400, false);
  }

  const existing = await getAirtableRecord(env, env.AIRTABLE_TABLE_MODEL_PARTNERS, partnerRecordId);
  const now = new Date().toISOString();
  const updateFields: AirtableFields = {
    [MODEL_PARTNERS.approvalStatus]: action
  };

  const previousNotes = fieldText(existing, MODEL_PARTNERS.notesInternal);
  if (note) {
    updateFields[MODEL_PARTNERS.notesInternal] = appendNote(previousNotes, `[${now}] Approval ${action}: ${note}`);
  }

  let token = "";
  let termsUrl = "";
  let dashboardUrl = "";

  if (action === "recognized") {
    token = await generatePartnerToken(env, partnerRecordId);
    const tokenHash = await sha256Hex(token);
    updateFields[MODEL_PARTNERS.status] = "Active";
    updateFields[MODEL_PARTNERS.accessTokenHash] = tokenHash;
    updateFields[MODEL_PARTNERS.onboardedAt] = now;
    termsUrl = `${env.TERMS_URL}?t=${encodeURIComponent(token)}`;
    dashboardUrl = `${env.DASHBOARD_URL}?t=${encodeURIComponent(token)}`;
  }

  const updatedRecord = await updateAirtableRecord(
    env,
    env.AIRTABLE_TABLE_MODEL_PARTNERS,
    partnerRecordId,
    updateFields,
    true
  );

  ctx.waitUntil(
    sendTelegramMessage(env, buildApprovalTelegramMessage({
      partnerRecord: updatedRecord,
      action,
      note,
      termsUrl,
      dashboardUrl
    })).catch((error) => console.error("telegram approval failed", error))
  );

  return json(request, env, {
    ok: true,
    partner_record_id: partnerRecordId,
    action,
    ...(action === "recognized" ? { terms_url: termsUrl, dashboard_url: dashboardUrl } : {})
  });
}

async function handlePartnerVerify(request: Request, env: RuntimeEnv): Promise<Response> {
  const verified = await verifyPartnerTokenFromRequest(request, env);
  if (!verified.ok) return verified.response;

  const partnerRecord = verified.value.partnerRecord;
  return json(request, env, {
    ok: true,
    control_layer: ROLE_LAYERS.partner_control,
    partner_id: partnerRecord.id,
    partner_name: fieldText(partnerRecord, MODEL_PARTNERS.partnerName) || fieldText(partnerRecord, MODEL_PARTNERS.displayName) || "SĪGIL Partner",
    terms_accepted: Boolean(
      fieldText(partnerRecord, MODEL_PARTNERS.agreementVersion) &&
      fieldText(partnerRecord, MODEL_PARTNERS.agreementAcceptedAt)
    )
  });
}

async function handleAcceptTerms(request: Request, env: RuntimeEnv, ctx: ExecutionContext): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body.ok) {
    return errorResponse(request, env, "invalid_json", body.error, 400, false);
  }

  const token = readString(body.value, "t");
  if (!token) {
    return errorResponse(request, env, "token_missing", "Token t is required.", 401, false);
  }

  const verified = await verifyPartnerToken(request, env, token);
  if (!verified.ok) return verified.response;

  const agreementVersion = readString(body.value, "agreement_version") || "partner_terms_v1.0";
  const acceptedAt = normalizeIsoDate(readString(body.value, "accepted_at")) || new Date().toISOString();
  const sourcePath = readString(body.value, "source_path") || env.TERMS_URL;

  const updatedRecord = await updateAirtableRecord(
    env,
    env.AIRTABLE_TABLE_MODEL_PARTNERS,
    verified.value.partnerRecord.id,
    {
      [MODEL_PARTNERS.agreementVersion]: agreementVersion,
      [MODEL_PARTNERS.agreementAcceptedAt]: acceptedAt,
      [MODEL_PARTNERS.agreementUrl]: `${publicSiteBase(env)}${sourcePath}`,
      [MODEL_PARTNERS.status]: "Active"
    },
    true
  );

  queueAuthorityEvent(ctx, env, {
    event: "partner_terms_accepted",
    authority: "partners-worker",
    scope: "partner",
    distinctValue: updatedRecord.id,
    insertValue: `${updatedRecord.id}:${agreementVersion}`,
    properties: {
      surface: "partner",
      flow: "partner_onboarding",
      world: "partner",
      terms_version: agreementVersion,
      status: "active",
    },
  });

  ctx.waitUntil(
    sendTelegramMessage(env, [
      "SIGIL TERMS ACCEPTED",
      "",
      `Partner: ${fieldText(updatedRecord, MODEL_PARTNERS.partnerName) || updatedRecord.id}`,
      `Version: ${agreementVersion}`,
      `Accepted At: ${acceptedAt}`
    ].join("\n"), "partner_confirm").catch((error) => console.error("telegram terms failed", error))
  );

  return json(request, env, {
    ok: true,
    dashboard_url: `${env.DASHBOARD_URL}?t=${encodeURIComponent(token)}`
  });
}

async function handlePartnerDashboard(request: Request, env: RuntimeEnv): Promise<Response> {
  const verified = await verifyPartnerTokenFromRequest(request, env);
  if (!verified.ok) return verified.response;

  const partnerRecord = verified.value.partnerRecord;
  const partnerId = fieldText(partnerRecord, MODEL_PARTNERS.partnerId) || "";
  const telegramConnected = partnerHasVerifiedTelegram(partnerRecord);
  const [referrals, commissions, partnerSalesRules, modelChanges, sessions] = await Promise.all([
    listLinkedRecordsForPartner(env, env.AIRTABLE_TABLE_MODEL_REFERRALS, MODEL_REFERRALS.partner, partnerRecord.id, partnerId),
    listLinkedRecordsForPartner(env, env.AIRTABLE_TABLE_PARTNER_COMMISSIONS, PARTNER_COMMISSIONS.partner, partnerRecord.id, partnerId),
    listPartnerSalesRules(env, partnerRecord.id),
    listPartnerModelChanges(env, partnerRecord.id, partnerId),
    listPartnerSessions(env, partnerId)
  ]);

  const modelIds = new Set<string>();
  for (const referral of referrals) {
    for (const modelId of fieldLinkIds(referral, MODEL_REFERRALS.model)) modelIds.add(modelId);
  }
  for (const commission of commissions) {
    for (const modelId of fieldLinkIds(commission, PARTNER_COMMISSIONS.model)) modelIds.add(modelId);
  }

  const modelMap = await fetchRecordMap(env, env.AIRTABLE_TABLE_MODELS, [...modelIds]);
  const normalizedReferrals = referrals.map((record) => normalizeReferral(record, modelMap));
  const normalizedCommissions = commissions.map((record) => normalizeCommission(record, modelMap));
  const finance = buildPartnerFinanceSnapshot(partnerRecord, normalizedCommissions);
  const financeRows = Array.isArray(finance.rows) ? finance.rows as Array<Record<string, unknown> & { commission: number; status: string }> : normalizedCommissions;
  const salesControls = buildPartnerSalesControls(referrals, modelMap, partnerSalesRules, partnerRecord.id);
  const normalizedChanges = modelChanges.map(normalizePartnerModelChange);
  const normalizedModels = buildPartnerModelProfiles(referrals, modelMap, salesControls, normalizedChanges);
  const verifiedSessionIds = await officiallyVerifiedPartnerSessions(env, sessions);
  const normalizedJobs = sessions.map((session) => normalizePartnerSession(session, verifiedSessionIds.has(fieldText(session, SESSION_FIELDS.sessionId) || "")));

  const activeModels = new Set(
    referrals
      .filter((record) => !["inactive", "revoked", "transferred"].includes(normalizeStatus(fieldText(record, MODEL_REFERRALS.ownershipStatus))))
      .flatMap((record) => fieldLinkIds(record, MODEL_REFERRALS.model))
      .filter(Boolean)
  ).size;

  const canonicalFinanceRows = financeRows.filter((commission) => commission.integrity_state !== "reconciliation_required");
  const pendingAmount = canonicalFinanceRows
    .filter((commission) => ["earned", "approved", "ready", "pending"].includes(String(commission.status)))
    .reduce((sum, commission) => sum + Number(commission.commission || 0), 0);
  const paidAmount = canonicalFinanceRows
    .filter((commission) => isPaidStatus(String(commission.status || "")))
    .reduce((sum, commission) => sum + Number(commission.commission || 0), 0);

  return json(request, env, {
    ok: true,
    control_layer: ROLE_LAYERS.partner_control,
    partner: {
      id: partnerRecord.id,
      name: fieldText(partnerRecord, MODEL_PARTNERS.partnerName) || fieldText(partnerRecord, MODEL_PARTNERS.displayName) || "SĪGIL Partner",
      telegram_connected: telegramConnected,
      telegram_optional: true,
      telegram_required_for_job_response: false,
      job_response_ready: true,
      telegram_username: telegramConnected ? fieldText(partnerRecord, MODEL_PARTNERS.telegramUsername) || null : null,
      terms_accepted: Boolean(fieldText(partnerRecord, MODEL_PARTNERS.agreementVersion) && fieldText(partnerRecord, MODEL_PARTNERS.agreementAcceptedAt)),
      terms_version: fieldText(partnerRecord, MODEL_PARTNERS.agreementVersion),
      terms_accepted_at: fieldText(partnerRecord, MODEL_PARTNERS.agreementAcceptedAt)
    },
    summary: {
      tier: fieldText(partnerRecord, MODEL_PARTNERS.tier) || "Trusted",
      activeModels,
      upcomingJobs: normalizedJobs.filter((job) => !["completed", "cancelled", "declined"].includes(normalizeStatus(String(job.lifecycle_status || job.status || "")))).length,
      pendingAmount,
      paidAmount
    },
    history: { complete: true, generated_at: new Date().toISOString() },
    referrals: normalizedReferrals,
    commissions: financeRows,
    finance,
    models: normalizedModels,
    model_changes: normalizedChanges,
    jobs: normalizedJobs,
    sales_controls: salesControls,
    privacy: {
      default_scope: "partner_private",
      partner_private_storage: "client_side_encrypted_vault",
      mmd_plaintext_access: false,
      shared_with_mmd_requires_explicit_consent: true
    }
  });
}


async function handlePartnerSalesProposal(request: Request, env: RuntimeEnv): Promise<Response> {
  const verified = await verifyPartnerTokenFromRequest(request, env);
  if (!verified.ok) return verified.response;

  const body = await readJsonObject(request);
  if (!body.ok) return errorResponse(request, env, "invalid_json", body.error, 400, false);
  if (body.value.share_with_mmd !== true) return errorResponse(request, env, "explicit_share_required", "Confirm sharing this proposal with MMD.", 400, false);

  const modelRecordId = readString(body.value, "model_record_id");
  if (!/^rec[A-Za-z0-9]{14,24}$/.test(modelRecordId)) {
    return errorResponse(request, env, "model_record_id_invalid", "A canonical linked model is required.", 400, false);
  }

  const referrals = await listLinkedRecordsForPartner(
    env,
    env.AIRTABLE_TABLE_MODEL_REFERRALS,
    MODEL_REFERRALS.partner,
    verified.value.partnerRecord.id,
    fieldText(verified.value.partnerRecord, MODEL_PARTNERS.partnerId) || ""
  );
  const ownsModel = referrals.some((record) => fieldLinkIds(record, MODEL_REFERRALS.model).includes(modelRecordId));
  if (!ownsModel) {
    return errorResponse(request, env, "partner_model_scope_forbidden", "This model is outside the Partner relationship scope.", 403, false);
  }

  const model = await getAirtableRecord(env, env.AIRTABLE_TABLE_MODELS, modelRecordId);
  const modelName = fieldText(model, MODELS.workingName) || fieldText(model, MODELS.nickname) || modelRecordId;
  const modelKey = fieldText(model, MODELS.uniqueKey) || modelRecordId;
  const partnerSourceRate = Number(body.value.partner_source_rate_thb);
  if (!Number.isFinite(partnerSourceRate) || partnerSourceRate < 0 || partnerSourceRate > 1000000) {
    return errorResponse(request, env, "partner_source_rate_invalid", "Partner source rate must be a valid THB amount.", 400, false);
  }
  const customerSellRate = Number(body.value.customer_sell_rate_thb);
  if (!Number.isFinite(customerSellRate) || customerSellRate < 0 || customerSellRate > 2000000) {
    return errorResponse(request, env, "customer_sell_rate_invalid", "Requested customer sell rate must be a valid THB amount.", 400, false);
  }
  if (customerSellRate < partnerSourceRate) {
    return errorResponse(request, env, "sell_rate_below_source_rate", "Requested customer sell rate cannot be below the Partner source rate.", 400, false);
  }

  const salesVisibility = readString(body.value, "sales_visibility").toLowerCase() || "off";
  if (!PARTNER_SALES_VISIBILITY.has(salesVisibility)) {
    return errorResponse(request, env, "sales_visibility_invalid", "Unsupported sales visibility.", 400, false);
  }

  const rawAudiences = Array.isArray(body.value.audience_scope) ? body.value.audience_scope : [];
  const audiences = [...new Set(rawAudiences.map((value) => String(value || "").trim()).filter(Boolean))];
  if (!audiences.length || audiences.some((value) => !PARTNER_SALES_AUDIENCES.has(value))) {
    return errorResponse(request, env, "audience_scope_invalid", "Choose one or more approved customer audiences.", 400, false);
  }

  const scheduleType = readString(body.value, "schedule_type") || "Always";
  if (!PARTNER_SALES_SCHEDULES.has(scheduleType)) {
    return errorResponse(request, env, "schedule_type_invalid", "Unsupported schedule type.", 400, false);
  }

  const rawDays = Array.isArray(body.value.days_of_week) ? body.value.days_of_week : [];
  const days = [...new Set(rawDays.map((value) => String(value || "").trim()).filter(Boolean))];
  if (days.some((value) => !PARTNER_SALES_DAYS.has(value))) {
    return errorResponse(request, env, "days_of_week_invalid", "Unsupported schedule day.", 400, false);
  }
  if (scheduleType === "Weekly recurring" && !days.length) {
    return errorResponse(request, env, "days_of_week_required", "Weekly recurring rules require at least one day.", 400, false);
  }

  const startTimeLocal = readString(body.value, "start_time_local");
  const endTimeLocal = readString(body.value, "end_time_local");
  if ((startTimeLocal && !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTimeLocal)) ||
      (endTimeLocal && !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTimeLocal))) {
    return errorResponse(request, env, "local_time_invalid", "Schedule time must use HH:mm Bangkok time.", 400, false);
  }

  const effectiveFrom = normalizeIsoDate(readString(body.value, "effective_from_at"));
  const effectiveUntil = normalizeIsoDate(readString(body.value, "effective_until_at"));
  if (["Date range", "Date + time range"].includes(scheduleType) && (!effectiveFrom || !effectiveUntil)) return errorResponse(request, env, "schedule_window_required", "Scheduled proposals require both start and end.", 400, false);
  if (scheduleType !== "Always" && readString(body.value, "effective_from_at") && !effectiveFrom) {
    return errorResponse(request, env, "effective_from_invalid", "Invalid effective-from timestamp.", 400, false);
  }
  if (readString(body.value, "effective_until_at") && !effectiveUntil) {
    return errorResponse(request, env, "effective_until_invalid", "Invalid effective-until timestamp.", 400, false);
  }
  if (effectiveFrom && effectiveUntil && Date.parse(effectiveUntil) <= Date.parse(effectiveFrom)) {
    return errorResponse(request, env, "schedule_window_invalid", "Schedule end must be later than schedule start.", 400, false);
  }

  const idempotencyKey = String(request.headers.get("Idempotency-Key") || "").trim();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 180) {
    return errorResponse(request, env, "idempotency_key_required", "A stable Idempotency-Key is required.", 400, false);
  }
  const digest = await sha256Hex(`${verified.value.partnerRecord.id}:${idempotencyKey}`);
  const ruleKey = `partner-proposal-${digest.slice(0, 24)}`;
  const offerRulesTable = String((env as RuntimeEnv & { AIRTABLE_TABLE_MODEL_OFFER_RULES?: string }).AIRTABLE_TABLE_MODEL_OFFER_RULES || "tblSbxUGTFqd2CgPy");

  const existing = await listAirtableRecords(env, offerRulesTable, {
    filterByFormula: `{${MODEL_OFFER_RULES.ruleKey}}='${escapeFormulaString(ruleKey)}'`,
    maxRecords: 2
  });
  if (existing.length === 1) {
    const existingRecord = existing[0];
    if (!existingRecord) {
      return errorResponse(request, env, "proposal_idempotency_lookup_failed", "Proposal lookup could not be resolved safely.", 503, false);
    }
    return json(request, env, {
      ok: true,
      idempotent: true,
      proposal_id: existingRecord.id,
      status: fieldText(existingRecord, MODEL_OFFER_RULES.status) || "Review",
      model_record_id: modelRecordId,
      model_name: modelName,
      requested_customer_sell_rate_thb: fieldNumber(existingRecord, MODEL_OFFER_RULES.customerSellRateThb),
      sellability_mutated: false,
      customer_sell_rate_mutated: false,
      requires_per_approval: true
    });
  }
  if (existing.length > 1) {
    return errorResponse(request, env, "proposal_idempotency_conflict", "Duplicate proposal key requires review.", 409, false);
  }

  const now = new Date().toISOString();
  const fields: AirtableFields = {
    [MODEL_OFFER_RULES.ruleKey]: ruleKey,
    [MODEL_OFFER_RULES.model]: [modelRecordId],
    [MODEL_OFFER_RULES.modelKey]: modelKey,
    [MODEL_OFFER_RULES.partnerSourceRateThb]: partnerSourceRate,
    [MODEL_OFFER_RULES.customerSellRateThb]: customerSellRate,
    [MODEL_OFFER_RULES.audienceScope]: audiences,
    [MODEL_OFFER_RULES.salesVisibility]: salesVisibility,
    [MODEL_OFFER_RULES.scheduleType]: scheduleType,
    [MODEL_OFFER_RULES.daysOfWeek]: days,
    [MODEL_OFFER_RULES.startTimeLocal]: startTimeLocal || null,
    [MODEL_OFFER_RULES.endTimeLocal]: endTimeLocal || null,
    [MODEL_OFFER_RULES.effectiveFromAt]: effectiveFrom,
    [MODEL_OFFER_RULES.effectiveUntilAt]: effectiveUntil,
    [MODEL_OFFER_RULES.priority]: 0,
    [MODEL_OFFER_RULES.requiresPerApproval]: "Yes",
    [MODEL_OFFER_RULES.priceVisibility]: "Per approval only",
    [MODEL_OFFER_RULES.status]: "Review",
    [MODEL_OFFER_RULES.internalOnly]: "Yes",
    [MODEL_OFFER_RULES.sourceActorType]: "partner",
    [MODEL_OFFER_RULES.sourcePartnerRef]: verified.value.partnerRecord.id,
    [MODEL_OFFER_RULES.changeReason]: readString(body.value, "change_reason").slice(0, 1200) || "Partner Dashboard sales-control proposal.",
    [MODEL_OFFER_RULES.updatedBy]: `partner:${verified.value.partnerRecord.id}`,
    [MODEL_OFFER_RULES.updatedAt]: now,
    [MODEL_OFFER_RULES.notifyStatus]: "pending",
    [MODEL_OFFER_RULES.version]: 1
  };

  const created = await createAirtableRecord(env, offerRulesTable, fields, true);
  try {
    await sendTelegramMessage(env, [
      "PARTNER SALES CONTROL PROPOSAL",
      "",
      `Partner: ${fieldText(verified.value.partnerRecord, MODEL_PARTNERS.partnerName) || verified.value.partnerRecord.id}`,
      `Model: ${modelName}`,
      `Source Rate: ${Math.round(partnerSourceRate).toLocaleString("en-US")} THB`,
      `Requested Sell Rate: ${Math.round(customerSellRate).toLocaleString("en-US")} THB`,
      `Visibility Request: ${salesVisibility}`,
      `Audience: ${audiences.join(", ")}`,
      `Schedule: ${scheduleType}`,
      `Proposal: ${created.id}`
    ].join("\n"), "partner_confirm");
  } catch (error) {
    console.error("partner sales proposal telegram alert failed", error);
  }

  return json(request, env, {
    ok: true,
    proposal_id: created.id,
    status: "Review",
    model_record_id: modelRecordId,
    model_name: modelName,
    requested_customer_sell_rate_thb: customerSellRate,
    sellability_mutated: false,
    customer_sell_rate_mutated: false,
    requires_per_approval: true
  }, 201);
}

function projectPartnerSalesRule(rule: AirtableRecord): Record<string, unknown> {
  return {
    proposal_id: rule.id,
    rule_key: fieldText(rule, MODEL_OFFER_RULES.ruleKey),
    status: fieldText(rule, MODEL_OFFER_RULES.status) || "Review",
    version: fieldNumber(rule, MODEL_OFFER_RULES.version) || 1,
    partner_source_rate_thb: fieldNumber(rule, MODEL_OFFER_RULES.partnerSourceRateThb),
    customer_sell_rate_thb: fieldNumber(rule, MODEL_OFFER_RULES.customerSellRateThb),
    sales_visibility: fieldText(rule, MODEL_OFFER_RULES.salesVisibility) || "off",
    audience_scope: fieldMultiText(rule, MODEL_OFFER_RULES.audienceScope),
    schedule_type: fieldText(rule, MODEL_OFFER_RULES.scheduleType) || "Always",
    effective_from_at: fieldText(rule, MODEL_OFFER_RULES.effectiveFromAt),
    effective_until_at: fieldText(rule, MODEL_OFFER_RULES.effectiveUntilAt),
    days_of_week: fieldMultiText(rule, MODEL_OFFER_RULES.daysOfWeek),
    start_time_local: fieldText(rule, MODEL_OFFER_RULES.startTimeLocal),
    end_time_local: fieldText(rule, MODEL_OFFER_RULES.endTimeLocal),
    source_actor_type: fieldText(rule, MODEL_OFFER_RULES.sourceActorType) || null,
    change_reason: fieldText(rule, MODEL_OFFER_RULES.changeReason) || null,
    reviewed_by: fieldText(rule, MODEL_OFFER_RULES.reviewedBy) || null,
    reviewed_at: fieldText(rule, MODEL_OFFER_RULES.reviewedAt) || null,
    updated_by: fieldText(rule, MODEL_OFFER_RULES.updatedBy) || null,
    notification_status: fieldText(rule, MODEL_OFFER_RULES.notifyStatus) || null,
    updated_at: fieldText(rule, MODEL_OFFER_RULES.updatedAt) || rule.createdTime || null
  };
}

function buildPartnerSalesControls(
  referrals: AirtableRecord[], modelMap: Map<string, AirtableRecord>, rules: AirtableRecord[], partnerRecordId: string
): Array<Record<string, unknown>> {
  const sorted = [...rules].sort((a, b) => (Date.parse(fieldText(b, MODEL_OFFER_RULES.updatedAt) || b.createdTime || "") || 0) - (Date.parse(fieldText(a, MODEL_OFFER_RULES.updatedAt) || a.createdTime || "") || 0));
  const modelIds = [...new Set(referrals.flatMap((r) => fieldLinkIds(r, MODEL_REFERRALS.model)).filter(Boolean))];
  return modelIds.map((modelId) => {
    const mine = sorted.filter((r) => fieldLinkIds(r, MODEL_OFFER_RULES.model).includes(modelId));
    const partnerScoped = mine.filter((r) => !fieldLinkIds(r, MODEL_OFFER_RULES.client).length && !fieldText(r, MODEL_OFFER_RULES.clientIdentityKey));
    const partnerHistory = partnerScoped.filter((r) => {
      const sourcePartner = fieldText(r, MODEL_OFFER_RULES.sourcePartnerRef) || "";
      const sourceActor = normalizeStatus(fieldText(r, MODEL_OFFER_RULES.sourceActorType));
      return sourcePartner === partnerRecordId || (sourceActor === "partner" && !sourcePartner);
    });
    const proposal = partnerHistory.find((r) => normalizeStatus(fieldText(r, MODEL_OFFER_RULES.sourceActorType)) === "partner");
    const approved = partnerScoped.find((r) => normalizeStatus(fieldText(r, MODEL_OFFER_RULES.status)) === "active" && Boolean(fieldText(r, MODEL_OFFER_RULES.reviewedBy)));
    const model = modelMap.get(modelId);
    return {
      model_record_id: modelId,
      model_name: model ? modelName(model) : "Model",
      proposal: proposal ? projectPartnerSalesRule(proposal) : null,
      // Configuration only. The canonical sales resolver still decides per customer/time.
      approved_policy: approved ? projectPartnerSalesRule(approved) : null,
      history: partnerHistory.map(projectPartnerSalesRule),
      policy_preview: previewPartnerSalesPolicy(modelId, model ? fieldText(model, MODELS.uniqueKey) || "" : "", mine)
    };
  });
}

function previewPartnerSalesPolicy(modelId: string, modelKey: string, records: AirtableRecord[]): Record<string, unknown> {
  const at = new Date().toISOString();
  const names: Record<string, string> = { model: "Model", client: "Client", clientIdentityKey: "client_identity_key", modelKey: "model_key", ruleKey: "offer_rule_key", customerSellRateThb: "customer_sell_rate_thb", audienceScope: "audience_scope", priceVisibility: "price_visibility", effectiveFromAt: "effective_from_at", effectiveUntilAt: "effective_until_at", salesVisibility: "sales_visibility", scheduleType: "schedule_type", daysOfWeek: "days_of_week", startTimeLocal: "start_time_local", endTimeLocal: "end_time_local", priority: "priority", status: "status", requiresPerApproval: "requires_per_approval", version: "version" };
  const rules = records.filter((r) => Boolean(fieldText(r, MODEL_OFFER_RULES.reviewedBy))).map((record) => ({ id: record.id, fields: Object.fromEntries(Object.entries(names).map(([key, name]) => [name, record.fields[MODEL_OFFER_RULES[key as keyof typeof MODEL_OFFER_RULES]]])) }));
  const audiences = [["Public Member", "public_member"], ["Elite", "elite"], ["Red Card", "red_card"], ["Standard", "standard"], ["Premium", "premium"], ["VIP / Black Card", "vip"], ["SVIP", "svip"]];
  return { requested_at: at, time_zone: "Asia/Bangkok", customer_access_granted: false, scope: "audience_policy_preview", audiences: audiences.map(([label, capability]) => {
    const result = resolveModelSalesOffer({ model_id: modelId, model_key: modelKey, requested_at: at, rules, entitlement_snapshot: { access: { [capability!]: true } } });
    return { audience: label, sellable: result.sellable === true, rate_thb: result.customer_rate_thb ?? null, reason: result.reason_code, requires_per_approval: result.requires_per_approval === true };
  }) };
}

async function listPartnerSalesRules(env: RuntimeEnv, partnerRecordId: string): Promise<AirtableRecord[]> {
  const tableId = String((env as RuntimeEnv & { AIRTABLE_TABLE_MODEL_OFFER_RULES?: string }).AIRTABLE_TABLE_MODEL_OFFER_RULES || "tblSbxUGTFqd2CgPy");
  try {
    return await listAirtableRecords(env, tableId, {
      // Read canonical rules as well as Partner proposals; exact model filtering happens before projection.

      sort: [{ field: MODEL_OFFER_RULES.updatedAt, direction: "desc" }]
    });
  } catch (error) {
    console.warn("Partner sales rules lookup failed", getErrorMessage(error));
    return [];
  }
}

async function listPartnerModelChanges(env: RuntimeEnv, partnerRecordId: string, partnerId: string): Promise<AirtableRecord[]> {
  const tableId = String(
    (env as RuntimeEnv & { AIRTABLE_TABLE_PARTNER_MODEL_CHANGES?: string }).AIRTABLE_TABLE_PARTNER_MODEL_CHANGES ||
    "tbl8kxhjKzGU0xx4L"
  );
  let records: AirtableRecord[] = [];
  if (partnerId) {
    records = await listAirtableRecords(env, tableId, {
      filterByFormula: `{${PARTNER_MODEL_CHANGES.partnerId}}='${escapeFormulaString(partnerId)}'`
    });
  }
  if (!records.length) {
    records = await listLinkedRecordsForPartner(env, tableId, PARTNER_MODEL_CHANGES.partner, partnerRecordId, partnerId);
  }
  return records.sort((a, b) => {
    const at = Date.parse(fieldText(a, PARTNER_MODEL_CHANGES.updatedAt) || a.createdTime || "") || 0;
    const bt = Date.parse(fieldText(b, PARTNER_MODEL_CHANGES.updatedAt) || b.createdTime || "") || 0;
    return bt - at;
  });
}

async function listPartnerSessions(env: RuntimeEnv, partnerId: string): Promise<AirtableRecord[]> {
  if (!partnerId) return [];
  const tableId = String((env as RuntimeEnv & { AIRTABLE_TABLE_SESSIONS?: string }).AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX");
  return await listAirtableRecords(env, tableId, {
    filterByFormula: `{${SESSION_FIELDS.partnerIdSnapshot}}='${escapeFormulaString(partnerId)}'`,

    sort: [{ field: SESSION_FIELDS.startTime, direction: "desc" }]
  });
}

function normalizePartnerModelChange(record: AirtableRecord): Record<string, unknown> {
  const parsed = parseJson(fieldText(record, PARTNER_MODEL_CHANGES.payloadJson) || "{}");
  const payload = isRecord(parsed) ? parsed : {};
  return {
    request_id: record.id,
    request_key: fieldText(record, PARTNER_MODEL_CHANGES.requestKey),
    model_record_id: fieldLinkIds(record, PARTNER_MODEL_CHANGES.model)[0] || null,
    action: fieldText(record, PARTNER_MODEL_CHANGES.action) || "update_profile",
    status: fieldText(record, PARTNER_MODEL_CHANGES.status) || "review",
    revision: fieldNumber(record, PARTNER_MODEL_CHANGES.revision) || null,
    payload,
    decision_note: readString(payload, "decision_note") || null,
    decided_at: readString(payload, "decided_at") || null,
    decided_by: readString(payload, "decided_by") || null,
    shared_with_mmd: record.fields[PARTNER_MODEL_CHANGES.shareWithMmd] === true,
    updated_at: fieldText(record, PARTNER_MODEL_CHANGES.updatedAt) || record.createdTime || null
  };
}

function normalizePartnerSession(record: AirtableRecord, officiallyVerified = false): Record<string, unknown> {
  const partnerStatus = normalizeStatus(fieldText(record, SESSION_FIELDS.partnerConfirmationStatus)) || "pending";
  const paymentStatus = normalizeStatus(fieldText(record, SESSION_FIELDS.paymentStatus)) || "unavailable";
  const lifecycle = normalizeStatus(fieldText(record, SESSION_FIELDS.lifecycle) || fieldText(record, SESSION_FIELDS.status));
  const snapshot = parseJson(fieldText(record, SESSION_FIELDS.partnerSnapshotJson) || "{}");
  const canonicalModel = fieldLinkIds(record, SESSION_FIELDS.canonicalModel)[0] || (isRecord(snapshot) ? readString(snapshot, "model_record_id") : "");
  const customerAckAt = fieldText(record, SESSION_FIELDS.customerAckAt);
  const canonicalLocation = fieldText(record, SESSION_FIELDS.locationName);
  const locationConfirmed = Boolean(customerAckAt && canonicalLocation);
  const partnerSourceRate = isRecord(snapshot) ? readFiniteNumber(snapshot.partner_source_rate_thb) : null;
  return {
    session_record_id: record.id,
    session_id: fieldText(record, SESSION_FIELDS.sessionId) || record.id,
    job_id: fieldText(record, "fldHw5HdDDdkHXMhG") || null,
    model_name: fieldText(record, SESSION_FIELDS.modelName) || "Model",
    model_record_id: canonicalModel || null,
    client_alias: "MMD Client",
    date: fieldText(record, SESSION_FIELDS.jobDate),
    start_at: fieldText(record, SESSION_FIELDS.startTime),
    end_at: fieldText(record, SESSION_FIELDS.endTime),
    location: locationConfirmed ? canonicalLocation : "รอยืนยันสถานที่กับลูกค้า",
    location_status: locationConfirmed ? "confirmed_with_customer" : "pending_customer_confirmation",
    location_confirmed_at: customerAckAt || null,
    partner_source_rate_thb: partnerSourceRate,
    work_lane: fieldText(record, SESSION_FIELDS.workLane),
    work_type: fieldText(record, SESSION_FIELDS.workType),
    status: partnerStatus,
    lifecycle_status: lifecycle || "pending",
    payment_status: paymentStatus,
    confirmation_allowed: isOfficiallyVerifiedPaymentStatus(paymentStatus) && officiallyVerified && !["confirmed", "declined"].includes(partnerStatus) && !["completed", "cancelled", "canceled", "declined", "closed", "void"].includes(lifecycle),
    confirmation_note: fieldText(record, SESSION_FIELDS.partnerConfirmationNote),
    confirmation_revision: fieldNumber(record, SESSION_FIELDS.partnerConfirmationRevision),
    notification_status: fieldText(record, SESSION_FIELDS.partnerNotificationStatus) || "pending"
  };
}

function buildPartnerModelProfiles(
  referrals: AirtableRecord[],
  modelMap: Map<string, AirtableRecord>,
  salesControls: Array<Record<string, unknown>>,
  changes: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  const controlByModel = new Map(salesControls.map((control) => [String(control.model_record_id || ""), control]));
  const latestProfileChange = new Map<string, Record<string, unknown>>();
  const workingSystemHistory = new Map<string, Array<Record<string, unknown>>>();
  for (const change of changes) {
    const modelId = String(change.model_record_id || "");
    if (!modelId) continue;
    if (!latestProfileChange.has(modelId) && change.status === "approved" && ["update_profile", "add_model"].includes(String(change.action))) latestProfileChange.set(modelId, change);
    if (change.action === "update_working_system") {
      const entries = workingSystemHistory.get(modelId) || [];
      entries.push(change);
      workingSystemHistory.set(modelId, entries);
    }
  }

  const models: Array<Record<string, unknown>> = [];
  for (const referral of referrals) {
    const modelId = fieldLinkIds(referral, MODEL_REFERRALS.model)[0] || "";
    if (!modelId) continue;
    const model = modelMap.get(modelId);
    if (!model) continue;
    const profileChange = latestProfileChange.get(modelId);
    const draft = profileChange?.status !== "rejected" && isRecord(profileChange?.payload) ? profileChange.payload : {};
    const systemHistory = workingSystemHistory.get(modelId) || [];
    const pendingSystem = systemHistory.find((entry) => entry.status === "review");
    const workingSystem = canonicalWorkingSystem(referral, pendingSystem);
    const approvedSystem = systemHistory.find((entry) => entry.status === "approved");
    if (approvedSystem && isRecord(approvedSystem.payload)) workingSystem.version = readFiniteNumber(approvedSystem.payload.version) || 1;
    models.push({
      model_record_id: modelId,
      referral_record_id: referral.id,
      referral_status: fieldText(referral, MODEL_REFERRALS.ownershipStatus) || "pending",
      display_name: readString(draft, "display_name") || modelName(model),
      age: readFiniteNumber(draft.age),
      height_cm: readFiniteNumber(draft.height_cm) ?? (fieldNumber(model, MODELS.heightCm) || null),
      weight_kg: readFiniteNumber(draft.weight_kg) ?? (fieldNumber(model, MODELS.weightKg) || null),
      profile_summary: readString(draft, "profile_summary"),
      availability_note: readString(draft, "availability_note"),
      skills_summary: readString(draft, "skills_summary") || fieldText(model, MODELS.skillsSummary),
      experience_summary: readString(draft, "experience_summary") || fieldText(model, MODELS.experienceSummary),
      sales_copy: readString(draft, "sales_copy"),
      portfolio_urls: Array.isArray(draft.portfolio_urls) ? draft.portfolio_urls : [],
      image_url: fieldText(model, MODELS.publicImageUrl) || fieldAttachmentUrl(model, MODELS.profilePhoto),
      availability_status: fieldText(model, MODELS.availabilityStatus) || "available",
      available_now: model.fields[MODELS.availableNow] === true,
      canonical_status: fieldText(model, MODELS.status) || "pending",
      roster_active: !["inactive", "revoked", "transferred", "archived"].includes(normalizeStatus(fieldText(referral, MODEL_REFERRALS.ownershipStatus))),
      profile_request_status: changes.find((c) => c.model_record_id === modelId && ["update_profile", "add_model"].includes(String(c.action)))?.status || null,
      pending_profile: changes.find((c) => c.model_record_id === modelId && c.status === "review" && c.action === "update_profile")?.payload || null,
      working_system: workingSystem,
      working_system_history: systemHistory.map((entry) => ({
        request_id: entry.request_id,
        version: isRecord(entry.payload) ? readFiniteNumber(entry.payload.version) : null,
        system: isRecord(entry.payload) ? readString(entry.payload, "system") : "",
        status: entry.status,
        commission_percent: isRecord(entry.payload) ? readFiniteNumber(entry.payload.commission_percent) : null,
        source_rate_thb: isRecord(entry.payload) ? readFiniteNumber(entry.payload.source_rate_thb) : null,
        partner_share_percent: isRecord(entry.payload) ? readFiniteNumber(entry.payload.partner_share_percent) : null,
        change_reason: isRecord(entry.payload) ? readString(entry.payload, "change_reason") || null : null,
        decision_note: entry.decision_note || (isRecord(entry.payload) ? readString(entry.payload, "decision_note") || null : null),
        decided_at: entry.decided_at || (isRecord(entry.payload) ? readString(entry.payload, "decided_at") || null : null),
        decided_by: entry.decided_by || (isRecord(entry.payload) ? readString(entry.payload, "decided_by") || null : null),
        updated_at: entry.updated_at
      })),
      sales_control: controlByModel.get(modelId) || null
    });
  }
  return models;
}

function canonicalWorkingSystem(
  referral: AirtableRecord,
  pendingChange?: Record<string, unknown>
): Record<string, unknown> {
  const rawType = normalizeStatus(fieldText(referral, MODEL_REFERRALS.commissionType));
  const system: PartnerWorkingSystem = rawType.includes("profit")
    ? "profit_share"
    : rawType.includes("co_partner") || rawType.includes("one_price") || rawType.includes("flat")
      ? "co_partner"
      : "bridge";
  const pendingPayload = isRecord(pendingChange?.payload) ? pendingChange.payload : null;
  const recognized = ["bridge", "first_job", "ongoing", "referral", "co_partner", "one_price", "flat", "profit_share"].includes(rawType);
  const current = recognized && Boolean(fieldText(referral, MODEL_REFERRALS.approvedAt)) && (!fieldText(referral, MODEL_REFERRALS.effectiveFrom) || Date.parse(fieldText(referral, MODEL_REFERRALS.effectiveFrom)!) <= Date.now()) && (!fieldText(referral, MODEL_REFERRALS.effectiveUntil) || Date.parse(fieldText(referral, MODEL_REFERRALS.effectiveUntil)!) > Date.now()) && !["inactive", "revoked", "transferred", "archived", "pending_review"].includes(normalizeStatus(fieldText(referral, MODEL_REFERRALS.ownershipStatus)));
  return {
    system: current ? system : null,
    label: current ? (system === "bridge" ? "System 1 · Bridge" : system === "co_partner" ? "System 2 · Co-Partner" : "System 3 · Profit Share") : "รอข้อตกลงที่อนุมัติ",
    status: current ? "approved" : "unavailable",
    commission_percent: current && system === "bridge" ? percentPoints(fieldNumber(referral, MODEL_REFERRALS.commissionRate)) : null,
    source_rate_thb: current && system === "co_partner" ? fieldNumber(referral, MODEL_REFERRALS.flatAmountThb) : null,
    partner_share_percent: current && system === "profit_share" ? percentPoints(fieldNumber(referral, MODEL_REFERRALS.commissionRate)) : null,
    basis_rule: fieldText(referral, MODEL_REFERRALS.basisRule) || "payment_truth_net_basis",
    effective_from: fieldText(referral, MODEL_REFERRALS.effectiveFrom) || null,
    effective_until: fieldText(referral, MODEL_REFERRALS.effectiveUntil) || null,
    version: 1,
    authority: "server_canonical",
    pending_change: pendingPayload ? {
      request_id: pendingChange?.request_id || null,
      status: pendingChange?.status || "review",
      version: readFiniteNumber(pendingPayload.version),
      system: readString(pendingPayload, "system")
    } : null
  };
}

async function handlePartnerWorkingSystemChange(request: Request, env: RuntimeEnv): Promise<Response> {
  const verified = await verifyPartnerTokenFromRequest(request, env);
  if (!verified.ok) return verified.response;
  const body = await readJsonObject(request);
  if (!body.ok) return errorResponse(request, env, "invalid_json", body.error, 400, false);
  if (body.value.share_with_mmd !== true) {
    return errorResponse(request, env, "explicit_share_required", "Confirm the agreement proposal before submitting it to MMD.", 400, false);
  }
  const modelRecordId = readString(body.value, "model_record_id");
  if (!/^rec[A-Za-z0-9]{14,24}$/.test(modelRecordId)) {
    return errorResponse(request, env, "model_record_id_invalid", "A canonical linked model is required.", 400, false);
  }
  const referrals = await listLinkedRecordsForPartner(
    env,
    env.AIRTABLE_TABLE_MODEL_REFERRALS,
    MODEL_REFERRALS.partner,
    verified.value.partnerRecord.id,
    fieldText(verified.value.partnerRecord, MODEL_PARTNERS.partnerId) || ""
  );
  if (!referrals.some((record) => fieldLinkIds(record, MODEL_REFERRALS.model).includes(modelRecordId))) {
    return errorResponse(request, env, "partner_model_scope_forbidden", "This model is outside the Partner relationship scope.", 403, false);
  }
  const system = readString(body.value, "system") as PartnerWorkingSystem;
  if (!PARTNER_WORKING_SYSTEMS.has(system)) {
    return errorResponse(request, env, "working_system_invalid", "Choose Bridge, Co-Partner, or Profit Share.", 400, false);
  }
  const commissionPercent = readFiniteNumber(body.value.commission_percent);
  const sourceRateThb = readFiniteNumber(body.value.source_rate_thb);
  const partnerSharePercent = readFiniteNumber(body.value.partner_share_percent);
  if (system === "bridge" && (commissionPercent === null || commissionPercent < 5 || commissionPercent > 10)) {
    return errorResponse(request, env, "bridge_commission_invalid", "Bridge commission must be between 5% and 10%.", 400, false);
  }
  if (system === "co_partner" && (sourceRateThb === null || sourceRateThb < 0 || sourceRateThb > 1000000)) {
    return errorResponse(request, env, "co_partner_source_rate_invalid", "Co-Partner source rate must be a valid THB amount.", 400, false);
  }
  if (system === "profit_share" && (partnerSharePercent === null || partnerSharePercent <= 0 || partnerSharePercent >= 100)) {
    return errorResponse(request, env, "profit_share_invalid", "Partner share must be greater than 0% and less than 100%.", 400, false);
  }
  const idempotencyKey = String(request.headers.get("Idempotency-Key") || "").trim();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 180) {
    return errorResponse(request, env, "idempotency_key_required", "A stable Idempotency-Key is required.", 400, false);
  }
  const partnerId = fieldText(verified.value.partnerRecord, MODEL_PARTNERS.partnerId) || verified.value.partnerRecord.id;
  const existingChanges = await listPartnerModelChanges(env, verified.value.partnerRecord.id, partnerId);
  const version = existingChanges.filter((record) =>
    fieldLinkIds(record, PARTNER_MODEL_CHANGES.model).includes(modelRecordId) &&
    fieldText(record, PARTNER_MODEL_CHANGES.action) === "update_working_system"
  ).length + 2;
  const digest = await sha256Hex(`${verified.value.partnerRecord.id}:working-system:${modelRecordId}:${idempotencyKey}`);
  const requestKey = `pws_${digest.slice(0, 28)}`;
  const tableId = String((env as RuntimeEnv & { AIRTABLE_TABLE_PARTNER_MODEL_CHANGES?: string }).AIRTABLE_TABLE_PARTNER_MODEL_CHANGES || "tbl8kxhjKzGU0xx4L");
  const duplicates = await listAirtableRecords(env, tableId, { filterByFormula: `{${PARTNER_MODEL_CHANGES.requestKey}}='${escapeFormulaString(requestKey)}'`, maxRecords: 2 });
  if (duplicates.length === 1) return json(request, env, { ok: true, idempotent: true, request_id: duplicates[0]?.id, status: "review" });
  if (duplicates.length > 1) return errorResponse(request, env, "working_system_idempotency_conflict", "Duplicate agreement request requires review.", 409, false);
  const now = new Date().toISOString();
  const payload = compactObject({
    system,
    version,
    commission_percent: system === "bridge" ? commissionPercent : null,
    source_rate_thb: system === "co_partner" ? sourceRateThb : null,
    partner_share_percent: system === "profit_share" ? partnerSharePercent : null,
    mmd_share_percent: system === "profit_share" && partnerSharePercent !== null ? 100 - partnerSharePercent : null,
    basis_rule: "payment_truth_net_basis",
    effective_from: normalizeIsoDate(readString(body.value, "effective_from")) || now,
    change_reason: readString(body.value, "change_reason").slice(0, 1200)
  });
  const created = await createAirtableRecord(env, tableId, {
    [PARTNER_MODEL_CHANGES.requestKey]: requestKey,
    [PARTNER_MODEL_CHANGES.partner]: [verified.value.partnerRecord.id],
    [PARTNER_MODEL_CHANGES.model]: [modelRecordId],
    [PARTNER_MODEL_CHANGES.action]: "update_working_system",
    [PARTNER_MODEL_CHANGES.status]: "review",
    [PARTNER_MODEL_CHANGES.payloadJson]: JSON.stringify(payload),
    [PARTNER_MODEL_CHANGES.shareWithMmd]: true,
    [PARTNER_MODEL_CHANGES.idempotencyKey]: digest,
    [PARTNER_MODEL_CHANGES.revision]: version,
    [PARTNER_MODEL_CHANGES.submittedAt]: now,
    [PARTNER_MODEL_CHANGES.updatedAt]: now,
    [PARTNER_MODEL_CHANGES.actorRef]: `partner:${verified.value.partnerRecord.id}`,
    [PARTNER_MODEL_CHANGES.partnerId]: partnerId
  }, true);
  try {
    await sendTelegramMessage(env, ["PARTNER WORKING SYSTEM V2", "", `Partner: ${partnerId}`, `Model: ${modelRecordId}`, `System: ${system}`, `Version: ${version}`, `Request: ${created.id}`, "Authority: pending Boss Per review; no ledger mutation"].join("\n"), "partner_confirm");
  } catch (error) {
    console.error("partner working system telegram alert failed", error);
  }
  return json(request, env, { ok: true, request_id: created.id, status: "review", version, system, canonical_agreement_mutated: false, ledger_mutated: false, requires_per_approval: true }, 201);
}

async function handleAdminWorkingSystemQueue(request: Request, env: RuntimeEnv): Promise<Response> {
  const authError = verifyAdminAuthority(request, env);
  if (authError) return authError;
  const tableId = partnerModelChangesTable(env);
  const records = await listAirtableRecords(env, tableId, {
    filterByFormula: `AND({${PARTNER_MODEL_CHANGES.action}}='update_working_system',{${PARTNER_MODEL_CHANGES.status}}='review')`,

    sort: [{ field: PARTNER_MODEL_CHANGES.submittedAt, direction: "asc" }]
  });
  return json(request, env, {
    ok: true,
    authority: "boss_per",
    requests: records.map(normalizePartnerModelChange)
  });
}

async function handleAdminWorkingSystemDecision(
  request: Request,
  env: RuntimeEnv,
  ctx: ExecutionContext
): Promise<Response> {
  const authError = verifyAdminAuthority(request, env);
  if (authError) return authError;
  const body = await readJsonObject(request);
  if (!body.ok) return errorResponse(request, env, "invalid_json", body.error, 400, false);
  const requestRecordId = readString(body.value, "request_record_id");
  const decision = normalizeStatus(readString(body.value, "decision"));
  const note = readString(body.value, "note").slice(0, 1200);
  if (!/^rec[A-Za-z0-9]{14,24}$/.test(requestRecordId) || !new Set(["approve", "reject"]).has(decision)) {
    return errorResponse(request, env, "working_system_decision_invalid", "request_record_id and approve or reject are required.", 400, false);
  }

  const changesTable = partnerModelChangesTable(env);
  const change = await getAirtableRecord(env, changesTable, requestRecordId);
  if (fieldText(change, PARTNER_MODEL_CHANGES.action) !== "update_working_system") {
    return errorResponse(request, env, "working_system_request_invalid", "The request is not a working-system proposal.", 409, false);
  }
  const currentStatus = normalizeStatus(fieldText(change, PARTNER_MODEL_CHANGES.status));
  if (currentStatus === "approved" || currentStatus === "rejected") {
    return json(request, env, { ok: true, idempotent: true, request_record_id: requestRecordId, status: currentStatus });
  }
  if (currentStatus !== "review") {
    return errorResponse(request, env, "working_system_request_not_reviewable", "The request is no longer reviewable.", 409, false);
  }

  const now = new Date().toISOString();
  const payloadValue = parseJson(fieldText(change, PARTNER_MODEL_CHANGES.payloadJson) || "{}");
  if (!isRecord(payloadValue)) {
    return errorResponse(request, env, "working_system_payload_invalid", "The stored proposal payload is invalid.", 409, false);
  }
  const system = readString(payloadValue, "system") as PartnerWorkingSystem;
  const modelRecordId = fieldLinkIds(change, PARTNER_MODEL_CHANGES.model)[0] || "";
  const partnerRecordId = fieldLinkIds(change, PARTNER_MODEL_CHANGES.partner)[0] || "";
  let version = readFiniteNumber(payloadValue.version) || fieldNumber(change, PARTNER_MODEL_CHANGES.revision) || 1;
  if (!PARTNER_WORKING_SYSTEMS.has(system) || !modelRecordId || !partnerRecordId) {
    return errorResponse(request, env, "working_system_payload_incomplete", "The stored proposal is missing canonical links.", 409, false);
  }

  if (decision === "reject") {
    await updateAirtableRecord(env, changesTable, requestRecordId, {
      [PARTNER_MODEL_CHANGES.status]: "rejected",
      [PARTNER_MODEL_CHANGES.updatedAt]: now,
      [PARTNER_MODEL_CHANGES.actorRef]: "boss_per",
      [PARTNER_MODEL_CHANGES.payloadJson]: JSON.stringify({ ...payloadValue, decision_note: note, decided_at: now, decided_by: "boss_per" })
    }, true);
    return json(request, env, { ok: true, request_record_id: requestRecordId, status: "rejected", canonical_agreement_mutated: false });
  }

  const validationError = validateStoredWorkingSystem(payloadValue, system);
  if (validationError) return errorResponse(request, env, validationError.code, validationError.message, 409, false);
  const referrals = await listLinkedRecordsForPartner(
    env,
    env.AIRTABLE_TABLE_MODEL_REFERRALS,
    MODEL_REFERRALS.partner,
    partnerRecordId,
    fieldText(change, PARTNER_MODEL_CHANGES.partnerId) || ""
  );
  const referral = referrals.find((record) => fieldLinkIds(record, MODEL_REFERRALS.model).includes(modelRecordId));
  if (!referral) return errorResponse(request, env, "working_system_referral_missing", "The canonical Partner–Model referral no longer exists.", 409, false);

  const history = await listPartnerModelChanges(env, partnerRecordId, fieldText(change, PARTNER_MODEL_CHANGES.partnerId) || "");
  const approvedVersions = history.filter((r) => r.id !== requestRecordId && fieldLinkIds(r, PARTNER_MODEL_CHANGES.model).includes(modelRecordId) && fieldText(r, PARTNER_MODEL_CHANGES.action) === "update_working_system" && ["approved", "superseded"].includes(normalizeStatus(fieldText(r, PARTNER_MODEL_CHANGES.status)))).map((r) => { const p = parseJson(fieldText(r, PARTNER_MODEL_CHANGES.payloadJson) || "{}"); return isRecord(p) ? Number(p.version || 1) : 1; });
  version = Math.max(version, ...approvedVersions.map((v) => v + 1));
  const effectiveFrom = normalizeIsoDate(readString(payloadValue, "effective_from")) || now;
  if (Date.parse(effectiveFrom) > Date.now()) return errorResponse(request, env, "agreement_effective_in_future", "Keep this proposal in review until its effective date; the current agreement remains in force.", 409, false);
  const previousNotes = fieldText(referral, MODEL_REFERRALS.notes);
  const canonicalFields: AirtableFields = {
    [MODEL_REFERRALS.commissionType]: system,
    [MODEL_REFERRALS.commissionRate]: system === "bridge"
      ? Number(payloadValue.commission_percent) / 100
      : system === "profit_share" ? Number(payloadValue.partner_share_percent) / 100 : 0,
    [MODEL_REFERRALS.flatAmountThb]: system === "co_partner" ? Number(payloadValue.source_rate_thb) : 0,
    [MODEL_REFERRALS.basisRule]: "payment_truth_net_basis",
    [MODEL_REFERRALS.effectiveFrom]: effectiveFrom,
    [MODEL_REFERRALS.approvedAt]: now,
    [MODEL_REFERRALS.approvedBy]: "boss_per",
    [MODEL_REFERRALS.notes]: appendNote(previousNotes, `[${now}] Working System v${version} approved (${system}); request ${requestRecordId}${note ? `; ${note}` : ""}`)
  };
  await updateAirtableRecord(env, env.AIRTABLE_TABLE_MODEL_REFERRALS, referral.id, canonicalFields, true);

  const priorApproved = await listAirtableRecords(env, changesTable, {
    filterByFormula: `AND({${PARTNER_MODEL_CHANGES.action}}='update_working_system',{${PARTNER_MODEL_CHANGES.status}}='approved')`,
      });
  for (const prior of priorApproved) {
    if (prior.id !== requestRecordId &&
        fieldLinkIds(prior, PARTNER_MODEL_CHANGES.partner).includes(partnerRecordId) &&
        fieldLinkIds(prior, PARTNER_MODEL_CHANGES.model).includes(modelRecordId)) {
      await updateAirtableRecord(env, changesTable, prior.id, {
        [PARTNER_MODEL_CHANGES.status]: "superseded",
        [PARTNER_MODEL_CHANGES.updatedAt]: now
      }, true);
    }
  }
  await updateAirtableRecord(env, changesTable, requestRecordId, {
    [PARTNER_MODEL_CHANGES.status]: "approved",
    [PARTNER_MODEL_CHANGES.revision]: version,
    [PARTNER_MODEL_CHANGES.updatedAt]: now,
    [PARTNER_MODEL_CHANGES.actorRef]: "boss_per",
    [PARTNER_MODEL_CHANGES.payloadJson]: JSON.stringify({ ...payloadValue, version, decision_note: note, decided_at: now, decided_by: "boss_per", canonical_referral_id: referral.id })
  }, true);

  ctx.waitUntil(sendTelegramMessage(env, [
    "PARTNER WORKING SYSTEM ACTIVATED", "", `Partner: ${partnerRecordId}`, `Model: ${modelRecordId}`,
    `System: ${system}`, `Version: ${version}`, `Effective: ${effectiveFrom}`, `Approved by: Boss Per`
  ].join("\n"), "partner_confirm").catch((error) => console.error("working system approval telegram failed", error)));
  return json(request, env, {
    ok: true,
    request_record_id: requestRecordId,
    status: "approved",
    system,
    version,
    effective_from: effectiveFrom,
    canonical_referral_id: referral.id,
    canonical_agreement_mutated: true,
    ledger_mutated: false
  });
}

function validateStoredWorkingSystem(
  payload: Record<string, unknown>,
  system: PartnerWorkingSystem
): { code: string; message: string } | null {
  const commission = readFiniteNumber(payload.commission_percent);
  const sourceRate = readFiniteNumber(payload.source_rate_thb);
  const partnerShare = readFiniteNumber(payload.partner_share_percent);
  if (system === "bridge" && (commission === null || commission < 5 || commission > 10)) {
    return { code: "bridge_commission_invalid", message: "Stored Bridge commission must be between 5% and 10%." };
  }
  if (system === "co_partner" && (sourceRate === null || sourceRate < 0 || sourceRate > 1000000)) {
    return { code: "co_partner_source_rate_invalid", message: "Stored Co-Partner source rate is invalid." };
  }
  if (system === "profit_share" && (partnerShare === null || partnerShare <= 0 || partnerShare >= 100)) {
    return { code: "profit_share_invalid", message: "Stored Profit Share percentage is invalid." };
  }
  return null;
}

function partnerModelChangesTable(env: RuntimeEnv): string {
  return String((env as RuntimeEnv & { AIRTABLE_TABLE_PARTNER_MODEL_CHANGES?: string }).AIRTABLE_TABLE_PARTNER_MODEL_CHANGES || "tbl8kxhjKzGU0xx4L");
}

function verifyAdminAuthority(request: Request, env: RuntimeEnv): Response | null {
  if (new URL(request.url).hostname === "partners-worker.internal" && request.headers.get("x-mmd-service-binding") === "admin-worker" && ["owner", "admin"].includes(request.headers.get("x-mmd-owner-role") || "") && request.headers.get("x-mmd-owner-id")) return null;
  const expected = String(env.ADMIN_APPROVE_SECRET || env.TOKEN_SECRET || "").trim();
  const explicit = String(request.headers.get("x-mmd-admin-secret") || "").trim();
  const bearer = String(request.headers.get("authorization") || "").trim().match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
  if (!expected) return errorResponse(request, env, "admin_auth_unavailable", "Boss Per approval authority is not configured.", 503, false);
  if (!explicit && !bearer) return errorResponse(request, env, "admin_auth_required", "Boss Per authorization is required.", 401, false);
  if (!constantTimeStringEqual(explicit || bearer, expected)) return errorResponse(request, env, "admin_auth_invalid", "Boss Per authorization is invalid.", 403, false);
  return null;
}

// A failed/uncertain Airtable write stays fenced for reconciliation. No expiring lease:
// an older worker must never resume after another request has stolen its lock.
async function serializeOwnerMutation(request: Request, env: RuntimeEnv, operation: () => Promise<Response>): Promise<Response> {
  const auth = verifyAdminAuthority(request, env);
  if (auth) return auth;
  const bucket = (env as RuntimeEnv & { PARTNER_ASSETS?: R2Bucket }).PARTNER_ASSETS;
  if (!bucket) return errorResponse(request, env, "mutation_storage_unavailable", "Owner write coordination is unavailable.", 503, true);
  const body = await request.clone().json().catch(() => ({})) as Record<string, unknown>;
  let scope = "owner-write";
  const sessionId = readString(body, "session_record_id"), commissionId = readString(body, "commission_record_id"), changeId = readString(body, "request_record_id");
  if (/^rec[A-Za-z0-9]{14,24}$/.test(sessionId)) {
    const row = await getAirtableRecord(env, String(env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX"), sessionId);
    scope = `session:${fieldText(row, SESSION_FIELDS.sessionId) || sessionId}`;
  } else if (/^rec[A-Za-z0-9]{14,24}$/.test(commissionId)) {
    const row = await getAirtableRecord(env, env.AIRTABLE_TABLE_PARTNER_COMMISSIONS, commissionId);
    scope = `session:${fieldText(row, PARTNER_COMMISSIONS.sessionId) || commissionId}`;
  } else if (/^rec[A-Za-z0-9]{14,24}$/.test(changeId)) {
    const row = await getAirtableRecord(env, partnerModelChangesTable(env), changeId);
    scope = `model:${fieldLinkIds(row, PARTNER_MODEL_CHANGES.model)[0] || changeId}`;
  }
  const key = `partner-operations/v1/${await sha256Hex(scope)}.json`;
  const current = await bucket.get(key);
  const prior = current ? parseJson(await current.text()) : null;
  if (isRecord(prior) && prior.state !== "idle") return errorResponse(request, env, "owner_operation_in_progress", "Another owner operation is running or needs reconciliation. Reload its canonical record before retrying.", 409, false);
  const receipt = { state: "running", operation: new URL(request.url).pathname, started_at: new Date().toISOString(), nonce: crypto.randomUUID(), scope, record_id: sessionId || commissionId || changeId };
  const claim = await bucket.put(key, JSON.stringify(receipt), { onlyIf: current ? { etagMatches: current.etag } : { etagDoesNotMatch: "*" } });
  if (!claim) return errorResponse(request, env, "owner_operation_in_progress", "Another owner operation is running. Retry after it completes.", 409, true);
  let response: Response;
  try { response = await operation(); }
  catch (error) {
    await bucket.put(key, JSON.stringify({ ...receipt, state: "reconciliation_required" }), { onlyIf: { etagMatches: claim.etag } });
    throw error;
  } // Deliberately keep the fence on thrown / ambiguous writes.
  if (response.status < 500) await bucket.put(key, JSON.stringify({ ...receipt, state: "idle", completed_at: new Date().toISOString(), status: response.status }), { onlyIf: { etagMatches: claim.etag } });
  return response;
}

function paymentStage(row: AirtableRecord): string {
  return normalizeStatus(fieldText(row, PAYMENT_FIELDS.canonicalStage) || fieldText(row, PAYMENT_FIELDS.stage));
}
function paymentStillValid(entry: AirtableRecord): boolean {
  return normalizeStatus(fieldText(entry, PAYMENT_FIELDS.verification)) === "verified" && !["refunded", "void", "voided", "cancelled", "canceled", "rejected", "disputed", "chargeback"].includes(normalizeStatus(fieldText(entry, PAYMENT_FIELDS.status)));
}

async function handleAdminPartnerAgreementCapture(request: Request, env: RuntimeEnv): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body.ok) return errorResponse(request, env, "invalid_json", body.error, 400, false);
  const id = readString(body.value, "session_record_id");
  if (!/^rec[A-Za-z0-9]{14,24}$/.test(id)) return errorResponse(request, env, "session_record_id_invalid", "Choose a Session.", 400, false);
  const table = String(env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX");
  const session = await getAirtableRecord(env, table, id);
  const existing = parseJson(fieldText(session, SESSION_FIELDS.referralSnapshotJson) || "{}");
  if (isRecord(existing) && existing.contract === "partner_agreement_v1") return json(request, env, { ok: true, idempotent: true, agreement: existing });
  const reconcile = body.value.reconcile_legacy === true && readString(body.value, "agreement_request_id") && readString(body.value, "reconciliation_reason").length >= 10 && request.headers.get("x-mmd-owner-id") !== "canonical-job-create";
  const legacyUnpriced = isRecord(existing) && existing.schema === "mmd_model_partner_referral_snapshot_v1" && existing.commission_terms === "not_set";
  if ((fieldText(session, SESSION_FIELDS.referralSnapshotJson) && !(reconcile && legacyUnpriced)) || session.fields[SESSION_FIELDS.commissionSnapshotLocked] === true) return errorResponse(request, env, "snapshot_already_present", "Reconcile existing historical evidence; it cannot be overwritten.", 409, false);
  const modelId = fieldLinkIds(session, SESSION_FIELDS.canonicalModel)[0];
  const sessionId = fieldText(session, SESSION_FIELDS.sessionId);
  const at = Date.parse(fieldText(session, SESSION_FIELDS.createdAt) || session.createdTime || "");
  if (!modelId || !sessionId || !Number.isFinite(at)) return errorResponse(request, env, "session_lineage_incomplete", "Canonical model, Session identity and creation timestamp are required.", 409, false);
  const rows = await listAirtableRecords(env, env.AIRTABLE_TABLE_MODEL_REFERRALS);
  const partnerSnapshot = fieldText(session, SESSION_FIELDS.partnerIdSnapshot);
  const candidates = [];
  for (const row of rows.filter((r) => fieldLinkIds(r, MODEL_REFERRALS.model).includes(modelId))) {
    const pid = fieldLinkIds(row, MODEL_REFERRALS.partner)[0];
    if (!pid) continue;
    const partner = await getAirtableRecord(env, env.AIRTABLE_TABLE_MODEL_PARTNERS, pid);
    if (partnerSnapshot && fieldText(partner, MODEL_PARTNERS.partnerId) !== partnerSnapshot) continue;
    const changes = await listPartnerModelChanges(env, pid, fieldText(partner, MODEL_PARTNERS.partnerId) || "");
    const history = changes.filter((c) => fieldText(c, PARTNER_MODEL_CHANGES.action) === "update_working_system" && ["approved", "superseded"].includes(normalizeStatus(fieldText(c, PARTNER_MODEL_CHANGES.status))) && fieldLinkIds(c, PARTNER_MODEL_CHANGES.model).includes(modelId)).map((c) => ({ id: c.id, payload: parseJson(fieldText(c, PARTNER_MODEL_CHANGES.payloadJson) || "{}") })).filter((c) => isRecord(c.payload) && (reconcile ? c.id === readString(body.value, "agreement_request_id") : Date.parse(readString(c.payload, "decided_at")) <= at && Date.parse(readString(c.payload, "effective_from") || readString(c.payload, "decided_at")) <= at)).sort((a, b) => Date.parse(readString(b.payload as Record<string, unknown>, "decided_at")) - Date.parse(readString(a.payload as Record<string, unknown>, "decided_at")));
    const requested = readString(body.value, "agreement_request_id");
    if (requested && history[0]?.id !== requested) continue; // Cannot choose an older or future rate.
    let terms = history[0]?.payload as Record<string, unknown> | undefined;
    // Initial capture only: current canonical terms can be frozen for a newly created Session.
    // Historical Sessions need the independently dated approval history above.
    const current = canonicalWorkingSystem(row);
    if (!terms && !requested && Date.now() - at >= 0 && Date.now() - at < 120000 && current.status === "approved" && Date.parse(fieldText(row, MODEL_REFERRALS.approvedAt) || "") <= at && (!current.effective_from || Date.parse(String(current.effective_from)) <= at) && (!current.effective_until || Date.parse(String(current.effective_until)) > at)) terms = { ...current, decided_by: fieldText(row, MODEL_REFERRALS.approvedBy), decided_at: fieldText(row, MODEL_REFERRALS.approvedAt) };
    if (!terms || !PARTNER_WORKING_SYSTEMS.has(String(terms.system)) || validateStoredWorkingSystem(terms, terms.system as PartnerWorkingSystem) || !readString(terms, "decided_by")) continue;
    candidates.push({ row, partner, terms, requestId: history[0]?.id || null });
  }
  if (!candidates.length && !partnerSnapshot && !rows.some((r) => fieldLinkIds(r, MODEL_REFERRALS.model).includes(modelId))) return json(request, env, { ok: true, partner_managed: false });
  if (candidates.length !== 1) return errorResponse(request, env, "historical_agreement_required", "An unambiguous agreement approved and effective at booking time is required. Current rates cannot repair historical evidence.", 409, false);
  const chosen = candidates[0]!;
  const agreement = { contract: "partner_agreement_v1", session_id: sessionId, model_record_id: modelId, partner_record_id: chosen.partner.id, referral_record_id: chosen.row.id, agreement_request_id: chosen.requestId, agreement_version: Number(chosen.terms.version || 1), basis_rule: readString(chosen.terms, "basis_rule") || fieldText(chosen.row, MODEL_REFERRALS.basisRule) || "payment_truth_net_basis", system: chosen.terms.system, commission_percent: chosen.terms.commission_percent ?? null, source_rate_thb: chosen.terms.source_rate_thb ?? null, partner_share_percent: chosen.terms.partner_share_percent ?? null, approved_by: chosen.terms.decided_by, approved_at: chosen.terms.decided_at, booked_at: new Date(at).toISOString(), captured_at: new Date().toISOString(), ...(reconcile ? { reconciliation_reason: readString(body.value, "reconciliation_reason").slice(0, 2000), reconciled_by: request.headers.get("x-mmd-owner-id") || "boss_per", reconciliation_source: "owner_explicit_late_agreement", original_snapshot: existing } : {}) };
  await updateAirtableRecord(env, table, id, {
    [SESSION_FIELDS.referralSnapshotJson]: JSON.stringify(agreement),
    [SESSION_FIELDS.referralSnapshotId]: chosen.row.id,
    [SESSION_FIELDS.partnerIdSnapshot]: fieldText(chosen.partner, MODEL_PARTNERS.partnerId),
    [SESSION_FIELDS.partnerSnapshotJson]: JSON.stringify({ partner_record_id: chosen.partner.id, model_record_id: modelId, source: "canonical_agreement_capture" })
  });
  return json(request, env, { ok: true, partner_managed: true, agreement });
}

// The owner explicitly chooses a settlement mode. Every included receipt must
// still be canonical, verified, positive, unique and free of refund/void state.
async function settlementReceipts(env: RuntimeEnv, sessionId: string, mode: string): Promise<AirtableRecord[]> {
  const table = String(env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ");
  const rows = (await listAirtableRecords(env, table, { filterByFormula: `{${PAYMENT_FIELDS.sessionId}}='${escapeFormulaString(sessionId)}'` })).filter((r) => fieldText(r, PAYMENT_FIELDS.sessionId) === sessionId && ["full", "deposit", "final", "balance"].includes(paymentStage(r)) && normalizeStatus(fieldText(r, PAYMENT_FIELDS.verification)) === "verified");
  if (!rows.length || rows.some((r) => !paymentStillValid(r) || !(fieldNumber(r, PAYMENT_FIELDS.amount) > 0) || !fieldText(r, PAYMENT_FIELDS.paymentRef))) return [];
  if (new Set(rows.map((r) => fieldText(r, PAYMENT_FIELDS.paymentRef))).size !== rows.length) return [];
  if (mode === "full" && rows.length === 1 && paymentStage(rows[0]!) === "full") return rows;
  if (mode === "deposit_and_final" && rows.length === 2 && rows.filter((r) => paymentStage(r) === "deposit").length === 1 && rows.filter((r) => ["final", "balance"].includes(paymentStage(r))).length === 1) return rows.sort((a, b) => a.id.localeCompare(b.id));
  return [];
}

async function handleAdminPartnerSettlementSnapshot(request: Request, env: RuntimeEnv): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body.ok) return errorResponse(request, env, "invalid_json", body.error, 400, false);
  const id = readString(body.value, "session_record_id"), mode = readString(body.value, "receipt_mode");
  if (!/^rec[A-Za-z0-9]{14,24}$/.test(id) || !["full", "deposit_and_final"].includes(mode) || body.value.approve_settlement !== true) return errorResponse(request, env, "settlement_approval_required", "Select the verified full or deposit + final settlement and explicitly approve its basis.", 400, false);
  const table = String(env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX"), session = await getAirtableRecord(env, table, id);
  if (session.fields[SESSION_FIELDS.commissionSnapshotLocked] === true) return json(request, env, { ok: true, idempotent: true, snapshot_locked: true });
  const agreement = parseJson(fieldText(session, SESSION_FIELDS.referralSnapshotJson) || "{}");
  const sessionId = fieldText(session, SESSION_FIELDS.sessionId) || "";
  if (!isRecord(agreement) || agreement.contract !== "partner_agreement_v1" || agreement.session_id !== sessionId || agreement.model_record_id !== fieldLinkIds(session, SESSION_FIELDS.canonicalModel)[0] || agreement.referral_record_id !== fieldText(session, SESSION_FIELDS.referralSnapshotId) || !readString(agreement, "approved_by") || !normalizeIsoDate(readString(agreement, "approved_at"))) return errorResponse(request, env, "agreement_snapshot_required", "Capture or reconcile the historical agreement first.", 409, false);
  if (!["paid", "verified", "paid_full", "fully_paid", "completed", "settled"].includes(normalizeStatus(fieldText(session, SESSION_FIELDS.paymentStatus)))) return errorResponse(request, env, "full_settlement_required", "The canonical Session must be fully paid before settlement approval.", 409, false);
  const receipts = await settlementReceipts(env, sessionId, mode);
  if (!receipts.length) return errorResponse(request, env, "payment_truth_ambiguous", "Verified receipts do not resolve uniquely to the selected settlement mode.", 409, false);
  const amount = roundCurrency(receipts.reduce((sum, r) => sum + fieldNumber(r, PAYMENT_FIELDS.amount), 0));
  // Explicit owner review of the displayed total prevents accidentally settling a partial amount.
  if (readFiniteNumber(body.value.reviewed_total_thb) !== amount) return errorResponse(request, env, "settlement_total_changed", "Review the current verified receipt total before approving.", 409, false);
  const costs = readFiniteNumber(body.value.costs_total_thb), costRef = readString(body.value, "cost_evidence_ref").slice(0, 500);
  if (agreement.system === "profit_share" && (costs === null || costs < 0 || costs > amount || !costRef)) return errorResponse(request, env, "approved_costs_required", "Profit Share requires the reviewed cost total and its evidence reference, including an explicit zero-cost reference.", 400, false);
  const actor = request.headers.get("x-mmd-owner-id") || "boss_per", now = new Date().toISOString();
  if (agreement.basis_rule === "final_payment_only" && mode !== "deposit_and_final") return errorResponse(request, env, "final_receipt_required", "This historical agreement applies only to the final payment stage.", 409, false);
  const snapshot = { ...agreement, contract: "partner_commission_v1", basis_rule: agreement.basis_rule === "final_payment_only" ? "final_payment_only" : "full_payment_only", receipt_mode: mode, receipts: receipts.map((r) => ({ record_id: r.id, payment_ref: fieldText(r, PAYMENT_FIELDS.paymentRef), amount_thb: fieldNumber(r, PAYMENT_FIELDS.amount), stage: paymentStage(r) })), payment_ref: receipts.map((r) => fieldText(r, PAYMENT_FIELDS.paymentRef)).join(" + "), payment_amount_thb: amount, costs_total_thb: agreement.system === "profit_share" ? costs : 0, cost_evidence_ref: costRef || null, costs_approved_by: actor, costs_approved_at: now, settlement_approved_by: actor, settlement_approved_at: now };
  await updateAirtableRecord(env, table, id, { [SESSION_FIELDS.commissionSnapshotJson]: JSON.stringify(snapshot), [SESSION_FIELDS.commissionSnapshotLocked]: true });
  return json(request, env, { ok: true, snapshot_locked: true, snapshot });
}

async function validateSettlementSnapshotReceipts(env: RuntimeEnv, sessionId: string, snapshot: Record<string, unknown>): Promise<boolean> {
  const rows = await settlementReceipts(env, sessionId, readString(snapshot, "receipt_mode") || "full");
  if (!rows.length || roundCurrency(rows.reduce((sum, r) => sum + fieldNumber(r, PAYMENT_FIELDS.amount), 0)) !== readFiniteNumber(snapshot.payment_amount_thb)) return false;
  if (!Array.isArray(snapshot.receipts)) return rows.length === 1 && fieldText(rows[0]!, PAYMENT_FIELDS.paymentRef) === snapshot.payment_ref;
  const expected = rows.map((r) => ({ record_id: r.id, payment_ref: fieldText(r, PAYMENT_FIELDS.paymentRef), amount_thb: fieldNumber(r, PAYMENT_FIELDS.amount), stage: paymentStage(r) }));
  return JSON.stringify(expected) === JSON.stringify(snapshot.receipts);
}

async function handleAdminPartnerSettlementQueue(request: Request, env: RuntimeEnv): Promise<Response> {
  const auth = verifyAdminAuthority(request, env); if (auth) return auth;
  const referrals = await listAirtableRecords(env, env.AIRTABLE_TABLE_MODEL_REFERRALS);
  const linkedModels = new Set(referrals.flatMap((r) => fieldLinkIds(r, MODEL_REFERRALS.model)));
  const sessions = await listAirtableRecords(env, String(env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX"));
  const changes = await listAirtableRecords(env, partnerModelChangesTable(env));
  const items = [];
  for (const session of sessions.filter((s) => Boolean(fieldText(s, SESSION_FIELDS.partnerIdSnapshot)) || fieldLinkIds(s, SESSION_FIELDS.canonicalModel).some((id) => linkedModels.has(id)))) {
    const sid = fieldText(session, SESSION_FIELDS.sessionId) || "";
    const payments = await listAirtableRecords(env, String(env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ"), { filterByFormula: `{${PAYMENT_FIELDS.sessionId}}='${escapeFormulaString(sid)}'` });
    const modelId = fieldLinkIds(session, SESSION_FIELDS.canonicalModel)[0];
    const options = changes.filter((c) => ["approved", "superseded"].includes(normalizeStatus(fieldText(c, PARTNER_MODEL_CHANGES.status))) && fieldText(c, PARTNER_MODEL_CHANGES.action) === "update_working_system" && fieldLinkIds(c, PARTNER_MODEL_CHANGES.model).includes(modelId || "") && fieldText(c, PARTNER_MODEL_CHANGES.partnerId) === fieldText(session, SESSION_FIELDS.partnerIdSnapshot)).map((c) => ({ request_id: c.id, payload: parseJson(fieldText(c, PARTNER_MODEL_CHANGES.payloadJson) || "{}") }));
    items.push({
      agreement_options: options,
      session_record_id: session.id,
      session_id: sid,
      session_created_at: fieldText(session, SESSION_FIELDS.createdAt) || session.createdTime || null,
      model: fieldText(session, SESSION_FIELDS.modelName),
      model_record_id: modelId || null,
      payment_status: fieldText(session, SESSION_FIELDS.paymentStatus),
      completion_review: fieldText(session, SESSION_FIELDS.completionReview),
      payout_hold: fieldText(session, SESSION_FIELDS.payoutHoldReason),
      agreement: parseJson(fieldText(session, SESSION_FIELDS.referralSnapshotJson) || "{}"),
      commission_snapshot: parseJson(fieldText(session, SESSION_FIELDS.commissionSnapshotJson) || "{}"),
      snapshot_locked: session.fields[SESSION_FIELDS.commissionSnapshotLocked] === true,
      receipts: payments.filter((p) => fieldText(p, PAYMENT_FIELDS.sessionId) === sid).map((p) => ({
        receipt_record_id: p.id,
        payment_ref: fieldText(p, PAYMENT_FIELDS.paymentRef),
        stage: paymentStage(p),
        amount_thb: fieldNumber(p, PAYMENT_FIELDS.amount),
        verified: paymentStillValid(p),
        verification_status: fieldText(p, PAYMENT_FIELDS.verification),
        status: fieldText(p, PAYMENT_FIELDS.status),
        payment_date: fieldText(p, PAYMENT_FIELDS.paymentDate) || null,
        recorded_at: p.createdTime || null
      }))
    });
  }
  return json(request, env, { ok: true, sessions: items, history_complete: true });
}

async function handleAdminPartnerLedgerMaterialize(
  request: Request,
  env: RuntimeEnv,
  ctx: ExecutionContext
): Promise<Response> {
  const authError = verifyAdminAuthority(request, env);
  if (authError) return authError;
  const body = await readJsonObject(request);
  if (!body.ok) return errorResponse(request, env, "invalid_json", body.error, 400, false);
  const sessionRecordId = readString(body.value, "session_record_id");
  const requestedModelId = readString(body.value, "model_record_id");
  if (!/^rec[A-Za-z0-9]{14,24}$/.test(sessionRecordId)) {
    return errorResponse(request, env, "session_record_id_invalid", "A canonical Session record is required.", 400, false);
  }
  const sessionsTable = String((env as RuntimeEnv & { AIRTABLE_TABLE_SESSIONS?: string }).AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX");
  const session = await getAirtableRecord(env, sessionsTable, sessionRecordId);
  const sessionId = fieldText(session, SESSION_FIELDS.sessionId) || "";
  const partnerId = fieldText(session, SESSION_FIELDS.partnerIdSnapshot) || "";
  const paymentRef = fieldText(session, SESSION_FIELDS.paymentRef) || "";
  if (!sessionId || !partnerId) {
    return errorResponse(request, env, "partner_snapshot_incomplete", "Session is missing immutable Partner snapshot data.", 409, false);
  }

  const partners = await listAirtableRecords(env, env.AIRTABLE_TABLE_MODEL_PARTNERS, {
    filterByFormula: `{${MODEL_PARTNERS.partnerId}}='${escapeFormulaString(partnerId)}'`, maxRecords: 2
  });
  if (partners.length !== 1) return errorResponse(request, env, "partner_snapshot_unresolved", "Session Partner snapshot does not resolve uniquely.", 409, false);
  const partner = partners[0]!;
  const referrals = await listLinkedRecordsForPartner(env, env.AIRTABLE_TABLE_MODEL_REFERRALS, MODEL_REFERRALS.partner, partner.id, partnerId);
  let modelRecordId = fieldLinkIds(session, SESSION_FIELDS.canonicalModel)[0] || "";
  const snapshot = parseJson(fieldText(session, SESSION_FIELDS.partnerSnapshotJson) || "{}");
  if (!modelRecordId && isRecord(snapshot)) modelRecordId = readString(snapshot, "model_record_id");
  if (requestedModelId && requestedModelId !== modelRecordId) return errorResponse(request, env, "session_model_mismatch", "The requested model differs from the immutable Session model.", 409, false);
  const lockedReferralId = fieldText(session, SESSION_FIELDS.referralSnapshotId);
  const referral = referrals.find((entry) => entry.id === lockedReferralId && fieldLinkIds(entry, MODEL_REFERRALS.model).includes(modelRecordId));
  if (!referral) return errorResponse(request, env, "canonical_referral_unresolved", "A unique canonical Partner–Model agreement is required.", 409, false);

  // Financial history must never be reconstructed from today's referral rate.
  // Missing legacy snapshots require reconciliation by the canonical producer.
  const locked = parseJson(fieldText(session, SESSION_FIELDS.commissionSnapshotJson) || "{}");
  if (session.fields[SESSION_FIELDS.commissionSnapshotLocked] !== true || !isRecord(locked) || locked.contract !== "partner_commission_v1" ||
      locked.session_id !== sessionId || locked.partner_record_id !== partner.id || locked.model_record_id !== modelRecordId || locked.referral_record_id !== referral.id ||
      fieldText(session, SESSION_FIELDS.referralSnapshotId) !== referral.id || !readString(locked, "approved_by") || !normalizeIsoDate(readString(locked, "approved_at"))) {
    return errorResponse(request, env, "commission_snapshot_required", "A locked, approved commission snapshot for this Session is required. Current agreements cannot backfill historical money truth.", 409, false);
  }

  if (!await validateSettlementSnapshotReceipts(env, sessionId, locked)) return errorResponse(request, env, "payment_not_verified", "Canonical receipts must remain unique, verified and match the locked settlement total.", 409, false);
  const paymentAmount = Number(locked.payment_amount_thb);

  const system = readString(locked, "system") as PartnerWorkingSystem;
  if (!PARTNER_WORKING_SYSTEMS.has(system) || validateStoredWorkingSystem(locked, system) || !["full_payment_only", "final_payment_only"].includes(String(locked.basis_rule))) return errorResponse(request, env, "commission_snapshot_invalid", "The locked agreement is incomplete or has an unsupported settlement basis.", 409, false);
  let basisAmount = paymentAmount;
  if (locked.basis_rule === "final_payment_only") {
    const final = Array.isArray(locked.receipts) ? locked.receipts.filter((r) => isRecord(r) && ["final", "balance"].includes(String(r.stage))) : [];
    if (final.length !== 1 || !isRecord(final[0]) || !(Number(final[0].amount_thb) > 0)) return errorResponse(request, env, "final_receipt_required", "The locked final-stage receipt is required.", 409, false);
    basisAmount = Number(final[0].amount_thb);
  }
  const grossBasis = basisAmount;
  if (system === "profit_share") {
    const costs = readFiniteNumber(locked.costs_total_thb);
    if (costs === null || costs < 0 || costs > grossBasis || !readString(locked, "costs_approved_by") || !normalizeIsoDate(readString(locked, "costs_approved_at"))) return errorResponse(request, env, "approved_costs_required", "Profit Share requires approved costs in the locked snapshot.", 409, false);
    basisAmount = roundCurrency(grossBasis - costs);
  }
  const rate = Number(system === "co_partner" ? locked.source_rate_thb : system === "bridge" ? locked.commission_percent : locked.partner_share_percent);
  const commissionAmount = roundCurrency(system === "co_partner" ? rate : basisAmount * rate / 100);
  if (!(commissionAmount >= 0) || commissionAmount > paymentAmount) return errorResponse(request, env, "commission_calculation_invalid", "Canonical agreement cannot produce a valid commission.", 409, false);
  const canonicalPaymentRef = readString(locked, "payment_ref");
  const version = readFiniteNumber(locked.agreement_version);
  if (!version || version < 1 || !Number.isInteger(version)) return errorResponse(request, env, "agreement_version_required", "A locked agreement version is required.", 409, false);
  const commissionId = `pc_${(await sha256Hex(`${sessionId}:${referral.id}:full-settlement`)).slice(0, 28)}`;
  const existing = await listAirtableRecords(env, env.AIRTABLE_TABLE_PARTNER_COMMISSIONS, {
    filterByFormula: `{${PARTNER_COMMISSIONS.commissionId}}='${escapeFormulaString(commissionId)}'`, maxRecords: 2
  });
  if (existing.length === 1) return json(request, env, {
    ok: true, idempotent: true, commission_record_id: existing[0]!.id, commission_id: commissionId,
    basis_amount_thb: basisAmount, commission_amount_thb: fieldNumber(existing[0]!, PARTNER_COMMISSIONS.commissionAmount)
  });
  if (existing.length > 1) return errorResponse(request, env, "commission_idempotency_conflict", "Duplicate ledger rows require review.", 409, false);

  const now = new Date().toISOString();
  const commission = await createAirtableRecord(env, env.AIRTABLE_TABLE_PARTNER_COMMISSIONS, {
    [PARTNER_COMMISSIONS.commissionId]: commissionId,
    [PARTNER_COMMISSIONS.partner]: [partner.id],
    [PARTNER_COMMISSIONS.referral]: [referral.id],
    [PARTNER_COMMISSIONS.model]: [modelRecordId],
    [PARTNER_COMMISSIONS.sessionId]: sessionId,
    [PARTNER_COMMISSIONS.paymentRef]: canonicalPaymentRef,
    [PARTNER_COMMISSIONS.currency]: "THB",
    [PARTNER_COMMISSIONS.basisAmount]: basisAmount,
    [PARTNER_COMMISSIONS.rateSnapshot]: system === "co_partner" ? 0 : rate / 100,
    [PARTNER_COMMISSIONS.typeSnapshot]: system,
    [PARTNER_COMMISSIONS.commissionSnapshotJson]: JSON.stringify(locked),
    [PARTNER_COMMISSIONS.commissionSnapshotLocked]: true,
    [PARTNER_COMMISSIONS.commissionAmount]: commissionAmount,
    [PARTNER_COMMISSIONS.status]: "earned",
    [PARTNER_COMMISSIONS.earnedAt]: now,
    [PARTNER_COMMISSIONS.payoutStatus]: "pending",
    [PARTNER_COMMISSIONS.jobId]: fieldText(session, "fldHw5HdDDdkHXMhG") || sessionId
  }, true);
  ctx.waitUntil(sendTelegramMessage(env, [
    "PARTNER LEDGER EARNED", "", `Partner: ${partnerId}`, `Session: ${sessionId}`, `System: ${system}`,
    `Payment Truth: ${canonicalPaymentRef}`, `Basis: ${basisAmount} THB`, `Commission: ${commissionAmount} THB`
  ].join("\n"), "partner_confirm").catch((error) => console.error("partner ledger telegram failed", error)));
  return json(request, env, {
    ok: true, commission_record_id: commission.id, commission_id: commissionId, system, agreement_version: version,
    basis_amount_thb: basisAmount, commission_amount_thb: commissionAmount, payment_verified: true,
    canonical_agreement_mutated: false, ledger_mutated: true
  }, 201);
}

async function handleAdminPartnerLedgerQueue(request: Request, env: RuntimeEnv): Promise<Response> {
  const authError = verifyAdminAuthority(request, env);
  if (authError) return authError;
  const rows = await listAirtableRecords(env, env.AIRTABLE_TABLE_PARTNER_COMMISSIONS, {});
  return json(request, env, {
    ok: true,
    authority: "boss_per",
    financial_visibility: "admin_full_partner_own_only",
    commissions: rows.map((record) => ({
      commission_record_id: record.id,
      commission_id: fieldText(record, PARTNER_COMMISSIONS.commissionId),
      partner_record_id: fieldLinkIds(record, PARTNER_COMMISSIONS.partner)[0] || null,
      model_record_id: fieldLinkIds(record, PARTNER_COMMISSIONS.model)[0] || null,
      session_id: fieldText(record, PARTNER_COMMISSIONS.sessionId),
      payment_ref: fieldText(record, PARTNER_COMMISSIONS.paymentRef),
      basis_amount_thb: fieldNumber(record, PARTNER_COMMISSIONS.basisAmount),
      commission_amount_thb: fieldNumber(record, PARTNER_COMMISSIONS.commissionAmount),
      system: fieldText(record, PARTNER_COMMISSIONS.typeSnapshot),
      status: fieldText(record, PARTNER_COMMISSIONS.status),
      payout_status: fieldText(record, PARTNER_COMMISSIONS.payoutStatus),
      payout_reference: fieldText(record, PARTNER_COMMISSIONS.payoutReference),
      earned_at: fieldText(record, PARTNER_COMMISSIONS.earnedAt) || record.createdTime || null,
      approved_at: fieldText(record, PARTNER_COMMISSIONS.approvedAt) || null,
      paid_at: fieldText(record, PARTNER_COMMISSIONS.paidAt) || null,
      held_reason: fieldText(record, PARTNER_COMMISSIONS.heldReason) || null,
      void_reason: fieldText(record, PARTNER_COMMISSIONS.voidReason) || null,
      approved_by: fieldText(record, PARTNER_COMMISSIONS.approvedBy) || null,
      commission_snapshot: parseJson(fieldText(record, PARTNER_COMMISSIONS.commissionSnapshotJson) || "{}"),
      audit: parseJson(fieldText(record, PARTNER_COMMISSIONS.auditJson) || "{}")
    }))
  });
}

async function handleAdminPartnerLedgerAction(
  request: Request,
  env: RuntimeEnv,
  ctx: ExecutionContext
): Promise<Response> {
  const authError = verifyAdminAuthority(request, env);
  if (authError) return authError;
  const body = await readJsonObject(request);
  if (!body.ok) return errorResponse(request, env, "invalid_json", body.error, 400, false);
  const recordId = readString(body.value, "commission_record_id");
  const action = normalizeStatus(readString(body.value, "action"));
  if (!/^rec[A-Za-z0-9]{14,24}$/.test(recordId) || !new Set(["approve", "mark_paid", "void"]).has(action)) {
    return errorResponse(request, env, "partner_ledger_action_invalid", "commission_record_id and approve, mark_paid or void are required.", 400, false);
  }
  const row = await getAirtableRecord(env, env.AIRTABLE_TABLE_PARTNER_COMMISSIONS, recordId);
  const status = normalizeStatus(fieldText(row, PARTNER_COMMISSIONS.status));
  const payoutStatus = normalizeStatus(fieldText(row, PARTNER_COMMISSIONS.payoutStatus));
  const now = new Date().toISOString();
  if (action === "void") {
    if (status === "void") return json(request, env, { ok: true, idempotent: true, status: "void" });
    if (status === "paid" || payoutStatus === "paid") return errorResponse(request, env, "paid_commission_requires_reconciliation", "A recorded transfer cannot be erased. Reconcile the actual return separately.", 409, false);
    const note = readString(body.value, "note").slice(0, 1200);
    if (note.length < 10) return errorResponse(request, env, "void_reason_required", "Record the reason and evidence for voiding this unpaid commission.", 400, false);
    await updateAirtableRecord(env, env.AIRTABLE_TABLE_PARTNER_COMMISSIONS, recordId, { [PARTNER_COMMISSIONS.status]: "void", [PARTNER_COMMISSIONS.payoutStatus]: "void", fldlY3e41hnHlJSNU: appendNote(fieldText(row, "fldlY3e41hnHlJSNU"), `[${now}] Voided by ${request.headers.get("x-mmd-owner-id") || "boss_per"}: ${note}`) });
    return json(request, env, { ok: true, commission_record_id: recordId, status: "void", payout_status: "void" });
  }
  if (action === "approve") {
    if (status === "approved" || payoutStatus === "ready") return json(request, env, { ok: true, idempotent: true, status: "approved", payout_status: "ready" });
    if (status !== "earned" || !(fieldNumber(row, PARTNER_COMMISSIONS.commissionAmount) >= 0)) {
      return errorResponse(request, env, "commission_not_approvable", "Only a valid earned commission can be approved.", 409, false);
    }
    const gate = await validatePartnerPayoutTruth(request, env, row);
    if (gate) return gate;
    await updateAirtableRecord(env, env.AIRTABLE_TABLE_PARTNER_COMMISSIONS, recordId, {
      [PARTNER_COMMISSIONS.status]: "approved",
      [PARTNER_COMMISSIONS.approvedAt]: now,
      [PARTNER_COMMISSIONS.payoutStatus]: "ready"
    }, true);
    return json(request, env, { ok: true, commission_record_id: recordId, status: "approved", payout_status: "ready" });
  }
  if (status === "paid" || payoutStatus === "paid") {
    if (readString(body.value, "payout_reference") !== fieldText(row, PARTNER_COMMISSIONS.payoutReference)) return errorResponse(request, env, "payout_reference_conflict", "The payout is already recorded with a different reference.", 409, false);
    return json(request, env, { ok: true, idempotent: true, status: "paid", payout_status: "paid" });
  }
  if (status !== "approved" || payoutStatus !== "ready") {
    return errorResponse(request, env, "commission_not_ready", "Commission must be approved and ready before marking paid.", 409, false);
  }
  const payoutReference = readString(body.value, "payout_reference").slice(0, 180);
  if (!payoutReference) return errorResponse(request, env, "payout_reference_required", "A payout reference is required.", 400, false);
  const gate = await validatePartnerPayoutTruth(request, env, row);
  if (gate) return gate;
  await updateAirtableRecord(env, env.AIRTABLE_TABLE_PARTNER_COMMISSIONS, recordId, {
    [PARTNER_COMMISSIONS.status]: "paid",
    [PARTNER_COMMISSIONS.payoutStatus]: "paid",
    [PARTNER_COMMISSIONS.paidAt]: now,
    [PARTNER_COMMISSIONS.payoutReference]: payoutReference
  }, true);
  ctx.waitUntil(sendTelegramMessage(env, [
    "PARTNER PAYOUT PAID", "", `Commission: ${fieldText(row, PARTNER_COMMISSIONS.commissionId) || recordId}`,
    `Amount: ${fieldNumber(row, PARTNER_COMMISSIONS.commissionAmount)} THB`, `Payout ref: ${payoutReference}`, "Authority: Boss Per"
  ].join("\n"), "partner_confirm").catch((error) => console.error("partner payout telegram failed", error)));
  return json(request, env, { ok: true, commission_record_id: recordId, status: "paid", payout_status: "paid", paid_at: now });
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function validatePartnerPayoutTruth(request: Request, env: RuntimeEnv, row: AirtableRecord): Promise<Response | null> {
  const sessionId = fieldText(row, PARTNER_COMMISSIONS.sessionId);
  const sessionsTable = String((env as RuntimeEnv & { AIRTABLE_TABLE_SESSIONS?: string }).AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX");
  const sessions = await listAirtableRecords(env, sessionsTable, { filterByFormula: `{${SESSION_FIELDS.sessionId}}='${escapeFormulaString(sessionId || "")}'`, maxRecords: 2 });
  const session = sessions.length === 1 ? sessions[0] : null;
  const reject = (code: string, message: string) => errorResponse(request, env, code, message, 409, false);
  if (!session || !sessionId || !["clear", "resolved"].includes(normalizeStatus(fieldText(session, SESSION_FIELDS.completionReview))) || fieldText(session, SESSION_FIELDS.payoutHoldReason)) return reject("completion_review_required", "Completion review must be clear and payout holds resolved before approving or paying Partner earnings.");
  const ledgerSnapshot = fieldText(row, PARTNER_COMMISSIONS.commissionSnapshotJson);
  const snapshot = parseJson(ledgerSnapshot || "{}");
  if (row.fields[PARTNER_COMMISSIONS.commissionSnapshotLocked] !== true || session.fields[SESSION_FIELDS.commissionSnapshotLocked] !== true || ledgerSnapshot !== fieldText(session, SESSION_FIELDS.commissionSnapshotJson) || !isRecord(snapshot) || snapshot.contract !== "partner_commission_v1") return reject("commission_snapshot_required", "The ledger must match its locked Session settlement snapshot.");
  const system = readString(snapshot, "system") as PartnerWorkingSystem;
  let gross = readFiniteNumber(snapshot.payment_amount_thb);
  if (snapshot.basis_rule === "final_payment_only") {
    const final = Array.isArray(snapshot.receipts) ? snapshot.receipts.filter((r) => isRecord(r) && ["final", "balance"].includes(String(r.stage))) : [];
    gross = final.length === 1 && isRecord(final[0]) ? readFiniteNumber(final[0].amount_thb) : null;
  }
  const cost = system === "profit_share" ? readFiniteNumber(snapshot.costs_total_thb) : 0;
  const rate = readFiniteNumber(system === "co_partner" ? snapshot.source_rate_thb : system === "bridge" ? snapshot.commission_percent : snapshot.partner_share_percent);
  if (gross === null || cost === null || cost < 0 || cost > gross || rate === null || validateStoredWorkingSystem(snapshot, system) || !PARTNER_WORKING_SYSTEMS.has(system)) return reject("commission_calculation_invalid", "The locked money calculation is incomplete.");
  const basis = roundCurrency(gross - cost), expected = roundCurrency(system === "co_partner" ? rate : basis * rate / 100);
  if (fieldNumber(row, PARTNER_COMMISSIONS.basisAmount) !== basis || fieldNumber(row, PARTNER_COMMISSIONS.commissionAmount) !== expected) return reject("ledger_amount_mismatch", "The ledger amounts differ from the approved locked calculation.");
  if (!await validateSettlementSnapshotReceipts(env, sessionId, snapshot) || !["paid", "verified", "paid_full", "fully_paid", "completed", "settled"].includes(normalizeStatus(fieldText(session, SESSION_FIELDS.paymentStatus)))) return reject("payment_not_verified", "Rechecked Payment Truth must still match every locked receipt.");
  if (["cancelled", "canceled", "void", "refunded", "declined"].includes(normalizeStatus(fieldText(session, SESSION_FIELDS.lifecycle) || fieldText(session, SESSION_FIELDS.status)))) return reject("session_not_payable", "The Session is cancelled, void or refunded.");
  return null;
}

const KEYWORD_PROFILE = { model: "fldjNlFofVm1xarDW", key: "fldiRYYHadjFNZav2", name: "fldQbELEfvRpED2eq", info: "fldX5kLQI97cBCc2x", remark: "fldC4cueqKzg2EHJx", status: "fldnGpRBJbkgBshPO", source: "fldyGGijcnECpaEVx", reviewer: "fld29VUuVF3jrWY5K", reviewedAt: "fldyK1ONRSS1PMAJi", version: "fldY5i3kQeiOkdFnL", public: "fldyFDzD9WAyCCqfh" };
async function publishApprovedPartnerProfile(env: RuntimeEnv, modelId: string, values: Record<string, unknown>, requestId: string, actor: string): Promise<void> {
  const table = "tblk0NqOj3NM5tEjs", model = await getAirtableRecord(env, env.AIRTABLE_TABLE_MODELS, modelId);
  const all = await listAirtableRecords(env, table); // Linked-field formulas expose primary labels, not record IDs; exact-filter returned links.
  const rows = all.filter((r) => fieldLinkIds(r, KEYWORD_PROFILE.model).includes(modelId));
  if (rows.length > 1) throw new Error("canonical_profile_conflict_requires_reconciliation");
  const existing = rows[0], source = `partner-profile:${requestId}`;
  if (existing && fieldText(existing, KEYWORD_PROFILE.source) === source) return;
  // Keep customer scope, public-Kenji, pricing and media entitlement policy unchanged.
  // Only the explicitly shared, owner-reviewed allowlist reaches customer-safe copy.
  const info = [values.age ? `อายุ ${values.age}` : "", values.height_cm ? `ส่วนสูง ${values.height_cm} ซม.` : "", values.weight_kg ? `น้ำหนัก ${values.weight_kg} กก.` : "", readString(values, "profile_summary"), readString(values, "skills_summary"), readString(values, "experience_summary")].filter(Boolean).join("\n");
  const remark = [readString(values, "sales_copy"), ...(Array.isArray(values.portfolio_urls) ? values.portfolio_urls.map(String) : [])].filter(Boolean).join("\n");
  const fields: AirtableFields = { [KEYWORD_PROFILE.model]: [modelId], [KEYWORD_PROFILE.key]: fieldText(model, MODELS.uniqueKey) || modelId, [KEYWORD_PROFILE.name]: readString(values, "display_name") || modelName(model), [KEYWORD_PROFILE.info]: info, [KEYWORD_PROFILE.remark]: remark, [KEYWORD_PROFILE.source]: source, [KEYWORD_PROFILE.reviewer]: actor, [KEYWORD_PROFILE.reviewedAt]: new Date().toISOString(), [KEYWORD_PROFILE.version]: existing ? fieldNumber(existing, KEYWORD_PROFILE.version) + 1 : 1 };
  if (existing) await airtableFetch(env, `${table}/${existing.id}`, { method: "PATCH", body: JSON.stringify({ fields, typecast: true }) });
  else await createAirtableRecord(env, table, { ...fields, [KEYWORD_PROFILE.status]: "Active", [KEYWORD_PROFILE.public]: "No" });
}

async function readSharedPartnerImage(env: RuntimeEnv, row: AirtableRecord): Promise<{ bytes: ArrayBuffer; type: string; digest: string } | null> {
  const key = fieldText(row, PARTNER_ASSETS.r2Key) || "", type = fieldText(row, PARTNER_ASSETS.fileType) || "";
  const partner = fieldLinkIds(row, PARTNER_ASSETS.partner)[0], model = fieldLinkIds(row, PARTNER_ASSETS.model)[0];
  if (!partner || !model || !key.startsWith(`partner-shared/${(await sha256Hex(partner)).slice(0, 20)}/${model}/`) || !["image/jpeg", "image/png", "image/webp"].includes(type)) return null;
  const bucket = (env as RuntimeEnv & { PARTNER_ASSETS?: R2Bucket }).PARTNER_ASSETS;
  const object = bucket ? await bucket.get(key) : null;
  if (!object || object.size > MAX_UPLOAD_SIZE) return null;
  const bytes = await object.arrayBuffer(), b = new Uint8Array(bytes);
  const valid = type === "image/jpeg" ? b[0] === 255 && b[1] === 216 && b[2] === 255 : type === "image/png" ? [137,80,78,71,13,10,26,10].every((v,i) => b[i] === v) : new TextDecoder().decode(b.slice(0,4)) === "RIFF" && new TextDecoder().decode(b.slice(8,12)) === "WEBP";
  if (!valid) return null;
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (x) => x.toString(16).padStart(2, "0")).join("");
  return { bytes, type, digest };
}
function sharedImageResponse(image: { bytes: ArrayBuffer; type: string; digest: string }): Response {
  return new Response(image.bytes, { headers: { "content-type": image.type, "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "x-media-sha256": image.digest, "content-security-policy": "default-src 'none'; sandbox" } });
}
async function handleOwnerPartnerImage(request: Request, env: RuntimeEnv): Promise<Response> {
  const auth = verifyAdminAuthority(request, env); if (auth) return auth;
  const id = new URL(request.url).searchParams.get("request_id") || "";
  if (!/^rec[A-Za-z0-9]{14,24}$/.test(id)) return errorResponse(request, env, "request_invalid", "Choose a media request.", 400, false);
  const change = await getAirtableRecord(env, partnerModelChangesTable(env), id), payload = parseJson(fieldText(change, PARTNER_MODEL_CHANGES.payloadJson) || "{}");
  if (!isRecord(payload) || !["set_cover", "archive_asset", "restore_asset"].includes(fieldText(change, PARTNER_MODEL_CHANGES.action) || "") || change.fields[PARTNER_MODEL_CHANGES.shareWithMmd] !== true) return errorResponse(request, env, "media_request_invalid", "Shared media review is required.", 409, false);
  const asset = await getAirtableRecord(env, env.AIRTABLE_TABLE_PARTNER_ASSETS, readString(payload, "asset_id"));
  if (fieldLinkIds(asset, PARTNER_ASSETS.partner)[0] !== fieldLinkIds(change, PARTNER_MODEL_CHANGES.partner)[0] || fieldLinkIds(asset, PARTNER_ASSETS.model)[0] !== fieldLinkIds(change, PARTNER_MODEL_CHANGES.model)[0]) return errorResponse(request, env, "asset_scope_forbidden", "Media no longer matches the review request.", 403, false);
  const image = await readSharedPartnerImage(env, asset);
  return image ? sharedImageResponse(image) : errorResponse(request, env, "image_unavailable", "A valid image is required.", 404, false);
}
async function publishApprovedPartnerCover(env: RuntimeEnv, asset: AirtableRecord, modelId: string, digest: string): Promise<string> {
  const url = `https://www.mmdbkk.com/v1/partner/public-model-image?asset_id=${asset.id}&sha256=${digest}`;
  const table = "tblrpQXhHnbTU9RhW", mediaId = `partner-cover-${asset.id}`;
  const rows = await listAirtableRecords(env, table, { filterByFormula: `{fld3B0OZuDYYjYdzu}='${mediaId}'`, maxRecords: 2 });
  if (rows.length > 1) throw new Error("canonical_media_conflict_requires_reconciliation");
  const fields: AirtableFields = { fld3B0OZuDYYjYdzu: mediaId, fldknjo3y47i3lR33: [modelId], fldJRlyE6RMaze62d: "profile_photo", fldVo9NWbfZYe5cif: "public_candidate", fldqod6rvT9MH77wx: "profile_photo", fldQiEnIJj5LjGy52: "approved", fldTS03RmDt3VkNrX: true, fldlWI6JpBI2DCHYD: false, fldF4zwz9hlwyE8f8: false, fldUfFXH8ouiveNvD: fieldText(asset, PARTNER_ASSETS.fileName), fldakN0VbkG9fuPnI: fieldText(asset, PARTNER_ASSETS.fileType), fldNSnlJECoDVRSb2: fieldNumber(asset, PARTNER_ASSETS.fileSize), fldpBoulQNLRvV67v: env.PARTNER_ASSETS_BUCKET_NAME, fldeojBmc0JPYwAoz: fieldText(asset, PARTNER_ASSETS.r2Key), fld97cl9GuXRUMGJV: fieldText(asset, PARTNER_ASSETS.uploadedAt) };
  if (rows[0]) await updateAirtableRecord(env, table, rows[0].id, fields); else await createAirtableRecord(env, table, fields);
  await updateAirtableRecord(env, env.AIRTABLE_TABLE_MODELS, modelId, { [MODELS.publicImageUrl]: url });
  return url;
}
async function handlePublicPartnerImage(request: Request, env: RuntimeEnv): Promise<Response> {
  const url = new URL(request.url), id = url.searchParams.get("asset_id") || "", digest = url.searchParams.get("sha256") || "";
  const missing = () => new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
  if (!/^rec[A-Za-z0-9]{14,24}$/.test(id) || !/^[a-f0-9]{64}$/.test(digest)) return missing();
  const asset = await getAirtableRecord(env, env.AIRTABLE_TABLE_PARTNER_ASSETS, id);
  const meta = parseJson(fieldText(asset, PARTNER_ASSETS.payloadJson) || "{}");
  if (fieldText(asset, PARTNER_ASSETS.reviewStatus) !== "approved" || !isRecord(meta) || meta.public_approved !== true || meta.reviewed_sha256 !== digest || meta.partner_cover !== true) return missing();
  const modelId = fieldLinkIds(asset, PARTNER_ASSETS.model)[0]; if (!modelId) return missing();
  const model = await getAirtableRecord(env, env.AIRTABLE_TABLE_MODELS, modelId);
  if (fieldText(model, MODELS.publicImageUrl) !== `https://www.mmdbkk.com/v1/partner/public-model-image?asset_id=${id}&sha256=${digest}`) return missing();
  const image = await readSharedPartnerImage(env, asset);
  return image && image.digest === digest ? sharedImageResponse(image) : missing();
}

async function handleAdminModelChangeQueue(request: Request, env: RuntimeEnv): Promise<Response> {
  const auth = verifyAdminAuthority(request, env);
  if (auth) return auth;
  const rows = await listAirtableRecords(env, partnerModelChangesTable(env), { sort: [{ field: PARTNER_MODEL_CHANGES.submittedAt, direction: "desc" }] });
  return json(request, env, { ok: true, requests: rows.map(normalizePartnerModelChange) });
}

async function handleAdminModelChangeDecision(request: Request, env: RuntimeEnv): Promise<Response> {
  const auth = verifyAdminAuthority(request, env);
  if (auth) return auth;
  const body = await readJsonObject(request);
  if (!body.ok) return errorResponse(request, env, "invalid_json", body.error, 400, false);
  const requestId = readString(body.value, "request_record_id"), decision = readString(body.value, "decision");
  if (!/^rec[A-Za-z0-9]{14,24}$/.test(requestId) || !["approve", "reject"].includes(decision)) return errorResponse(request, env, "decision_invalid", "Choose a request and decision.", 400, false);
  const row = await getAirtableRecord(env, partnerModelChangesTable(env), requestId);
  const action = fieldText(row, PARTNER_MODEL_CHANGES.action) || "";
  if (!["add_model", "update_profile", "remove_model", "console_request", "archive_asset", "restore_asset", "set_cover"].includes(action)) return errorResponse(request, env, "decision_action_invalid", "Use the dedicated agreement review for this request.", 409, false);
  const previousStatus = normalizeStatus(fieldText(row, PARTNER_MODEL_CHANGES.status));
  if (previousStatus !== "review") return json(request, env, { ok: true, idempotent: true, status: previousStatus });
  const parsed = parseJson(fieldText(row, PARTNER_MODEL_CHANGES.payloadJson) || "{}");
  if (!isRecord(parsed) || row.fields[PARTNER_MODEL_CHANGES.shareWithMmd] !== true) return errorResponse(request, env, "shared_payload_invalid", "Explicitly shared data is required.", 409, false);
  const validated = buildSharedPartnerModelPayload(parsed, action);
  if (!validated.ok) return errorResponse(request, env, validated.error, validated.message, 409, false);
  const partnerId = fieldLinkIds(row, PARTNER_MODEL_CHANGES.partner)[0] || "";
  if (!partnerId) return errorResponse(request, env, "partner_link_missing", "Canonical Partner is required.", 409, false);
  let modelId = fieldLinkIds(row, PARTNER_MODEL_CHANGES.model)[0] || "";
  const now = new Date().toISOString(), note = readString(body.value, "note").slice(0, 2000);
  let applied = false;
  if (decision === "approve") {
    const partner = await getAirtableRecord(env, env.AIRTABLE_TABLE_MODEL_PARTNERS, partnerId);
    if (normalizeStatus(fieldText(partner, MODEL_PARTNERS.status)) !== "active" || normalizeStatus(fieldText(partner, MODEL_PARTNERS.approvalStatus)) !== "recognized") return errorResponse(request, env, "partner_not_active", "Partner must remain active and recognized.", 409, false);
    const referrals = await listLinkedRecordsForPartner(env, env.AIRTABLE_TABLE_MODEL_REFERRALS, MODEL_REFERRALS.partner, partnerId, fieldText(partner, MODEL_PARTNERS.partnerId) || "");
    let referral = referrals.find((r) => fieldLinkIds(r, MODEL_REFERRALS.model).includes(modelId));
    if (action === "add_model") {
      // Explicit owner approval creates inventory only. Sales/entitlements remain off.
      const key = `partner-intake-${requestId}`;
      const existing = await listAirtableRecords(env, env.AIRTABLE_TABLE_MODELS, { filterByFormula: `{${MODELS.uniqueKey}}='${key}'`, maxRecords: 2 });
      if (existing.length > 1) return errorResponse(request, env, "model_intake_conflict", "Duplicate canonical inventory requires review.", 409, false);
      const model = existing[0] || await createAirtableRecord(env, env.AIRTABLE_TABLE_MODELS, {
        [MODELS.uniqueKey]: key,
        [MODELS.workingName]: readString(validated.value, "display_name"),
        [MODELS.availableNow]: false,
        fld9YrnlELxggG6yA: false,
        fldnfx9PFseLvcYYq: false,
        [MODELS.heightCm]: readFiniteNumber(validated.value.height_cm),
        [MODELS.weightKg]: readFiniteNumber(validated.value.weight_kg),
        [MODELS.skillsSummary]: readString(validated.value, "skills_summary"),
        [MODELS.experienceSummary]: readString(validated.value, "experience_summary")
      }, true);
      modelId = model.id;
      referral = referrals.find((r) => fieldLinkIds(r, MODEL_REFERRALS.model).includes(modelId));
      if (!referral) await createAirtableRecord(env, env.AIRTABLE_TABLE_MODEL_REFERRALS, {
        [MODEL_REFERRALS.referralId]: `partner-intake-${requestId}`,
        [MODEL_REFERRALS.partner]: [partnerId], [MODEL_REFERRALS.model]: [modelId],
        [MODEL_REFERRALS.ownershipStatus]: "active", [MODEL_REFERRALS.referredAt]: now,
        [MODEL_REFERRALS.approvedAt]: now, [MODEL_REFERRALS.approvedBy]: "boss_per",
        [MODEL_REFERRALS.notes]: `Owner-approved roster intake ${requestId}; no commission or sales agreement activated.`
      }, true);
      await publishApprovedPartnerProfile(env, modelId, validated.value, requestId, request.headers.get("x-mmd-owner-id") || "boss_per");
      applied = true;
    } else if (action !== "console_request") {
      if (!referral || ["revoked", "transferred"].includes(normalizeStatus(fieldText(referral, MODEL_REFERRALS.ownershipStatus)))) return errorResponse(request, env, "partner_model_scope_forbidden", "The Partner relationship changed.", 409, false);
      if (action === "update_profile") {
        const values = validated.value;
        const fields: AirtableFields = {
          [MODELS.skillsSummary]: readString(values, "skills_summary"),
          [MODELS.experienceSummary]: readString(values, "experience_summary")
        };
        if (readString(values, "display_name")) fields[MODELS.workingName] = readString(values, "display_name");
        if (values.height_cm != null) fields[MODELS.heightCm] = Number(values.height_cm);
        if (values.weight_kg != null) fields[MODELS.weightKg] = Number(values.weight_kg);
        await updateAirtableRecord(env, env.AIRTABLE_TABLE_MODELS, modelId, fields, true);
        await publishApprovedPartnerProfile(env, modelId, values, requestId, request.headers.get("x-mmd-owner-id") || "boss_per");
      } else if (action === "remove_model") {
        await updateAirtableRecord(env, env.AIRTABLE_TABLE_MODEL_REFERRALS, referral.id, { [MODEL_REFERRALS.ownershipStatus]: "inactive", [MODEL_REFERRALS.notes]: appendNote(fieldText(referral, MODEL_REFERRALS.notes), `[${now}] Roster removed by owner; request ${requestId}`) }, true);
      } else {
        const assetId = readString(validated.value, "asset_id");
        const asset = await getAirtableRecord(env, env.AIRTABLE_TABLE_PARTNER_ASSETS, assetId);
        if (!fieldLinkIds(asset, PARTNER_ASSETS.partner).includes(partnerId) || !fieldLinkIds(asset, PARTNER_ASSETS.model).includes(modelId)) return errorResponse(request, env, "asset_scope_forbidden", "The asset relationship changed.", 409, false);
        if (action === "set_cover" && !["image/jpeg", "image/png", "image/webp"].includes(fieldText(asset, PARTNER_ASSETS.fileType) || "")) return errorResponse(request, env, "cover_image_required", "A cover must be an image.", 409, false);
        let reviewedDigest = "";
        if (action === "set_cover") {
          const image = await readSharedPartnerImage(env, asset);
          if (!image || body.value.approve_public_image !== true || readString(body.value, "reviewed_sha256") !== image.digest) return errorResponse(request, env, "image_review_required", "Preview this exact image and explicitly approve public use before publishing.", 409, false);
          reviewedDigest = image.digest;
          await publishApprovedPartnerCover(env, asset, modelId, image.digest);
        }
        if (action === "archive_asset") {
          const media = await listAirtableRecords(env, "tblrpQXhHnbTU9RhW", { filterByFormula: `{fld3B0OZuDYYjYdzu}='partner-cover-${asset.id}'` });
          for (const row of media) await updateAirtableRecord(env, "tblrpQXhHnbTU9RhW", row.id, { fldQiEnIJj5LjGy52: "archived", fldTS03RmDt3VkNrX: false });
          const model = await getAirtableRecord(env, env.AIRTABLE_TABLE_MODELS, modelId);
          if ((fieldText(model, MODELS.publicImageUrl) || "").startsWith(`https://www.mmdbkk.com/v1/partner/public-model-image?asset_id=${asset.id}&`)) await airtableFetch(env, `${env.AIRTABLE_TABLE_MODELS}/${modelId}`, { method: "PATCH", body: JSON.stringify({ fields: { [MODELS.publicImageUrl]: "" } }) });
        }
        const metadata = parseJson(fieldText(asset, PARTNER_ASSETS.payloadJson) || "{}");
        await updateAirtableRecord(env, env.AIRTABLE_TABLE_PARTNER_ASSETS, assetId, {
          [PARTNER_ASSETS.reviewStatus]: action === "archive_asset" ? "archived" : "approved",
          [PARTNER_ASSETS.payloadJson]: JSON.stringify({ ...(isRecord(metadata) ? metadata : {}), partner_cover: action === "set_cover", public_approved: action === "set_cover", reviewed_sha256: reviewedDigest, decided_at: now, decided_by: "boss_per", decision_request: requestId }),
          [PARTNER_ASSETS.notes]: appendNote(fieldText(asset, PARTNER_ASSETS.notes), `[${now}] ${action} approved; ${requestId}`)
        }, true);
      }
      applied = true;
    } else if (!note) {
      return errorResponse(request, env, "response_note_required", "Provide the team response to this coordination request.", 400, false);
    }
  }
  await updateAirtableRecord(env, partnerModelChangesTable(env), requestId, {
    [PARTNER_MODEL_CHANGES.status]: decision === "approve" ? "approved" : "rejected",
    ...(modelId ? { [PARTNER_MODEL_CHANGES.model]: [modelId] } : {}),
    [PARTNER_MODEL_CHANGES.updatedAt]: now,
    [PARTNER_MODEL_CHANGES.actorRef]: "boss_per",
    [PARTNER_MODEL_CHANGES.payloadJson]: JSON.stringify({ ...validated.value, decision_note: note, decided_at: now, decided_by: "boss_per", canonical_model_record_id: modelId || null })
  }, true);
  return json(request, env, { ok: true, status: decision === "approve" ? "approved" : "rejected", canonical_model_mutated: applied, model_record_id: modelId || null });
}

async function handlePartnerModelChange(request: Request, env: RuntimeEnv): Promise<Response> {
  const verified = await verifyPartnerTokenFromRequest(request, env);
  if (!verified.ok) return verified.response;
  const body = await readJsonObject(request);
  if (!body.ok) return errorResponse(request, env, "invalid_json", body.error, 400, false);
  if (body.value.share_with_mmd !== true) {
    return errorResponse(request, env, "explicit_share_required", "Select Share with MMD before submitting shared profile data.", 400, false);
  }

  const action = readString(body.value, "action");
  if (!new Set(["add_model", "update_profile", "remove_model", "console_request", "archive_asset", "restore_asset", "set_cover"]).has(action)) {
    return errorResponse(request, env, "model_change_action_invalid", "Unsupported model change action.", 400, false);
  }
  const modelRecordId = readString(body.value, "model_record_id");
  let ownedReferral: AirtableRecord | null = null;
  if (!["add_model", "console_request"].includes(action)) {
    if (!/^rec[A-Za-z0-9]{14,24}$/.test(modelRecordId)) {
      return errorResponse(request, env, "model_record_id_invalid", "A canonical linked model is required.", 400, false);
    }
    const referrals = await listLinkedRecordsForPartner(
      env,
      env.AIRTABLE_TABLE_MODEL_REFERRALS,
      MODEL_REFERRALS.partner,
      verified.value.partnerRecord.id,
      fieldText(verified.value.partnerRecord, MODEL_PARTNERS.partnerId) || ""
    );
    ownedReferral = referrals.find((record) => fieldLinkIds(record, MODEL_REFERRALS.model).includes(modelRecordId)) || null;
    if (!ownedReferral || ["inactive", "revoked", "transferred", "archived"].includes(normalizeStatus(fieldText(ownedReferral, MODEL_REFERRALS.ownershipStatus)))) {
      return errorResponse(request, env, "partner_model_scope_forbidden", "This model is outside the Partner relationship scope.", 403, false);
    }
  }

  const payload = buildSharedPartnerModelPayload(body.value, action);
  if (!payload.ok) return errorResponse(request, env, payload.error, payload.message, 400, false);
  if (action === "console_request") {
    const session = await getAirtableRecord(env, String((env as RuntimeEnv & { AIRTABLE_TABLE_SESSIONS?: string }).AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX"), readString(payload.value, "session_record_id"));
    if (fieldText(session, SESSION_FIELDS.partnerIdSnapshot) !== fieldText(verified.value.partnerRecord, MODEL_PARTNERS.partnerId)) return errorResponse(request, env, "partner_session_scope_forbidden", "This job is outside the Partner scope.", 403, false);
  }
  if (["archive_asset", "restore_asset", "set_cover"].includes(action)) {
    const asset = await getAirtableRecord(env, env.AIRTABLE_TABLE_PARTNER_ASSETS, readString(payload.value, "asset_id"));
    if (!fieldLinkIds(asset, PARTNER_ASSETS.partner).includes(verified.value.partnerRecord.id) || !fieldLinkIds(asset, PARTNER_ASSETS.model).includes(modelRecordId)) return errorResponse(request, env, "asset_scope_forbidden", "This asset is outside the Partner model scope.", 403, false);
  }

  const idempotencyKey = String(request.headers.get("Idempotency-Key") || "").trim();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 180) {
    return errorResponse(request, env, "idempotency_key_required", "A stable Idempotency-Key is required.", 400, false);
  }
  const digest = await sha256Hex(`${verified.value.partnerRecord.id}:${action}:${modelRecordId}:${idempotencyKey}`);
  const requestKey = `pmc_${digest.slice(0, 28)}`;
  const tableId = String(
    (env as RuntimeEnv & { AIRTABLE_TABLE_PARTNER_MODEL_CHANGES?: string }).AIRTABLE_TABLE_PARTNER_MODEL_CHANGES ||
    "tbl8kxhjKzGU0xx4L"
  );
  const existing = await listAirtableRecords(env, tableId, {
    filterByFormula: `{${PARTNER_MODEL_CHANGES.requestKey}}='${escapeFormulaString(requestKey)}'`,
    maxRecords: 2
  });
  if (existing.length === 1) {
    return json(request, env, { ok: true, idempotent: true, request_id: existing[0]?.id, status: "review" });
  }
  if (existing.length > 1) {
    return errorResponse(request, env, "model_change_idempotency_conflict", "Duplicate change request requires review.", 409, false);
  }

  const now = new Date().toISOString();
  const partnerId = fieldText(verified.value.partnerRecord, MODEL_PARTNERS.partnerId) || verified.value.partnerRecord.id;
  const fields: AirtableFields = {
    [PARTNER_MODEL_CHANGES.requestKey]: requestKey,
    [PARTNER_MODEL_CHANGES.partner]: [verified.value.partnerRecord.id],
    [PARTNER_MODEL_CHANGES.action]: action,
    [PARTNER_MODEL_CHANGES.status]: "review",
    [PARTNER_MODEL_CHANGES.payloadJson]: JSON.stringify(payload.value),
    [PARTNER_MODEL_CHANGES.shareWithMmd]: true,
    [PARTNER_MODEL_CHANGES.idempotencyKey]: digest,
    [PARTNER_MODEL_CHANGES.revision]: 1,
    [PARTNER_MODEL_CHANGES.submittedAt]: now,
    [PARTNER_MODEL_CHANGES.updatedAt]: now,
    [PARTNER_MODEL_CHANGES.actorRef]: `partner:${verified.value.partnerRecord.id}`,
    [PARTNER_MODEL_CHANGES.partnerId]: partnerId
  };
  if (modelRecordId) fields[PARTNER_MODEL_CHANGES.model] = [modelRecordId];
  const created = await createAirtableRecord(env, tableId, fields, true);

  try {
    await sendTelegramMessage(env, [
      "PARTNER MODEL CHANGE",
      "",
      `Partner: ${fieldText(verified.value.partnerRecord, MODEL_PARTNERS.partnerName) || verified.value.partnerRecord.id}`,
      `Action: ${action}`,
      `Model: ${modelRecordId || readString(payload.value, "display_name") || "New model"}`,
      `Request: ${created.id}`,
      "Privacy: explicitly shared with MMD"
    ].join("\n"), "partner_confirm");
  } catch (error) {
    console.error("partner model change telegram alert failed", error);
  }

  return json(request, env, {
    ok: true,
    request_id: created.id,
    status: "review",
    action,
    canonical_model_mutated: false,
    shared_with_mmd: true
  }, 201);
}

function buildSharedPartnerModelPayload(
  body: Record<string, unknown>,
  action: string
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string; message: string } {
  if (action === "console_request") {
    const sessionRecordId = readString(body, "session_record_id");
    const message = readString(body, "message").slice(0, 2000);
    if (!/^rec[A-Za-z0-9]{14,24}$/.test(sessionRecordId) || !message) return { ok: false, error: "console_request_invalid", message: "A linked job and a message are required." };
    return { ok: true, value: { session_record_id: sessionRecordId, message } };
  }
  if (["archive_asset", "restore_asset", "set_cover"].includes(action)) {
    const assetId = readString(body, "asset_id");
    if (!/^rec[A-Za-z0-9]{14,24}$/.test(assetId)) return { ok: false, error: "asset_id_invalid", message: "A valid asset is required." };
    return { ok: true, value: { asset_id: assetId } };
  }
  if (action === "remove_model") {
    return { ok: true, value: { reason: readString(body, "reason").slice(0, 1200) } };
  }
  const displayName = readString(body, "display_name").slice(0, 120);
  if (action === "add_model" && !displayName) {
    return { ok: false, error: "display_name_required", message: "Model display name is required." };
  }
  const age = readBoundedNumber(body.age, 18, 70);
  const height = readBoundedNumber(body.height_cm, 120, 230);
  const weight = readBoundedNumber(body.weight_kg, 35, 250);
  if (hasSubmittedValue(body.age) && age === null) return { ok: false, error: "age_invalid", message: "Age must be between 18 and 70." };
  if (hasSubmittedValue(body.height_cm) && height === null) return { ok: false, error: "height_invalid", message: "Height must be between 120 and 230 cm." };
  if (hasSubmittedValue(body.weight_kg) && weight === null) return { ok: false, error: "weight_invalid", message: "Weight must be between 35 and 250 kg." };
  const urls = normalizeHttpsUrls(body.portfolio_urls, 3);
  if (Array.isArray(body.portfolio_urls) && urls.length !== body.portfolio_urls.filter((entry) => String(entry || "").trim()).length) {
    return { ok: false, error: "portfolio_url_invalid", message: "Portfolio links must be valid HTTPS URLs." };
  }
  return {
    ok: true,
    value: compactObject({
      display_name: displayName,
      age,
      height_cm: height,
      weight_kg: weight,
      profile_summary: readString(body, "profile_summary").slice(0, 4000),
      skills_summary: readString(body, "skills_summary").slice(0, 5000),
      experience_summary: readString(body, "experience_summary").slice(0, 5000),
      sales_copy: readString(body, "sales_copy").slice(0, 5000),
      portfolio_urls: urls,
      availability_note: readString(body, "availability_note").slice(0, 1200)
    })
  };
}

async function handlePartnerModelUpload(request: Request, env: RuntimeEnv): Promise<Response> {
  const verified = await verifyPartnerTokenFromRequest(request, env);
  if (!verified.ok) return verified.response;
  const bucket = (env as RuntimeEnv & { PARTNER_ASSETS?: R2Bucket }).PARTNER_ASSETS;
  if (!bucket) return errorResponse(request, env, "uploads_unavailable", "File uploads are not enabled right now.", 503, true);
  if (!request.headers.get("Content-Type")?.includes("multipart/form-data")) {
    return errorResponse(request, env, "invalid_content_type", "Expected multipart FormData.", 400, false);
  }
  const form = await request.formData();
  if (stringFromForm(form.get("share_with_mmd")) !== "true") {
    return errorResponse(request, env, "explicit_share_required", "Select Share with MMD before uploading profile media.", 400, false);
  }
  const modelRecordId = stringFromForm(form.get("model_record_id"));
  if (!/^rec[A-Za-z0-9]{14,24}$/.test(modelRecordId)) {
    return errorResponse(request, env, "model_record_id_invalid", "A canonical linked model is required.", 400, false);
  }
  const referrals = await listLinkedRecordsForPartner(
    env,
    env.AIRTABLE_TABLE_MODEL_REFERRALS,
    MODEL_REFERRALS.partner,
    verified.value.partnerRecord.id,
    fieldText(verified.value.partnerRecord, MODEL_PARTNERS.partnerId) || ""
  );
  const referral = referrals.find((record) => fieldLinkIds(record, MODEL_REFERRALS.model).includes(modelRecordId));
  if (!referral) return errorResponse(request, env, "partner_model_scope_forbidden", "This model is outside the Partner relationship scope.", 403, false);

  const file = form.get("file");
  if (!(file instanceof File)) return errorResponse(request, env, "file_missing", "A file field is required.", 400, false);
  if (!ALLOWED_MIME_TYPES.has(file.type)) return errorResponse(request, env, "unsupported_file_type", "Only JPG, PNG, WebP, and PDF files are allowed.", 415, false);
  if (file.size > MAX_UPLOAD_SIZE) return errorResponse(request, env, "file_too_large", "Maximum upload size is 20MB per file.", 413, false);
  const category = parseFileCategory(stringFromForm(form.get("file_category")) || "photo");
  if (!category || !new Set(["photo", "portfolio", "comp_card"]).has(category)) {
    return errorResponse(request, env, "invalid_file_category", "Choose photo, portfolio, or comp_card.", 400, false);
  }

  const requestId = generateRequestId();
  const partnerHash = (await sha256Hex(verified.value.partnerRecord.id)).slice(0, 20);
  const r2Key = `partner-shared/${partnerHash}/${modelRecordId}/${compactTimestamp()}-${safeFilename(file.name)}`;
  await bucket.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { scope: "shared_with_mmd", category, model_record_id: modelRecordId }
  });
  const now = new Date().toISOString();
  const metadata: UploadedFileMetadata = {
    r2_key: r2Key,
    file_name: file.name,
    file_type: file.type,
    file_size: file.size,
    file_category: category
  };
  const fields = buildAssetFields({
    requestId,
    index: 0,
    file: metadata,
    partnerRecordId: verified.value.partnerRecord.id,
    referralRecordId: referral.id,
    modelApplicationRecordId: null,
    talentName: "",
    talentType: "model",
    portfolioUrl: "",
    sourcePath: "/partner/dashboard",
    now,
    bucketName: env.PARTNER_ASSETS_BUCKET_NAME
  });
  fields[PARTNER_ASSETS.model] = [modelRecordId];
  fields[PARTNER_ASSETS.payloadJson] = JSON.stringify({ ...metadata, scope: "shared_with_mmd" });
  const asset = await createAirtableRecord(env, env.AIRTABLE_TABLE_PARTNER_ASSETS, fields, true);
  return json(request, env, { ok: true, asset_id: asset.id, review_status: "pending_review", shared_with_mmd: true }, 201);
}

async function handlePartnerAssets(request: Request, env: RuntimeEnv): Promise<Response> {
  const verified = await verifyPartnerTokenFromRequest(request, env);
  if (!verified.ok) return verified.response;
  const partner = verified.value.partnerRecord;
  const rows = await listLinkedRecordsForPartner(env, env.AIRTABLE_TABLE_PARTNER_ASSETS, PARTNER_ASSETS.partner, partner.id, fieldText(partner, MODEL_PARTNERS.partnerId) || "");
  return json(request, env, { ok: true, assets: rows.map((row) => ({
    asset_id: row.id,
    model_record_id: fieldLinkIds(row, PARTNER_ASSETS.model)[0] || null,
    file_name: fieldText(row, PARTNER_ASSETS.fileName),
    file_type: fieldText(row, PARTNER_ASSETS.fileType),
    category: fieldText(row, PARTNER_ASSETS.fileCategory),
    review_status: fieldText(row, PARTNER_ASSETS.reviewStatus) || "pending_review",
    approved_cover: normalizeStatus(fieldText(row, PARTNER_ASSETS.reviewStatus)) === "approved" && (parseJson(fieldText(row, PARTNER_ASSETS.payloadJson) || "{}") as Record<string, unknown>)?.partner_cover === true,
    decision_at: (parseJson(fieldText(row, PARTNER_ASSETS.payloadJson) || "{}") as Record<string, unknown>)?.decided_at || null,
    uploaded_at: fieldText(row, PARTNER_ASSETS.uploadedAt),
    preview_available: ["image/jpeg", "image/png", "image/webp"].includes(fieldText(row, PARTNER_ASSETS.fileType) || "") && (fieldText(row, PARTNER_ASSETS.r2Key) || "").startsWith("partner-shared/")
  })) });
}

async function handlePartnerAssetRead(request: Request, env: RuntimeEnv): Promise<Response> {
  const verified = await verifyPartnerTokenFromRequest(request, env);
  if (!verified.ok) return verified.response;
  const assetId = new URL(request.url).searchParams.get("asset_id") || "";
  if (!/^rec[A-Za-z0-9]{14,24}$/.test(assetId)) return errorResponse(request, env, "asset_id_invalid", "A valid asset is required.", 400, false);
  const row = await getAirtableRecord(env, env.AIRTABLE_TABLE_PARTNER_ASSETS, assetId);
  if (!fieldLinkIds(row, PARTNER_ASSETS.partner).includes(verified.value.partnerRecord.id)) return errorResponse(request, env, "asset_scope_forbidden", "This asset is outside the Partner scope.", 403, false);
  const key = fieldText(row, PARTNER_ASSETS.r2Key) || "";
  const type = fieldText(row, PARTNER_ASSETS.fileType) || "";
  if (!key.startsWith("partner-shared/") || !["image/jpeg", "image/png", "image/webp"].includes(type)) return errorResponse(request, env, "asset_preview_unavailable", "No image preview is available.", 404, false);
  const bucket = (env as RuntimeEnv & { PARTNER_ASSETS?: R2Bucket }).PARTNER_ASSETS;
  const object = bucket ? await bucket.get(key) : null;
  if (!object) return errorResponse(request, env, "asset_preview_unavailable", "No image preview is available.", 404, false);
  return new Response(object.body, { headers: { "Content-Type": type, "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
}

async function handlePartnerJobAction(request: Request, env: RuntimeEnv): Promise<Response> {
  const verified = await verifyPartnerTokenFromRequest(request, env);
  if (!verified.ok) return verified.response;
  const body = await readJsonObject(request);
  if (!body.ok) return errorResponse(request, env, "invalid_json", body.error, 400, false);
  const sessionRecordId = readString(body.value, "session_record_id");
  const action = normalizeStatus(readString(body.value, "action"));
  const note = readString(body.value, "note").slice(0, 600);
  if (!/^rec[A-Za-z0-9]{14,24}$/.test(sessionRecordId)) return errorResponse(request, env, "session_record_id_invalid", "Invalid session.", 400, false);
  const nextStatus = ({ confirm: "confirmed", changes: "changes_requested", decline: "declined" } as Record<string, string>)[action];
  if (!nextStatus) return errorResponse(request, env, "partner_confirmation_action_invalid", "Choose confirm, changes, or decline.", 400, false);

  const tableId = String((env as RuntimeEnv & { AIRTABLE_TABLE_SESSIONS?: string }).AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX");
  const session = await getAirtableRecord(env, tableId, sessionRecordId);
  const partnerId = fieldText(verified.value.partnerRecord, MODEL_PARTNERS.partnerId) || "";
  if (!partnerId || fieldText(session, SESSION_FIELDS.partnerIdSnapshot) !== partnerId) {
    return errorResponse(request, env, "partner_session_scope_forbidden", "This job is outside the Partner relationship scope.", 403, false);
  }
  const currentStatus = normalizeStatus(fieldText(session, SESSION_FIELDS.partnerConfirmationStatus));
  const currentRevision = fieldNumber(session, SESSION_FIELDS.partnerConfirmationRevision);
  const paymentStatus = normalizeStatus(fieldText(session, SESSION_FIELDS.paymentStatus));
  if (["completed", "cancelled", "canceled", "declined", "closed", "void"].includes(normalizeStatus(fieldText(session, SESSION_FIELDS.lifecycle) || fieldText(session, SESSION_FIELDS.status)))) {
    return errorResponse(request, env, "job_already_closed", "This job is already closed.", 409, false);
  }
  if (!isOfficiallyVerifiedPaymentStatus(paymentStatus) || !(await officiallyVerifiedPartnerSessions(env, [session])).has(fieldText(session, SESSION_FIELDS.sessionId) || "")) {
    return errorResponse(
      request,
      env,
      "official_verify_required",
      "Partner confirmation is available only after canonical Payment Truth reaches Official Verify.",
      409,
      false
    );
  }
  if (currentStatus === nextStatus) return json(request, env, { ok: true, idempotent: true, status: nextStatus, revision: currentRevision });
  if (["confirmed", "declined"].includes(currentStatus)) {
    return errorResponse(request, env, "partner_confirmation_already_final", `Job response is already ${currentStatus}.`, 409, false);
  }
  const now = new Date().toISOString();
  const revision = currentRevision + 1;
  await updateAirtableRecord(env, tableId, sessionRecordId, {
    [SESSION_FIELDS.partnerConfirmationStatus]: nextStatus,
    [SESSION_FIELDS.partnerConfirmedAt]: now,
    [SESSION_FIELDS.partnerConfirmationRevision]: revision,
    [SESSION_FIELDS.partnerConfirmationNote]: note || `Partner selected ${nextStatus} in Partner Dashboard.`
  }, true);
  try {
    await sendTelegramMessage(env, [
      "PARTNER DASHBOARD JOB RESPONSE",
      "",
      `Partner: ${fieldText(verified.value.partnerRecord, MODEL_PARTNERS.partnerName) || partnerId}`,
      `Session: ${fieldText(session, SESSION_FIELDS.sessionId) || sessionRecordId}`,
      `Model: ${fieldText(session, SESSION_FIELDS.modelName) || "Model"}`,
      `Response: ${nextStatus}`,
      `Revision: ${revision}`
    ].join("\n"), "partner_confirm");
  } catch (error) {
    console.error("partner dashboard job response telegram alert failed", error);
  }
  return json(request, env, { ok: true, status: nextStatus, revision, confirmed_at: now });
}

async function handlePartnerPrivateVaultGet(request: Request, env: RuntimeEnv): Promise<Response> {
  const verified = await verifyPartnerTokenFromRequest(request, env);
  if (!verified.ok) return verified.response;
  const bucket = (env as RuntimeEnv & { PARTNER_ASSETS?: R2Bucket }).PARTNER_ASSETS;
  if (!bucket) return errorResponse(request, env, "private_vault_unavailable", "Private Vault is temporarily unavailable.", 503, true);
  const key = await partnerPrivateVaultKey(verified.value.partnerRecord.id);
  const stored = await bucket.get(key);
  const response = stored
    ? json(request, env, { ok: true, exists: true, revision: stored.etag, envelope: parseJson(await stored.text()) })
    : json(request, env, { ok: true, exists: false, revision: null, envelope: null });
  response.headers.set("Cache-Control", "no-store, private");
  response.headers.set("X-MMD-Privacy", "client-side-encrypted");
  return response;
}

async function handlePartnerPrivateVaultPut(request: Request, env: RuntimeEnv): Promise<Response> {
  const verified = await verifyPartnerTokenFromRequest(request, env);
  if (!verified.ok) return verified.response;
  const bucket = (env as RuntimeEnv & { PARTNER_ASSETS?: R2Bucket }).PARTNER_ASSETS;
  if (!bucket) return errorResponse(request, env, "private_vault_unavailable", "Private Vault is temporarily unavailable.", 503, true);
  const body = await readJsonObject(request);
  if (!body.ok || !isRecord(body.value.envelope)) return errorResponse(request, env, "vault_envelope_invalid", "Encrypted vault envelope is required.", 400, false);
  const envelope = body.value.envelope;
  const version = Number(envelope.version || 0);
  const salt = readString(envelope, "salt");
  const iv = readString(envelope, "iv");
  const ciphertext = readString(envelope, "ciphertext");
  if (version !== 1 || !isBoundedBase64Url(salt, 16, 256) || !isBoundedBase64Url(iv, 12, 64) || !isBoundedBase64Url(ciphertext, 16, 900000)) {
    return errorResponse(request, env, "vault_envelope_invalid", "Encrypted vault envelope is invalid or too large.", 400, false);
  }
  const storedEnvelope = { version: 1, kdf: "PBKDF2-SHA256-310000", cipher: "AES-GCM-256", salt, iv, ciphertext, updated_at: new Date().toISOString() };
  const key = await partnerPrivateVaultKey(verified.value.partnerRecord.id);
  if (!Object.hasOwn(body.value, "revision")) return errorResponse(request, env, "vault_revision_required", "Reload the vault before saving.", 409, false);
  const revision = readString(body.value, "revision");
  const saved = await bucket.put(key, JSON.stringify(storedEnvelope), {
    onlyIf: revision ? { etagMatches: revision } : { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: "application/json" },
    customMetadata: { scope: "partner_private_ciphertext", version: "1" }
  });
  if (!saved) return errorResponse(request, env, "vault_conflict", "The vault changed on another device. Reload before saving.", 409, false);
  const response = json(request, env, { ok: true, stored: true, revision: saved.etag, plaintext_received: false, updated_at: storedEnvelope.updated_at });
  response.headers.set("Cache-Control", "no-store, private");
  response.headers.set("X-MMD-Privacy", "client-side-encrypted");
  return response;
}

async function partnerPrivateVaultKey(partnerRecordId: string): Promise<string> {
  const digest = await sha256Hex(`partner-private-vault:${partnerRecordId}`);
  return `partner-private-vault/v1/${digest.slice(0, 40)}.json`;
}

function isBoundedBase64Url(value: string, min: number, max: number): boolean {
  return value.length >= min && value.length <= max && /^[A-Za-z0-9_-]+$/.test(value);
}

function normalizeHttpsUrls(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const urls: string[] = [];
  for (const item of value) {
    const raw = String(item || "").trim();
    if (!raw) continue;
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== "https:") continue;
      urls.push(parsed.toString().slice(0, 1000));
    } catch {}
  }
  return [...new Set(urls)].slice(0, limit);
}

function readBoundedNumber(value: unknown, min: number, max: number): number | null {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function hasSubmittedValue(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function readFiniteNumber(value: unknown): number | null {
  const number = Number(value);
  return value !== undefined && value !== null && value !== "" && Number.isFinite(number) ? number : null;
}

function compactObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => {
    if (item === undefined || item === null || item === "") return false;
    if (Array.isArray(item) && item.length === 0) return false;
    return true;
  }));
}

function fieldAttachmentUrl(record: AirtableRecord, key: string): string | null {
  const value = record.fields[key];
  if (!Array.isArray(value)) return null;
  const first = value.find((entry) => isRecord(entry) && typeof entry.url === "string");
  return isRecord(first) && typeof first.url === "string" ? first.url : null;
}

const PARTNER_SALES_AUDIENCE = new Set(["Public Member","Elite","Red Card","Standard","Premium","VIP / Black Card","SVIP","Per Review"]);
const PARTNER_SALES_SCHEDULE = new Set(["Always","Date range","Date + time range","Weekly recurring"]);
const PARTNER_SALES_DAYS = new Set(["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]);

async function handlePartnerSalesControl(request: Request, env: RuntimeEnv, ctx: ExecutionContext): Promise<Response> {
  const verified = await verifyPartnerTokenFromRequest(request, env);
  if (!verified.ok) return verified.response;
  const body = await readJsonObject(request);
  if (!body.ok) return json(request, env, { ok:false, error:"invalid_json" }, 400);

  const modelId = readString(body.value, "model_id");
  if (!/^rec[A-Za-z0-9]{14,24}$/.test(modelId)) return json(request, env, { ok:false, error:"model_id_invalid" }, 400);
  const referrals = await listLinkedRecordsForPartner(env, env.AIRTABLE_TABLE_MODEL_REFERRALS, MODEL_REFERRALS.partner, verified.value.partnerRecord.id);
  const ownsModel = referrals.some((record) => fieldLinkIds(record, MODEL_REFERRALS.model).includes(modelId));
  if (!ownsModel) return json(request, env, { ok:false, error:"partner_model_scope_forbidden" }, 403);

  const partnerId = fieldText(verified.value.partnerRecord, MODEL_PARTNERS.partnerId);
  if (!partnerId) return json(request, env, { ok:false, error:"partner_identity_missing" }, 409);
  const modelRecord = await getAirtableRecord(env, env.AIRTABLE_TABLE_MODELS, modelId);
  const sourceRate = Number(body.value.partner_source_rate_thb);
  if (!Number.isFinite(sourceRate) || sourceRate < 0) return json(request, env, { ok:false, error:"partner_source_rate_invalid" }, 400);

  const visibilityRaw = normalizeStatus(readString(body.value, "sales_visibility") || "off");
  if (!["on","off"].includes(visibilityRaw)) return json(request, env, { ok:false, error:"sales_visibility_invalid" }, 400);
  const scheduleRaw = readString(body.value, "schedule_type") || "Always";
  if (!PARTNER_SALES_SCHEDULE.has(scheduleRaw)) return json(request, env, { ok:false, error:"schedule_type_invalid" }, 400);
  const audienceRaw = Array.isArray(body.value.audience_scope) ? body.value.audience_scope.map((item) => cleanText(item)) : [];
  if (audienceRaw.some((item) => !PARTNER_SALES_AUDIENCE.has(item))) return json(request, env, { ok:false, error:"audience_scope_invalid" }, 400);
  const daysRaw = Array.isArray(body.value.days_of_week) ? body.value.days_of_week.map((item) => cleanText(item)) : [];
  if (daysRaw.some((item) => !PARTNER_SALES_DAYS.has(item))) return json(request, env, { ok:false, error:"days_of_week_invalid" }, 400);
  const reason = readString(body.value, "change_reason").slice(0, 600);
  if (reason.length < 3) return json(request, env, { ok:false, error:"change_reason_required" }, 400);

  const tableId = String((env as RuntimeEnv & { AIRTABLE_TABLE_MODEL_OFFER_RULES?: string }).AIRTABLE_TABLE_MODEL_OFFER_RULES || "tblSbxUGTFqd2CgPy");
  const stableKey = `partner-sales-${normalizeStatus(partnerId)}-${modelId.toLowerCase()}-v1`;
  const existingRows = await listAirtableRecords(env, tableId, { maxRecords: 500 });
  const existing = existingRows.find((record) => fieldText(record, MODEL_OFFER_RULES.offerRuleKey) === stableKey) || null;
  const version = Math.max(0, Number(existing ? fieldNumber(existing, MODEL_OFFER_RULES.version) : 0) || 0) + 1;
  const now = new Date().toISOString();

  const fields: AirtableFields = {
    [MODEL_OFFER_RULES.offerRuleKey]: stableKey,
    [MODEL_OFFER_RULES.model]: [modelId],
    [MODEL_OFFER_RULES.modelKey]: fieldText(modelRecord, "fldYvAbkENGQ4NaaI") || fieldText(modelRecord, MODELS.workingName),
    [MODEL_OFFER_RULES.audienceScope]: audienceRaw,
    [MODEL_OFFER_RULES.partnerSourceRateThb]: sourceRate,
    [MODEL_OFFER_RULES.priceVisibility]: "Per approval only",
    [MODEL_OFFER_RULES.salesVisibility]: visibilityRaw,
    [MODEL_OFFER_RULES.scheduleType]: scheduleRaw,
    [MODEL_OFFER_RULES.effectiveFromAt]: readString(body.value, "effective_from_at") || null,
    [MODEL_OFFER_RULES.effectiveUntilAt]: readString(body.value, "effective_until_at") || null,
    [MODEL_OFFER_RULES.daysOfWeek]: daysRaw,
    [MODEL_OFFER_RULES.startTimeLocal]: readString(body.value, "start_time_local"),
    [MODEL_OFFER_RULES.endTimeLocal]: readString(body.value, "end_time_local"),
    [MODEL_OFFER_RULES.priority]: 0,
    [MODEL_OFFER_RULES.status]: "Draft",
    [MODEL_OFFER_RULES.requiresPerApproval]: "Yes",
    [MODEL_OFFER_RULES.sourceActorType]: "partner",
    [MODEL_OFFER_RULES.sourcePartnerRef]: partnerId,
    [MODEL_OFFER_RULES.changeReason]: reason,
    [MODEL_OFFER_RULES.updatedBy]: partnerId,
    [MODEL_OFFER_RULES.updatedAt]: now,
    [MODEL_OFFER_RULES.notifyStatus]: "pending",
    [MODEL_OFFER_RULES.version]: version
  };
  const saved = existing
    ? await updateAirtableRecord(env, tableId, existing.id, fields, true)
    : await createAirtableRecord(env, tableId, fields, true);

  ctx.waitUntil(sendTelegramMessage(env, [
    "MODEL SALES CONTROL · PARTNER PROPOSAL",
    "",
    `Partner: ${fieldText(verified.value.partnerRecord, MODEL_PARTNERS.partnerName) || partnerId}`,
    `Model: ${modelName(modelRecord)}`,
    `Source rate: ${sourceRate.toLocaleString("th-TH")} THB`,
    `Visibility proposal: ${visibilityRaw}`,
    `Audience: ${audienceRaw.join(", ") || "Per review"}`,
    `Schedule: ${scheduleRaw}`,
    `Version: ${version}`,
    "Status: Draft · requires Per approval"
  ].join("\n"), "partner_confirm").catch((error) => console.error("telegram partner sales proposal failed", error)));

  return json(request, env, {
    ok:true,
    authority:"model_sales_control_v1",
    state:"pending_per_approval",
    production_sales_changed:false,
    rule_id:saved.id,
    rule_key:stableKey,
    version
  });
}

async function handlePartnerTelegramConnect(request: Request, env: RuntimeEnv): Promise<Response> {
  const verified = await verifyPartnerTokenFromRequest(request, env);
  if (!verified.ok) return verified.response;

  const authority = (env as RuntimeEnv & { TELEGRAM_BIND_AUTHORITY?: Fetcher }).TELEGRAM_BIND_AUTHORITY;
  if (!authority?.fetch) {
    return errorResponse(request, env, "telegram_bind_authority_unavailable", "Telegram connection is temporarily unavailable.", 503, true);
  }

  const response = await authority.fetch(new Request("https://admin-worker.internal/__internal/telegram-identity-bind", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mmd-service-binding": "partners-worker"
    },
    body: JSON.stringify({
      operation: "issue_partner",
      partner_record_id: verified.value.partnerRecord.id
    })
  }));
  const payload = await response.json().catch(() => null) as {
    ok?: boolean;
    error?: string;
    telegram_connected?: boolean;
    state?: string;
    connect_url?: string | null;
    expires_at?: string | null;
  } | null;
  if (!response.ok || !payload?.ok) {
    return errorResponse(
      request,
      env,
      String(payload?.error || "telegram_bind_issue_failed"),
      "Unable to prepare Telegram connection.",
      response.status || 503,
      response.status >= 500
    );
  }
  return json(request, env, {
    ok: true,
    telegram_connected: payload.telegram_connected === true,
    state: payload.state || "connect_required",
    connect_url: payload.connect_url || null,
    expires_at: payload.expires_at || null
  });
}

async function handlePartnerJobConfirmInternal(request: Request, env: RuntimeEnv): Promise<Response> {
  if (new URL(request.url).hostname !== "partners-worker.internal") {
    return json(request, env, { ok: false, error: "internal_only" }, 403);
  }
  if (String(request.headers.get("x-mmd-service-binding") || "").trim() !== "telegram-worker") {
    return json(request, env, { ok: false, error: "internal_caller_invalid" }, 403);
  }
  const body = await readJsonObject(request);
  if (!body.ok) return json(request, env, { ok: false, error: "invalid_json" }, 400);

  const sessionRecordId = readString(body.value, "session_record_id");
  const telegramUserId = readString(body.value, "telegram_user_id");
  const action = normalizeStatus(readString(body.value, "action"));
  const note = readString(body.value, "note").slice(0, 600);
  if (!/^rec[A-Za-z0-9]{14,24}$/.test(sessionRecordId)) return json(request, env, { ok:false, error:"session_record_id_invalid" }, 400);
  if (!/^\d{5,20}$/.test(telegramUserId)) return json(request, env, { ok:false, error:"telegram_identity_invalid" }, 400);
  const statusByAction: Record<string,string> = {
    confirm: "confirmed",
    changes: "changes_requested",
    decline: "declined"
  };
  const nextStatus = statusByAction[action];
  if (!nextStatus) return json(request, env, { ok:false, error:"partner_confirmation_action_invalid" }, 400);

  const sessionsTable = String((env as RuntimeEnv & { AIRTABLE_TABLE_SESSIONS?: string }).AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX");
  const session = await getAirtableRecord(env, sessionsTable, sessionRecordId);
  const sf = session.fields || {};
  const partnerId = String(sf[SESSION_FIELDS.partnerIdSnapshot] || sf.partner_id_snapshot || "").trim();
  let partnerSnapshot: Record<string, unknown> = {};
  try {
    const raw = String(sf[SESSION_FIELDS.partnerSnapshotJson] || sf.partner_snapshot_json || "{}");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) partnerSnapshot = parsed as Record<string,unknown>;
  } catch {}
  const partnerRecordId = String(partnerSnapshot.partner_record_id || "").trim();
  if (!partnerId || !/^rec[A-Za-z0-9]{14,24}$/.test(partnerRecordId)) {
    return json(request, env, { ok:false, error:"partner_snapshot_required" }, 409);
  }

  const partner = await getAirtableRecord(env, env.AIRTABLE_TABLE_MODEL_PARTNERS, partnerRecordId);
  if (fieldText(partner, MODEL_PARTNERS.partnerId) !== partnerId) {
    return json(request, env, { ok:false, error:"partner_snapshot_mismatch" }, 409);
  }
  const approval = normalizeStatus(fieldText(partner, MODEL_PARTNERS.approvalStatus));
  const partnerStatus = normalizeStatus(fieldText(partner, MODEL_PARTNERS.status));
  const bindStatus = normalizeStatus(fieldText(partner, MODEL_PARTNERS.telegramVerificationStatus));
  const boundTelegramId = fieldText(partner, MODEL_PARTNERS.telegramId);
  if (approval !== "recognized" || partnerStatus !== "active") {
    return json(request, env, { ok:false, error:"partner_not_active" }, 403);
  }
  if (bindStatus !== "verified" || boundTelegramId !== telegramUserId) {
    return json(request, env, { ok:false, error:"partner_telegram_identity_mismatch" }, 403);
  }

  // Recheck canonical Payment Truth when the button is pressed. A previously
  // delivered Telegram message must never become independent payment authority.
  if (["completed", "cancelled", "canceled", "declined", "closed", "void"].includes(normalizeStatus(fieldText(session, SESSION_FIELDS.lifecycle) || fieldText(session, SESSION_FIELDS.status)))) {
    return json(request, env, { ok: false, error: "job_already_closed" }, 409);
  }
  if (!(await officiallyVerifiedPartnerSessions(env, [session])).has(fieldText(session, SESSION_FIELDS.sessionId) || "")) {
    return json(request, env, { ok:false, error:"official_verify_required" }, 409);
  }

  const currentStatus = normalizeStatus(String(sf[SESSION_FIELDS.partnerConfirmationStatus] || sf.partner_confirmation_status || ""));
  const currentRevision = Number(sf[SESSION_FIELDS.partnerConfirmationRevision] || sf.partner_confirmation_revision || 0) || 0;
  if (currentStatus === nextStatus) {
    return json(request, env, {
      ok:true,
      idempotent:true,
      session_id:String(sf[SESSION_FIELDS.sessionId] || sf.session_id || ""),
      partner_confirmation_status:nextStatus,
      partner_confirmation_revision:currentRevision
    });
  }
  if (["confirmed","declined"].includes(currentStatus)) {
    return json(request, env, { ok:false, error:"partner_confirmation_already_final", current_status:currentStatus }, 409);
  }

  const now = new Date().toISOString();
  const nextRevision = currentRevision + 1;
  await updateAirtableRecord(env, sessionsTable, sessionRecordId, {
    [SESSION_FIELDS.partnerConfirmationStatus]: nextStatus,
    [SESSION_FIELDS.partnerConfirmedAt]: now,
    [SESSION_FIELDS.partnerConfirmationRevision]: nextRevision,
    [SESSION_FIELDS.partnerConfirmationNote]: note || (nextStatus === "confirmed" ? "Confirmed by Partner." : nextStatus === "declined" ? "Declined by Partner." : "Partner requested changes."),
    [SESSION_FIELDS.partnerNotificationStatus]: "acknowledged",
    [SESSION_FIELDS.partnerNotificationError]: null
  }, true);

  const safeSession = fieldText(session, SESSION_FIELDS.sessionId) || sessionRecordId;
  const safeModel = fieldText(session, SESSION_FIELDS.modelName) || "Model";
  const safeClient = fieldText(session, SESSION_FIELDS.clientName) || "Client";
  try {
    await sendTelegramMessage(env, [
      "PARTNER JOB RESPONSE",
      "",
      `Partner: ${fieldText(partner, MODEL_PARTNERS.partnerName) || partnerId}`,
      `Session: ${safeSession}`,
      `Client: ${safeClient}`,
      `Model: ${safeModel}`,
      `Response: ${nextStatus}`,
      `Revision: ${nextRevision}`
    ].join("\n"), "partner_confirm");
  } catch (error) {
    console.error("partner response telegram alert failed", error);
  }

  return json(request, env, {
    ok:true,
    session_id:safeSession,
    partner_confirmation_status:nextStatus,
    partner_confirmation_revision:nextRevision,
    confirmed_at:now
  });
}

function buildPartnerFields(input: {
  requestId: string;
  nameAlias: string;
  accessSource: AccessSource;
  valueBring: string;
  whyConsider: string;
  contact: string;
  contactParts: ReturnType<typeof parseContact>;
  experience: string;
  talentName: string;
  talentType: TalentType | null;
  portfolioUrl: string;
  talentLocation: string;
  talentDetails: string;
  sourcePath: string;
  files: UploadedFileMetadata[];
  score: number;
  now: string;
}): AirtableFields {
  const notes = [
    `Request ID: ${input.requestId}`,
    `Source Path: ${input.sourcePath}`,
    `Access Source: ${input.accessSource}`,
    `Contact: ${input.contact}`,
    "",
    "Value Bring:",
    input.valueBring,
    "",
    "Why Consider:",
    input.whyConsider,
    input.experience ? `\nExperience:\n${input.experience}` : "",
    input.talentName ? `\nTalent: ${input.talentName}` : "",
    input.talentType ? `Talent Type: ${input.talentType}` : "",
    input.portfolioUrl ? `Portfolio URL: ${input.portfolioUrl}` : "",
    input.talentLocation ? `Talent Location: ${input.talentLocation}` : "",
    input.talentDetails ? `Talent Details: ${input.talentDetails}` : "",
    `Files: ${input.files.length}`
  ].filter(Boolean).join("\n");

  const fields: AirtableFields = {
    [MODEL_PARTNERS.partnerId]: input.requestId,
    [MODEL_PARTNERS.partnerName]: input.nameAlias,
    [MODEL_PARTNERS.contactName]: input.nameAlias,
    [MODEL_PARTNERS.partnerType]: PARTNER_TYPE_BY_SOURCE[input.accessSource],
    [MODEL_PARTNERS.status]: "Pending Review",
    [MODEL_PARTNERS.approvalStatus]: "pending_review",
    [MODEL_PARTNERS.createdAt]: input.now,
    [MODEL_PARTNERS.notesInternal]: notes,
    [MODEL_PARTNERS.notes]: input.whyConsider,
    [MODEL_PARTNERS.partnerCode]: input.requestId,
    [MODEL_PARTNERS.displayName]: input.nameAlias,
    [MODEL_PARTNERS.partnerScore]: input.score
  };

  setOptional(fields, MODEL_PARTNERS.email, input.contactParts.email);
  setOptional(fields, MODEL_PARTNERS.contactPhone, input.contactParts.phone);
  setOptional(fields, MODEL_PARTNERS.lineId, input.contactParts.lineId);
  setOptional(fields, MODEL_PARTNERS.telegramId, input.contactParts.telegram);
  setOptional(fields, MODEL_PARTNERS.telegramUsername, input.contactParts.telegram);

  return fields;
}

function buildModelApplicationFields(input: {
  requestId: string;
  nameAlias: string;
  accessSource: AccessSource;
  contact: string;
  contactParts: ReturnType<typeof parseContact>;
  talentName: string;
  talentType: TalentType | null;
  portfolioUrl: string;
  talentLocation: string;
  talentDetails: string;
  sourcePath: string;
  now: string;
}): AirtableFields {
  const workingName = input.talentName || `${input.nameAlias} referral`;
  const notes = [
    `Partner Request ID: ${input.requestId}`,
    `Partner Alias: ${input.nameAlias}`,
    `Access Source: ${input.accessSource}`,
    `Contact: ${input.contact}`,
    `Source Path: ${input.sourcePath}`,
    input.talentType ? `Talent Type: ${input.talentType}` : "",
    input.portfolioUrl ? `Portfolio URL: ${input.portfolioUrl}` : "",
    input.talentLocation ? `Location: ${input.talentLocation}` : "",
    input.talentDetails ? `Details:\n${input.talentDetails}` : ""
  ].filter(Boolean).join("\n");

  const fields: AirtableFields = {
    [MODEL_APPLICATIONS.nickname]: workingName,
    [MODEL_APPLICATIONS.workingName]: workingName,
    [MODEL_APPLICATIONS.notes]: notes,
    [MODEL_APPLICATIONS.source]: "sigil_partner_request",
    [MODEL_APPLICATIONS.savedBy]: "partners-worker",
    [MODEL_APPLICATIONS.createdAt]: input.now,
    [MODEL_APPLICATIONS.consentToPrivacy]: true,
    [MODEL_APPLICATIONS.applicationStatus]: "New"
  };

  setOptional(fields, MODEL_APPLICATIONS.instagram, instagramHandle(input.portfolioUrl));
  setOptional(fields, MODEL_APPLICATIONS.bkkDistrict, input.talentLocation);
  setOptional(fields, MODEL_APPLICATIONS.telegramUsername, input.contactParts.telegram);

  return fields;
}

function buildPublicModelApplicationFields(input: {
  requestId: string;
  nameAlias: string;
  talentName: string;
  age: number | null;
  talentLocation: string;
  identity: string;
  contact: string;
  portfolioUrl: string;
  height: string;
  bodyProfile: string;
  workTypes: string[];
  skills: string;
  availability: string;
  travelReady: string;
  boundaries: string;
  whyConsider: string;
  extraNotes: string;
  sourcePath: string;
  files: UploadedFileMetadata[];
  now: string;
}): AirtableFields {
  const fileLines = input.files.length
    ? [`\nFiles (${input.files.length}):`, ...input.files.map(
        (file) => `- ${file.file_category}: ${file.file_name} (${file.r2_key})`
      )]
    : ["\nFiles: 0"];

  const notes = [
    `Request ID: ${input.requestId}`,
    "Application Type: public_model",
    "Intent: modeling_public_events",
    `Source Path: ${input.sourcePath}`,
    `Contact: ${input.contact}`,
    input.age !== null ? `Age: ${input.age}` : "",
    input.height ? `Height: ${input.height}` : "",
    input.bodyProfile ? `Body profile: ${input.bodyProfile}` : "",
    input.workTypes.length ? `Work interests: ${input.workTypes.join(", ")}` : "",
    input.availability ? `Availability: ${input.availability}` : "",
    input.travelReady ? `Travel: ${input.travelReady}` : "",
    input.portfolioUrl ? `Portfolio URL: ${input.portfolioUrl}` : "",
    "",
    "Identity:",
    input.identity,
    "",
    "Skills / Personality:",
    input.skills,
    input.boundaries ? `\nBoundaries:\n${input.boundaries}` : "",
    `\nWhy MMD:\n${input.whyConsider}`,
    input.extraNotes ? `\nNotes:\n${input.extraNotes}` : "",
    ...fileLines
  ].filter(Boolean).join("\n");

  const fields: AirtableFields = {
    [MODEL_APPLICATIONS.nickname]: input.nameAlias,
    [MODEL_APPLICATIONS.workingName]: input.talentName,
    [MODEL_APPLICATIONS.notes]: notes,
    [MODEL_APPLICATIONS.source]: "apply_public_model",
    [MODEL_APPLICATIONS.savedBy]: "partners-worker",
    [MODEL_APPLICATIONS.createdAt]: input.now,
    [MODEL_APPLICATIONS.consentToPrivacy]: true,
    [MODEL_APPLICATIONS.applicationStatus]: "new_review"
  };

  setOptional(fields, MODEL_APPLICATIONS.age, input.age);
  setOptional(fields, MODEL_APPLICATIONS.heightCm, parseHeightCm(input.height));
  setOptional(fields, MODEL_APPLICATIONS.instagram, instagramHandle(input.portfolioUrl));
  setOptional(fields, MODEL_APPLICATIONS.bkkDistrict, input.talentLocation);

  return fields;
}

function buildReferralFields(input: {
  requestId: string;
  partnerRecordId: string;
  accessSource: AccessSource;
  portfolioUrl: string;
  talentName: string;
  talentType: TalentType | null;
  talentLocation: string;
  talentDetails: string;
  now: string;
}): AirtableFields {
  const notes = [
    `Partner request referral: ${input.requestId}`,
    input.talentName ? `Talent: ${input.talentName}` : "",
    input.talentType ? `Talent Type: ${input.talentType}` : "",
    input.talentLocation ? `Talent Location: ${input.talentLocation}` : "",
    input.talentDetails ? `Talent Details:\n${input.talentDetails}` : ""
  ].filter(Boolean).join("\n");

  const fields: AirtableFields = {
    [MODEL_REFERRALS.referralId]: `${input.requestId}_ref`,
    [MODEL_REFERRALS.partner]: [input.partnerRecordId],
    [MODEL_REFERRALS.ownershipStatus]: "pending_review",
    [MODEL_REFERRALS.commissionType]: "first_job",
    [MODEL_REFERRALS.sourceChannel]: PARTNER_TYPE_BY_SOURCE[input.accessSource],
    [MODEL_REFERRALS.referredAt]: input.now,
    [MODEL_REFERRALS.notes]: notes,
    [MODEL_REFERRALS.firstJobRemaining]: true,
    [MODEL_REFERRALS.createdByWorker]: "partners-worker"
  };

  setOptional(fields, MODEL_REFERRALS.proofUrl, input.portfolioUrl);
  return fields;
}

function buildAssetFields(input: {
  requestId: string;
  index: number;
  file: UploadedFileMetadata;
  partnerRecordId: string;
  referralRecordId: string | null;
  modelApplicationRecordId: string | null;
  talentName: string;
  talentType: TalentType | null;
  portfolioUrl: string;
  sourcePath: string;
  now: string;
  bucketName: string;
}): AirtableFields {
  const fields: AirtableFields = {
    [PARTNER_ASSETS.assetId]: `${input.requestId}_asset_${String(input.index + 1).padStart(2, "0")}`,
    [PARTNER_ASSETS.requestId]: input.requestId,
    [PARTNER_ASSETS.partner]: [input.partnerRecordId],
    [PARTNER_ASSETS.fileName]: input.file.file_name,
    [PARTNER_ASSETS.fileType]: input.file.file_type,
    [PARTNER_ASSETS.fileSize]: input.file.file_size,
    [PARTNER_ASSETS.fileCategory]: input.file.file_category,
    [PARTNER_ASSETS.r2Key]: input.file.r2_key,
    [PARTNER_ASSETS.r2Bucket]: input.bucketName,
    [PARTNER_ASSETS.storageProvider]: "cloudflare_r2",
    [PARTNER_ASSETS.uploadedAt]: input.now,
    [PARTNER_ASSETS.reviewStatus]: "pending_review",
    [PARTNER_ASSETS.visibility]: "private",
    [PARTNER_ASSETS.signedUrlStatus]: "not_signed",
    [PARTNER_ASSETS.createdByWorker]: "partners-worker",
    [PARTNER_ASSETS.sourcePath]: input.sourcePath,
    [PARTNER_ASSETS.payloadJson]: JSON.stringify(input.file)
  };

  setOptional(fields, PARTNER_ASSETS.referral, input.referralRecordId ? [input.referralRecordId] : null);
  setOptional(fields, PARTNER_ASSETS.modelApplication, input.modelApplicationRecordId ? [input.modelApplicationRecordId] : null);
  setOptional(fields, PARTNER_ASSETS.talentName, input.talentName);
  setOptional(fields, PARTNER_ASSETS.talentType, input.talentType || "");
  setOptional(fields, PARTNER_ASSETS.portfolioUrl, input.portfolioUrl);

  return fields;
}

async function createPartnerRecord(env: RuntimeEnv, fields: AirtableFields): Promise<AirtableRecord> {
  try {
    return await createAirtableRecord(env, env.AIRTABLE_TABLE_MODEL_PARTNERS, fields, true);
  } catch (error) {
    const message = getErrorMessage(error);
    if (!message.includes(MODEL_PARTNERS.partnerScore) && !message.includes("UNKNOWN_FIELD_NAME")) {
      throw error;
    }

    const retryFields = { ...fields };
    delete retryFields[MODEL_PARTNERS.partnerScore];
    return createAirtableRecord(env, env.AIRTABLE_TABLE_MODEL_PARTNERS, retryFields, true);
  }
}

function computePartnerScore(body: Record<string, unknown>, files: UploadedFileMetadata[]): number {
  let score = 0;
  const sourceMap: Record<string, number> = {
    staff_referral: 40,
    model_referral: 35,
    modeling_broker: 30,
    client_referral: 45,
    other: 10
  };

  const accessSource = readString(body, "access_source");
  score += sourceMap[accessSource] || 0;
  score += Math.min(readString(body, "value_bring").length / 10, 20);
  score += Math.min(readString(body, "why_consider").length / 10, 20);
  if (readString(body, "talent_name")) score += 10;
  if (readString(body, "portfolio_url")) score += 10;
  score += Math.min(files.length * 5, 20);

  return Math.round(score);
}

async function createAirtableRecord(
  env: RuntimeEnv,
  tableId: string,
  fields: AirtableFields,
  typecast = true
): Promise<AirtableRecord> {
  const response = await airtableFetch(env, tableId, {
    method: "POST",
    body: JSON.stringify({ fields: compactFields(fields), typecast })
  });
  return parseAirtableRecord(response);
}

async function updateAirtableRecord(
  env: RuntimeEnv,
  tableId: string,
  recordId: string,
  fields: AirtableFields,
  typecast = true
): Promise<AirtableRecord> {
  const response = await airtableFetch(env, `${tableId}/${encodeURIComponent(recordId)}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: compactFields(fields), typecast })
  });
  return parseAirtableRecord(response);
}

async function listAirtableRecords(
  env: RuntimeEnv,
  tableId: string,
  options: AirtableListOptions = {}
): Promise<AirtableRecord[]> {
  const records: AirtableRecord[] = [];
  let offset = "";
  const maxRecords = options.maxRecords ?? Infinity;
  const seenOffsets = new Set<string>();

  do {
    const params = new URLSearchParams();
    params.set("pageSize", String(Math.min(options.pageSize || 100, maxRecords - records.length)));
    if (offset) params.set("offset", offset);
    if (options.filterByFormula) params.set("filterByFormula", options.filterByFormula);

    if (options.sort) {
      options.sort.forEach((entry, index) => {
        params.set(`sort[${index}][field]`, entry.field);
        params.set(`sort[${index}][direction]`, entry.direction || "asc");
      });
    }

    const response = await airtableFetch(env, `${tableId}?${params.toString()}`, { method: "GET" });
    const data = await parseAirtableJson<{ records?: AirtableRecord[]; offset?: string }>(response);
    records.push(...(Array.isArray(data.records) ? data.records : []));
    offset = data.offset || "";
    if (offset && seenOffsets.has(offset)) throw new Error("airtable_pagination_loop");
    if (offset) seenOffsets.add(offset);
  } while (offset && records.length < maxRecords);

  return records.slice(0, maxRecords);
}

async function fetchRecordMap(env: RuntimeEnv, tableId: string, ids: string[]): Promise<Map<string, AirtableRecord>> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, AirtableRecord>();
  if (!uniqueIds.length) return map;

  for (let index = 0; index < uniqueIds.length; index += 10) {
    const chunk = uniqueIds.slice(index, index + 10);
    const formula = `OR(${chunk.map((id) => `RECORD_ID()='${escapeFormulaString(id)}'`).join(",")})`;
    const records = await listAirtableRecords(env, tableId, { filterByFormula: formula, maxRecords: chunk.length });
    for (const record of records) map.set(record.id, record);
  }

  return map;
}

function escapeFormulaString(value: string): string {
  return String(value ?? "").replace(/'/g, "\\'");
}

async function getAirtableRecord(env: RuntimeEnv, tableId: string, recordId: string): Promise<AirtableRecord> {
  const response = await airtableFetch(env, `${tableId}/${encodeURIComponent(recordId)}`, { method: "GET" });
  return parseAirtableRecord(response);
}

async function airtableFetch(env: RuntimeEnv, path: string, init: RequestInit): Promise<Response> {
  const apiKey = requireSecret(env, "AIRTABLE_API_KEY");
  const url = new URL(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${path}`);
  if ((init.method || "GET").toUpperCase() === "GET") {
    url.searchParams.set("returnFieldsByFieldId", "true");
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${apiKey}`);
  headers.set("Content-Type", "application/json");

  const response = await fetch(url.toString(), { ...init, headers });
  if (!response.ok) {
    const detail = await boundedText(response);
    throw new Error(`Airtable request failed (${response.status}): ${detail}`);
  }

  return response;
}

async function parseAirtableRecord(response: Response): Promise<AirtableRecord> {
  const record = await parseAirtableJson<AirtableRecord>(response);
  if (!record.id || typeof record.fields !== "object" || !record.fields) {
    throw new Error("Airtable returned an invalid record payload.");
  }
  return record;
}

async function parseAirtableJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function boundedText(response: Response): Promise<string> {
  const text = await response.text();
  return text.length > 2000 ? `${text.slice(0, 2000)}...` : text;
}

async function listLinkedRecordsForPartner(
  env: RuntimeEnv,
  tableId: string,
  partnerFieldId: string,
  partnerRecordId: string,
  partnerPrimaryValue = ""
): Promise<AirtableRecord[]> {
  const formulaValue = partnerPrimaryValue || partnerRecordId;
  const formula = `FIND('${escapeFormulaString(formulaValue)}', ARRAYJOIN({${partnerFieldId}}))`;
  try {
    const records = await listAirtableRecords(env, tableId, { filterByFormula: formula });
    if (records.length) return records.filter((record) => fieldLinkIds(record, partnerFieldId).includes(partnerRecordId));
  } catch (error) {
    console.warn("Airtable linked formula failed; using fallback filter", getErrorMessage(error));
  }

  const fallback = await listAirtableRecords(env, tableId, {});
  return fallback.filter((record) => fieldLinkIds(record, partnerFieldId).includes(partnerRecordId));
}

async function verifyPartnerTokenFromRequest(
  request: Request,
  env: RuntimeEnv
): Promise<{ ok: true; value: VerifiedPartner } | { ok: false; response: Response }> {
  const token = new URL(request.url).searchParams.get("t") || "";
  if (!token) {
    return {
      ok: false,
      response: errorResponse(request, env, "token_missing", "This partner link is missing token t.", 401, false)
    };
  }

  return verifyPartnerToken(request, env, token);
}

async function verifyPartnerToken(
  request: Request,
  env: RuntimeEnv,
  token: string
): Promise<{ ok: true; value: VerifiedPartner } | { ok: false; response: Response }> {
  const parsed = await parseAndVerifyTokenSignature(env, token);
  if (!parsed.ok) {
    return {
      ok: false,
      response: errorResponse(request, env, "token_invalid", parsed.error, 401, false)
    };
  }

  if (parsed.payload.exp < Date.now()) {
    return {
      ok: false,
      response: errorResponse(request, env, "token_expired", "This partner token has expired.", 401, false)
    };
  }

  let partnerRecord: AirtableRecord;
  try {
    partnerRecord = await getAirtableRecord(env, env.AIRTABLE_TABLE_MODEL_PARTNERS, parsed.payload.pid);
  } catch {
    return {
      ok: false,
      response: errorResponse(request, env, "token_partner_missing", "This partner token does not match a partner record.", 401, false)
    };
  }

  const tokenHash = await sha256Hex(token);
  const storedHash = fieldText(partnerRecord, MODEL_PARTNERS.accessTokenHash) || "";
  if (!constantTimeStringEqual(storedHash, tokenHash)) {
    return {
      ok: false,
      response: errorResponse(request, env, "token_revoked", "This partner token is no longer active.", 401, false)
    };
  }

  const approvalStatus = normalizeStatus(fieldText(partnerRecord, MODEL_PARTNERS.approvalStatus));
  if (approvalStatus !== "recognized") {
    return {
      ok: false,
      response: errorResponse(request, env, "partner_not_recognized", "This partner has not been recognized.", 403, false)
    };
  }

  if (normalizeStatus(fieldText(partnerRecord, MODEL_PARTNERS.status)) !== "active") {
    return { ok: false, response: errorResponse(request, env, "partner_not_active", "This Partner account is awaiting review.", 403, false) };
  }

  return {
    ok: true,
    value: { token, tokenHash, payload: parsed.payload, partnerRecord }
  };
}

async function generatePartnerToken(env: RuntimeEnv, partnerRecordId: string): Promise<string> {
  const now = Date.now();
  const payload: TokenPayload = {
    pid: partnerRecordId,
    iat: now,
    exp: now + TOKEN_TTL_MS
  };
  const body = `sigil_${base64UrlEncodeString(JSON.stringify(payload))}`;
  const signature = await signTokenBody(env, body);
  return `${body}.${signature}`;
}

async function parseAndVerifyTokenSignature(
  env: RuntimeEnv,
  token: string
): Promise<{ ok: true; payload: TokenPayload } | { ok: false; error: string }> {
  const [body, signature] = token.split(".");
  if (!body || !signature || !body.startsWith("sigil_")) {
    return { ok: false, error: "Malformed partner token." };
  }

  const payloadText = base64UrlDecodeString(body.slice("sigil_".length));
  const parsed = parseJson(payloadText);
  if (!isTokenPayload(parsed)) {
    return { ok: false, error: "Malformed partner token payload." };
  }

  const secret = env.TOKEN_SECRET || "";
  if (secret) {
    const expected = await signTokenBody(env, body);
    if (!constantTimeStringEqual(signature, expected)) {
      return { ok: false, error: "Invalid partner token signature." };
    }
  }

  return { ok: true, payload: parsed };
}

async function signTokenBody(env: RuntimeEnv, body: string): Promise<string> {
  const secret = env.TOKEN_SECRET || "";
  if (!secret) {
    return randomBase64Url(32);
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64UrlEncodeString(value: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeString(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

function constantTimeStringEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let diff = leftBytes.length ^ rightBytes.length;
  const max = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < max; index += 1) {
    diff |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }
  return diff === 0;
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncodeBytes(bytes);
}

async function sendTelegramMessage(env: RuntimeEnv, text: string, flow = "partner_review"): Promise<void> {
  const token = String(env.AUTH_SERVICE_PARTNERS_TO_TELEGRAM || "").trim();
  const service = (env as RuntimeEnv & { TELEGRAM_WORKER?: { fetch(input: Request): Promise<Response> } }).TELEGRAM_WORKER;
  if (!token || !service || typeof service.fetch !== "function") {
    console.warn("Telegram notification skipped: canonical telegram-worker transport is unavailable.");
    return;
  }

  const response = await service.fetch(new Request("https://telegram-worker.internal/telegram/internal/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ flow, text, disable_web_page_preview: true })
  }));

  const payload = await response.json().catch(() => ({})) as { ok?: boolean; telegram?: { ok?: boolean; error?: unknown }; error?: unknown };
  if (!response.ok || payload?.ok !== true || payload?.telegram?.ok !== true) {
    throw new Error(`Telegram router notify failed (${response.status}): ${JSON.stringify(payload?.telegram?.error || payload?.error || {})}`);
  }
}

function buildNewRequestTelegramMessage(input: {
  nameAlias: string;
  accessSource: AccessSource;
  contact: string;
  talentName: string;
  talentType: TalentType | null;
  score: number;
  files: UploadedFileMetadata[];
  whyConsider: string;
  partnerRecordId: string;
}): string {
  return [
    "🜂 NEW PARTNER REQUEST",
    "",
    `Name: ${input.nameAlias}`,
    `Source: ${input.accessSource}`,
    `Contact: ${input.contact}`,
    `Talent: ${input.talentName || "-"}`,
    `Type: ${input.talentType || "-"}`,
    `Score: ${input.score}`,
    `Files: ${input.files.length}`,
    `Partner Record: ${input.partnerRecordId}`,
    "",
    "Why:",
    input.whyConsider
  ].join("\n");
}

function publicModelThreadId(env: RuntimeEnv): number | undefined {
  const raw = env.TELEGRAM_PUBLIC_MODEL_THREAD_ID || env.TELEGRAM_ADMIN_THREAD_ID || "";
  const threadId = Number(raw);
  return Number.isFinite(threadId) && threadId > 0 ? threadId : undefined;
}

function buildPublicModelTelegramMessage(input: {
  nameAlias: string;
  talentName: string;
  age: number | null;
  height: string;
  talentLocation: string;
  contact: string;
  workTypes: string[];
  files: UploadedFileMetadata[];
  whyConsider: string;
  applicationRecordId: string;
}): string {
  return [
    "MMD Public Model Application",
    "",
    `Name: ${input.nameAlias}`,
    `Working Name: ${input.talentName || "-"}`,
    `Age: ${input.age ?? "-"}`,
    `Height: ${input.height || "-"}`,
    `Location: ${input.talentLocation || "-"}`,
    `Contact: ${input.contact}`,
    `Work interests: ${input.workTypes.join(", ") || "-"}`,
    `Files: ${input.files.length}`,
    `Application Record: ${input.applicationRecordId}`,
    "",
    "Why:",
    input.whyConsider
  ].join("\n");
}

function buildApprovalTelegramMessage(input: {
  partnerRecord: AirtableRecord;
  action: ApprovalAction;
  note: string;
  termsUrl: string;
  dashboardUrl: string;
}): string {
  const lines = [
    "SIGIL PARTNER APPROVAL UPDATE",
    "",
    `Partner: ${fieldText(input.partnerRecord, MODEL_PARTNERS.partnerName) || input.partnerRecord.id}`,
    `Action: ${input.action}`
  ];

  if (input.note) lines.push(`Note: ${input.note}`);
  if (input.termsUrl) lines.push(`Terms: ${publicLink(input.termsUrl)}`);
  if (input.dashboardUrl) lines.push(`Dashboard: ${publicLink(input.dashboardUrl)}`);

  return lines.join("\n");
}

function publicLink(relativeUrl: string): string {
  if (/^https?:\/\//i.test(relativeUrl)) return relativeUrl;
  return `${DEFAULT_PUBLIC_SITE_URL}${relativeUrl.startsWith("/") ? "" : "/"}${relativeUrl}`;
}

function publicSiteBase(env: RuntimeEnv): string {
  const configured = String(env.PUBLIC_SITE_URL || "").trim();
  return configured || DEFAULT_PUBLIC_SITE_URL;
}

function normalizeReferral(record: AirtableRecord, modelMap: Map<string, AirtableRecord>): Record<string, unknown> {
  const modelId = fieldLinkIds(record, MODEL_REFERRALS.model)[0] || "";
  const modelRecord = modelId ? modelMap.get(modelId) : undefined;
  const status = fieldText(record, MODEL_REFERRALS.ownershipStatus) || "pending_review";

  return {
    model: modelRecord ? modelName(modelRecord) : "Talent pending",
    referralDate: dateOnly(fieldText(record, MODEL_REFERRALS.referredAt)),
    ownership: status,
    commissionType: fieldText(record, MODEL_REFERRALS.commissionType) || "first_job",
    lastJob: null,
    status,
    statusLabel: toLabel(status)
  };
}

function normalizeCommission(record: AirtableRecord, modelMap: Map<string, AirtableRecord>): Record<string, unknown> & {
  commission: number;
  status: string;
} {
  const modelId = fieldLinkIds(record, PARTNER_COMMISSIONS.model)[0] || "";
  const modelRecord = modelId ? modelMap.get(modelId) : undefined;
  const ledgerStatus = normalizeStatus(fieldText(record, PARTNER_COMMISSIONS.status));
  const payoutStatus = normalizeStatus(fieldText(record, PARTNER_COMMISSIONS.payoutStatus));
  const status = ["void", "voided", "refunded", "cancelled", "reversed", "disputed", "held"].includes(ledgerStatus) ? ledgerStatus : payoutStatus || ledgerStatus || "pending";
  const commission = fieldNumber(record, PARTNER_COMMISSIONS.commissionAmount);
  const audit = parseJson(fieldText(record, PARTNER_COMMISSIONS.auditJson) || "{}");

  return {
    commission_id: fieldText(record, PARTNER_COMMISSIONS.commissionId) || null,
    commission_key: fieldText(record, PARTNER_COMMISSIONS.commissionKey) || null,
    commission_group_key: fieldText(record, PARTNER_COMMISSIONS.commissionGroupKey) || null,
    jobId: fieldText(record, PARTNER_COMMISSIONS.jobId) || fieldText(record, PARTNER_COMMISSIONS.sessionId) || fieldText(record, PARTNER_COMMISSIONS.commissionId) || "-",
    commission_record_id: record.id,
    model_record_id: modelId || null,
    session_id: fieldText(record, PARTNER_COMMISSIONS.sessionId),
    payment_ref: fieldText(record, PARTNER_COMMISSIONS.paymentRef) || null,
    earnedAt: fieldText(record, PARTNER_COMMISSIONS.earnedAt),
    approvedAt: fieldText(record, PARTNER_COMMISSIONS.approvedAt),
    paidAt: fieldText(record, PARTNER_COMMISSIONS.paidAt),
    approved_by: fieldText(record, PARTNER_COMMISSIONS.approvedBy) || null,
    model: modelRecord ? modelName(modelRecord) : "Talent pending",
    currency: fieldText(record, PARTNER_COMMISSIONS.currency) || "THB",
    basisAmount: fieldNumber(record, PARTNER_COMMISSIONS.basisAmount),
    rate: formatRate(fieldNumber(record, PARTNER_COMMISSIONS.rateSnapshot)),
    commission_type: fieldText(record, PARTNER_COMMISSIONS.typeSnapshot) || null,
    commission,
    status,
    statusLabel: toLabel(status),
    approval_status: fieldText(record, PARTNER_COMMISSIONS.approvalStatus) || null,
    payout_status: fieldText(record, PARTNER_COMMISSIONS.payoutStatus) || null,
    eligibility_status: fieldText(record, PARTNER_COMMISSIONS.eligibilityStatus) || null,
    held_reason: fieldText(record, PARTNER_COMMISSIONS.heldReason) || null,
    void_reason: fieldText(record, PARTNER_COMMISSIONS.voidReason) || null,
    payout_reference: fieldText(record, PARTNER_COMMISSIONS.payoutReference),
    split_index: fieldNumber(record, PARTNER_COMMISSIONS.splitIndex) || null,
    split_percent: fieldNumber(record, PARTNER_COMMISSIONS.splitPercent) || null,
    audit_event_count: isRecord(audit) && Array.isArray(audit.events) ? audit.events.length : null,
    included_in_earnings: ["earned", "approved", "ready", "pending", "paid", "settled", "completed"].includes(status)
  };
}

function maskPayoutAccountRef(value: string | null): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const compact = raw.replace(/\s+/g, "");
  if (compact.length <= 4) return "••••";
  return "••••" + compact.slice(-4);
}

function buildPartnerFinanceSnapshot(
  partnerRecord: AirtableRecord,
  commissions: Array<Record<string, unknown> & { commission: number; status: string }>
): Record<string, unknown> {
  const ids = new Map<string, number>();
  for (const row of commissions) {
    const id = String(row.commission_id || "").trim();
    const split = row.split_index == null ? "" : String(row.split_index);
    const key = id ? id + "#" + split : "";
    if (key) ids.set(key, (ids.get(key) || 0) + 1);
  }
  const ambiguous = new Set([...ids.entries()].filter(([, count]) => count > 1).map(([id]) => id));
  const rows: Array<Record<string, unknown> & { commission: number; status: string; integrity_state: string; included_in_finance_totals: boolean }> = commissions.map((row) => {
    const id = String(row.commission_id || "").trim();
    const split = row.split_index == null ? "" : String(row.split_index);
    const duplicateKey = id ? id + "#" + split : "";
    const duplicate = Boolean(duplicateKey && ambiguous.has(duplicateKey));
    return {
      ...row,
      integrity_state: duplicate ? "reconciliation_required" : "canonical",
      included_in_finance_totals: !duplicate && row.included_in_earnings === true
    };
  });
  const canonical = rows.filter((row) => row.integrity_state === "canonical");
  const amount = (statuses: string[]) => canonical
    .filter((row) => statuses.includes(normalizeStatus(String(row.status || ""))))
    .reduce((sum, row) => sum + Number(row.commission || 0), 0);
  const monthly = new Map<string, { month: string; earned: number; paid: number; rows: number }>();
  for (const row of canonical) {
    const date = String(row.paidAt || row.approvedAt || row.earnedAt || "");
    const parsed = Date.parse(date);
    if (!Number.isFinite(parsed)) continue;
    const month = new Date(parsed).toISOString().slice(0, 7);
    const item = monthly.get(month) || { month, earned: 0, paid: 0, rows: 0 };
    item.rows += 1;
    if (row.included_in_earnings === true) item.earned += Number(row.commission || 0);
    if (isPaidStatus(String(row.status || ""))) item.paid += Number(row.commission || 0);
    monthly.set(month, item);
  }
  return {
    payout_profile: {
      configured: Boolean(
        fieldText(partnerRecord, MODEL_PARTNERS.payoutMethod) &&
        fieldText(partnerRecord, MODEL_PARTNERS.payoutAccountName) &&
        fieldText(partnerRecord, MODEL_PARTNERS.payoutAccountRef)
      ),
      method: fieldText(partnerRecord, MODEL_PARTNERS.payoutMethod) || null,
      account_name: fieldText(partnerRecord, MODEL_PARTNERS.payoutAccountName) || null,
      account_ref_masked: maskPayoutAccountRef(fieldText(partnerRecord, MODEL_PARTNERS.payoutAccountRef))
    },
    summary: {
      pending_amount: amount(["pending", "earned", "ready"]),
      approved_amount: amount(["approved"]),
      held_amount: amount(["held", "disputed"]),
      paid_amount: amount(["paid", "settled", "completed"]),
      void_amount: amount(["void", "voided", "refunded", "cancelled", "reversed"]),
      canonical_rows: canonical.length,
      reconciliation_rows: rows.length - canonical.length
    },
    monthly: [...monthly.values()].sort((a, b) => b.month.localeCompare(a.month)),
    reconciliation: {
      required: ambiguous.size > 0,
      duplicate_commission_ids: [...new Set([...ambiguous].map((key) => key.split("#")[0]).filter(Boolean))],
      excluded_from_totals: rows.filter((row) => row.integrity_state === "reconciliation_required").map((row) => row.commission_record_id)
    },
    rows
  };
}

function modelName(record: AirtableRecord): string {
  return fieldText(record, MODELS.workingName) || fieldText(record, MODELS.nickname) || record.id;
}

function cleanText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value).trim();
  return "";
}

function compactFields(fields: AirtableFields): AirtableFields {
  const compacted: AirtableFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    compacted[key] = value;
  }
  return compacted;
}

function setOptional(fields: AirtableFields, key: string, value: AirtableFieldValue | undefined): void {
  if (value === undefined || value === null || value === "") return;
  if (Array.isArray(value) && value.length === 0) return;
  fields[key] = value;
}

function readNumberOrNull(body: Record<string, unknown>, key: string): number | null {
  const raw = readString(body, key);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function readStringArray(body: Record<string, unknown>, key: string): string[] {
  const value = body[key];
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseHeightCm(value: string): number | null {
  const match = value.match(/(\d{2,3}(?:\.\d+)?)/);
  if (!match?.[1]) return null;
  const height = Number(match[1]);
  return height >= 100 && height <= 250 ? Math.round(height) : null;
}

function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  return "";
}

async function readJsonObject(
  request: Request
): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const value = await request.json();
    if (!isRecord(value)) return { ok: false, error: "Request body must be a JSON object." };
    return { ok: true, value };
  } catch {
    return { ok: false, error: "Request body must be valid JSON." };
  }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTokenPayload(value: unknown): value is TokenPayload {
  return (
    isRecord(value) &&
    typeof value.pid === "string" &&
    typeof value.iat === "number" &&
    typeof value.exp === "number"
  );
}

function resolveRequestId(body: Record<string, unknown>): string {
  return validateRequestId(readString(body, "request_id")) || generateRequestId();
}

function validateRequestId(value: string): string | null {
  if (/^prq_\d{8}_[A-Za-z0-9_-]{6,64}$/.test(value)) return value;
  return null;
}

function generateRequestId(): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `prq_${stamp}_${randomBase64Url(8).slice(0, 11)}`;
}

function buildR2Key(requestId: string, filename: string): string {
  return `partner-requests/${requestId}/uploads/${compactTimestamp()}-${safeFilename(filename)}`;
}

function compactTimestamp(): string {
  return new Date().toISOString().replace(/[-:.TZ]/g, "");
}

function safeFilename(filename: string): string {
  const clean = filename
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
  return clean || "upload.bin";
}

function stringFromForm(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseAccessSource(value: string): AccessSource | null {
  return includesString(ACCESS_SOURCES, value) ? value : null;
}

function parseTalentType(value: string): TalentType | null {
  if (!value) return null;
  return includesString(TALENT_TYPES, value) ? value : null;
}

function parseFileCategory(value: string): FileCategory | null {
  return includesString(FILE_CATEGORIES, value) ? value : null;
}

function parseApprovalAction(value: string): ApprovalAction | null {
  return includesString(APPROVAL_ACTIONS, value) ? value : null;
}

function includesString<T extends readonly string[]>(values: T, value: string): value is T[number] {
  return (values as readonly string[]).includes(value);
}

function normalizeUploadedFiles(value: unknown, requestId: string): UploadedFileMetadata[] {
  if (!Array.isArray(value)) return [];

  const prefix = `partner-requests/${requestId}/uploads/`;
  const files: UploadedFileMetadata[] = [];

  for (const item of value) {
    if (!isRecord(item)) continue;
    const fileCategory = parseFileCategory(readString(item, "file_category"));
    const r2Key = readString(item, "r2_key");
    const fileName = readString(item, "file_name");
    const fileType = readString(item, "file_type");
    const fileSize = Number(item.file_size || 0);

    if (!fileCategory || !r2Key.startsWith(prefix) || !fileName || !fileType || !Number.isFinite(fileSize)) continue;
    files.push({
      r2_key: r2Key,
      file_name: fileName,
      file_type: fileType,
      file_size: fileSize,
      file_category: fileCategory
    });
  }

  return files.slice(0, MAX_FILES_PER_REQUEST);
}

function parseContact(contact: string): { email: string; phone: string; lineId: string; telegram: string } {
  const email = contact.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
  const phone = contact.match(/(?:\+?\d[\d\s().-]{6,}\d)/)?.[0]?.replace(/\s+/g, " ").trim() || "";
  const telegram = contact.match(/(?:telegram|tg)\s*:?\s*@?([A-Za-z0-9_]{4,})/i)?.[1] || contact.match(/@([A-Za-z0-9_]{4,})/)?.[1] || "";
  const lineId = contact.match(/line\s*:?\s*@?([A-Za-z0-9_.-]{2,})/i)?.[1] || "";
  return { email, phone, lineId, telegram: telegram ? `@${telegram.replace(/^@/, "")}` : "" };
}

function instagramHandle(value: string): string {
  if (!value) return "";
  const match = value.match(/instagram\.com\/([A-Za-z0-9_.]+)/i);
  return match?.[1] ? `@${match[1]}` : "";
}

function fieldText(record: AirtableRecord, key: string): string | null {
  const value = record.fields[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.filter(Boolean).join(", ") || null;
  return null;
}

function fieldNumber(record: AirtableRecord, key: string): number {
  const value = record.fields[key];
  const number = typeof value === "number" ? value : Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function fieldLinkIds(record: AirtableRecord, key: string): string[] {
  const value = record.fields[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.startsWith("rec"));
}

function fieldMultiText(record: AirtableRecord, key: string): string[] {
  const value = record.fields[key];
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry || "").trim()).filter(Boolean);
}

function normalizeStatus(value: string | null): string {
  return String(value || "").trim().toLowerCase();
}

function partnerHasVerifiedTelegram(record: AirtableRecord): boolean {
  const telegramId = fieldText(record, MODEL_PARTNERS.telegramId);
  return normalizeStatus(fieldText(record, MODEL_PARTNERS.telegramVerificationStatus)) === "verified" && /^\d{5,20}$/.test(telegramId || "");
}

function isPaidStatus(value: string): boolean {
  const status = normalizeStatus(value);
  return ["paid", "settled", "complete", "completed"].includes(status);
}

function isOfficiallyVerifiedPaymentStatus(value: string): boolean {
  return ["verified", "deposit_paid", "paid", "settled", "complete", "completed", "success"].includes(normalizeStatus(value));
}

async function officiallyVerifiedPartnerSessions(env: RuntimeEnv, sessions: AirtableRecord[]): Promise<Set<string>> {
  const candidates = new Set(sessions
    .filter((session) => isOfficiallyVerifiedPaymentStatus(fieldText(session, SESSION_FIELDS.paymentStatus) || ""))
    .map((session) => fieldText(session, SESSION_FIELDS.sessionId) || "")
    .filter(Boolean));
  if (!candidates.size) return new Set();
  const table = String((env as RuntimeEnv & { AIRTABLE_TABLE_PAYMENTS?: string }).AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ");
  const ids = [...candidates], payments: AirtableRecord[] = [];
  for (let i = 0; i < ids.length; i += 25) {
    const sessionFilter = ids.slice(i, i + 25).map((id) => `{${PAYMENT_FIELDS.sessionId}}='${escapeFormulaString(id)}'`).join(",");
    payments.push(...await listAirtableRecords(env, table, { filterByFormula: `AND(OR(${sessionFilter}),{${PAYMENT_FIELDS.verification}}='verified')` }));
  }
  return new Set(payments.filter((payment) =>
    candidates.has(fieldText(payment, PAYMENT_FIELDS.sessionId) || "") && paymentStillValid(payment) &&
    ["deposit", "full"].includes(paymentStage(payment)) && fieldNumber(payment, PAYMENT_FIELDS.amount) > 0
  ).map((payment) => fieldText(payment, PAYMENT_FIELDS.sessionId)!));
}

function toLabel(value: string): string {
  return String(value || "pending")
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function dateOnly(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function normalizeIsoDate(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatRate(value: number): string {
  if (!value) return "0%";
  const percent = percentPoints(value);
  return `${Number(percent.toFixed(2))}%`;
}

function percentPoints(value: number): number {
  // Airtable percent fields are fractions; tolerate historical percentage-point values on read only.
  return Number((value <= 1 ? value * 100 : value).toFixed(6));
}

function appendNote(previous: string | null, next: string): string {
  return previous ? `${previous}\n\n${next}` : next;
}

function requireSecret(env: RuntimeEnv, name: SecretName): string {
  const value = env[name];
  if (!value) throw new Error(`Missing required secret ${name}.`);
  return value;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "");
}

const WEBFLOW_SIGIL_PARTNER_FORM_JS = `
(function () {
  var CONFIG = {
    workerBaseUrl: "https://partners-worker.malemodel-bkk.workers.dev",
    formSelector: "form.sigil-form-card[name='sigil-partner-request']"
  };
  var fileCategories = {
    photo: true,
    portfolio: true,
    comp_card: true,
    company_profile: true,
    identity: true,
    rate_card: true,
    proof: true,
    other: true
  };
  function randomPart() {
    var bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (byte) {
      return byte.toString(36).padStart(2, "0");
    }).join("").slice(0, 11);
  }
  function requestId() {
    var stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return "prq_" + stamp + "_" + randomPart();
  }
  function fieldValue(form, name) {
    var field = form.elements[name];
    return field && "value" in field ? String(field.value || "").trim() : "";
  }
  function setStatus(form, text) {
    var root = form.closest(".sigil-partner-form");
    var status = root && root.querySelector("[data-eval-status]");
    if (status) status.textContent = text;
  }
  function showModal(form, mode, message) {
    var root = form.closest(".sigil-partner-form");
    var modal = root && root.querySelector("[data-submit-modal]");
    var loadingState = root && root.querySelector("[data-loading-state]");
    var resultState = root && root.querySelector("[data-result-state]");
    if (!modal || !loadingState || !resultState) return;
    modal.classList.add("is-visible");
    loadingState.hidden = mode !== "loading";
    resultState.hidden = mode === "loading";
    if (message) {
      var paragraph = resultState.querySelector("p");
      if (paragraph) paragraph.textContent = message;
    }
  }
  function isReady(form) {
    var required = Array.prototype.slice.call(form.querySelectorAll("[required]"));
    return required.every(function (field) {
      if (!("value" in field)) return false;
      var text = String(field.value || "").trim();
      if (field.tagName === "TEXTAREA") return text.length >= 20;
      return text.length >= 2;
    });
  }
  function fileCategory(input) {
    var raw = input.dataset.fileCategory || input.name || "other";
    return fileCategories[raw] ? raw : "other";
  }
  async function uploadFiles(form, id) {
    var inputs = Array.prototype.slice.call(form.querySelectorAll("input[type='file']"));
    var uploads = [];
    for (var inputIndex = 0; inputIndex < inputs.length; inputIndex += 1) {
      var input = inputs[inputIndex];
      var files = Array.prototype.slice.call(input.files || []);
      for (var fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        var data = new FormData();
        data.set("request_id", id);
        data.set("file_category", fileCategory(input));
        data.set("file", files[fileIndex]);
        var response = await fetch(CONFIG.workerBaseUrl + "/v1/partner/upload", {
          method: "POST",
          body: data
        });
        var payload = await response.json();
        if (!response.ok || !payload || !payload.ok) {
          throw new Error(payload && payload.error && payload.error.message ? payload.error.message : "File upload failed.");
        }
        uploads.push(payload);
      }
    }
    return uploads;
  }
  async function submitPartnerRequest(form) {
    var id = form.dataset.requestId || requestId();
    form.dataset.requestId = id;
    var files = await uploadFiles(form, id);
    var payload = {
      request_id: id,
      name_alias: fieldValue(form, "name_alias"),
      access_source: fieldValue(form, "access_source"),
      value_bring: fieldValue(form, "value_bring"),
      why_consider: fieldValue(form, "why_consider"),
      experience: fieldValue(form, "experience"),
      contact: fieldValue(form, "contact"),
      talent_name: fieldValue(form, "talent_name"),
      talent_type: fieldValue(form, "talent_type"),
      portfolio_url: fieldValue(form, "portfolio_url"),
      talent_location: fieldValue(form, "talent_location"),
      talent_details: fieldValue(form, "talent_details"),
      source_path: window.location.pathname,
      files: files
    };
    var response = await fetch(CONFIG.workerBaseUrl + "/v1/partner/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    var result = await response.json();
    if (!response.ok || !result || !result.ok) {
      throw new Error(result && result.error && result.error.message ? result.error.message : "Request submission failed.");
    }
    return result;
  }
  document.addEventListener("submit", function (event) {
    var target = event.target;
    var form = target instanceof HTMLFormElement ? target.closest(CONFIG.formSelector) : null;
    if (!form) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (form.dataset.sigilSubmitting === "true") return;
    if (!isReady(form)) {
      setStatus(form, "Partial profile detected / ตรวจพบข้อมูลบางส่วน");
      return;
    }
    form.dataset.sigilSubmitting = "true";
    setStatus(form, "Submitting to private review / กำลังส่งเข้าสู่การพิจารณาส่วนตัว");
    showModal(form, "loading");
    submitPartnerRequest(form)
      .then(function () {
        setStatus(form, "Submission received / ส่งคำขอแล้ว");
        showModal(form, "result", "Your request has been received for private review.");
      })
      .catch(function (error) {
        setStatus(form, error.message || "Submission failed.");
        showModal(form, "result", error.message || "Unable to submit this request right now.");
      })
      .finally(function () {
        delete form.dataset.sigilSubmitting;
      });
  }, true);
})();
`;

async function handlePartnerLineExchange(request: Request, env: RuntimeEnv): Promise<Response> {
  if (!["https://www.mmdbkk.com", "https://mmdbkk.com"].includes(request.headers.get("Origin") || "")) return errorResponse(request, env, "origin_not_allowed", "Open Partner LINE login.", 403, false);
  const body = await readJsonObject(request);
  if (!body.ok) return errorResponse(request, env, "invalid_json", body.error, 400, false);
  const token = readString(body.value, "id_token");
  if (!token || token.length > 10000) return errorResponse(request, env, "id_token_required", "Verify LINE first.", 401, false);
  const response = await fetch("https://api.line.me/oauth2/v2.1/verify", { method: "POST", body: new URLSearchParams({ id_token: token, client_id: "2010864854" }) });
  const identity = await response.json() as Record<string, unknown>;
  if (!response.ok || identity.aud !== "2010864854" || identity.iss !== "https://access.line.me" || typeof identity.exp !== "number" || identity.exp * 1000 <= Date.now() || typeof identity.sub !== "string" || !/^U[a-f0-9]{32}$/i.test(identity.sub)) return errorResponse(request, env, "line_identity_invalid", "LINE verification failed.", 401, false);
  const claims = await listAirtableRecords(env, "tbluoZ5JiRcoUP6WT", { filterByFormula: `{line_user_id}='${escapeFormulaString(identity.sub)}'`, maxRecords: 2 });
  const claim = claims[0];
  if (claims.length !== 1 || !claim || fieldText(claim, "fld6PAywOhvDeelDJ") !== "verified_unlinked" || fieldText(claim, "fldGB7Raqm6O1NIhh") !== "published") return errorResponse(request, env, "partner_line_review_required", "LINE claim requires review.", 403, false);
  const ids = fieldLinkIds(claim, "fldaMlO1fRoazxfHg");
  if (ids.length !== 1) return errorResponse(request, env, "partner_line_review_required", "Partner link requires review.", 403, false);
  const partner = await getAirtableRecord(env, env.AIRTABLE_TABLE_MODEL_PARTNERS, ids[0]!);
  const links = fieldLinkIds(partner, "fldXs6VyfXIHxBMpQ");
  if (links.length !== 1 || links[0] !== claim.id || normalizeStatus(fieldText(partner, MODEL_PARTNERS.status)) !== "active" || normalizeStatus(fieldText(partner, MODEL_PARTNERS.approvalStatus)) !== "recognized") return errorResponse(request, env, "partner_not_recognized", "Partner is not active.", 403, false);
  const access = await generatePartnerToken(env, partner.id);
  await updateAirtableRecord(env, env.AIRTABLE_TABLE_MODEL_PARTNERS, partner.id, { [MODEL_PARTNERS.accessTokenHash]: await sha256Hex(access) }, false);
  const result = json(request, env, { ok: true, dashboard_url: `https://www.mmdbkk.com/partner/dashboard?t=${encodeURIComponent(access)}` });
  result.headers.set("Cache-Control", "no-store");
  return result;
}
const PARTNER_LINE_LOGIN_URL = "https://mmdbkk.com/sigil/model/dashboard/partner-login";
const PARTNER_LINE_LOGIN = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="referrer" content="no-referrer">
  <meta name="robots" content="noindex,nofollow">
  <meta name="theme-color" content="#080807">
  <title>SĪGIL Partner · Private Access</title>
  <style>
    @font-face{font-family:"Anuphan";src:url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6ab03af83c714e7ca09d4d5f_Anuphan-Regular.ttf") format("truetype");font-weight:400;font-style:normal;font-display:swap}
    @font-face{font-family:"Anuphan";src:url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6ab03af8f8fd3acb9ca38e4d_Anuphan-Medium.ttf") format("truetype");font-weight:500;font-style:normal;font-display:swap}
    @font-face{font-family:"Anuphan";src:url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6ab03af8bae381fe8af7b3fd_Anuphan-SemiBold.ttf") format("truetype");font-weight:600;font-style:normal;font-display:swap}
    @font-face{font-family:"Anuphan";src:url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6ab03af8e6af8380eb7ade4f_Anuphan-Bold.ttf") format("truetype");font-weight:700;font-style:normal;font-display:swap}
    @font-face{font-family:"General Sans";src:url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6ab03e0906124a74b5e2a114_GeneralSans-Regular.ttf") format("truetype");font-weight:400;font-style:normal;font-display:swap}
    @font-face{font-family:"General Sans";src:url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6ab03e09393d9307034e1c53_GeneralSans-Medium.ttf") format("truetype");font-weight:500;font-style:normal;font-display:swap}
    @font-face{font-family:"General Sans";src:url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6ab03e09ac36bac3c6685725_GeneralSans-Semibold.ttf") format("truetype");font-weight:600;font-style:normal;font-display:swap}
    @font-face{font-family:"General Sans";src:url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6ab03e096209f014ff07c142_GeneralSans-Bold.ttf") format("truetype");font-weight:700;font-style:normal;font-display:swap}
    @font-face{font-family:"Satoshi";src:url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6ab14912ae97f0a7a0fd93d9_Satoshi-Regular.ttf") format("truetype");font-weight:400;font-style:normal;font-display:swap}
    @font-face{font-family:"Satoshi";src:url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6ab14912d1ba49f7fb7fcf56_Satoshi-Medium.ttf") format("truetype");font-weight:500;font-style:normal;font-display:swap}
    @font-face{font-family:"Satoshi";src:url("https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6ab149126876bbe61da30a9c_Satoshi-Bold.ttf") format("truetype");font-weight:700;font-style:normal;font-display:swap}
    :root{color-scheme:dark;--bg:#0a0908;--bg-mid:#0f0d0b;--ivory:#fff9f0;--body:#d9d1c7;--muted:#91887f;--placeholder:#7f776f;--gold:#d7af67;--gold2:#f5e2b5;--line:rgba(215,175,103,.28);--line2:rgba(255,255,255,.06);--ink:#17120b;--green:#5f9272;--font-th:"Anuphan",Tahoma,"Noto Sans Thai",sans-serif;--font-en:"General Sans","Satoshi",Arial,sans-serif;--font-secondary:"Satoshi","General Sans",Arial,sans-serif}
    *{box-sizing:border-box}
    html,body{margin:0;min-height:100%;background:var(--bg)}
    body{min-height:100svh;overflow:hidden;color:var(--body);font-family:var(--font-th);font-size:16px;line-height:1.7;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
    a{color:inherit}
    .page{position:relative;min-height:100svh;display:grid;isolation:isolate;overflow:hidden;background:linear-gradient(180deg,var(--bg),var(--bg-mid) 52%,#050505)}
    .hero{position:absolute;inset:0;z-index:-2}
    .hero picture,.hero img{display:block;width:100%;height:100%}
    .hero img{object-fit:cover;object-position:center top}
    .hero:after{position:absolute;inset:0;content:"";background:linear-gradient(180deg,rgba(4,4,3,.04) 0%,rgba(4,4,3,.12) 34%,rgba(4,4,3,.74) 67%,rgba(4,4,3,.98) 100%)}
    .grain{position:absolute;inset:0;z-index:-1;pointer-events:none;opacity:.16;background-image:linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.018) 1px,transparent 1px);background-size:42px 42px;mask-image:linear-gradient(to bottom,black,transparent 85%)}
    .topbar{position:relative;z-index:3;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 16px}
    .brand{display:flex;align-items:center;gap:10px;text-decoration:none}
    .brand-mark{width:30px;height:30px;display:grid;place-items:center;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none}
    .brand-copy{display:flex;flex-direction:column;gap:3px}
    .brand-copy b{color:var(--ivory);font-family:var(--font-en);font-size:11px;line-height:1;font-weight:700;letter-spacing:.14em}
    .brand-copy span{color:var(--gold2);font-family:var(--font-en);font-size:8px;line-height:1.1;font-weight:600;letter-spacing:.14em;text-transform:uppercase}
    .private{padding:8px 10px;border:1px solid rgba(213,174,102,.3);border-radius:999px;background:rgba(8,8,7,.3);backdrop-filter:blur(12px);color:var(--gold2);font-size:8px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
    .shell{align-self:end;width:min(100% - 24px,1180px);margin:0 auto;padding:0 0 max(14px,env(safe-area-inset-bottom))}
    .card{position:relative;overflow:hidden;padding:20px;border:1px solid var(--line);border-radius:24px;background:linear-gradient(180deg,rgba(20,18,15,.78),rgba(8,8,7,.95));box-shadow:0 24px 80px rgba(0,0,0,.44);backdrop-filter:blur(20px)}
    .card:before{position:absolute;top:0;right:14%;left:14%;height:1px;content:"";background:linear-gradient(90deg,transparent,var(--gold),transparent)}
    .eyebrow{margin:0 0 10px;color:var(--gold2);font-family:var(--font-en);font-size:9px;font-weight:600;letter-spacing:.14em;text-transform:uppercase}
    h1{margin:0;max-width:570px;color:var(--ivory);font-family:var(--font-th);font-size:clamp(36px,10vw,52px);font-weight:600;letter-spacing:-.045em;line-height:1.02;text-wrap:balance}
    .lead{margin:12px 0 0;max-width:620px;color:var(--body);font-size:13px;line-height:1.68}
    .flow{margin:16px 0 0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));list-style:none;border-top:1px solid var(--line2);border-bottom:1px solid var(--line2)}
    .flow li{padding:11px 7px 11px 0;min-width:0}
    .flow li+li{padding-left:9px;border-left:1px solid var(--line2)}
    .flow b,.flow span{display:block}
    .flow b{color:var(--gold);font-size:8px;letter-spacing:.08em;text-transform:uppercase}
    .flow span{margin-top:4px;color:var(--body);font-size:9px;font-weight:700;line-height:1.35}
    #go{width:100%;min-height:58px;margin-top:14px;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:0 20px;border:1px solid rgba(255,241,199,.72);border-radius:24px;background:linear-gradient(135deg,#f6e2ae 0%,#e7ca86 56%,#d4ae64 100%);box-shadow:0 14px 38px rgba(0,0,0,.24),inset 0 1px 0 rgba(255,255,255,.5);color:#17120b;font:600 15px/1 var(--font-th);cursor:pointer;transition:transform .2s ease,filter .2s ease,box-shadow .2s ease}
    #go:hover{transform:translateY(-1px);filter:brightness(1.025);box-shadow:0 16px 42px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.56)}
    #go:focus-visible{outline:3px solid rgba(239,213,159,.72);outline-offset:4px}
    #go:disabled{cursor:wait;opacity:.68;transform:none}
    .line-action{display:flex;align-items:center;gap:14px;min-width:0}
    .line-dot{width:14px;height:14px;flex:0 0 14px;border-radius:50%;background:#5f9272;box-shadow:0 0 0 7px rgba(95,146,114,.10)}
    .line-arrow{flex:0 0 auto;color:#17120b;font-family:var(--font-en);font-size:22px;font-weight:600;line-height:1;transform:translateY(-1px)}
    #state{min-height:20px;margin:9px 0 0;color:var(--gold2);font-size:11px;line-height:1.45;text-align:center}
    .micro{margin:8px 0 0;color:var(--muted);font-size:9px;line-height:1.5;text-align:center}
    .links{margin-top:11px;display:flex;justify-content:center;gap:16px}
    .links a{color:var(--muted);font-family:var(--font-en);font-size:10px;font-weight:600;text-decoration:none}
    .links a:hover{color:var(--ivory)}

    .flow b,.private{font-family:var(--font-en)}
    .line-arrow{font-family:var(--font-en)}
    /* FINAL PARTNER CONTRAST SAFETY */
    h1,.brand-copy b{color:var(--ivory)!important;-webkit-text-fill-color:var(--ivory)!important;background:none!important;background-image:none!important}
    .eyebrow,.brand-copy span,.private,#state{color:var(--gold2)!important;-webkit-text-fill-color:var(--gold2)!important}
    .lead,.flow span,.micro,.links a{ -webkit-text-fill-color:currentColor }
    @media(min-width:768px){
      body{overflow:hidden}
      .hero img{object-position:center center}
      .hero:after{background:linear-gradient(90deg,rgba(4,4,3,.94) 0%,rgba(4,4,3,.72) 35%,rgba(4,4,3,.16) 63%,rgba(4,4,3,.04) 100%),linear-gradient(180deg,rgba(4,4,3,.04),rgba(4,4,3,.24))}
      .topbar{padding:20px clamp(28px,4vw,56px)}
      .brand-mark{width:34px;height:34px}
      .brand-copy b{font-size:12px}.brand-copy span{font-size:9px}.private{font-size:9px;padding:9px 12px}
      .shell{align-self:center;width:min(1180px,calc(100% - 84px));padding:66px 0}
      .card{width:min(560px,48vw);padding:30px 32px;border-radius:28px;background:linear-gradient(145deg,rgba(17,16,14,.86),rgba(8,8,7,.93))}
      h1{font-size:clamp(48px,4.5vw,68px)}
      .lead{font-size:14px;line-height:1.75}
      .flow{margin-top:20px}.flow li{padding:13px 9px 13px 0}.flow span{font-size:10px}
      #go{min-height:62px;padding:0 22px;font-size:15px;border-radius:26px}
    }
    @media(max-height:690px) and (max-width:767px){
      .topbar{padding-top:10px}.shell{padding-bottom:8px}.card{padding:16px}h1{font-size:34px}.lead{font-size:12px;line-height:1.55}.flow{margin-top:12px}#go{margin-top:11px;min-height:54px}.micro,.links{display:none}
    }
    @media(prefers-reduced-motion:reduce){#go{transition:none}}
  </style>
</head>
<body>
  <main class="page">
    <div class="hero" aria-hidden="true">
      <picture>
        <source media="(max-width:767px)" srcset="https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6ab1323f4e443dd3ce36de09_Yuki%20Dash%20log%20mob.webp">
        <img src="https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6ab1323f7c4d9e972ff1d3ea_Yuki%20Dash%20log%20desk.webp" alt="" fetchpriority="high" decoding="async">
      </picture>
    </div>
    <div class="grain" aria-hidden="true"></div>

    <header class="topbar">
      <a class="brand" href="https://www.mmdbkk.com/partner" aria-label="SĪGIL Partner Division">
        <span class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="21" height="21"><g fill="#d5ae66"><polygon points="7,21 11.5,17.5 14,17.5 14,22 10,25"/><polygon points="10.5,15.5 14.5,12.5 14.5,7.5 10.5,10.7"/><polygon points="15.8,6.5 20,3 20,14.8 15.8,18"/><polygon points="15.2,18.8 19.3,15.6 25,19.6 25,23.5 21.2,27 21.2,23.2 17.8,20.9"/></g></svg>
        </span>
        <span class="brand-copy"><b>SĪGIL SYSTEM</b><span>Partner Division</span></span>
      </a>
      <span class="private">Private Access</span>
    </header>

    <section class="shell">
      <div class="card">
        <p class="eyebrow">Recognized Partner Access · Partner Control Layer</p>
        <h1>กลับเข้าสู่<br>Control Room ของคุณ</h1>
        <p class="lead">ใช้ LINE บัญชีเดิมที่ MMD รับรองไว้ ระบบจะยืนยันตัวตนก่อนพาเข้าสู่ Dashboard ของบัญชีนี้ครับ</p>

        <ol class="flow" aria-label="ขั้นตอนเข้าสู่ระบบ">
          <li><b>01 · LINE</b><span>ยืนยันตัวตน</span></li>
          <li><b>02 · Telegram</b><span>แจ้งเตือนเสริม</span></li>
          <li><b>03 · Dashboard</b><span>เปิด Control Room</span></li>
        </ol>

        <button id="go" type="button">
          <span class="line-action">
            <span class="line-dot" aria-hidden="true"></span>
            <span>เข้าสู่ระบบด้วย LINE</span>
          </span>
          <span class="line-arrow" aria-hidden="true">↗</span>
        </button>
        <p id="state" role="status" aria-live="polite"></p>
        <p class="micro">ระบบเชื่อมต่อกับ Partner record ที่ผ่าน Recognition และรักษา identity เดิมของคุณตลอด flow</p>
        <nav class="links" aria-label="Partner links">
          <a href="https://www.mmdbkk.com/partner/terms">Partner Terms</a>
          <a href="https://www.mmdbkk.com/partner">Partner Home ↗</a>
        </nav>
      </div>
    </section>
  </main>

  <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  <script>
const go=document.getElementById('go'),state=document.getElementById('state');
let initialized;
function initialize(){return initialized||(initialized=liff.init({liffId:'2010864854-N34SgCqq'}).catch(error=>{initialized=null;throw error;}));}
go.onclick=async()=>{go.disabled=true;state.textContent='กำลังยืนยัน LINE';try{await initialize();if(!liff.isLoggedIn()){liff.login({redirectUri:'${PARTNER_LINE_LOGIN_URL}'});return;}const idToken=liff.getIDToken();if(!idToken)throw Error();const r=await fetch('/v1/partner/line/exchange',{method:'POST',referrerPolicy:'no-referrer',cache:'no-store',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({id_token:idToken})});const d=await r.json();if(!r.ok||!d.ok){const code=d.error&&d.error.code;state.textContent=code==='partner_line_review_required'||code==='partner_not_recognized'?'ยืนยัน LINE แล้ว · Partner Review กำลังดำเนินการ':'พร้อมยืนยัน LINE อีกครั้ง';go.disabled=false;return;}const target=new URL(d.dashboard_url);if(target.origin!=='https://www.mmdbkk.com'||target.pathname!=='/partner/dashboard'||!target.searchParams.get('t')||target.username||target.password)throw Error();state.textContent='เชื่อมต่อแล้ว · กำลังเปิด Partner Control Room';location.replace(target.href);}catch{state.textContent='พร้อมเชื่อมต่ออีกครั้งผ่าน LINE';go.disabled=false;}};
if(typeof liff!=='undefined')initialize().catch(()=>{state.textContent='พร้อมเชื่อมต่อผ่าน LINE';});
  </script>
</body>
</html>`;
