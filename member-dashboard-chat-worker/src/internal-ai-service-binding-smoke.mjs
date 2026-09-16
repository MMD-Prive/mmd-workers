const AI_REASONING_URL = "https://ai-worker.local/v1/ai/kenji/customer-reasoning";
const SMOKE_TIMEOUT_MS = 1_500;

function text(value) {
  return value == null ? "" : String(value).trim();
}

function unavailable(reason) {
  return { state: "SOURCE_UNAVAILABLE", reason };
}

function syntheticCustomerContext() {
  return {
    synthetic: true,
    line_user_id: "",
    evidence_sources: {
      rename_identity: unavailable("diagnostic_synthetic_context"),
      line_oa_1to1: unavailable("diagnostic_synthetic_context"),
      line_crew: unavailable("diagnostic_synthetic_context"),
      chat_exports_attachments: unavailable("diagnostic_synthetic_context"),
      hashtags_tenure: unavailable("diagnostic_synthetic_context"),
      recognition_history: unavailable("diagnostic_synthetic_context"),
      membership_cycles: unavailable("diagnostic_synthetic_context"),
      payment_evidence: unavailable("diagnostic_synthetic_context"),
      resolver_snapshot: unavailable("diagnostic_synthetic_context"),
    },
    current_line_event: {
      observed: false,
      source_type: "diagnostic",
      crew_source_allowlisted: false,
      event_type: "diagnostic",
      message_type: "none",
      redelivery: false,
    },
  };
}

function contractAccepted(payload) {
  const data = payload?.data;
  return payload?.ok === true &&
    data?.read_only === true &&
    data?.evidence_discovery?.unavailable_is_not_not_found === true;
}

function failed(status, code) {
  return {
    status,
    payload: {
      ok: false,
      read_only: true,
      service: "ai-worker",
      error: { code },
    },
  };
}

/**
 * Internal diagnostic only. It sends a fully synthetic context to the existing
 * read-only Kenji reasoning contract and deliberately returns no upstream body.
 */
export async function runInternalAiServiceBindingSmoke(env = {}) {
  if (!env.AI_WORKER?.fetch) return failed(503, "AI_WORKER_BINDING_MISSING");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("ai_service_binding_smoke_timeout"), SMOKE_TIMEOUT_MS);
  try {
    const response = await env.AI_WORKER.fetch(new Request(AI_REASONING_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-mmd-internal-call": "true",
        "x-mmd-service-binding": "member-dashboard-chat-worker",
        "x-service-name": "member-dashboard-chat-worker",
        "x-mmd-diagnostic": "read-only-service-binding-smoke",
      },
      body: JSON.stringify({
        actor: { role: "system", purpose: "read_only_service_binding_smoke" },
        customer_context: syntheticCustomerContext(),
      }),
      signal: controller.signal,
    }));
    if (!response.ok) return failed(502, `AI_WORKER_HTTP_${response.status}`);

    const payload = await response.json().catch(() => null);
    if (!contractAccepted(payload)) return failed(502, "AI_WORKER_CONTRACT_REJECTED");

    return {
      status: 200,
      payload: {
        ok: true,
        read_only: true,
        service: "ai-worker",
        contract: "kenji_customer_reasoning_v1",
      },
    };
  } catch (_) {
    return failed(502, "AI_WORKER_REQUEST_FAILED");
  } finally {
    clearTimeout(timer);
  }
}

export const INTERNAL_AI_SERVICE_BINDING_SMOKE = Object.freeze({
  path: "/v1/internal/ai/service-binding-smoke",
  url: AI_REASONING_URL,
});