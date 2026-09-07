import {
  AI_OPS_AUTHORITY,
  AI_OPS_SCHEMA_VERSION,
  baseAiOpsBrief,
  resolveAiOpsSurface,
  safeAiOpsContext,
} from "./ai-ops-layer-contract.js";

export function buildAiOpsContextResponse(urlLike) {
  const url = urlLike instanceof URL ? urlLike : new URL(String(urlLike), "https://mmdbkk.com");
  const surface = resolveAiOpsSurface(url.searchParams.get("path") || "/internal/admin/control-room");
  const context = safeAiOpsContext(Object.fromEntries(url.searchParams.entries()));
  const advisory = baseAiOpsBrief(surface, context);
  return {
    ok: true,
    schema_version: AI_OPS_SCHEMA_VERSION,
    page: surface,
    context,
    brief: advisory.brief,
    anomalies: advisory.anomalies,
    next_actions: advisory.next_actions,
    authority: AI_OPS_AUTHORITY,
    generated_at: new Date().toISOString(),
  };
}

export function aiOpsJsonResponse(request) {
  const payload = buildAiOpsContextResponse(new URL(request.url));
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
