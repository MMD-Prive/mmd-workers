// Request-local evidence from the eligibility guard. Never populated from HTTP input.
export const RENEWAL_VERIFIED_SESSION = Symbol("renewal_verified_session");

export function sameRenewalIdentity(expected, current) {
  return Boolean(expected && current && !expected.readGraceOnly && !current.readGraceOnly
    && expected.memberExists === true && current.memberExists === true
    && /^U[0-9a-f]{32}$/i.test(expected.lineUserId || "")
    && expected.lineUserId === current.lineUserId
    && expected.memberId && expected.memberId === current.memberId
    && expected.memberProfile?.tier === current.memberProfile?.tier
    && expected.memberProfile?.membership_status === current.memberProfile?.membership_status
    && expected.memberProfile?.membership_expires_at === current.memberProfile?.membership_expires_at);
}
