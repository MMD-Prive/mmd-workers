const DESTINATION = '/pay/membership?package=red_card';
const ANCHOR = 'profileReady = true;';

export function isRedCardLiffReturn(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (!['/member/liff', '/member/liff/'].includes(url.pathname)) return false;
  const direct = url.searchParams;
  const states = [...direct.getAll('liff.state'), ...direct.getAll('liff_state')];
  if (states.length > 1) return false;
  const raw = states[0] || '';
  const nested = new URLSearchParams(raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : raw);
  const read = key => {
    const a = direct.getAll(key), b = nested.getAll(key);
    if (a.length > 1 || b.length > 1 || (a.length && b.length && a[0] !== b[0])) return null;
    return a[0] ?? b[0] ?? '';
  };
  // Exact navigation hint only, never entitlement or payment authority.
  return read('intent') === 'status' && read('return_to') === DESTINATION &&
    ['campaign', 'view', 'album', 'liff_intent'].every(key => read(key) === '');
}

export async function applyRedCardLiffReturn(request, response) {
  if (!isRedCardLiffReturn(request) || response.status !== 200 ||
      !response.headers.get('content-type')?.includes('text/html')) return response;
  const html = await response.clone().text();
  if (html.split(ANCHOR).length !== 2 || !html.includes('currentMemberRef = /^[a-f0-9]{64}$/')) return response;
  // renderProfile runs only after the authenticated profile GET succeeds.
  // Even then, require its verified member-binding marker before re-entry.
  const injected = `${ANCHOR}\n    if (/^[a-f0-9]{64}$/.test(currentMemberRef)) { window.location.replace(${JSON.stringify(DESTINATION)}); return; }`;
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('etag');
  headers.set('cache-control', 'no-store, private');
  return new Response(html.replace(ANCHOR, injected), { status: response.status, headers });
}
