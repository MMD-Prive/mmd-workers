import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isMyMmdRenewalEntry, enhanceRenewalShell, applyMyMmdRenewalPageResponse } from '../src/liff-renewal-page-response.js';
import { createRenewalView, renewalViewHtml } from '../src/liff-renewal-view.js';

// Synthetic fixture for the unchanged shell's exact, inspected splice boundaries.
// Full real-shell assertions are in liff-renewal-runtime-contract.test.mjs.
export const fixture = () => `<!doctype html><html><head><title>MMD Privé</title></head><body><main>
<div id="renewal-card" class="card" hidden>old card</div>
<div class="card"><h2 data-copy="packageTitle">Package</h2></div>
<script nonce="fixture-nonce">
const CONFIG={intent:"renew"}; let busy=false;
  function showView(view, smooth = true) { return view; }
async function bootFixture(){const profile=null,preflightVerifiedSession=false;
if (profile || (preflightVerifiedSession && document.body.dataset.welcomeAudience === "existing")) { await enterApp(); }}
  async function loadRenewalCard() { /* old */ }
  function renderRenewalCard() { /* old */ }
  async function purchaseRenewal() { /* old */ }
  function legacyCustomerView(data) { return data; }
</script></main></body></html>`;

test('direct and nested LINE state entries select Renewal; normal Home/signup/promo remain untouched', () => {
  for (const suffix of ['?intent=renew&view=package', '?liff_intent=renew', '?liff.state=%2F%3Fintent%3Drenew%26view%3Dpackage', '?liff_state=intent%3Drenew'])
    assert.equal(isMyMmdRenewalEntry(new Request('https://mmdbkk.com/member/liff' + suffix)), true);
  for (const suffix of ['', '?intent=status', '?intent=signup&liff.state=%2F%3Fintent%3Drenew', '?view=package'])
    assert.equal(isMyMmdRenewalEntry(new Request('https://mmdbkk.com/member/liff' + suffix)), false);
  assert.equal(isMyMmdRenewalEntry(new Request('https://mmdbkk.com/sigil/pay/renewal?intent=renew')), false);
});
test('only renewal markup/client is replaced, original CSP script nonce and unrelated sections survive', () => {
  const output = enhanceRenewalShell(fixture());
  assert.match(output, /my-mmd-renewal-atelier-v1/); assert.match(output, /name="renewal-package" value="premium"/);
  assert.match(output, /name="renewal-package" value="standard"/); assert.match(output, /data-copy="packageTitle"/);
  assert.match(output, /script nonce="fixture-nonce"/); assert.match(output, /fetcher: memberApiFetch/);
  assert.doesNotMatch(output, /old card/); assert.match(output, /CONFIG.intent === "renew" \|\| profile/);
  assert.equal((output.match(/id="renewal-card"/g) || []).length, 1);
  new Function(output.match(/<script nonce="fixture-nonce">([\s\S]*?)<\/script>/)[1]);
});
test('unknown shell contract and duplicate enhancement are not partially spliced', () => {
  assert.equal(enhanceRenewalShell(fixture().replace('function loadRenewalCard()', 'function movedCard()')), null);
  assert.equal(enhanceRenewalShell(enhanceRenewalShell(fixture())), null);
});
test('response decorator preserves headers, session cookies and non-renewal response identity', async () => {
  const headers = { 'content-type': 'text/html', 'content-security-policy': "script-src 'nonce-fixture-nonce'", 'set-cookie': 'example=value; Secure', etag: 'old' };
  const original = new Response(fixture(), { headers });
  assert.equal(await applyMyMmdRenewalPageResponse(new Request('https://mmdbkk.com/member/liff?intent=status'), original), original);
  const result = await applyMyMmdRenewalPageResponse(new Request('https://mmdbkk.com/member/liff?intent=renew'), original);
  assert.equal(result.headers.get('content-security-policy'), headers['content-security-policy']);
  assert.equal(result.headers.get('set-cookie'), headers['set-cookie']); assert.equal(result.headers.get('etag'), null);
  assert.equal(result.headers.get('cache-control'), 'no-store'); assert.match(await result.text(), /ต่ออายุสมาชิก \| MY MMD/);
});
test('HEAD, errors and API JSON are never rendered as the renewal page', async () => {
  for (const [request, response] of [
    [new Request('https://mmdbkk.com/member/liff?intent=renew', {method:'HEAD'}), new Response(null)],
    [new Request('https://mmdbkk.com/member/liff?intent=renew'), new Response('error', {status:500})],
    [new Request('https://mmdbkk.com/member/liff?intent=renew'), Response.json({ok:true})],
  ]) assert.equal(await applyMyMmdRenewalPageResponse(request, response), response);
});
test('view uses textContent, server prices and signed checkout, never identity/query prices or payment widgets', () => {
  const source = createRenewalView.toString(); new Function('return (' + source + ')');
  assert.doesNotMatch(source, /\.innerHTML|localStorage|sessionStorage/);
  assert.match(source, /pricing_policy === policy/); assert.match(source, /JSON.stringify\(\{ package_code: selected \}\)/);
  assert.doesNotMatch(renewalViewHtml(), /promptpay\.io|<iframe|฿799|฿1,999/);
});
test('production runtime connects guard and decorator on original and bootstrap retry', () => {
  const source = readFileSync(new URL('../src/runtime-index.js', import.meta.url), 'utf8');
  assert.match(source, /withLiffRenewalEligibility\(request, env/);
  assert.match(source, /readSpend: readMyMmdVerifiedPointsContext/);
  assert.equal((source.match(/await fetchBaseWithRenewal\(/g)||[]).length, 2);
  assert.match(source, /return applyMyMmdRenewalPageResponse\(request, response\)/);
});
