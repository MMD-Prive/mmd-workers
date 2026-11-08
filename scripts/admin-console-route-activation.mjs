// Only the approved Console routes may be created. Importing performs no I/O.
import { createHash } from 'node:crypto';
import { ROOT, ZONE } from './admin-current-session-code-only.mjs';

export const CONSOLE_ROUTES_PATH = `/zones/${ZONE}/workers/routes`;
export const CONSOLE_ROUTE_PATTERNS = Object.freeze([
  'mmdbkk.com/internal/admin/console*',
  'www.mmdbkk.com/internal/admin/console*',
]);
const SCRIPT = 'admin-worker';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const ROUTE_ID = /^[a-f0-9]{32}$/i;
const failureCodes = new WeakMap();
function failure(code) {
  const error = new Error(`Console route activation stopped (${code}); do not retry or roll back automatically.`);
  failureCodes.set(error, code);
  error.code = code;
  return error;
}
function requireValue(condition, code) { if (!condition) throw failure(code); }
const record = value => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));

// Compare every JSON field, including unrelated/no-script routes, without
// allowing response order or object-key order to create a false drift signal.
function canonical(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  requireValue((Array.isArray(value) || record(value)) && !ancestors.has(value), 'INVALID_JSON_SNAPSHOT');
  ancestors.add(value);
  let result;
  if (Array.isArray(value)) {
    requireValue(Object.keys(value).length === value.length, 'INVALID_JSON_SNAPSHOT');
    result = '[' + value.map(item => canonical(item, ancestors)).join(',') + ']';
  } else {
    requireValue(Reflect.ownKeys(value).every(key => typeof key === 'string'), 'INVALID_JSON_SNAPSHOT');
    result = '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key], ancestors)).join(',') + '}';
  }
  ancestors.delete(value);
  return result;
}
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');

function inventory(value) {
  requireValue(Array.isArray(value), 'INVALID_ROUTE_INVENTORY');
  const routes = JSON.parse(canonical(value));
  const ids = new Set(), patterns = new Set();
  for (const route of routes) {
    requireValue(record(route) && typeof route.id === 'string' && ROUTE_ID.test(route.id), 'INVALID_ROUTE_INVENTORY');
    requireValue(typeof route.pattern === 'string' && route.pattern.length > 0
      && route.pattern.length <= 4096 && route.pattern.trim() === route.pattern
      && !/[\u0000-\u001f\u007f]/.test(route.pattern), 'INVALID_ROUTE_INVENTORY');
    requireValue(!Object.hasOwn(route, 'script') || route.script === null
      || (typeof route.script === 'string' && route.script.length > 0), 'INVALID_ROUTE_INVENTORY');
    requireValue(!ids.has(route.id.toLowerCase()) && !patterns.has(route.pattern), 'DUPLICATE_ROUTE_INVENTORY');
    ids.add(route.id.toLowerCase()); patterns.add(route.pattern);
  }
  return routes.sort((a, b) => a.id.localeCompare(b.id));
}

