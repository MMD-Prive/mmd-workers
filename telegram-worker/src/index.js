import { json, safeJson, HttpError } from "../lib/http.js";
import { requireInternalToken } from "../lib/guard.js";
import { telegramNotify } from "../lib/telegram.js";

const DEFAULT_PROMO_CAMPAIGN = "PRIDE_2026";
const PROMO_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function str(value) {
  return value == null ? "" : String(value).trim();
}

function normalizeCampaign(value) {
  return str(value || DEFAULT_PROMO_CAMPAIGN).toUpperCase().replace(/[^A-Z0-9_:-]/g, "_").slice(0, 40) || DEFAULT_PROMO_CAMPAIGN;
}

function normalizePromoCode(value) {
  return str(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function requirePromoKv(env) {
  const kv = env.PROMO_CODES_KV || env.PROMO_KV || env.PAY_SESSIONS_KV;
  if (!kv?.get || !kv?.put) {
    throw new HttpError(503, {
      ok: false,
      error: "storage_not_configured",
      message: "PROMO_CODES_KV is required before issuing production promo codes.",
    });
  }
  return kv;
}

function makePromoCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((byte) => PROMO_CODE_ALPHABET[byte % PROMO_CODE_ALPHABET.length]).join("");
}

async function issuePromoCode(env, input) {
  const kv = requirePromoKv(env);
  const telegramUserId = str(input.telegram_user_id || input.telegramUserId);
  if (!telegramUserId) {
    throw new HttpError(400, { ok: false, error: "telegram_user_id_required" });
  }

  const campaign = normalizeCampaign(input.campaign);
  const source = str(input.source || "telegram") || "telegram";
  const requestId = str(input.request_id || crypto.randomUUID());
  const userKey = `promo:${campaign}:telegram_user:${telegramUserId}`;
  const existingCode = await kv.get(userKey);

  if (existingCode) {
    const existingRecord = await kv.get(`promo:${campaign}:code:${normalizePromoCode(existingCode)}`, "json");
    if (existingRecord?.status === "issued") {
      return {
        ok: true,
        code: existingRecord.code,
        campaign,
        single_use: true,
        status: "issued",
        idempotent: true,
      };
    }
  }

  let code = "";
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = makePromoCode();
    const taken = await kv.get(`promo:${campaign}:code:${candidate}`);
    if (!taken) {
      code = candidate;
      break;
    }
  }

  if (!code) {
    throw new HttpError(409, { ok: false, error: "promo_code_exhausted" });
  }

  const record = {
    code,
    campaign,
    telegram_user_id: telegramUserId,
    issued_at: new Date().toISOString(),
    used_at: "",
    status: "issued",
    source,
    request_id: requestId,
    single_use: true,
  };

  await kv.put(`promo:${campaign}:code:${code}`, JSON.stringify(record));
  await kv.put(userKey, code);

  return {
    ok: true,
    code,
    campaign,
    single_use: true,
    status: "issued",
  };
}

async function handlePromoIssue(req, env) {
  requireInternalToken(req, env);
  const body = await safeJson(req);
  if (!body) return json({ ok: false, error: "invalid_json" }, 400);
  const result = await issuePromoCode(env, body);
  return json(result, 200);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;

    try {
      if (req.method === "GET" && (path === "/" || path === "/health")) {
        return json({ ok: true, lock: "v2026-LOCK-01i", worker: "telegram" }, 200);
      }

      // Telegram webhook (ถ้าจะใช้จริง ค่อยทำ parser/commands เพิ่ม)
      if (path === "/telegram/webhook" && req.method === "POST") {
        const update = await safeJson(req);
        if (!update) return json({ ok: false, error: "invalid_json" }, 400);
        return json({ ok: true, received: true }, 200);
      }

      if (path === "/promo/issue" && req.method === "POST") {
        return await handlePromoIssue(req, env);
      }

      // Optional: internal send (ให้ worker อื่นเรียกผ่านตัวนี้)
      if (path === "/telegram/internal/send" && req.method === "POST") {
        requireInternalToken(req, env);
        const body = await safeJson(req);
        if (!body) return json({ ok: false, error: "invalid_json" }, 400);
        const tg = await telegramNotify(body, env);
        return json({ ok: true, telegram: tg }, 200);
      }

      return json({ ok: false, error: "not_found" }, 404);
    } catch (err) {
      if (err instanceof HttpError) return json(err.body, err.status);
      return json({ ok: false, error: "server_error", detail: String(err?.message || err) }, 500);
    }
  },
};

export { issuePromoCode };
