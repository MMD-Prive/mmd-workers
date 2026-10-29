import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleLiffMemberShell } from '../src/liff-member-shell.js';
import { renderCustomerBrand, resolveVerifiedCustomerBrand, V6_BRAND_ASSETS } from '../src/liff-customer-brand-v6.js';
import { MY_MMD_SIGIL_PRIVATE_CSS } from '../src/liff-sigil-private-theme.js';

test('SĪGIL artwork remains scoped to the verified private audience', async () => {
  assert.equal(resolveVerifiedCustomerBrand({ brand_audience: 'sigil' }, 'canonical_member_account_v1'), 'private');
  assert.equal(resolveVerifiedCustomerBrand({ brand_audience: 'sigil' }, ''), 'unresolved');
  assert.equal(resolveVerifiedCustomerBrand({ tier: 'svip' }, 'canonical_member_account_v1'), 'unresolved');

  const response = handleLiffMemberShell(new Request('https://mmdbkk.com/member/liff?intent=status&audience=private'), {});
  const html = await response.text();
  assert.match(html, /data-brand-audience="unresolved"/);
  assert.match(html, /data-brand-panel="private" hidden/);
  assert.match(html, /customerBrand\.render\(resolveVerifiedCustomerBrand\(data, brandAuthority\)\)/);
  assert.match(html, /body\[data-brand-audience="private"\]\.app-entered:not\(\.signup-mode\)/);
  assert.doesNotMatch(MY_MMD_SIGIL_PRIVATE_CSS, /world-private|\btier\b|localStorage|sessionStorage/);
  assert.ok(renderCustomerBrand().includes(V6_BRAND_ASSETS.private));
  assert.match(response.headers.get('content-security-policy'), /img-src 'self' data:/);
  assert.match(response.headers.get('cache-control'), /\bno-store\b/);
});

test('approved artwork stays lightweight in the LIFF shell', () => {
  const logo = Buffer.from(V6_BRAND_ASSETS.private.split(',')[1], 'base64');
  const wallUrl = MY_MMD_SIGIL_PRIVATE_CSS.match(/url\("(data:image\/webp;base64,[^"]+)"\)/)?.[1];
  assert.ok(wallUrl, 'wall texture is embedded locally');
  const wall = Buffer.from(wallUrl.split(',')[1], 'base64');
  for (const image of [logo, wall]) {
    assert.equal(image.toString('ascii', 0, 4), 'RIFF');
    assert.equal(image.toString('ascii', 8, 12), 'WEBP');
  }
  assert.ok(logo.length + wall.length < 50_000, 'combined artwork remains under 50 KB');
});
