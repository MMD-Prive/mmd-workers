import { MODEL_DOCS_VERIFICATION_HTML } from './model-docs-verification-page.js';

// Reconcile the e06c6dd5 outer wrapper into the canonical source entrypoint.
// This page consumes the existing Model identity API; it grants no document access.
export function modelDocsVerificationResponse(request) {
  const url = new URL(request.url);
  if (!['mmdbkk.com', 'www.mmdbkk.com'].includes(url.hostname)
    || url.pathname !== '/sigil/model/dashboard'
    || url.searchParams.get('flow') !== 'docs_verify') return null;

  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response('Method not allowed', {
      status: 405, headers: { allow: 'GET, HEAD', 'cache-control': 'no-store' },
    });
  }
  if (url.hostname !== 'mmdbkk.com') {
    url.hostname = 'mmdbkk.com';
    return new Response(null, {
      status: 302,
      headers: { location: url.href, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
    });
  }

  const nonce = crypto.randomUUID().replace(/-/g, '');
  const html = MODEL_DOCS_VERIFICATION_HTML.replaceAll('__NONCE__', nonce);
  return new Response(request.method === 'HEAD' ? null : html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, private',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY',
      'x-content-type-options': 'nosniff',
      'x-robots-tag': 'noindex, nofollow',
      'x-mmd-docs-verification': 'v1',
      'content-security-policy': "default-src 'none'; script-src 'nonce-" + nonce
        + "' https://static.line-scdn.net; style-src 'unsafe-inline'; font-src data:;"
        + " connect-src 'self' https://api.line.me https://liff.line.me https://access.line.me;"
        + " img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; object-src 'none'; form-action 'self'",
    },
  });
}
