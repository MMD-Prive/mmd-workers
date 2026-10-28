import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const account = 'b176eda1172b741fd2e58904cc9d77c5';
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw new Error('Cloudflare API token is unavailable');
const root = new URL('../release/my-mmd-renewal-20261027/', import.meta.url);
const specs = {
  'payments-worker': {
    file: 'payments-worker.js',
    sha: 'c96ffc6593ea852ccc5daa03c58a8fab027daa92f964937fac0771a9f5ad945f',
    active: 'c611d886-8e99-4fe1-a346-ca6033c631dd',
    date: '2026-01-20',
  },
  'member-pages-worker': {
    file: 'member-pages-worker.js',
    sha: '72b693792d9944f3c56aebc4535f9947e7f9b319a5d870e35e763af332b3b1a4',
    active: '4e7ec892-fcd9-44a3-9852-c29cf91d6ebb',
    date: '2026-06-20',
  },
};
const path = name => `/accounts/${account}/workers/scripts/${name}`;
async function api(method, endpoint, body) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${endpoint}`, {
    method, headers: { Authorization: `Bearer ${token}`, ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(`${method} ${endpoint}: ${response.status} ${JSON.stringify(result.errors || []).slice(0, 1000)}`);
  return result.result;
}
async function state(name) {
  const [deployments, settings] = await Promise.all([
    api('GET', `${path(name)}/deployments`), api('GET', `${path(name)}/settings`),
  ]);
  return { version: deployments.deployments?.[0]?.versions?.find(v => v.percentage === 100)?.version_id, settings };
}
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function expect(condition, message) { if (!condition) throw new Error(message); }

const initial = {};
const files = {};
const latestVersion = {};
for (const [name, spec] of Object.entries(specs)) {
  const bytes = await readFile(new URL(spec.file, root));
  expect(digest(bytes) === spec.sha, `${name}: candidate checksum changed`);
  files[name] = bytes;
  initial[name] = await state(name);
  expect(initial[name].version === spec.active, `${name}: active production version changed`);
  const listed = await api('GET', `${path(name)}/versions?per_page=1`);
  expect(listed.items?.[0]?.id === spec.active, `${name}: latest uploaded version differs from active production`);
  latestVersion[name] = spec.active;
  expect(initial[name].settings.compatibility_date === spec.date, `${name}: compatibility date changed`);
  expect(Array.isArray(initial[name].settings.bindings), `${name}: missing bindings`);
}
const flag = initial['member-pages-worker'].settings.bindings.find(b => b.name === 'LIFF_RENEWAL_CARD_ENABLED');
const promotion = initial['member-pages-worker'].settings.bindings.find(b => b.name === 'LIFF_PROMOTION_PURCHASE_ENABLED');
expect(flag?.type === 'plain_text' && flag.text === 'false', 'Renewal is already active or flag changed');
expect(promotion?.type === 'plain_text' && promotion.text === 'false', 'Promotion flag changed');
console.log('Baseline versions, flags and candidate checksums verified');

async function upload(name, renewalEnabled) {
  const listed = await api('GET', `${path(name)}/versions?per_page=1`);
  expect(listed.items?.[0]?.id === latestVersion[name], `${name}: another version was uploaded during this release`);
  const { settings } = initial[name];
  const bindings = settings.bindings.map(binding => {
    if (binding.type !== 'plain_text') return { type: 'inherit', name: binding.name, version_id: 'latest' };
    if (binding.name === 'LIFF_RENEWAL_CARD_ENABLED') return { ...binding, text: renewalEnabled ? 'true' : 'false' };
    if (binding.name === 'LIFF_PROMOTION_PURCHASE_ENABLED') return { ...binding, text: 'false' };
    return binding;
  });
  const metadata = {
    main_module: 'worker.js', compatibility_date: settings.compatibility_date,
    compatibility_flags: settings.compatibility_flags || [], usage_model: settings.usage_model,
    bindings,
    annotations: { 'workers/message': `MY MMD Renewal 90-day release; ${name}; enabled=${renewalEnabled}; source 3930c335` },
  };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }), 'metadata.json');
  form.append('worker.js', new Blob([files[name]], { type: 'application/javascript+module' }), 'worker.js');
  const result = await api('POST', `${path(name)}/versions`, form);
  const id = result.id || result.version_id;
  expect(/^[a-f0-9-]{36}$/i.test(id || ''), `${name}: version upload returned no ID`);
  latestVersion[name] = id;
  console.log(`${name} candidate uploaded: ${id} (Renewal ${renewalEnabled ? 'on' : 'off'})`);
  return id;
}
async function deploy(name, id) {
  const result = await api('POST', `${path(name)}/deployments`, {
    strategy: 'percentage', versions: [{ version_id: id, percentage: 100 }],
    annotations: { 'workers/message': `MY MMD Renewal release; source PR 2816; ${name}` },
  });
  const after = await state(name);
  expect(after.version === id, `${name}: deployed version was not observed at 100%`);
  console.log(`${name} deployed at 100%: ${id}; deployment=${result.id}`);
}
let disabledMemberVersion;
let paymentDeployed = false;
let renewalActivated = false;
try {
  const paymentVersion = await upload('payments-worker', false);
  disabledMemberVersion = await upload('member-pages-worker', false);
  await deploy('payments-worker', paymentVersion);
  paymentDeployed = true;
  await deploy('member-pages-worker', disabledMemberVersion);
  const disabled = await state('member-pages-worker');
  expect(disabled.settings.bindings.find(b => b.name === 'LIFF_RENEWAL_CARD_ENABLED')?.text === 'false', 'Disabled stage flag mismatch');
  const enabledMemberVersion = await upload('member-pages-worker', true);
  await deploy('member-pages-worker', enabledMemberVersion);
  renewalActivated = true;
  const enabled = await state('member-pages-worker');
  expect(enabled.settings.bindings.find(b => b.name === 'LIFF_RENEWAL_CARD_ENABLED')?.text === 'true', 'Renewal flag did not enable');
  expect(enabled.settings.bindings.find(b => b.name === 'LIFF_PROMOTION_PURCHASE_ENABLED')?.text === 'false', 'Promotion unexpectedly enabled');
  console.log(JSON.stringify({ status: 'RENEWAL_ACTIVE', payments: paymentVersion, member_pages: enabledMemberVersion, promotion: 'off' }));
} catch (error) {
  console.error(`Release stopped: ${error.message}`);
  if (paymentDeployed && !renewalActivated && disabledMemberVersion) {
    try { await deploy('member-pages-worker', disabledMemberVersion); console.error('Member Pages returned to Renewal-disabled version'); }
    catch (rollbackError) { console.error(`Automatic disable failed: ${rollbackError.message}`); }
  }
  throw error;
}
