import { reasonKenjiCustomerContext, RESOLVER_SCHEMA } from "./kenji-customer-reasoning.js";
import {
  buildKenjiConversationPolicyV1,
  CONVERSATION_MATRIX_POLICY,
  CONVERSATION_MATRIX_SCHEMA,
  CONVERSATION_POLICY_ENGINE,
} from "../../../shared/kenji-conversation-policy-core.mjs";

function text(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function buildKenjiConversationMatrix(input = {}, options = {}) {
  const bundle = object(input);
  const identity = object(bundle.identity);
  const requestedState = text(identity.state || bundle.identity_state).toLowerCase();
  const now = options.now || bundle.evaluated_at || new Date().toISOString();

  const reasoning = requestedState === "known"
    ? reasonKenjiCustomerContext(object(bundle.customer_context), { now })
    : undefined;

  return buildKenjiConversationPolicyV1(bundle, {
    now,
    reasoning,
    rightsAuthority: RESOLVER_SCHEMA,
  });
}

export {
  CONVERSATION_MATRIX_POLICY,
  CONVERSATION_MATRIX_SCHEMA,
  CONVERSATION_POLICY_ENGINE,
};
