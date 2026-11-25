// Mount this adapter ahead of the existing Console QA fetch handler.
const prefix = '/sigil/model/console/partner-replacement/';
const qaHost = 'my-model-developing-console-qa.malemodel-bkk.workers.dev';
const routes = new Map([
  ['', ['GET', '/']],
  ['participant-ui.js', ['GET', '/participant-ui.js']],
  ['staging/job', ['GET', '/staging/job']],
  ['staging/action', ['POST', '/staging/action']],
]);

const fail = (status, code) => Response.json({ ok: false, code }, {
  status, headers: { 'Cache-Control': 'no-store' },
});

export function withPartnerReplacement(consoleQa, forward = fetch) {
  return {
    async fetch(request, env, context) {
      const url = new URL(request.url);
      if (!url.pathname.startsWith(prefix)) return consoleQa.fetch(request, env, context);
      if (url.protocol !== 'https:' || url.host !== qaHost || env.CONSOLE_QA_REPLACEMENT_ENABLED !== 'true')
        return fail(404, 'not_found');
      const route = routes.get(url.pathname.slice(prefix.length));
      if (!route) return fail(404, 'not_found');
      const [method, target] = route;
      if (request.method !== method) return fail(405, 'method_not_allowed');
      if (url.search && target !== '/') return fail(404, 'not_found');

      const host = env.CONSOLE_QA_REPLACEMENT_HOST;
      if (typeof host !== 'string' || !/^partner-replacement-staging(?:-[a-z0-9]+)?\.onrender\.com$/.test(host))
        return fail(503, 'staging_unavailable');
      const upstream = 'https://' + host;
      const headers = new Headers();
      const authorization = request.headers.get('authorization');
      if (authorization && target.startsWith('/staging/')) headers.set('authorization', authorization);
      if (method === 'POST') {
        if (request.headers.get('origin') !== url.origin || request.headers.get('content-type') !== 'application/json')
          return fail(403, 'staging_origin_required');
        headers.set('origin', upstream);
        headers.set('content-type', 'application/json');
      }
      try {
        const response = await forward(new Request(upstream + target, {
          method, headers, body: method === 'POST' ? request.body : undefined,
          duplex: 'half',
          redirect: 'error', signal: AbortSignal.timeout(10000),
        }));
        if (response.status >= 300 && response.status < 400) return fail(503, 'staging_unavailable');
        const responseHeaders = new Headers(response.headers);
        responseHeaders.set('Cache-Control', 'no-store');
        responseHeaders.delete('Set-Cookie');
        return new Response(response.body, { status: response.status, headers: responseHeaders });
      } catch { return fail(503, 'staging_unavailable'); }
    },
  };
}
