// Staging participant API. Only the local operator preview has an aggregate view or role switcher.
const roles = ['owner', 'partner', 'modelA', 'modelB', 'customer'];
const reply = (status, data) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const denied = (status, code) => reply(status, { ok: false, code });

export function participantApi({ origin, audience, bindings, store, verifyFetch = fetch, now = Date.now, enabled = false }) {
  const expected = new URL(origin);
  if (expected.origin !== origin || expected.protocol !== 'https:' || !/^\d+$/.test(audience)
      || typeof audience !== 'string') throw Error('Invalid staging origin or LINE audience');
  if (!bindings || Object.keys(bindings).length !== roles.length ||
      roles.some(role => !Object.hasOwn(bindings, role) || typeof bindings[role] !== 'string' || !bindings[role].trim()) ||
      new Set(Object.values(bindings)).size !== roles.length) throw Error('Five distinct staging participants required');
  const actors = new Map(roles.map(role => [bindings[role], role]));
  return async function handle(request) {
    const url = new URL(request.url);
    if (url.origin !== origin) return denied(403, 'staging_origin_required');
    if (!enabled) return denied(503, 'staging_gate_closed');
    const read = request.method === 'GET' && url.pathname === '/staging/job';
    const write = request.method === 'POST' && url.pathname === '/staging/action';
    if (!(read || write) || url.search) return denied(404, 'not_found');
    if (write && (request.headers.get('origin') !== origin || request.headers.get('content-type') !== 'application/json'))
      return denied(403, 'staging_origin_required');
    const bearer = /^Bearer ([^\s,]{1,8192})$/.exec(request.headers.get('authorization') ?? '');
    if (!bearer) return denied(401, 'line_identity_required');
    try {
      const verification = await verifyFetch('https://api.line.me/oauth2/v2.1/verify', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
        body: new URLSearchParams({ id_token: bearer[1], client_id: audience }),
      });
      if ([400, 401].includes(verification.status)) return denied(401, 'line_identity_required');
      if (verification.status !== 200) return denied(503, 'verification_unavailable');
      const claims = await verification.json();
      if (!claims || claims.iss !== 'https://access.line.me' || claims.aud !== audience ||
          typeof claims.sub !== 'string' || !Number.isSafeInteger(claims.exp) || claims.exp <= now() / 1000)
        return denied(401, 'invalid_line_identity');
      const actor = actors.get(claims.sub);
      if (!actor) return denied(403, 'participant_required');
      const sid = 'sess_STAGE_PARTNER_001';
      let result;
      if (read) {
        result = await store.view(actor, sid);
        if (result.ok) {
          result.participant_role = actor;
          if (actor === 'owner') result.test_alternative = result.model === 'model_STAGE_A' ? 'model_STAGE_B' : 'model_STAGE_A';
        }
      } else {
        let input;
        try { input = await request.json(); } catch { return denied(400, 'invalid_request'); }
        if (!input || input.session_id !== sid) return denied(400, 'invalid_test_job');
        if (input.action === 'review') {
          if (Object.keys(input).some(k => !['action','session_id','revision','generation','next_model'].includes(k)))
            return denied(400, 'invalid_request');
          result = await store.approveFixtureReview(actor, sid, input.next_model, input);
        } else {
          result = await store.act(actor, input);
        }
      }
      if (result.ok) return reply(200, result);
      if (result.code === 'ownership_required') return denied(403, result.code);
      if (result.code === 'invalid_request') return denied(400, result.code);
      return denied(409, result.code);
    } catch { return denied(503, 'staging_unavailable'); }
  };
}
