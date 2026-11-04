import test from 'node:test';
import assert from 'node:assert/strict';
import {enhanceRenewalShell,applyMyMmdRenewalPageResponse} from '../src/liff-renewal-page-response.js';

const shell = padding => `<html><head><title>MMD Privé</title>${' '.repeat(padding)}</head><body>
<div id="renewal-card"></div><div class="card"><h2 data-copy="packageTitle">Package</h2></div>
<script>
  function showView(view, smooth = true) {}
  async function loadRenewalCard() {}
  function legacyCustomerView(data) {}
  function render(data) {
    const screen = data && typeof data.screen === "object" ? data.screen : {};
  }
  if (profile || (preflightVerifiedSession && document.body.dataset.welcomeAudience === "existing")) {}
</script></body></html>`;

test('current-size shell above 1 MiB receives Renewal UI and lookup handler', async () => {
  const input=shell(1400000);
  const response=await applyMyMmdRenewalPageResponse(new Request('https://mmdbkk.com/member/liff?intent=renew&view=package'),new Response(input,{headers:{'content-type':'text/html','set-cookie':'fixture=1; Secure'}}));
  const html=await response.text();
  assert.notEqual(response.headers.get('x-mmd-renewal-ui'),'shell-contract-mismatch');
  assert.match(html,/data-renewal-version=/);
  assert.match(html,/atelierRenewalUI\(\)\.lookup\(\)/);
  assert.equal(response.headers.get('set-cookie'),'fixture=1; Secure');
});
test('oversized, duplicate-anchor and already-enhanced pages remain rejected',()=>{
  assert.equal(enhanceRenewalShell(shell(4*1024*1024)),null);
  const input=shell(1400000);
  assert.equal(enhanceRenewalShell(input.replace('</head>','</head></head>')),null);
  assert.equal(enhanceRenewalShell(enhanceRenewalShell(input)),null);
});
test('non-renewal page remains unchanged',async()=>{
  const response=new Response(shell(1400000),{headers:{'content-type':'text/html'}});
  assert.equal(await applyMyMmdRenewalPageResponse(new Request('https://mmdbkk.com/member/liff?intent=status'),response),response);
});
