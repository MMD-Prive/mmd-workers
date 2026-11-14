import staging from '../.build/staging.mjs';
import { readCredentialBoundAdminActor } from '../.build/admin-worker/src/credential-bound-admin-session.js';
export { CreateJobFixtureRun } from './runtime.mjs';
const origin = 'https://mmd-admin-console-3143-staging.malemodel-bkk.workers.dev';
const fixtureRoutes = new Map([
  ['/v1/admin/models/sources', 'GET'],
  ['/internal/admin/jobs/create-job/preflight', 'POST'],
  ['/v1/admin/job/create', 'POST'],
  ['/qa/create-job/mode', 'POST'],
  ['/qa/create-job/evidence', 'GET'],
]);
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!fixtureRoutes.has(url.pathname)) {
      const response = await staging.fetch(request, env, ctx);
      if (url.pathname === '/internal/admin/console' && response.status === 200 &&
          (await readCredentialBoundAdminActor(request, env))?.role === 'owner' &&
          !request.headers.get('Cookie')?.includes('mmd_fixture_run=')) {
        const headers = new Headers(response.headers);
        headers.append('Set-Cookie', 'mmd_fixture_run=' + crypto.randomUUID() + '; Path=/; HttpOnly; Secure; SameSite=Strict');
        return new Response(response.body, { status: response.status, headers });
      }
      return response;
    }
    if (url.origin !== origin) return new Response(null, { status: 421 });
    const actor = await readCredentialBoundAdminActor(request, env);
    if (actor?.role !== 'owner') return new Response(null, { status: 403 });
    if (request.method !== fixtureRoutes.get(url.pathname)) return new Response(null, { status: 405 });
    if (request.method !== 'GET' && request.headers.get('Origin') !== origin) return new Response(null, { status: 403 });
    const run = /(?:^|;\s*)mmd_fixture_run=([a-f0-9-]{36})(?:;|$)/.exec(request.headers.get('Cookie') || '')?.[1];
    if (!run) return Response.json({ error: 'fixture_run_required' }, { status: 409 });
    const id = env.CREATE_JOB_FIXTURE_RUNS.idFromName(run);
    let response;
    try { response = await env.CREATE_JOB_FIXTURE_RUNS.get(id).fetch(request); }
    catch { return Response.json({ error: 'fixture_unavailable' }, { status: 503 }); }
    if (response.headers.get('Content-Type')?.includes('application/json')) {
      const data = await response.json();
      const sanitize = value => {
        if (typeof value === 'string' && /^https?:\/\//.test(value)) return origin + '/qa/create-job/evidence';
        if (Array.isArray(value)) return value.map(sanitize);
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, sanitize(child)]));
        return value;
      };
      response = Response.json({ ...sanitize(data), fixture: true }, { status: response.status });
    }
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store');
    headers.set('X-MMD-Staging-Source', '022cdf2bd5d05bab6382ab7c8f57ad07e05effd6');
    return new Response(response.body, { status: response.status, headers });
  },
};
