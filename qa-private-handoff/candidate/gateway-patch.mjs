export function patchGateway(source) {
  const replacements = [
    ['import {verifyLineToken,checkIdentity,identityEvent} from "./identity-verification.mjs";',
     'import {verifyLineToken,identityEvent} from "./identity-verification.mjs";\nimport {verifyQaCustomerIdentity} from "./private-handoff/customer-identity.mjs";'],
    ['await checkIdentity(token,channel,subject,verify)', 'await verifyQaCustomerIdentity(token,channel,env,verify)'],
    ['await linkVerifiedQaSession(env,id,expiresAt)', 'await linkVerifiedQaSession(env,id,expiresAt,identity.subject)'],
  ];
  for (const [before,after] of replacements) {
    if (source.split(before).length !== 2) throw Error('Gateway patch requires the captured QA revision');
    source = source.replace(before,after);
  }
  return source;
}
