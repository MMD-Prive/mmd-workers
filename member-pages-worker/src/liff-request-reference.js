// Diagnostic references are never identity or authorization evidence.
const SERVER_REFERENCE = Symbol('liff-server-diagnostic-reference');

// Read only bounded JSON from a clone; never log raw bodies or unknown codes.
async function allowed401Reason(response) {
  if (response.status !== 401 || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) return '';
  let reader, timer;
  try {
    reader = response.clone().body?.getReader();
    if (!reader) return '';
    const read = async () => {
      const chunks = []; let size = 0;
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) return '';
        chunks.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      const code = JSON.parse(new TextDecoder().decode(bytes))?.error?.code;
      return code === 'LIFF_SESSION_REQUIRED' || code === 'LIFF_SESSION_INVALID' ? code : '';
    };
    return await Promise.race([read(), new Promise(resolve => { timer = setTimeout(() => resolve(''), 100); })]);
  } catch { return ''; }
  finally {
    clearTimeout(timer);
    // Tee cancellation can wait for the original body; never await it.
    try { reader?.cancel().catch(() => {}); } catch {}
  }
}

export async function withReferenceWorker(request, env, ctx, run) {
  const path = new URL(request.url).pathname;
  const operation = path === '/member/api/liff/start' && request.method === 'POST' ? 'start'
    : path === '/member/api/liff/profile' && request.method === 'GET' ? 'profile' : '';
  if (!operation) return run(env);
  return withRequestReference(request, env, ctx, operation, ref => run({...env, [SERVER_REFERENCE]:ref}));
}

export function createReferenceFetch(send, uuid = () => crypto.randomUUID()) {
  const valid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  let flow = '';
  try { flow = uuid(); } catch {} // Diagnostics cannot prevent a business request.
  let lastProfile = '', sequence = 0;
  return async (url, init = {}) => {
    const operation = url === '/member/api/liff/start' ? 'start' : url === '/member/api/liff/profile' ? 'profile' : '';
    if (!operation) return send(url, init);
    const {diagnosticRetry, ...options} = init;
    if (!valid(flow) || sequence >= 80) return send(url, options);
    if (operation === 'start') lastProfile = '';
    const headers = new Headers(init.headers);
    headers.set('x-mmd-diag-flow', flow);
    headers.delete('x-mmd-diag-retry-of');
    if (init.diagnosticRetry === true && operation === 'profile' && lastProfile) headers.set('x-mmd-diag-retry-of', lastProfile);
    const ordinal = ++sequence;
    const response = await send(url, {...options, headers});
    const ref = response.headers.get('x-mmd-diag-request');
    // A late result must not replace the reference of a newer request.
    if (operation === 'profile' && ordinal === sequence) lastProfile = valid(ref) ? ref : '';
    return response;
  };
}

export async function withRequestReference(request, env, ctx, operation, run) {
  if (!['start', 'profile'].includes(operation)) return run();
  // The outer wrapper owns the final response; inner handlers reuse its server ref.
  // Never accept a server reference from a request header or cookie.
  if (env?.[SERVER_REFERENCE]) return run(env[SERVER_REFERENCE]);
  const valid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  const flow = request.headers.get('x-mmd-diag-flow');
  const retry = request.headers.get('x-mmd-diag-retry-of');
  const ref = crypto.randomUUID(), started = Date.now();
  const record = (outcome, status, reason = '') => {
    const row = {event:'liff_request_reference', request_ref:ref, operation, outcome,
      observed_at:Date.now(), duration_ms:Math.min(300000, Math.max(0, Date.now()-started)),
      ...(valid(flow) ? {client_flow_ref:flow, correlation_authority:'untrusted_client_reference'} : {}),
      ...(operation === 'profile' && valid(flow) && valid(retry) ? {client_retry_of:retry} : {}),
      ...(Number.isInteger(status) ? {status} : {}),
      ...(reason ? {reason_code:reason} : {})};
    try { console.info(row); } catch {}
    if (typeof ctx?.waitUntil === 'function' && typeof env?.LIFF_IDENTITY_KV?.put === 'function') {
      try { ctx.waitUntil(Promise.resolve().then(() => env.LIFF_IDENTITY_KV.put(
        `liff_request_reference:${started}:${ref}:${outcome}`, JSON.stringify(row), {expirationTtl:172800},
      )).catch(() => {})); } catch {}
    }
  };
  record('begin');
  try {
    const response = await run(ref);
    record('complete', response.status, await allowed401Reason(response));
    const result = new Response(response.body, response);
    result.headers.set('x-mmd-diag-request', ref);
    return result;
  } catch (error) { record('threw'); throw error; }
}
