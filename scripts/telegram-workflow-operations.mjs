import { pathToFileURL } from 'node:url';

const workerOrigin = 'https://telegram-worker.malemodel-bkk.workers.dev';
const canonicalWebhook = 'https://mmdbkk.com/telegram/webhook';
const menuTarget = 'https://mmdbkk.com/member/login?source=telegram&entry=hype';
export const telegramRoutePatterns = [
  '/telegram/webhook', '/v1/webhook', '/telegram/internal/send', '/v1/internal/send', '/v1/send',
].flatMap(path => [`mmdbkk.com${path}`, `www.mmdbkk.com${path}`]);

function requireValue(env, key) {
  const value = String(env[key] || '').trim();
  if (!value) throw new Error(`missing_${key}`);
  return value;
}

// A failed or ambiguous write is never retried. Read back before a new approval.
async function requestJson(request, url, token, body) {
  let response;
  try {
    response = await request(url, {
      method: body === undefined ? 'GET' : 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new Error('operation_transport_failed_readback_required');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || (data.ok !== true && data.success !== true)) {
    throw new Error('operation_response_failed_readback_required');
  }
  return data;
}

async function syncRoutes(env, request) {
  const token = requireValue(env, 'CLOUDFLARE_ROUTES_API_TOKEN');
  const zone = requireValue(env, 'CLOUDFLARE_ZONE_ID');
  if (!/^[a-f0-9]{32}$/.test(zone)) throw new Error('invalid_zone');
  let approved;
  try { approved = JSON.parse(env.APPROVED_MISSING_PATTERNS); } catch { throw new Error('invalid_route_approval'); }
  if (!Array.isArray(approved) || approved.some(pattern => !telegramRoutePatterns.includes(pattern))
    || new Set(approved).size !== approved.length) throw new Error('invalid_route_approval');
  const url = `https://api.cloudflare.com/client/v4/zones/${zone}/workers/routes`;
  const readRoutes = async () => {
    const data = await requestJson(request, url, token);
    if (data.success !== true || !Array.isArray(data.result) || data.result_info?.total_pages > 1
      || data.result_info?.total_count > data.result.length
      || data.result.some(route => !route || typeof route.pattern !== 'string')) throw new Error('routes_readback_incomplete');
    return data.result;
  };
  const existing = await readRoutes();
  if (existing.some(route => telegramRoutePatterns.includes(route.pattern) && route.script !== 'telegram-worker')) {
    throw new Error('route_owner_conflict');
  }
  const missing = telegramRoutePatterns.filter(pattern => !existing.some(route => route.pattern === pattern));
  if (JSON.stringify([...approved].sort()) !== JSON.stringify([...missing].sort())) throw new Error('route_diff_not_approved');
  for (const pattern of missing) {
    const data = await requestJson(request, url, token, { pattern, script: 'telegram-worker' });
    if (data.success !== true || data.result?.pattern !== pattern || data.result?.script !== 'telegram-worker') {
      throw new Error('route_write_readback_required');
    }
  }
  const observed = missing.length ? await readRoutes() : existing;
  if (telegramRoutePatterns.some(pattern => !observed.some(route => route.pattern === pattern && route.script === 'telegram-worker'))
    || observed.some(route => telegramRoutePatterns.includes(route.pattern) && route.script !== 'telegram-worker')) {
    throw new Error('route_verification_failed');
  }
  return { created: missing.length, verified: telegramRoutePatterns.length };
}

export async function runTelegramOperation(operation, env, request = fetch) {
  if (operation === 'sync-routes') return syncRoutes(env, request);
  if (operation === 'webhook') {
    const token = requireValue(env, 'CLOUDFLARE_API_TOKEN');
    const result = await requestJson(request, `${workerOrigin}/telegram/internal/webhook/ensure-canonical`, token,
      { confirm: 'ENSURE_CANONICAL_TELEGRAM_WEBHOOK_V1' });
    if (result.ok !== true || result.canonical_url !== canonicalWebhook || result.observed_url !== canonicalWebhook
      || result.secret_token_enforced !== true) throw new Error('webhook_verification_failed');
    const status = await requestJson(request, `${workerOrigin}/telegram/webhook/status`);
    if (status.ok !== true || status.canonical !== true || status.canonical_url !== canonicalWebhook
      || status.observed_url !== canonicalWebhook || status.webhook_secret_configured !== true) throw new Error('webhook_verification_failed');
    return { verified: true };
  }
  if (operation === 'menu') {
    const token = requireValue(env, 'TELEGRAM_BOT_TOKEN');
    const root = `https://api.telegram.org/bot${token}`;
    const updated = await requestJson(request, `${root}/setChatMenuButton`, undefined,
      { menu_button: { type: 'web_app', text: 'MY MMD', web_app: { url: menuTarget } } });
    if (updated.ok !== true || updated.result !== true) throw new Error('menu_verification_failed');
    const observed = await requestJson(request, `${root}/getChatMenuButton`);
    if (observed.ok !== true || observed.result?.type !== 'web_app' || observed.result.web_app?.url !== menuTarget) {
      throw new Error('menu_verification_failed');
    }
    return { verified: true };
  }
  if (operation === 'premium-room') {
    const token = requireValue(env, 'INTERNAL_API_TOKEN');
    const result = await requestJson(request, `${workerOrigin}/telegram/internal/premium-room/sync`, token,
      { confirm: 'SYNC_HYPE_PREMIUM_ROOM_V1' });
    const premium = result.titles?.results?.find(item => item.surface === 'premium_group');
    const standard = result.titles?.results?.find(item => item.surface === 'standard_group');
    if (result.ok !== true || result.mode !== 'hype_premium_room_manager_v1' || result.titles?.ok !== true
      || premium?.desired_title !== 'MMD PRIVÉ : PREMIUM' || standard?.desired_title !== 'MMD PRIVÉ : STANDARD'
      || !['already_current', 'updated'].includes(premium?.state) || !['already_current', 'updated'].includes(standard?.state)
      || !['already_current', 'updated'].includes(result.description?.state)
      || !['already_ready', 'welcome_pinned'].includes(result.welcome?.state)) throw new Error('room_verification_failed');
    return { verified: true };
  }
  if (operation === 'topic-smoke') {
    const token = requireValue(env, 'INTERNAL_API_TOKEN');
    const result = await requestJson(request, `${workerOrigin}/telegram/internal/topics/smoke`, token,
      { confirm: 'SEND_REDACTED_TOPIC_SMOKE', disable_notification: true });
    if (result.ok !== true || result.failed !== 0 || !Number.isInteger(result.tested) || result.tested < 7) {
      throw new Error('topic_smoke_verification_failed');
    }
    return { tested: result.tested, failed: 0 };
  }
  throw new Error('operation_not_allowed');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const operation = process.argv[2];
    const result = await runTelegramOperation(operation, process.env);
    console.log(JSON.stringify({ ok: true, operation, ...result }));
  } catch {
    console.error('Telegram operation stopped; inspect readback before a separately approved attempt.');
    process.exitCode = 1;
  }
}
