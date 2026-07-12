import worker from "./index.js";

const WEBFLOW_PATH = "/v1/private-care/submit";
const LEGACY_PATH = "/member/api/recovery/complaint-evidence";
const PRIVATE_CASE_KEY_PREFIX = "mmd:private-care:webflow:v1:";
const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return worker.fetch(request, env, ctx);
   