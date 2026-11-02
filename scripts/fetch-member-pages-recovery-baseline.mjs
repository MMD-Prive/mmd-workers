import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const ACCOUNT_ID = 'b176eda1172b741fd2e58904cc9d77c5';
export const ACTIVE_HASHES = Object.freeze({
  'member-pages-worker': '9e1e7eb7b425af0e08789f9aca2a65b467cfd234d50fbac90927aec574122849',
  'admin-worker': '70e0a9e6f541ef9c71425be84d54f11c124004219ebb9c6c7062b57da950160e',
});

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const root = worker => `/accounts/${ACCOUNT_ID}/workers/scripts/${worker}`;

export async function fetchActiveWorkerArtifact({ worker, expectedVersion, expectedDeployment, expectedSha256 = ACTIVE_HASHES[worker], token, request = fetch }) {
  assert.ok(ACTIVE_HASHES[worker], 'unsupported recovery worker');
  assert.ok(token, 'Cloudflare API token required');
  const get = async path => {
    const response = await request(`https://api.cloudflare.com/client/v4${path}`, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${token}` } });
    const payload = await response.json();
    assert.ok(response.ok && payload?.success === true, `Cloudflare read failed (${response.status})`);
    return payload.result;
  };
  const deployment = (await get(root(worker) + '/deployments'))?.deployments?.[0];
  assert.equal(deployment?.id, expectedDeployment, `${worker} deployment drift`);
  assert.equal(deployment?.versions?.length, 1, `${worker} traffic split`);
  assert.equal(deployment?.versions?.[0]?.percentage, 100, `${worker} traffic allocation`);
  assert.equal(deployment?.versions?.[0]?.version_id, expectedVersion, `${worker} serving version drift`);
  const version = await get(root(worker) + '/versions/' + expectedVersion);
  assert.equal(version?.id, expectedVersion, `${worker} version readback mismatch`);
  const response = await request(`https://api.cloudflare.com/client/v4${root(worker)}/content/v2`, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${token}` } });
  assert.ok(response.ok, `${worker} content read failed (${response.status})`);
  const parts = [...(await response.formData()).entries()];
  assert.equal(parts.length, 1, `${worker} content must contain one module`);
  assert.equal(parts[0][0], 'worker.js', `${worker} active module name drift`);
  const bytes = Buffer.from(await parts[0][1].arrayBuffer());
  assert.equal(sha256(bytes), expectedSha256, `${worker} active module hash drift`);
  return { worker, version, deployment, bytes, sha256: expectedSha256 };
}

export async function fetchRecoveryBaselines({ outputDir, memberVersion, memberDeployment, adminVersion, adminDeployment, token, request = fetch }) {
  const [member, admin] = await Promise.all([
    fetchActiveWorkerArtifact({ worker: 'member-pages-worker', expectedVersion: memberVersion, expectedDeployment: memberDeployment, token, request }),
    fetchActiveWorkerArtifact({ worker: 'admin-worker', expectedVersion: adminVersion, expectedDeployment: adminDeployment, token, request }),
  ]);
  const dir = resolve(outputDir); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'member-active.js'), member.bytes, { mode: 0o600 });
  writeFileSync(join(dir, 'admin-active.js'), admin.bytes, { mode: 0o600 });
  writeFileSync(join(dir, 'baseline.json'), JSON.stringify({ member: { version: memberVersion, deployment: memberDeployment, sha256: member.sha256 }, admin: { version: adminVersion, deployment: adminDeployment, sha256: admin.sha256 } }, null, 2) + '\n', { mode: 0o600 });
  return { member: { version: memberVersion, deployment: memberDeployment, sha256: member.sha256 }, admin: { version: adminVersion, deployment: adminDeployment, sha256: admin.sha256 } };
}

if (process.argv[1] && new URL(import.meta.url).pathname === resolve(process.argv[1])) {
  const [outputDir] = process.argv.slice(2);
  assert.ok(outputDir, 'usage: node fetch-member-pages-recovery-baseline.mjs OUTPUT_DIR');
  const result = await fetchRecoveryBaselines({ outputDir, memberVersion: process.env.MMD_RECOVERY_MEMBER_VERSION, memberDeployment: process.env.MMD_RECOVERY_MEMBER_DEPLOYMENT, adminVersion: process.env.MMD_RECOVERY_ADMIN_VERSION, adminDeployment: process.env.MMD_RECOVERY_ADMIN_DEPLOYMENT, token: process.env.CLOUDFLARE_API_TOKEN });
  console.log(JSON.stringify(result));
}
