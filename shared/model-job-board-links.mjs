export const MODEL_JOB_BOARD_LOGIN_V2_URL = "https://www.mmdbkk.com/sigil/model/login";
export const MODEL_JOB_BOARD_URL = "https://sigil.mmdbkk.com/public/api/jobs";

const JOB_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function cleanModelJobBoardJobId(value = "") {
  const text = String(value || "").trim();
  return JOB_ID_RE.test(text) ? text : "";
}

export function resolveModelJobBoardNext(input = {}) {
  const requested = String(input?.next || "").trim();
  if (requested) {
    let url;
    try {
      url = new URL(requested);
    } catch {
      throw new Error("job_board_next_invalid");
    }
    if (url.protocol !== "https:" || url.origin !== "https://sigil.mmdbkk.com") {
      throw new Error("job_board_next_invalid");
    }
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path !== "/public/api/jobs" && !/^\/public\/api\/jobs\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(path)) {
      throw new Error("job_board_next_invalid");
    }
    if (url.username || url.password || url.hash) throw new Error("job_board_next_invalid");
    url.search = "";
    url.hash = "";
    return url.toString();
  }

  const jobId = cleanModelJobBoardJobId(input?.job_id);
  return jobId
    ? `${MODEL_JOB_BOARD_URL}/${encodeURIComponent(jobId)}`
    : MODEL_JOB_BOARD_URL;
}

export function buildModelJobBoardBroadcastLink(input = {}) {
  const url = new URL(MODEL_JOB_BOARD_LOGIN_V2_URL);
  url.searchParams.set("intent", "job_board");
  url.searchParams.set("source", String(input?.source || "line_model_group").trim().slice(0, 80) || "line_model_group");
  url.searchParams.set("return_to", "public_job_board");

  const jobId = cleanModelJobBoardJobId(input?.job_id);
  const next = resolveModelJobBoardNext({ job_id: jobId, next: input?.next });
  url.searchParams.set("next", next);

  if (jobId) url.searchParams.set("job_id", jobId);

  const campaignId = String(input?.campaign_id || "").trim();
  if (campaignId && campaignId.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(campaignId)) {
    url.searchParams.set("campaign_id", campaignId);
  }

  return url.toString();
}
