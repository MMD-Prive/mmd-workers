// Promotion only: candidate upload is a separate owner-approved code-only step.
// No uploads, route mutations, secret writes, model calls or customer messages.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { versionConfiguration } from './admin-current-session-code-only.mjs';

export const ROOT = '/accounts/b176eda1172b741fd2e58904cc9d77c5/workers/scripts/member-dashboard-chat-worker';
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const canonical = value => JSON.stringify(value, (_, item) => item && !Array.isArray(item) && typeof item === 'object'
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);

export function validateCandidate(baseline, candidate, sourceSha) {
  assert.match(sourceSha, /^[a-f0-9]{40}$/);
  const annotations = candidate.annotations || {};
  const commitSha = annotations['workers/commit_sha'];
  if (commitSha !== undefined) assert.equal(commitSha, sourceSha, 'Candidate source provenance mismatch');
  assert.ok(commitSha === sourceSha || (
    annotations['workers/message'] === `Per AI Support source-sha=${sourceSha}` &&
    annotations['workers/tag'] === `per-support-${sourceSha.slice(0, 12)}`
  ), 'Candidate source provenance mismatch');
  assert.equal(canonical(versionConfiguration(candidate)), canonical(versionConfiguration(baseline)), 'Configuration differs; no promotion');
  for (const name of ['LINE_AUTO_REPLY_ENABLED', 'LINE_KENJI_MODEL_ENABLED', 'KENJI_LINE_CONTEXTUAL_SHADOW_ENABLED']) {
    const binding = candidate.resources.bindings.find(item => item.name === name);
    assert.equal(binding?.type, 'plain_text');
    assert.equal(binding.text, 'false', `${name} must remain OFF`);
  }
}

export function createTransport(token, request = fetch) {
  assert.ok(token, 'Missing existing deploy credential');
  return async (path, method = 'GET', body) => {
    assert.ok((method === 'GET' && (path === ROOT + '/deployments' || new RegExp('^' + ROOT + '/versions/[a-f0-9-]{36}$').test(path)))
      || (method === 'POST' && path === ROOT + '/deployments'), 'Outside Kenji promotion scope');
    const response = await request('https://api.cloudflare.com/client/v4' + path, {
      method, redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json();
    assert.ok(response.ok && payload.success, `Cloudflare ${method} ${response.status}; stop without retry`);
    return payload.result;
  };
}

export async function promote({ call, baselineId, candidateId, sourceSha }) {
  for (const id of [baselineId, candidateId]) assert.match(id || '', uuid);
  assert.notEqual(baselineId, candidateId);
  const active = async () => {
    const deployment = (await call(ROOT + '/deployments')).deployments[0];
    assert.equal(deployment.versions.length, 1, 'Split traffic requires separate review');
    assert.equal(deployment.versions[0].percentage, 100);
    return deployment;
  };
  const before = await active();
  assert.equal(before.versions[0].version_id, baselineId, 'Active baseline drift');
  const baseline = await call(ROOT + '/versions/' + baselineId);
  const candidate = await call(ROOT + '/versions/' + candidateId);
  validateCandidate(baseline, candidate, sourceSha);
  assert.equal((await active()).id, before.id, 'Deployment drift before promotion');
  // One write, no retries even when outcome is unknown.
  const written = await call(ROOT + '/deployments', 'POST', {
    strategy: 'percentage', versions: [{ version_id: candidateId, percentage: 100 }],
  });
  const after = await active();
  assert.equal(after.id, written.id);
  assert.equal(after.versions[0].version_id, candidateId);
  validateCandidate(baseline, await call(ROOT + '/versions/' + candidateId), sourceSha);
  return { worker: 'member-dashboard-chat-worker', deployment: after.id, version: candidateId,
    auto_reply: 'OFF', model: 'OFF', config_unchanged: true, route_writes: 0, secret_writes: 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await promote({ call: createTransport(process.env.CLOUDFLARE_API_TOKEN),
    baselineId: process.env.BASELINE_VERSION, candidateId: process.env.CANDIDATE_VERSION, sourceSha: process.env.SOURCE_SHA });
  console.log(JSON.stringify(result));
}
