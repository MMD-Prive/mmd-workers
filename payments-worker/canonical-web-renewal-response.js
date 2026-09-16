const OWNER_POLICY = "membership_slip_simple_accept_v1";
const ENTITLEMENT_AUTHORITY = "my_mmd_entitlement_resolver_v1";

export async function preserveCanonicalWebRenewalPaymentSuccess(response) {
  if (!(response instanceof Response) || !response.ok) return response;
  const payload = await response.clone().json().catch(() => null);
  if (!payload || typeof payload !== "object") return response;

  // The entitlement resolver is reached only after canonical renewal money truth
  // has already been committed by canonical-web-renewal-settlement. Keep those
  // two truths separate: payment may be successful while access materialization
  // is still review_required.
  if (payload?.renewal_settlement?.authority !== ENTITLEMENT_AUTHORITY) return response;
  if (payload.payment_status === "paid" && payload.verification_status === "verified") return response;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store, private");
  return new Response(JSON.stringify({
    ...payload,
    payment_status: "paid",
    verification_status: "verified",
    evidence_submitted: true,
    owner_policy: payload.owner_policy || OWNER_POLICY,
  }), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
