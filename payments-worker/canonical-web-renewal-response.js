// A response adapter cannot establish Money Truth. Canonical paid/verified fields
// must already be present from payments-worker; preserve both paid and pending.
export async function preserveCanonicalWebRenewalPaymentSuccess(response) {
  return response;
}
