import fs from "node:fs";

const DEFAULT_POST_PACK = "ops/campaigns/care-back-telegram-post-20260929.json";
const SENSITIVE_RE = /(?:line_user_id|cookie|authorization|bearer\s+[a-z0-9._-]+|AIRTABLE_API_KEY|TELEGRAM_BOT_TOKEN|private_original_key)/i;

function clean(value = "", max = 5000) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
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
  const url = clean(endpoint || pack.destination?.worker_url, 500);
  if (!url) throw new Error("telegram_internal_send_url_required");
  if (!dryRun && !token) throw new Error("telegram_internal_token_required");
  if (dryRun) {
    return { ok: true, dry_run: true, campaign_id: pack.campaign_id, payload };
  }
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${token}`,
      "x-internal-token": token,
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
  sendCareBackTelegramPost({
    packPath,
    endpoint: process.env.TELEGRAM_INTERNAL_SEND_URL,
    token: process.env.TELEGRAM_INTERNAL_TOKEN || process.env.INTERNAL_TOKEN,
    dryRun,
  }).then((result) => {
    console.log(JSON.stringify(result, null, 2));
  }).catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exitCode = 1;
  });
}
