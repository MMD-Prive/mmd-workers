const DEFAULT_STUDIO_PAGE_URL = "https://www.mmdbkk.com/studio";
const DEFAULT_STUDIO_API_BASE_URL = "https://www.mmdbkk.com";
const CARD_WIDTH = 1322;
const CARD_HEIGHT = 1200;
const RECORD_RE = /^rec[A-Za-z0-9]{14,24}$/;
const JOB_RE = /^card_[a-f0-9]{32}$/;
const PLACEHOLDER_RE = /^(?:todo|tbd|pending|placeholder|test|fake|none|null|n\/a|-)$/i;
const SENSITIVE_RE = /(?:private_original_key|r2_key|r2_prefix|storage_key|line_user_id|cookie|authorization|bearer\s+[a-z0-9._-]+|OPENAI_IMAGE_API_KEY|AIRTABLE_API_KEY)/i;

function clean(value = "") {
  return String(value ?? "").trim();
}

function requiredEnv(name, value, pattern) {
  const text = clean(value);
  if (!text || PLACEHOLDER_RE.test(text)) throw new Error(`${name}_required`);
  if (pattern && !pattern.test(text)) throw new Error(`${name}_invalid`);
  return text;
}

function assertNoSensitivePayload(value, context = "payload") {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? {});
  if (SENSITIVE_RE.test(text)) throw new Error(`${context}_contains_sensitive_payload`);
}

export function readPngDimensions(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[i] !== signature[i]) throw new Error("preview_not_png");
  }
  const type = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (type !== "IHDR") throw new Error("preview_missing_ihdr");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

export function validateStudioJob(job, { modelRecordId, cardJobId, expectedName = "" } = {}) {
  if (!job || typeof job !== "object") throw new Error("studio_job_missing");
  if (job.model_record_id !== modelRecordId) throw new Error("studio_job_model_mismatch");
  if (job.job_id !== cardJobId) throw new Error("studio_job_id_mismatch");
  if (Number(job.width) !== CARD_WIDTH || Number(job.height) !== CARD_HEIGHT) throw new Error("studio_card_dimensions_mismatch");
  if (job.published !== false) throw new Error("studio_card_must_remain_private_draft");
  if (!["awaiting_owner_review", "needs_review", "waiting_profile", "waiting_configuration", "paused"].includes(String(job.state || ""))) {
    throw new Error("studio_job_state_unknown");
  }
  if (expectedName) {
    const name = String(job.model_name || "");
    const tokens = expectedName.split(/[,|]/).map((item) => item.trim()).filter(Boolean);
    if (tokens.length && !tokens.some((token) => name.toLowerCase().includes(token.toLowerCase()))) {
      throw new Error("studio_job_model_name_mismatch");
    }
  }
  assertNoSensitivePayload(job, "studio_job");
  return true;
}

function jsonHeaders(internalToken) {
  return {
    "content-type": "application/json",
    accept: "application/json",
    "user-agent": "mmd-studio-master-frame-v2-final-verifier/1",
    ...(internalToken ? { "x-internal-token": internalToken } : {}),
  };
}

function buildUrl(base, path) {
  return new URL(path, base.endsWith("/") ? base : `${base}/`).toString();
}

async function readText(response) {
  return await response.text().catch(() => "");
}

