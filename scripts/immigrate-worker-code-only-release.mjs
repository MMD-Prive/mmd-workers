import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ACCOUNT = 'b176eda1172b741fd2e58904cc9d77c5';
const WORKER = 'immigrate-worker';
const SECRET_BINDINGS = [
  'AIRTABLE_API_KEY', 'AUTH_SERVICE_IMMIGRATE_TO_PAYMENTS', 'BROWSER_GATE_PASSWORD',
  'CONFIRM_KEY', '/eV6h915fcEk4jqqk8Fb5GlMfxZM8f7VzMplGdENwsE=', 'INTERNAL_TOKEN',
  'LINE_CHANNEL_ACCESS_TOKEN', 'LINE_CHANNEL_SECRET', 'LINK_SIGNING_SECRET',
  'TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET_TOKEN',
];
const PRESERVED_DASHBOARD_VARS = {
  AIRTABLE_ENTITLEMENT_MEMBERSTACK_ID_FIELD: 'memberstack_id',
  AIRTABLE_MEMBERS_MEMBERSTACK_ID_FIELD: 'memberstack_id',
};

function fail(message) { throw new Error(message); }
function sorted(value) { return [...value].sort((a, b) => a.localeCompare(b)); }
function uuid(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || ''); }

export function parseImmigrateWorkerConfig(source) {
  const worker = source.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
  const compatibilityDate = source.match(/^compatibility_date\s*=\s*"([^"]+)"/m)?.[1];
  const varsBlock = source.match(/^\[vars\]\s*\n([\s\S]*?)(?=^\[|^$)/m)?.[1];
  if (!worker || !compatibilityDate || !varsBlock) fail('Worker config is incomplete');
  const vars = {};
  for (const line of varsBlock.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Z0-9_]+)\s*=\s*("(?:\\.|[^"\\])*"|'[^']*')$/);
    if (!match) fail('Worker vars config contains an unsupported value');
    vars[match[1]] = match[2].startsWith('"') ? JSON.parse(match[2]) : match[2].slice(1, -1);
  }
  const service = source.match(/\[\[services\]\][^\[]*?binding\s*=\s*"([^"]+)"[^\[]*?service\s*=\s*"([^"]+)"/)?.slice(1);
  const assetBinding = source.match(/^binding\s*=\s*"([^"]+)"/m)?.[1];
  if (!service || !assetBinding) fail('Worker asset or service binding config is incomplete');
  return { worker, compatibilityDate, vars, service: { name: service[0], service: service[1] }, assetBinding };
}

function expectedBindingSignature(config) {
  const expectedVars = { ...config.vars, ...PRESERVED_DASHBOARD_VARS };
  return [
    ...Object.entries(expectedVars).map(([name, text]) => ({ name, type: 'plain_text', text })),
    ...SECRET_BINDINGS.map(name => ({ name, type: 'secret_text' })),
    { name: config.assetBinding, type: 'assets' },
    { name: config.service.name, type: 'service', service: config.service.service, environment: 'production' },
  ].map(binding => JSON.stringify(binding)).sort();
}

function actualBindingSignature(bindings) {
  return (bindings || []).map(binding => {
    const normalized = { name: binding.name, type: binding.type };
    if (binding.type === 'plain_text') normalized.text = binding.text;
    if (binding.type === 'service') {
      normalized.service = binding.service;
      normalized.environment = binding.environment || 'production';
    }
    return JSON.stringify(normalized);
  }).sort();
}

