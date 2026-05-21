type SecretName = "AIRTABLE_API_KEY" | "TELEGRAM_BOT_TOKEN" | "TOKEN_SECRET";
type RuntimeEnv = Env & Partial<Record<SecretName | "PUBLIC_SITE_URL", string>>;

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
  accessTokenHash: "fldoaCF4k4YqyuQ7Q"
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
  payoutStatus: "fldno1EAh01onIVbp",
  jobId: "fldUcVyYC37ijCHz8"
} as const;

const MODELS = {
  workingName: "fldShiT60bmCxFxRu",
  nickname: "fld0maFkh4NHpsPxA",
  status: "fldRcAE3bL8dKmURH"
} as const;

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
          control_layer: ROLE_LAYERS.partner_control
        });
      }

      if (
        request.method === "GET" &&
        (url.pathname === "/webflow-sigil-partner-form.js" ||
          url.pathname === "/assets/webflow-sigil-partner-form.js")
      ) {
        return javascriptResponse(WEBFLOW_SIGIL_PARTNER_FORM_JS);
      }

      if (request.method === "POST" && url.pathname === "/v1/partner/upload") {
        return await handlePartnerUpload(request, runtimeEnv);
      }

      if (request.method === "POST" && url.pathname === "/v1/partner/request") {
        return await handlePartnerRequest(request, runtimeEnv, ctx);
      }

      if (request.method === "GET" && url.pathname === "/v1/partner/verify") {
        return await handlePartnerVerify(request, runtimeEnv);
      }

      if (request.method === "GET" && url.pathname === "/v1/partner/dashboard") {
        return await handlePartnerDashboard(request, runtimeEnv);
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
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

async function handlePartnerApprove(request: Request, env: RuntimeEnv, ctx: ExecutionContext): Promise<Response> {
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

  ctx.waitUntil(
    sendTelegramMessage(env, [
      "SIGIL TERMS ACCEPTED",
      "",
      `Partner: ${fieldText(updatedRecord, MODEL_PARTNERS.partnerName) || updatedRecord.id}`,
      `Version: ${agreementVersion}`,
      `Accepted At: ${acceptedAt}`
    ].join("\n")).catch((error) => console.error("telegram terms failed", error))
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
  const [referrals, commissions] = await Promise.all([
    listLinkedRecordsForPartner(env, env.AIRTABLE_TABLE_MODEL_REFERRALS, MODEL_REFERRALS.partner, partnerRecord.id),
    listLinkedRecordsForPartner(env, env.AIRTABLE_TABLE_PARTNER_COMMISSIONS, PARTNER_COMMISSIONS.partner, partnerRecord.id)
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

  const activeModels = new Set(
    referrals
      .flatMap((record) => fieldLinkIds(record, MODEL_REFERRALS.model))
      .filter(Boolean)
  ).size;

  const pendingAmount = normalizedCommissions
    .filter((commission) => !isPaidStatus(commission.status))
    .reduce((sum, commission) => sum + commission.commission, 0);
  const paidAmount = normalizedCommissions
    .filter((commission) => isPaidStatus(commission.status))
    .reduce((sum, commission) => sum + commission.commission, 0);

  return json(request, env, {
    ok: true,
    control_layer: ROLE_LAYERS.partner_control,
    partner: {
      id: partnerRecord.id,
      name: fieldText(partnerRecord, MODEL_PARTNERS.partnerName) || fieldText(partnerRecord, MODEL_PARTNERS.displayName) || "SĪGIL Partner"
    },
    summary: {
      tier: fieldText(partnerRecord, MODEL_PARTNERS.tier) || "Trusted",
      activeModels,
      pendingAmount,
      paidAmount
    },
    referrals: normalizedReferrals,
    commissions: normalizedCommissions
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
  const maxRecords = options.maxRecords || 100;

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
  partnerRecordId: string
): Promise<AirtableRecord[]> {
  const formula = `FIND('${escapeFormulaString(partnerRecordId)}', ARRAYJOIN({${partnerFieldId}}))`;
  try {
    const records = await listAirtableRecords(env, tableId, { filterByFormula: formula, maxRecords: 100 });
    if (records.length) return records;
  } catch (error) {
    console.warn("Airtable linked formula failed; using fallback filter", getErrorMessage(error));
  }

  const fallback = await listAirtableRecords(env, tableId, { maxRecords: 100 });
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

async function sendTelegramMessage(env: RuntimeEnv, text: string): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN || "";
  if (!token || !env.TELEGRAM_CHAT_ID) {
    console.warn("Telegram notification skipped: missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID.");
    return;
  }

  const payload: Record<string, string | number> = {
    chat_id: env.TELEGRAM_CHAT_ID,
    text
  };

  const threadId = Number(env.TG_THREAD_CONFIRM || 0);
  if (Number.isFinite(threadId) && threadId > 0) {
    payload.message_thread_id = threadId;
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Telegram notify failed (${response.status}): ${await boundedText(response)}`);
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
  const status = fieldText(record, PARTNER_COMMISSIONS.payoutStatus) || fieldText(record, PARTNER_COMMISSIONS.status) || "pending";
  const commission = fieldNumber(record, PARTNER_COMMISSIONS.commissionAmount);

  return {
    jobId: fieldText(record, PARTNER_COMMISSIONS.jobId) || fieldText(record, PARTNER_COMMISSIONS.sessionId) || fieldText(record, PARTNER_COMMISSIONS.commissionId) || "-",
    model: modelRecord ? modelName(modelRecord) : "Talent pending",
    basisAmount: fieldNumber(record, PARTNER_COMMISSIONS.basisAmount),
    rate: formatRate(fieldNumber(record, PARTNER_COMMISSIONS.rateSnapshot)),
    commission,
    status,
    statusLabel: toLabel(status),
    paidAt: fieldText(record, PARTNER_COMMISSIONS.paidAt)
  };
}

function modelName(record: AirtableRecord): string {
  return fieldText(record, MODELS.workingName) || fieldText(record, MODELS.nickname) || record.id;
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

function normalizeStatus(value: string | null): string {
  return String(value || "").trim().toLowerCase();
}

function isPaidStatus(value: string): boolean {
  const status = normalizeStatus(value);
  return ["paid", "settled", "complete", "completed"].some((entry) => status.includes(entry));
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
  const percent = value <= 1 ? value * 100 : value;
  return `${Number(percent.toFixed(2))}%`;
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
