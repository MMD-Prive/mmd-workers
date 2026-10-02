import { readMemberAppSession } from "./member-app-api-runtime.js";
import { preparePrivatePreviewDataset } from "./own-history-preview.mjs";

export const HISTORY_PREVIEW_PATH = "/api/member/app/history/preview";
// Private data is provisioned separately after release approval. Never ship it
// with the Worker or accept a checksum or identity supplied by the browser.
export const HISTORY_PREVIEW_SHA256 = "07c390528df0a6900ed7b892c74927fcce2cdc975c37cb4efc733f5550662cf0";
export const HISTORY_PREVIEW_KV_KEY = "private:customer-history-preview:2026-10-02";

export async function handleMemberHistoryPreview(request, env = {}, dependencies = {}) {
  const respond = (status, data = null, error = null) => new Response(request.method === "HEAD" ? null : JSON.stringify({ok: status === 200, data, error}), {
    status, headers: {"content-type":"application/json; charset=utf-8", "cache-control":"private, no-store", "vary":"Cookie, Origin", "x-content-type-options":"nosniff"},
  });
  const url = new URL(request.url);
  if (!["GET", "HEAD"].includes(request.method)) return respond(405, null, "method_not_allowed");
  const origin = request.headers.get("origin");
  if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site") return respond(403, null, "same_origin_required");
  if (url.search) return respond(400, null, "query_not_allowed");
  const session = await (dependencies.readSession || readMemberAppSession)(request, env);
  if (!session?.lineUserId) return respond(401, null, "verified_session_required");
  try {
    const load = dependencies.loadPreview || (async () => {
      const raw = await env.LIFF_IDENTITY_KV?.get?.(HISTORY_PREVIEW_KV_KEY);
      if (typeof raw !== "string" || !raw) return null;
      return preparePrivatePreviewDataset(raw, HISTORY_PREVIEW_SHA256);
    });
    const preview = await load();
    if (!preview) return respond(503, null, "history_preview_pending");
    const result = preview.lookupOwnHistory({provider:"line", isVerified:true, lineUserId:session.lineUserId});
    return respond(result.statusCode, result.data, result.statusCode === 404 ? "history_evidence_missing" : null);
  } catch {
    return respond(503, null, "history_preview_pending");
  }
}
