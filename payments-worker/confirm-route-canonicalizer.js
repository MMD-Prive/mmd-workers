export const CUSTOMER_CONFIRM_PATH = "/sigil/confirm/job-confirmation";
export const MODEL_CONFIRM_PATH = "/sigil/confirm/job-model";

const LEGACY_CUSTOMER_CONFIRM_PATH = "/confirm/job-confirmation";
const LEGACY_MODEL_CONFIRM_PATH = "/confirm/job-model";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function normalizePath(pathname = "") {
  const path = clean(pathname || "/").replace(/\/{2,}/g, "/");
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

export function canonicalizeConfirmTarget(value, legacyPath, canonicalPath) {
  const raw = clean(value);
  if (!raw) return canonicalPath;

  if (!/^https?:\/\//i.test(raw)) {
    return normalizePath(raw) === normalizePath(legacyPath) ? canonicalPath : raw;
  }

  try {
    const url = new URL(raw);
    if (normalizePath(url.pathname) === normalizePath(legacyPath)) {
      url.pathname = canonicalPath;
      return url.toString();
    }
  } catch (_) {}

  return raw;
}

export function canonicalizeConfirmLinkPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  return {
    ...payload,
    confirm_page: canonicalizeConfirmTarget(
      payload.confirm_page,
      LEGACY_CUSTOMER_CONFIRM_PATH,
      CUSTOMER_CONFIRM_PATH,
    ),
    model_confirm_page: canonicalizeConfirmTarget(
      payload.model_confirm_page,
      LEGACY_MODEL_CONFIRM_PATH,
      MODEL_CONFIRM_PATH,
    ),
  };
}

export async function canonicalizeConfirmLinkRequest(request) {
  const body = await request.clone().json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return request;

  return new Request(request, {
    body: JSON.stringify(canonicalizeConfirmLinkPayload(body)),
  });
}
