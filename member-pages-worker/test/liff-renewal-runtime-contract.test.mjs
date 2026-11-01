import test from 'node:test';
import assert from 'node:assert/strict';
import { handleLiffMemberShell } from '../src/liff-member-shell.js';
import { applyMyMmdRenewalPageResponse } from '../src/liff-renewal-page-response.js';

test('real MY MMD shell contract accepts Renewal without changing its auth script nonce', async () => {
  for (const query of ['intent=renew&view=package', 'liff.state=%2F%3Fintent%3Drenew%26view%3Dpackage']) {
    const request = new Request('https://mmdbkk.com/member/liff?' + query);
    const base = handleLiffMemberShell(request, { LINE_LIFF_ID: '2010862595-yT4DCEMc' });
    const csp = base.headers.get('content-security-policy');
    const enhanced = await applyMyMmdRenewalPageResponse(request, base);
    assert.equal(enhanced.headers.get('x-mmd-renewal-ui'), 'my-mmd-renewal-atelier-v2');
    assert.equal(enhanced.headers.get('content-security-policy'), csp);
    const html = await enhanced.text();
    assert.match(html, /data-renewal-version="my-mmd-renewal-atelier-v2"/);
    assert.equal((html.match(/id="renewal-card"/g)||[]).length, 1);
    for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) if (match[1].trim()) new Function(match[1]);
  }
});
test('ordinary MY MMD Home response is returned byte-for-byte unchanged', async () => {
  const request = new Request('https://mmdbkk.com/member/liff?intent=status');
  const base = handleLiffMemberShell(request);
  assert.equal(await applyMyMmdRenewalPageResponse(request, base), base);
});
