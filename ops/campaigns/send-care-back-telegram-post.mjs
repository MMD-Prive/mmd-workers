import fs from "node:fs";

const DEFAULT_POST_PACK = "ops/campaigns/care-back-telegram-post-20260929.json";
export const DEFAULT_INTERNAL_SEND_URL = "https://telegram-worker.malemodel-bkk.workers.dev/telegram/internal/send";
export const TELEGRAM_TOKEN_ENV_KEYS = [
  "TELEGRAM_INTERNAL_TOKEN",
  "INTERNAL_API_TOKEN",
  "INTERNAL_TOKEN",
  "AUTH_SERVICE_LINE_TO_TELEGRAM",
  "AUTH_SERVICE_BOOKING_TO_TELEGRAM",
  "AUTH_SERVICE_EVENTS_TO_TELEGRAM",
  "AUTH_SERVICE_STUDIO_TO_TELEGRAM",
  "AUTH_SERVICE_AUTH_TO_TELEGRAM",
  "AUTH_SERVICE_PAYMENTS_TO_TELEGRAM",
  "TELEGRAM_DEPLOY_CONTROL_TOKEN",
];
const SENSITIVE_RE = /(?:line_user_id|cookie|authorization|bearer\s+[a-z0-9._-]+|AIRTABLE_API_KEY|TELEGRAM_BOT_TOKEN|private_original_key)/i;

function clean(value = "", max = 5000) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

export function resolveCareBackTelegramRuntimeEnv(env = process.env) {
  const token = TELEGRAM_TOKEN_ENV_KEYS.map((key) => clean(env[key], 5000)).find(Boolean) || "";
  return {
    endpoint: clean(env.TELEGRAM_INTERNAL_SEND_URL || DEFAULT_INTERNAL_SEND_URL, 500),
    token,
  };
}

export function buildCareBackTelegramPayload(pack) {
  if (!pack || pack.schema !== "mmd.care_back_telegram_post.v1") throw new Error("invalid_post_pack");
  const text = clean(pack.copy?.text, 4096);
  if (!text) throw new Error("post_text_required");
  if (SENSITIVE_RE.test(text)) throw new Error("post_text_contains_sensitive_payload");
  if (pack.safety?.does_not_grant_membership !== true || pack.safety?.does_not_confirm_payment !== true) {
    throw new Error("care_back_safety_flags_required");
  }
  return {
    flow: clean(pack.destination?.flow || "care_back", 80) || "care_back",
    text,
    parse_mode: clean(pack.copy?.parse_mode || "HTML", 20) || "HTML",
    disable_web_page_preview: pack.destination?.disable_web_page_preview === false ? false : true,
  };
}

export async function sendCareBackTelegramPost({ packPath = DEFAULT_POST_PACK, endpoint, token, dryRun = false } = {}, fetchImpl = globalThis.fetch) {
  const pack = JSON.parse(fs.readFileSync(packPath, "utf8"));
  const payload = buildCareBackTelegramPayload(pack);
  const url = clean(endpoint || pack.destination?.worker_url || DEFAULT_INTERNAL_SEND_URL, 500);
  const serviceToken = clean(token, 5000);
  if (!url) throw new Error("telegram_internal_send_url_required");
  if (!dryRun && !serviceToken) throw new Error("telegram_internal_token_required");
  if (dryRun) {
    return { ok: true, dry_run: true, campaign_id: pack.campaign_id, payload };
  }
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${serviceToken}`,
      "x-internal-token": serviceToken,
    },
    body: JSON.stringify(payload),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`telegram_send_http_${response.status}:${body.slice(0, 500)}`);
  const data = JSON.parse(body);
  if (data?.telegram?.ok === false) throw new Error(`telegram_send_failed:${JSON.stringify(data.telegram).slice(0, 500)}`);
  return { ok: true, campaign_id: pack.campaign_id, response: data };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const packPath = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : DEFAULT_POST_PACK;
  const dryRun = process.argv.includes("--dry-run");
  const runtime = resolveCareBackTelegramRuntimeEnv(process.env);
  sendCareBackTelegramPost({
    packPath,
    endpoint: runtime.endpoint,
    token: runtime.token,
    dryRun,
  }).then((result) => {
    console.log(JSON.stringify(result, null, 2));
  }).catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exitCode = 1;
  });
}