function shadowsConsole(pattern) {
  const route = pattern.replace(/^(?:[a-z][a-z0-9+.-]*|\*):\/\//i, '');
  const slash = route.indexOf('/');
  if (slash < 0) return false;
  const host = route.slice(0, slash).replace(/:\d+$/, '');
  let path = route.slice(slash);
  try { path = decodeURIComponent(path); } catch { /* Compare the literal path. */ }
  if (!/^\/internal\/admin\/console(?:$|[/*?])/i.test(path)) return false;
  const hostPattern = '^' + host.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$';
  return ['mmdbkk.com', 'www.mmdbkk.com'].some(name => new RegExp(hostPattern, 'i').test(name));
}

// Call on the complete pre-promotion GET result before uploading code. The
// activation function repeats this validation on its own immutable snapshot.
export function validateConsoleRouteBaseline(routes) {
  const baseline = inventory(routes);
  requireValue(!baseline.some(route => shadowsConsole(route.pattern)), 'EXISTING_CONSOLE_ROUTE');
  return baseline;
}

function deployment(value) {
  requireValue(record(value) && typeof value.id === 'string' && UUID.test(value.id)
    && value.strategy === 'percentage' && Array.isArray(value.versions)
    && value.versions.length === 1 && record(value.versions[0])
    && typeof value.versions[0].version_id === 'string' && UUID.test(value.versions[0].version_id)
    && value.versions[0].percentage === 100, 'INVALID_EXACT_DEPLOYMENT');
  return { id: value.id, strategy: 'percentage', versions: [{ version_id: value.versions[0].version_id, percentage: 100 }] };
}

function completeRouteResult(data) {
  requireValue(Array.isArray(data.result), 'INVALID_ROUTE_RESPONSE');
  const info = data.result_info;
  if (info !== undefined && info !== null) {
    requireValue(record(info), 'INCOMPLETE_ROUTE_INVENTORY');
    for (const key of ['count', 'total_count']) {
      if (info[key] !== undefined) requireValue(info[key] === data.result.length, 'INCOMPLETE_ROUTE_INVENTORY');
    }
    if (info.page !== undefined) requireValue(info.page === 1, 'INCOMPLETE_ROUTE_INVENTORY');
    if (info.total_pages !== undefined) requireValue(info.total_pages === 1
      || (info.total_pages === 0 && data.result.length === 0), 'INCOMPLETE_ROUTE_INVENTORY');
  }
  return data.result;
}

// A separate route-scoped credential is supplied by the adapter. No environment
// reads, credential output, redirects, retries, updates, or deletes are allowed.
export function createConsoleRoutesTransport(token, request = fetch) {
  requireValue(typeof token === 'string' && token.length <= 4096
    && /^[A-Za-z0-9._~+/-]+=*$/.test(token), 'INVALID_ROUTE_CREDENTIAL');
  requireValue(typeof request === 'function', 'INVALID_ROUTE_REQUEST');
  return async (path, init = {}) => {
    requireValue(path === CONSOLE_ROUTES_PATH && record(init)
      && Object.keys(init).every(key => ['method', 'body'].includes(key)), 'OUTSIDE_CONSOLE_ROUTE_SCOPE');
    const method = init.method === undefined ? 'GET' : init.method;
    requireValue(method === 'GET' || method === 'POST', 'OUTSIDE_CONSOLE_ROUTE_SCOPE');
    let body;
    if (method === 'GET') requireValue(init.body === undefined, 'OUTSIDE_CONSOLE_ROUTE_SCOPE');
    else {
      requireValue(typeof init.body === 'string' && init.body.length <= 256, 'INVALID_CONSOLE_ROUTE_BODY');
      let parsed;
      try { parsed = JSON.parse(init.body); } catch { throw failure('INVALID_CONSOLE_ROUTE_BODY'); }
      requireValue(record(parsed) && Object.keys(parsed).length === 2
        && Object.hasOwn(parsed, 'pattern') && Object.hasOwn(parsed, 'script')
        && CONSOLE_ROUTE_PATTERNS.includes(parsed.pattern) && parsed.script === SCRIPT, 'INVALID_CONSOLE_ROUTE_BODY');
      body = JSON.stringify({ pattern: parsed.pattern, script: SCRIPT });
    }
    let response, data;
    try {
      response = await request('https://api.cloudflare.com/client/v4' + CONSOLE_ROUTES_PATH, {
        method, ...(body === undefined ? {} : { body }), redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      });
      data = await response.json();
    } catch { throw failure('CONSOLE_ROUTE_TRANSPORT_FAILED'); }
    requireValue(response.ok === true && data?.success === true, 'CONSOLE_ROUTE_API_FAILED');
    if (method === 'GET') return completeRouteResult(data);
    requireValue(record(data.result), 'INVALID_ROUTE_RESPONSE');
    return data.result;
  };
}

/**
 * baselineRoutes: the complete array captured before code promotion.
 * expectedDeployment: { id, strategy: 'percentage', versions: [{ version_id, percentage: 100 }] }
 * from the successful code engine receipt. readDeployment() reads the CURRENT
 * deployment through the separate code credential; callRoutes uses the narrow
 * route transport. approve() rechecks the adapter's production gate and other
 * code/configuration invariants before each creation. now()/save(receipt) are
 * required hooks; save may be asynchronous and must finish before the POST.
 */
export async function activateConsoleRoutes(io) {
  const state = { kind: 'admin-console-route-activation', phase: 'preflight', worker: SCRIPT,
    worker_root: ROOT, zone: ZONE, target_patterns: [...CONSOLE_ROUTE_PATTERNS],
    write_attempts: 0, created_routes: [], verified_route_count: 0 };
  let failureStage = 'input_validation';
  const saveHook = io?.save, nowHook = io?.now;
  const timestamp = () => {
    const at = nowHook();
    requireValue(typeof at === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(at)
      && Number.isFinite(Date.parse(at)), 'INVALID_RECEIPT_CLOCK');
    return at;
  };
  const save = async phase => {
    state.phase = phase;
    state.recorded_at = timestamp();
    try { await saveHook(structuredClone(state)); } catch { throw failure('CONSOLE_ROUTE_RECEIPT_FAILED'); }
  };
  try {
    requireValue(record(io) && ['callRoutes', 'readDeployment', 'approve', 'now', 'save']
      .every(key => typeof io[key] === 'function'), 'INVALID_ACTIVATION_CALLBACKS');
    const { callRoutes, readDeployment, approve } = io;
    const baseline = validateConsoleRouteBaseline(io.baselineRoutes);
    const expectedDeployment = deployment(io.expectedDeployment);
    const created = [];
    state.expected_deployment = expectedDeployment;
    state.baseline_routes = { count: baseline.length, sha256: digest(baseline) };
    await save('preflight');

    const unchanged = async (stage, added = null) => {
      failureStage = stage + '_routes';
      const current = inventory(await callRoutes(CONSOLE_ROUTES_PATH, { method: 'GET' }));
      const expected = inventory([...baseline, ...created]);
      let confirmed;
      if (added) {
        confirmed = current.find(route => route.id === added.id);
        const previous = current.filter(route => route.id !== added.id);
        requireValue(confirmed && current.length === expected.length + 1
          && canonical(previous) === canonical(expected), 'CONSOLE_ROUTE_INVENTORY_DRIFT');
        // GET may populate server defaults omitted by the create response.
        // Accept those only on this new route's first readback; all returned
        // fields must match, then retain the full GET record for later checks.
        requireValue(Object.keys(added).every(key => Object.hasOwn(confirmed, key)
          && canonical(confirmed[key]) === canonical(added[key])), 'CREATED_CONSOLE_ROUTE_READBACK_MISMATCH');
        requireValue(!Object.hasOwn(confirmed, 'request_limit_fail_open')
          || confirmed.request_limit_fail_open === false, 'UNSAFE_CONSOLE_ROUTE_FAIL_OPEN');
      } else requireValue(canonical(current) === canonical(expected), 'CONSOLE_ROUTE_INVENTORY_DRIFT');
      failureStage = stage + '_deployment';
      const currentDeployment = deployment(await readDeployment());
      requireValue(canonical(currentDeployment) === canonical(expectedDeployment), 'CONSOLE_DEPLOYMENT_DRIFT');
      if (confirmed) created.push(confirmed);
      state.last_verified_inventory = { count: current.length, sha256: digest(current) };
      state.verified_route_count = created.length;
    };

    for (const [index, pattern] of CONSOLE_ROUTE_PATTERNS.entries()) {
      const stage = `route_${index + 1}`;
      failureStage = stage + '_approval';
      await approve();
      await unchanged(stage + '_before_create');
      state.pending_route = { pattern, script: SCRIPT };
      state.write_attempts++;
      failureStage = stage + '_intent_receipt';
      await save('route-create-attempted-outcome-unknown');
      failureStage = stage + '_create';
      const result = await callRoutes(CONSOLE_ROUTES_PATH, { method: 'POST', body: JSON.stringify(state.pending_route) });
      failureStage = stage + '_response_validation';
      const [added] = inventory([result]);
      requireValue(added.pattern === pattern && added.script === SCRIPT
        && ![...baseline, ...created].some(route => route.id.toLowerCase() === added.id.toLowerCase()), 'INVALID_CREATED_CONSOLE_ROUTE');
      state.created_routes.push({ id: added.id, pattern, script: SCRIPT });
      failureStage = stage + '_response_receipt';
      await save('route-created-not-yet-verified');
      await unchanged(stage + '_after_create', added);
      delete state.pending_route;
      failureStage = stage + '_verified_receipt';
      await save('route-created-and-verified');
    }
    failureStage = 'completion_receipt';
    await save('complete');
    return structuredClone(state);
  } catch (error) {
    const code = failureCodes.get(error) || 'CONSOLE_ROUTE_STAGE_FAILED';
    state.stopped_after = state.phase;
    state.phase = 'stopped';
    state.failure_stage = failureStage;
    state.reason_code = code;
    try { if (typeof nowHook === 'function') state.recorded_at = timestamp(); } catch { /* Retain the last valid timestamp. */ }
    // Receipt failure must never permit another mutation or leak an upstream
    // exception. A best-effort stopped receipt is the only remaining operation.
    try { if (typeof saveHook === 'function') await saveHook(structuredClone(state)); } catch { /* Stop regardless. */ }
    throw failure(code);
  }
}
