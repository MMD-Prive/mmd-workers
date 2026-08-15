import { HttpError } from "./http.js";

export function requireConfirmKey(req, env) {
  if (!env.CONFIRM_KEY) return;
  const key = req.headers.get("X-Confirm-Key") || "";
  if (key !== env.CONFIRM_KEY) {
    throw new HttpError(403, { ok: false, error: "confirm_key_required" });
  }
}

export function requireInternalToken(req, env, { allowBookingService = false } = {}) {
  const acceptedTokens = [
    env.INTERNAL_API_TOKEN,
    allowBookingService ? env.AUTH_SERVICE_BOOKING_TO_TELEGRAM : "",
  ].filter(Boolean);
  if (!acceptedTokens.length) return;

  const direct = req.headers.get("X-Internal-Token") || "";
  const authorization = req.headers.get("Authorization") || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
  const key = direct || bearer;

  if (!acceptedTokens.includes(key)) {
    throw new HttpError(403, { ok: false, error: "internal_token_required" });
  }
}
