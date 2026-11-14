import { scope } from './context.mjs';
import { setup, actor } from '../.build/admin-worker/owner-job-edit-captain-fixture.mjs';
import { CAPTAIN } from '../.build/admin-worker/src/owner-job-edit-captain.js';
import { handleOwnerJobEdit, S, J } from '../.build/admin-worker/src/owner-job-edit.js';
import { createCredentialBoundAdminSession } from '../.build/admin-worker/src/credential-bound-admin-session.js';

export const captainRoutes = new Map([
  ['/internal/admin/jobs/edit', ['GET']],
  ['/v1/admin/jobs/edit', ['GET', 'POST']],
  ['/qa/captain/mode', ['POST']],
  ['/qa/captain/evidence', ['GET']],
]);
export const captainSource = '9abc9915b1d5e9a348bf24d5fa9a7abca8a56f90';

export async function handleCaptainFixture(request, storage) {
  const url = new URL(request.url);
  const saved = await storage.get('captain');
  const fixture = setup({ installGlobalFetch: false });
  for (const key of ['job', 'session', 'writes', 'payCalls']) {
    if (saved) fixture[key] = saved[key];
  }
  for (const [key, value] of saved?.journal || []) fixture.memory.set(key, value);
  let mode = saved?.mode || 'valid';
  if (url.pathname === '/qa/captain/mode') {
    const input = await request.json();
    if (!['valid', 'changed', 'unavailable', 'existing-link', 'lose-reply', 'reset'].includes(input.mode)) {
      return Response.json({ error: 'invalid_mode' }, { status: 400 });
    }
    if (input.mode === 'reset') {
      await storage.delete('captain');
      return Response.json({ fixture: true, mode: 'valid' });
    }
    mode = input.mode;
    await persist();
    return Response.json({ fixture: true, mode });
  }

  if (url.pathname === '/qa/captain/evidence') {
    return Response.json({ fixture: true, mode, session_id: CAPTAIN.session,
      jobs_model: fixture.job.fields[J.name], sessions_model: fixture.session.fields[S.name],
      received: fixture.payments[0].fields.fldvCSwrUW8OMAooS,
      remaining: fixture.session.fields[S.due] ?? null,
      writes: fixture.writes, receipt_count: fixture.payments.length,
      payment_issue_attempts: fixture.payCalls.filter(path => path !== '/v1/internal/payments/balance').length,
      audit_count: [...fixture.memory.keys()].filter(key => key.startsWith('audit:')).length,
    });
  }

  fixture.relations = mode !== 'changed';
  fixture.sourceUnavailable = mode === 'unavailable';
  if (mode === 'existing-link') fixture.session.fields[S.customerLink] = 'https://fixture.invalid/old';
  else delete fixture.session.fields[S.customerLink];
  fixture.env.JOB_EDIT_COORDINATOR = { getByName(id) {
    if (id !== CAPTAIN.session) throw new Error('fixture_session_required');
    return fixture.journal;
  }};
  let body;
  if (request.method === 'POST') {
    const raw = await request.text();
    if (raw.length > 12000) return new Response(null, { status: 413 });
    try { body = JSON.parse(raw); } catch { return new Response(null, { status: 400 }); }
    if (body?.session_id !== CAPTAIN.session || body.amendment !== 'captain-zero') {
      return new Response(null, { status: 403 });
    }
  } else {
    const session = url.searchParams.get('session_id');
    if (url.pathname === '/v1/admin/jobs/edit' && session !== CAPTAIN.session &&
        !(url.searchParams.get('preview') === 'captain-receipt' && session === null)) {
      return new Response(null, { status: 403 });
    }
    if (url.pathname === '/internal/admin/jobs/edit' && session && session !== CAPTAIN.session) {
      return new Response(null, { status: 403 });
    }
  }
  const origin = 'https://mmdbkk.com';
  const token = await createCredentialBoundAdminSession(new Request(origin), actor, fixture.env);
  const forwarded = new Request(origin + url.pathname + url.search, {
    method: request.method,
    headers: { Cookie: 'mmd_admin_gate_v1=' + token, Origin: origin },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const response = await scope.run({ fetch: fixture.http }, () => handleOwnerJobEdit(forwarded, fixture.env));
  const loseReply = mode === 'lose-reply' && request.method === 'POST' && response.ok;
  if (loseReply) mode = 'valid';
  await persist();
  return loseReply ? Response.json({ error: 'fixture_reply_lost' }, { status: 503 }) : response;

  function persist() {
    return storage.put('captain', {
      mode, job: fixture.job, session: fixture.session, writes: fixture.writes,
      payCalls: fixture.payCalls, journal: [...fixture.memory],
    });
  }
}
