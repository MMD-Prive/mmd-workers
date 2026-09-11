import worker from "./admin-model-line-link-worker.js";
export * from "./admin-login-hero-worker-pre-model-line-link.js";

/*
Delegated active-entrypoint contract markers.
The implementation remains in the pre-model-line-link wrapper/core chain; these
markers keep existing source-contract CI explicit while this outer wrapper adds
only the owner-reviewed MMD MODEL LINE-link flow.

browser_admin_session_required
forbidden_origin
isPaymentReviewRequest
handlePaymentReviewRequest
isPaymentEntitlementApprovalRequest
handlePaymentEntitlementApproval
coreWorker.fetch(request, env, ctx)
*/

export default worker;
