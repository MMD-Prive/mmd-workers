const DIAGNOSTIC_PATH = "/__internal/member-status/diagnostic";
const RESOLVER_SECRET_HEADER = "x-mmd-member-resolver-secret";
const HEALTHY_ZERO_MATCH = "healthy_zero_match";
const GENERIC_FAILURE = "generic_failure";

export async function runMemberResolverDiagnostic(env = {}, argumentCount = 0) {
  if (argumentCount !== 0) return GENERIC_FAILURE;

  const resolver = env.MEMBER_STATUS_RESOLVER;
  const resolverSecret = String(env.MEMBER_STATUS_RESOLVER_SECRET || "");
  if (!resolver?.fetch || resolverSecret.length < 32) return GENERIC_FAILURE;

  try {
    const response = await resolver.fetch(new Request(`https://mmd-auth-worker.internal${DIAGNOSTIC_PATH}`, {
      method: "POST",
      headers: { [RESOLVER_SECRET_HEADER]: resolverSecret },
    }));
    const payload = await response.json().catch(() => null);
    return response.ok && payload?.result === HEALTHY_ZERO_MATCH
      ? HEALTHY_ZERO_MATCH
      : GENERIC_FAILURE;
  } catch {
    return GENERIC_FAILURE;
  }
}
