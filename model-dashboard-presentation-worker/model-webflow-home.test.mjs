import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { shouldServeWebflowDashboard } from './src/index.js';

test('normal home and LIFF callbacks render the Webflow document on either host', async () => {
  const originalFetch = globalThis.fetch;
  const document = '<!doctype html><html data-wf-page="dashboard"><body><main>MY MODEL</main><script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script></body></html>';
  const requests = [];
  globalThis.fetch = async (request) => {
    requests.push(request);
    return new Response(document, {headers: {'content-type':'text/html', 'set-cookie':'upstream=discard'}});
  };
  try {
    for (const host of ['mmdbkk.com', 'www.mmdbkk.com']) {
      for (const suffix of ['', '/', '?liff.state=%3Fliff_env%3Dpublished&code=private-code&state=private-state']) {
        const request = new Request(`https://${host}/sigil/model/dashboard${suffix}`, {headers: {
          'user-agent':'Mozilla/5.0 Line/15.0.0',
          cookie:'mmd_model_session_v1=private-session; mmd_liff_boot=1',
          authorization:'Bearer private-authorization',
        }});
        assert.equal(shouldServeWebflowDashboard(request), true);
        const response = await worker.fetch(request);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('x-mmd-ui-source'), 'webflow-dashboard-proxy');
        assert.equal(response.headers.get('location'), null);
        assert.equal(response.headers.get('set-cookie'), null);
        assert.match(response.headers.get('cache-control'), /no-store/);
        assert.equal(await response.text(), document);
      }
    }
    for (const request of requests) {
      assert.equal(request.url, 'https://mmdprive.webflow.io/sigil/model/dashboard');
      assert.equal(request.headers.get('cookie'), null);
      assert.equal(request.headers.get('authorization'), null);
    }
    const anonymous = await worker.fetch(new Request('https://www.mmdbkk.com/sigil/model/dashboard'));
    assert.equal(anonymous.status, 200);
    assert.equal(anonymous.headers.get('location'), null);
    const head = await worker.fetch(new Request('https://www.mmdbkk.com/sigil/model/dashboard', {method:'HEAD'}));
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  } finally { globalThis.fetch = originalFetch; }
});

test('special work links and nested app routes retain their existing handlers', () => {
  for (const suffix of ['?intent=job_board&job_id=JOB-123', '?flow=apply', '?activation=signed', '?launch=pwa', '?briefs=1', '?handoff=job-confirmed&session_id=sess_mu8oo9ao_a97c529604a34602', '/jobs']) {
    assert.equal(shouldServeWebflowDashboard(new Request(`https://mmdbkk.com/sigil/model/dashboard${suffix}`)), false, suffix);
  }
});

test('home fails visibly when Webflow is unavailable and blocks writes', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('upstream unavailable'); };
  try {
    const failed = await worker.fetch(new Request('https://www.mmdbkk.com/sigil/model/dashboard'));
    assert.equal(failed.status, 502);
    assert.match(await failed.text(), /temporarily unavailable/);
    const write = await worker.fetch(new Request('https://www.mmdbkk.com/sigil/model/dashboard', {method:'POST'}));
    assert.equal(write.status, 405);
    assert.equal(write.headers.get('allow'), 'GET, HEAD');
  } finally { globalThis.fetch = originalFetch; }
});
