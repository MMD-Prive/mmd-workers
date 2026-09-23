import { searchAirtable, getMemberContext as getCanonicalMemberContext } from "../connectors/airtable.js";

export async function unifiedSearch({ query, scope, env }) {
  return searchAirtable(query, scope, env);
}

export async function buildMemberContext(memberId, env) {
  return getCanonicalMemberContext(memberId, env);
}
