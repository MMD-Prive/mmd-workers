import { buildKenjiVoiceContext } from "../../shared/kenji-customer-memory-v2.mjs";
import {
  linkKenjiMatrixCustomerMemoryAfterTurn,
  resolveKenjiLineCustomerMemoryContext,
} from "./kenji-line-customer-memory-runtime.mjs";

function text(value) {
  return value == null ? "" : String(value).trim();
}

function voiceForContext(context = {}) {
  return buildKenjiVoiceContext({
    relationship_context: text(context.relationship_context) || "unknown",
    identity_status: context.resolved === true ? "resolved" : text(context.status) === "not_found" ? "candidate" : "candidate",
  });
}

export async function resolveCanonicalKenjiLineClient(args = {}) {
  const context = await resolveKenjiLineCustomerMemoryContext(args);
  const voiceContext = voiceForContext(context);
  return {
    ...context,
    voice_context: voiceContext,
    safe_context: {
      ...(context.safe_context || {}),
      voice_context: voiceContext,
      customer_reply_contract: {
        use_structured_live_truth_only: true,
        render_through_voice_context: true,
        never_render_memory_as_current_truth: true,
      },
    },
  };
}

export async function linkCanonicalKenjiLineClientAfterTurn(args = {}) {
  return linkKenjiMatrixCustomerMemoryAfterTurn(args);
}
