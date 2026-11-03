// Recovery may suggest historical matches, but only an explicit client choice
// may advance those matches to the canonical identity/entitlement resolver.
export async function resolveOwnerRecoveryIdentity(env, input, { resolve, lookup }) {
  let identity;
  try {
    identity = await resolve(env, input);
  } catch {
    return { status: 'unavailable', reason: 'identity_resolution_unavailable' };
  }
  if (identity?.reason !== 'per_rename_not_resolved' || !input.client_query || input.canonical_client_id) return identity;
  try {
    const response = await lookup(new Request('https://admin-worker.internal/v1/admin/clients/lineage-lookup', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: input.client_query, canonical_only: true, allow_manual_fallback: false }),
    }), env, { alreadyAuthorized: true });
    const body = await response.json();
    if (!response.ok || body?.ok !== true) return { status: 'unavailable', reason: 'identity_search_unavailable' };
    // A bounded/partial scan must not turn into a confident match or not-found.
    if (body.degraded_sources?.length || body.lineage_warnings?.length) return { status: 'unavailable', reason: 'identity_search_incomplete' };
    const seen = new Set();
    const choices = (Array.isArray(body.records) ? body.records : []).filter(row => {
      if (!/^rec[A-Za-z0-9]{6,32}$/.test(row?.client_id || '') || seen.has(row.client_id)) return false;
      seen.add(row.client_id); return true;
    }).slice(0, 12).map(row => ({
      client_id: row.client_id, display_name: String(row.client_name || '').slice(0, 120),
      matched_on: String(row.matched_on || '').slice(0, 80),
      matched_value: String(row.matched_value || '').slice(0, 120),
    }));
    return choices.length ? { status: 'unresolved', reason: 'recovery_client_selection_required', choices } : identity;
  } catch {
    return { status: 'unavailable', reason: 'identity_search_unavailable' };
  }
}
