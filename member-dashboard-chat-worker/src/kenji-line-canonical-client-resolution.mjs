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
  const nextActionPolicy = voiceContext.next_action_policy || {};
  return {
    ...context,
    voice_context: voiceContext,
    next_action_policy: nextActionPolicy,
    safe_context: {
      ...(context.safe_context || {}),
      voice_context: voiceContext,
      next_action_policy: nextActionPolicy,
      customer_reply_contract: {
        use_structured_live_truth_only: true,
        render_through_voice_context: true,
        never_render_memory_as_current_truth: true,
        include_next_best_action_when_actionable: true,
        no_forced_cta_when_not_useful: true,
        max_primary_cta: 1,
        cta_must_be_executable: true,
        cta_must_preserve_continuity: true,
        cta_must_not_repeat_known_inputs: true,
        cta_must_not_imply_protected_outcome: true,
        cta_must_not_bypass_authority: true,
      },
    },
  };
}

export async function linkCanonicalKenjiLineClientAfterTurn(args = {}) {
  return linkKenjiMatrixCustomerMemoryAfterTurn(args);
}
