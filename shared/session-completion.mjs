import { withPaymentEvidenceLock } from './canonical-payment-evidence.mjs';

export const COMPLETION_SCHEMA = 'mmd_customer_completion_v1';

export function withSessionCompletionLock(env, sessionId, operation) {
  return withPaymentEvidenceLock(env.SESSION_COMPLETION_STATE || env.PRIVATE_MODEL_MEDIA,
    `session-completion:${sessionId}`, operation);
}

export function readCustomerCompletion(fields = {}) {
  const raw = fields.customer_aftercare_json ?? fields.fldflz9XwR9vAQIBZ;
  let evidence = null;
  try { evidence = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch {}
  const sessionId = fields.session_id ?? fields.fldLTq2kZbyRv22IA;
  const completedAt = fields.customer_completed_at ?? fields.fldj3m3CxELpYZO4f;
  const approved = evidence?.schema === COMPLETION_SCHEMA && evidence.session_id === sessionId &&
    evidence.approved_at === completedAt && Number.isFinite(Date.parse(completedAt));
  return { approved, evidence: evidence && typeof evidence === 'object' && !Array.isArray(evidence) ? evidence : null,
    review: approved ? evidence.review || null : null };
}
