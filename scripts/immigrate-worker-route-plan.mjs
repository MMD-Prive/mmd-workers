import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { verifyImmigrateMutation } from './immigrate-production-gate.mjs';

const worker = 'immigrate-worker';
const endpoint = 'https://api.cloudflare.com/client/v4/zones/2d62396174fa2ddadbbcd0e8cf0f3367/workers/routes';
const hosts = paths => ['mmdbkk.com', 'www.mmdbkk.com'].flatMap(host => paths.map(path => host + path));
const scopes = {
  ingress: {
    desired: hosts([
      '/internal/admin/customer-data', '/internal/admin/customer-data*',
      '/internal/admin/job-board*', '/internal/admin/jobs/job-board*', '/internal/jobs/create-job*',
      '/internal/admin/jobs/create-session/core', '/a/create-session.js',
      '/v1/admin/clients/lineage-lookup*', '/v1/admin/clients/recent*', '/v1/admin/clients/intelligence*',
    ]),
    obsolete: hosts([
      '/internal/admin/jobs/create-job*', '/internal/admin/jobs/create-session.js', '/a/create-session.js*',
      '/a/create-session-focus-flow-v2.js', '/a/create-session-focus-flow-v2.js*',
    ]),
  },
  'member-intelligence': {
    required: hosts(['/internal/admin/control-room*']),
    obsolete: hosts(['/internal/admin/member-intelligence/runtime', '/a/member-intelligence.js']),
  },
  ceo: { desired: hosts(['/internal/ceo*']) },
};
const shaPattern = /^[0-9a-f]{40}$/;
const routeIdPattern = /^[0-9a-f]{32}$/i;
const byPattern = (a, b) => a.pattern.localeCompare(b.pattern, 'en');
const encode = plan => JSON.stringify(plan);
export const routePlanDigest = plan => createHash('sha256').update(encode(plan)).digest('hex');

function policy(sha, scope) {
  assert.match(sha || '', shaPattern, 'full approved SHA required');
  assert.ok(Object.hasOwn(scopes, scope), 'unknown route scope');
  return scopes[scope];
}

export function buildRoutePlan({ sha, scope, routes }) {
  const { desired = [], obsolete = [], required = [] } = policy(sha, scope);
  const existing = pattern => {
    const matches = routes.filter(route => route.pattern === pattern);
    assert.ok(matches.length <= 1, `ambiguous route: ${pattern}`);
    return matches[0];
  };
  const add = [];
  const remove = [];
  for (const pattern of required) assert.equal(existing(pattern)?.script, worker, `required route ownership differs: ${pattern}`);
  for (const pattern of desired) {
    const route = existing(pattern);
    if (!route) add.push(pattern);
    else assert.equal(route.script, worker, `route ownership conflict: ${pattern}`);
  }
  for (const pattern of obsolete) {
    const route = existing(pattern);
    if (route?.script !== worker) continue;
    assert.match(route.id, routeIdPattern, 'invalid obsolete route ID');
    remove.push({ pattern, id: route.id });
  }
  return { sha, scope, add: add.sort(), remove: remove.sort(byPattern) };
}

export function readApprovedRoutePlan({ sha, scope, json, digest }) {
  const { desired = [], obsolete = [] } = policy(sha, scope);
  const plan = JSON.parse(json);
  assert.equal(plan?.sha, sha, 'route plan SHA differs from approved SHA');
  assert.equal(plan.scope, scope, 'route plan scope differs from approved scope');
  assert.ok(Array.isArray(plan.add) && Array.isArray(plan.remove), 'route operations required');
  assert.ok(plan.add.every(pattern => desired.includes(pattern)), 'route addition outside scope');
  assert.ok(plan.remove.every(route => obsolete.includes(route?.pattern) && routeIdPattern.test(route?.id)), 'route deletion outside scope');
  assert.equal(new Set(plan.add).size, plan.add.length, 'duplicate route additions');
  assert.equal(new Set(plan.remove.map(route => route.pattern)).size, plan.remove.length, 'duplicate route deletions');
  assert.equal(new Set(plan.remove.map(route => route.id)).size, plan.remove.length, 'duplicate route IDs');
  const canonical = {
    sha, scope, add: [...plan.add].sort(),
    remove: plan.remove.map(({ pattern, id }) => ({ pattern, id })).sort(byPattern),
  };
  assert.equal(routePlanDigest(canonical), digest, 'route plan digest differs from approved digest');
  return canonical;
}

function cloudflareRoutes(token, request) {
  assert.ok(token?.trim(), 'route credential missing');
  return async (method = 'GET', routeId, body) => {
    const response = await request(routeId ? `${endpoint}/${routeId}` : endpoint, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => null);
    assert.ok(response.ok && data?.success === true, `Cloudflare route ${method} failed (HTTP ${response.status})`);
    if (method === 'GET') {
      assert.ok(Array.isArray(data.result), 'Cloudflare route list is missing');
      assert.ok(data.result_info?.total_pages === undefined || data.result_info.total_pages <= 1, 'Cloudflare route list is incomplete');
      assert.ok(data.result_info?.total_count === undefined || data.result_info.total_count === data.result.length,
        'Cloudflare route list count is incomplete');
    }
    return data.result;
  };
}

export async function applyRoutePlan({ plan, token, authorize, request = fetch }) {
  await authorize();
  const call = cloudflareRoutes(token, request);
  let remaining = plan;
  const verify = async () => {
    const current = buildRoutePlan({ sha: plan.sha, scope: plan.scope, routes: await call() });
    assert.deepEqual(current, remaining, 'live route operations differ from the approved plan; review again');
  };
  await verify();
  for (const pattern of plan.add) {
    await Promise.all([authorize(), verify()]);
    await call('POST', undefined, { pattern, script: worker });
    remaining = { ...remaining, add: remaining.add.slice(1) };
  }
  for (const { id } of plan.remove) {
    await Promise.all([authorize(), verify()]);
    await call('DELETE', id);
    remaining = { ...remaining, remove: remaining.remove.slice(1) };
  }
  await verify();
  return { added: plan.add.length, removed: plan.remove.length, digest: routePlanDigest(plan) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [mode, scope, sha] = process.argv.slice(2);
    if (mode === '--plan') {
      policy(sha, scope);
      const routes = await cloudflareRoutes(process.env.IMMIGRATE_ROUTE_READ_TOKEN, fetch)();
      const plan = buildRoutePlan({ sha, scope, routes });
      console.log(JSON.stringify({ plan, digest: routePlanDigest(plan) }));
    } else {
      const env = process.env;
      const plan = readApprovedRoutePlan({
        sha: env.APPROVED_SHA, scope: env.ROUTE_SCOPE, json: env.ROUTE_PLAN, digest: env.ROUTE_PLAN_DIGEST,
      });
      if (mode === '--review') {
        console.log(`## Cloudflare route plan\n\nSHA: \`${plan.sha}\`\n\nScope: \`${plan.scope}\`\n\nDigest: \`${env.ROUTE_PLAN_DIGEST}\`\n\n\`\`\`json\n${JSON.stringify(plan, null, 2)}\n\`\`\``);
      } else if (mode === '--apply') {
        const result = await applyRoutePlan({
          plan, token: env.IMMIGRATE_ROUTE_MUTATION_TOKEN, authorize: () => verifyImmigrateMutation(env),
        });
        console.log(JSON.stringify(result));
      } else {
        throw Error('Use --plan <scope> <sha>, --review, or --apply');
      }
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