export async function verifyImmigrateWorkerBaseline({ expectedVersion, expectedDeployment, token, configText, fetcher = fetch }) {
  if (!uuid(expectedVersion) || !uuid(expectedDeployment) || !token) fail('Expected production baseline or Cloudflare credentials are missing');
  const config = parseImmigrateWorkerConfig(configText);
  if (config.worker !== WORKER) fail('Repository config does not target immigrate-worker');
  const base = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/scripts/${WORKER}`;
  const call = async path => {
    const response = await fetcher(`${base}${path}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.success !== true) fail(`Cloudflare baseline read failed (${response.status})`);
    return body.result;
  };
  const [deploymentResponse, settings, version] = await Promise.all([
    call('/deployments?per_page=1'),
    call('/settings'),
    call(`/versions/${expectedVersion}`),
  ]);
  const active = deploymentResponse?.deployments?.[0];
  if (active?.id !== expectedDeployment || active.versions?.length !== 1 || active.versions[0].version_id !== expectedVersion || active.versions[0].percentage !== 100) fail('Production deployment baseline drifted; stop before upload');
  if (version?.id !== expectedVersion) fail('Production version baseline readback mismatch');
  if (settings?.compatibility_date !== config.compatibilityDate || settings?.usage_model !== 'standard' || (settings.compatibility_flags || []).length) fail('Production runtime configuration differs from repository baseline');
  const expected = expectedBindingSignature(config);
  const actual = actualBindingSignature(settings.bindings);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail('Production binding names or configuration differ from repository baseline');
  return { worker: WORKER, baselineVersion: expectedVersion, baselineDeployment: expectedDeployment, configuration: 'matched', routesChanged: false };
}

export async function promoteImmigrateWorkerVersion({ uploadedVersion, expectedVersion, expectedDeployment, token, configText, commitSha, fetcher = fetch }) {
  if (!uuid(uploadedVersion) || !/^[0-9a-f]{40}$/i.test(commitSha || '')) fail('Uploaded version or approved source SHA is invalid');
  await verifyImmigrateWorkerBaseline({ expectedVersion, expectedDeployment, token, configText, fetcher });
  const root = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/scripts/${WORKER}`;
  const call = async (path, init = {}) => {
    const response = await fetcher(`${root}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, signal: AbortSignal.timeout(30000) });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.success !== true) fail(`Cloudflare release request failed (${response.status})`);
    return body.result;
  };
  const uploaded = await call(`/versions/${uploadedVersion}`);
  const message = uploaded?.annotations?.['workers/message'] || '';
  const annotatedSha = uploaded?.annotations?.['workers/commit_sha'] || '';
  if (uploaded?.id !== uploadedVersion || (!message.includes(commitSha) && annotatedSha !== commitSha)) fail('Uploaded Worker version does not match the approved commit');
  const deployment = await call('/deployments', { method: 'POST', body: JSON.stringify({ strategy: 'percentage', versions: [{ version_id: uploadedVersion, percentage: 100 }] }) });
  if (!uuid(deployment?.id)) fail('Cloudflare deployment ID missing');
  const readback = await call(`/deployments/${deployment.id}`);
  if (readback?.id !== deployment.id || readback.strategy !== 'percentage' || readback.versions?.length !== 1 || readback.versions[0].version_id !== uploadedVersion || readback.versions[0].percentage !== 100) fail('Production deployment readback mismatch');
  return { worker: WORKER, version: uploadedVersion, deployment: deployment.id, traffic: '100%', routesChanged: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2];
  const configText = readFileSync(new URL('../immigrate-worker/wrangler.toml', import.meta.url), 'utf8');
  const options = {
    expectedVersion: process.env.EXPECTED_VERSION,
    expectedDeployment: process.env.EXPECTED_DEPLOYMENT,
    token: process.env.CLOUDFLARE_API_TOKEN,
    configText,
    fetcher: globalThis.fetch,
  };
  try {
    const result = mode === '--preflight'
      ? await verifyImmigrateWorkerBaseline(options)
      : mode === '--promote' && process.argv[3]
        ? await promoteImmigrateWorkerVersion({ ...options, uploadedVersion: process.argv[3], commitSha: process.env.APPROVED_SHA })
        : fail('Use --preflight or --promote <uploaded-version>');
    console.log(JSON.stringify({ ok: true, ...result }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
