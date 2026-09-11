export const PAYMENTS_CONFIRM_LINK_PATH = "/v1/confirm/link";
export const PAYMENTS_FALLBACK_ORIGIN = "https://sigil.mmdbkk.com";

export function paymentIssuerTransport(env = {}) {
  return typeof env.PAYMENTS_WORKER?.fetch === "function" ? "service_binding" : "https_fallback";
}

export async function requestPaymentsConfirmLink(env = {}, payload) {
  const serviceToken = String(env.AUTH_SERVICE_ADMIN_TO_PAYMENTS || "").trim();
  if (!serviceToken) throw new Error("missing_AUTH_SERVICE_ADMIN_TO_PAYMENTS");

  const bound = paymentIssuerTransport(env) === "service_binding";
  let base = bound ? PAYMENTS_FALLBACK_ORIGIN : String(
    env.PAYMENTS_WORKER_BASE_URL || env.PAYMENTS_BASE_URL || PAYMENTS_FALLBACK_ORIGIN,
  ).trim().replace(/\/+$/, "");
  // --keep-vars may retain the old workers.dev base on an existing deployment.
  if (base === "https://payments-worker.malemodel-bkk.workers.dev") base = PAYMENTS_FALLBACK_ORIGIN;
  let url;
  try { url = new URL(base); } catch { throw new Error("invalid_PAYMENTS_BASE_URL"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("invalid_PAYMENTS_BASE_URL");
  }
  const init = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Internal-Token": serviceToken,
    },
    body: JSON.stringify(payload),
    redirect: "manual",
  };
  // A failed/ambiguous write must never be retried over another transport.
  // HTTP fallback is selected only when the service binding is absent.
  if (bound) return env.PAYMENTS_WORKER.fetch(new Request(`${url.origin}${PAYMENTS_CONFIRM_LINK_PATH}`, init));
  return fetch(`${url.origin}${PAYMENTS_CONFIRM_LINK_PATH}`, init);
}
