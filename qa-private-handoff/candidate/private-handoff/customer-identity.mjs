const lineSubject = /^U[a-f0-9]{32}$/i;
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);

export function qaCustomerLinks(env) {
  if (env.QA_ENABLED !== 'true' || env.PRIVATE_HANDOFF_QA !== 'true') return [];
  const primary = env.QA_LINE_SUBJECT;
  if (!lineSubject.test(primary ?? '')) return [];
  const configured = env.PRIVATE_QA_CLIENT_BY_SUBJECT ?? {};
  if (!configured || typeof configured !== 'object' || Array.isArray(configured)) return [];
  const entries = Object.entries(configured);
  if (entries.length > 2 || entries.some(([subject,id]) => !lineSubject.test(subject) || !validId(id))) return [];
  const primaryId = Object.hasOwn(configured,primary) ? configured[primary] : env.PRIVATE_QA_VERIFIED_FIXTURE_CLIENT;
  if (!validId(primaryId)) return [];
  const links = [[primary,primaryId], ...entries.filter(([subject]) => subject !== primary)];
  if (links.length > 2 || new Set(links.map(([,id]) => id)).size !== links.length) return [];
  return links;
}

// The verifier must return the subject obtained from LINE's server response.
export async function verifyQaCustomerIdentity(token,channel,env,verify) {
  if (typeof token !== 'string' || !token) return {allowed:false,reason:'token_missing',tokenVerified:false,subjectMatched:false};
  const verified = await verify(token,channel);
  const subject = typeof verified === 'string' ? verified : verified?.subject;
  if (!lineSubject.test(subject ?? '')) {
    return {allowed:false,reason:verified?.reason || 'token_verify_rejected',tokenVerified:false,subjectMatched:false};
  }
  const permitted = subject === env.QA_LINE_SUBJECT || qaCustomerLinks(env).some(([candidate]) => candidate === subject);
  if (!permitted) return {allowed:false,reason:'identity_mismatch',tokenVerified:true,subjectMatched:false,subject};
  return {allowed:true,reason:'identity_verified',tokenVerified:true,subjectMatched:true,subject};
}

export async function subjectDigest(subject) {
  const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(subject));
  return Array.from(new Uint8Array(bytes),byte => byte.toString(16).padStart(2,'0')).join('');
}

export async function linkedCustomerId(env,session) {
  for (const [subject,id] of qaCustomerLinks(env)) {
    if (session?.id === id && session.subjectDigest === await subjectDigest(subject)) return id;
  }
  return null;
}


// A reference identifies a private, short-lived registration record only.
export async function registerVerifiedQaCustomer(env,identity) {
  if (env.PRIVATE_QA_CUSTOMER_REGISTRATION_ENABLED !== 'true' ||
      env.QA_ENABLED !== 'true' || env.PRIVATE_HANDOFF_QA !== 'true' ||
      identity.allowed || !identity.tokenVerified || identity.reason !== 'identity_mismatch' ||
      !lineSubject.test(identity.subject ?? '')) return null;
  const reference = (await subjectDigest(identity.subject)).slice(0,32);
  await env.QA_STORAGE.put('private-qa/v1/customer-registration/'+reference,JSON.stringify({
    reference,subject:identity.subject,expiresAt:Date.now()+10*60*1000,
  }));
  return reference;
}