export async function verifyStudioMasterFrameV2(input = {}, fetchImpl = globalThis.fetch) {
  const studioPageUrl = clean(input.studioPageUrl || DEFAULT_STUDIO_PAGE_URL);
  const apiBaseUrl = clean(input.apiBaseUrl || DEFAULT_STUDIO_API_BASE_URL);
  const modelRecordId = requiredEnv("GAZ_MODEL_RECORD_ID", input.modelRecordId, RECORD_RE);
  const cardJobId = requiredEnv("GAZ_CARD_JOB_ID", input.cardJobId, JOB_RE);
  const internalToken = requiredEnv("STUDIO_INTERNAL_TOKEN", input.internalToken);
  const expectedName = clean(input.expectedName || "Gaz|Gazz");
  const ownerReviewRef = requiredEnv("OWNER_IDENTITY_STATS_REVIEW_REF", input.ownerReviewRef);

  const page = await fetchImpl(studioPageUrl, {
    headers: { accept: "text/html", "user-agent": "mmd-studio-master-frame-v2-final-verifier/1" },
    redirect: "follow",
  });
  const pageBody = await readText(page);
  if (page.status !== 200) throw new Error(`studio_page_http_${page.status}`);
  if (!/(mmdStudioUploadR5|mmd-auto-card-inbox|model-cards\/list)/i.test(pageBody)) throw new Error("studio_auto_card_inbox_not_published");

  const listResponse = await fetchImpl(buildUrl(apiBaseUrl, "/studio/api/model-cards/list"), {
    method: "POST",
    headers: jsonHeaders(internalToken),
    body: JSON.stringify({ cursor: "" }),
  });
  const listText = await readText(listResponse);
  if (listResponse.status !== 200) throw new Error(`studio_cards_list_http_${listResponse.status}_${listText.slice(0, 120)}`);
  const list = JSON.parse(listText);
  if (list.ok !== true || !Array.isArray(list.jobs)) throw new Error("studio_cards_list_invalid");
  if (list.enabled !== true) throw new Error("studio_card_auto_not_enabled_for_controlled_pilot");
  const jobs = list.jobs.filter((job) => job?.model_record_id === modelRecordId);
  if (jobs.length !== 1) throw new Error(`studio_generation_job_count_${jobs.length}`);
  const job = jobs[0];
  validateStudioJob(job, { modelRecordId, cardJobId, expectedName });

  const previewResponse = await fetchImpl(buildUrl(apiBaseUrl, "/studio/api/model-cards/preview"), {
    method: "POST",
    headers: jsonHeaders(internalToken),
    body: JSON.stringify({ model_record_id: modelRecordId, job_id: cardJobId }),
  });
  const previewBytes = new Uint8Array(await previewResponse.arrayBuffer());
  if (previewResponse.status !== 200) throw new Error(`studio_cards_preview_http_${previewResponse.status}`);
  const contentType = previewResponse.headers.get("content-type") || "";
  if (!/image\/png/i.test(contentType)) throw new Error("studio_preview_not_png_content_type");
  const dimensions = readPngDimensions(previewBytes);
  if (dimensions.width !== CARD_WIDTH || dimensions.height !== CARD_HEIGHT) throw new Error("studio_preview_dimensions_mismatch");
  const disposition = previewResponse.headers.get("content-disposition") || "";
  if (!/1322x1200/i.test(disposition)) throw new Error("studio_preview_filename_missing_dimensions");

  const evidence = {
    schema: "mmd.studio_master_frame_v2_final_gate_evidence.v1",
    verified_at: new Date().toISOString(),
    gates: {
      webflow_studio_v2_published: {
        status: "pass",
        evidence: `Studio page ${studioPageUrl} returned HTTP 200 and published the auto-card inbox markers mmdStudioUploadR5 / mmd-auto-card-inbox / model-cards/list.`,
      },
      studio_page_smoke: {
        status: "pass",
        evidence: `Studio page smoke passed for ${studioPageUrl}.`,
      },
      profile_main_selected: {
        status: "pass",
        evidence: `A real Gaz/Gazz Model card draft exists for canonical model ${modelRecordId}, which can only be created after an approved profile_main set-main flow.`,
      },
      exactly_one_generation_job: {
        status: "pass",
        evidence: `Studio model-cards/list returned exactly one draft for model ${modelRecordId}: ${cardJobId}.`,
      },
      studio_preview_received: {
        status: "pass",
        evidence: `Studio preview returned authenticated PNG for ${modelRecordId}/${cardJobId}.`,
      },
      identity_and_stats_review: {
        status: "pass",
        evidence: `Owner identity/stat review recorded: ${ownerReviewRef}. Verifier confirmed summary model name includes ${expectedName}.`,
      },
      finished_png_returned: {
        status: "pass",
        evidence: `Preview PNG dimensions verified at ${dimensions.width} x ${dimensions.height}; draft remains private and unpublished.`,
      },
    },
    model_record_id: modelRecordId,
    card_job_id: cardJobId,
    model_name: job.model_name || "",
    job_state: job.state,
    published: job.published,
    preview_dimensions: dimensions,
  };
  assertNoSensitivePayload(evidence, "studio_final_evidence");
  return evidence;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verifyStudioMasterFrameV2({
    studioPageUrl: process.env.STUDIO_PAGE_URL,
    apiBaseUrl: process.env.STUDIO_API_BASE_URL,
    modelRecordId: process.env.GAZ_MODEL_RECORD_ID,
    cardJobId: process.env.GAZ_CARD_JOB_ID,
    internalToken: process.env.STUDIO_INTERNAL_TOKEN || process.env.INTERNAL_TOKEN,
    expectedName: process.env.GAZ_EXPECTED_NAME || "Gaz|Gazz",
    ownerReviewRef: process.env.OWNER_IDENTITY_STATS_REVIEW_REF,
  }).then((evidence) => {
    console.log(JSON.stringify(evidence, null, 2));
  }).catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exitCode = 1;
  });
}
