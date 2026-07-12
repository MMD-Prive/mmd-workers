const WORKER_NAME_FALLBACK = "mmd-care-intake-worker";
const MODE = "private_care_metadata_intake";
const COMPLAINT_PATH = "/member/api/recovery/complaint-evidence";
const STATUS_PATH = "/member/api/recovery/complaint-status";
const CASE_KEY_PREFIX = "mmd:private-care:complaint:v1:";
const BOARD_CARDS_KEY = "sigil:board:v1:cards";
const MAX_FILES_PER_SIDE = 12;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_TOTAL_FILES = MAX_FILES_PER_SIDE * 2;
const AIRTABLE_BASE_ID_DEFAULT = "appsV1ILPRfIjkaYg";
const AIRTABLE_CASE_TABLE_DEFAULT = "private_care_cases";
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "pdf"]);
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif", "application/pdf"]);
const ALLOWED_LANES = new Set(["client", "internal", "model"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    try {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

      if (url.pathname === "/ping" || url.pathname === "/health") {
        if (request.method !== "GET") return methodNot