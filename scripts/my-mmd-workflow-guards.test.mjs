import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Ubuntu hosted runners and macOS include Ruby/Psych; parse YAML without installing packages.
const root = new URL('../', import.meta.url);
const workflows = JSON.parse(execFileSync('ruby', ['-ryaml', '-rjson', '-e', `
  def reject_duplicate_keys(node)
    if node.is_a?(Psych::Nodes::Mapping)
      keys = node.children.each_slice(2).map { |key, _| key.value }
      raise "duplicate YAML key" if keys.uniq.length != keys.length
    end
    (node.children || []).each { |child| reject_duplicate_keys(child) } if node.respond_to?(:children)
  end
  puts JSON.generate(Dir['.github/workflows/*.{yml,yaml}'].map do |path|
    reject_duplicate_keys(YAML.parse(File.read(path)))
    data = YAML.safe_load(File.read(path), permitted_classes: [], permitted_symbols: [], aliases: true)
    data['on'] = data.delete(true) if data.key?(true)
    jobs = (data['jobs'] || {}).transform_values do |j|
      { 'if' => j['if'], 'needs' => j['needs'], 'uses' => j['uses'], 'with' => j['with'], 'environment' => j['environment'],
        'checkouts' => (j['steps'] || []).select { |s| (s['uses'] || '').start_with?('actions/checkout@') }.map { |s| s['with'] },
        'runs' => (j['steps'] || []).map { |s| s['run'] }.compact,
        'matrix' => j.dig('strategy', 'matrix') }
    end
    [File.basename(path), { 'name' => data['name'], 'on' => data['on'], 'permissions' => data['permissions'], 'jobs' => jobs }]
  end.to_h)
`], { cwd: root, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 }));
const protectedJobs = {
  'retire-mmd-redirect-worker-production.yml': 'retire',
  'deploy-member-pages-worker.yml': 'validate-and-deploy',
  'sync-control-room-dashboard-ingress.yml': 'sync-and-smoke',
  'deploy-my-mmd-standby-worker.yml': 'deploy',
  'hype-shop-production-smoke.yml': 'smoke',
  'model-drive-directory-production-smoke.yml': 'smoke',
};
const sha = 'a'.repeat(40);
const approved = { production_approved: true, approval_ref: 'fixture-owner-approval', approved_sha: sha, confirm: 'DEPLOY' };
function allows(expression, event = 'workflow_dispatch', inputs = approved, override = {}) {
  if (expression === false) return false;
  return vm.runInNewContext(expression.replace(/^\s*\$\{\{([\s\S]*)\}\}\s*$/, '$1'), {
    github: { event_name: event, ref: 'refs/heads/main', sha,
      event: { workflow_run: { conclusion: 'success', head_branch: 'main' } }, ...override }, inputs,
  }) === true;
}
for (const [file, id] of Object.entries(protectedJobs)) {
  test(`${file}: only separately approved exact main dispatch can reach production`, () => {
    const workflow = workflows[file], job = workflow.jobs[id], gate = workflow.jobs['production-approval'];
    const controls = workflow.on.workflow_dispatch.inputs;
    assert.equal(controls.production_approved.type, 'boolean');
    assert.equal(controls.production_approved.default, false);
    for (const name of ['production_approved', 'approved_sha', 'approval_ref']) assert.equal(controls[name].required, true);
    assert.equal(controls.approved_sha.type, 'string');
    assert.equal(controls.approval_ref.type, 'string');
    assert.equal(job.environment, 'mmd-production-mutation');
    assert.ok(job.needs.includes('production-approval'));
    assert.equal(gate.uses, './.github/workflows/admin-production-approval.yml');
    assert.deepEqual(gate.with, { approval_ref: '${{ inputs.approval_ref }}', approved_sha: '${{ inputs.approved_sha }}' });
    for (const expression of [job.if, gate.if]) {
      assert.equal(allows(expression), true);
      for (const event of ['push', 'pull_request', 'workflow_run', 'schedule', 'repository_dispatch']) {
        assert.equal(allows(expression, event), false, event);
      }
      for (const inputs of [{}, { ...approved, production_approved: false }, { ...approved, production_approved: 'true' },
        { ...approved, approved_sha: '' }, { ...approved, approved_sha: 'b'.repeat(40) }, { ...approved, approval_ref: '' }]) {
        assert.equal(allows(expression, 'workflow_dispatch', inputs), false);
      }
      assert.equal(allows(expression, 'workflow_dispatch', approved, { ref: 'refs/heads/feature' }), false);
    }
    for (const checkout of job.checkouts) {
      assert.equal(checkout.ref, '${{ github.sha }}'); assert.equal(checkout['persist-credentials'], false);
    }
  });
}
test('Standby keeps its existing confirmation and validation requirements', () => {
  const workflow = workflows['deploy-my-mmd-standby-worker.yml'];
  assert.equal(workflow.on.workflow_dispatch.inputs.confirm.required, true);
  assert.equal(allows(workflow.jobs.deploy.if, 'workflow_dispatch', { ...approved, confirm: '' }), false);
  assert.deepEqual(workflow.jobs.deploy.needs, ['production-approval', 'validate']);
  assert.equal(workflow.jobs.validate.if, null);
});
test('LIFF-start automatic POST/issue smoke stays held with no new dispatch path', () => {
  const workflow = workflows['smoke-my-mmd-liff-start.yml'];
  assert.equal(Object.hasOwn(workflow.on, 'workflow_dispatch'), false);
  for (const event of ['push', 'workflow_run', 'workflow_dispatch']) assert.equal(allows(workflow.jobs.smoke.if, event), false);
});
test('legacy one-shot redirect deployment remains held on every trigger', () => {
  const workflow = workflows['retire-mmd-redirect-worker-once.yml'];
  assert.equal(Object.hasOwn(workflow.on, 'workflow_dispatch'), false);
  assert.equal(workflow.jobs.retire.if, false);
});
test('read-only CI runs runtime regression and guard tests on Node 18/20/22', () => {
  const workflow = workflows['my-mmd-phase456-ci.yml'];
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.deepEqual(workflow.jobs.contracts.matrix.node, [18, 20, 22]);
  assert.ok(workflow.on.pull_request.paths.includes('member-pages-worker/test/member-attention-entrypoint.test.mjs'));
  const safety = workflows['my-mmd-mutation-safety-ci.yml'];
  assert.ok(safety.on.pull_request.paths.includes('.github/workflows/**'));
  assert.ok(safety.on.pull_request.paths.includes('scripts/my-mmd-workflow-guards.test.mjs'));
  assert.ok(workflow.jobs.contracts.runs.some(run => run.includes('member-pages-worker/test/member-attention-entrypoint.test.mjs')));
  assert.ok(safety.jobs.contracts.runs.some(run => run.includes('scripts/my-mmd-workflow-guards.test.mjs')));
});

test('effective merge push and downstream chain cannot reach unreviewed production jobs', () => {
  const changed = ['member-pages-worker/src/runtime-index.js', 'member-pages-worker/test/member-attention-entrypoint.test.mjs',
    'scripts/my-mmd-workflow-guards.test.mjs', '.github/workflows/my-mmd-phase456-ci.yml', '.github/workflows/my-mmd-mutation-safety-ci.yml',
    '.github/workflows/retire-mmd-redirect-worker-once.yml',
    'scripts/admin-workflow-safety.test.mjs', 'shared/phase1-route-owner-lock.test.mjs', 'scripts/redirect-route-retirement-scope.mjs',
    'scripts/redirect-route-retirement-scope.test.mjs', 'scripts/redirect-route-retirement-execution.test.mjs',
    'webflow/member/dashboard/current/footer.html', 'webflow/member/dashboard/member-attention-coupons.test.mjs',
    ...Object.keys(protectedJobs).map(file => '.github/workflows/' + file), '.github/workflows/smoke-my-mmd-liff-start.yml'];
  const matches = (pattern, path) => new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*') + '$').test(path);
  const reached = new Set(), names = new Set();
  for (const [file, workflow] of Object.entries(workflows)) {
    if (!Object.hasOwn(workflow.on || {}, 'push')) continue;
    const push = workflow.on.push || {};
    if (!(push.branches || ['**']).some(p => matches(p, 'main')) || (push['branches-ignore'] || []).some(p => matches(p, 'main'))) continue;
    if (!changed.some(path => (push.paths || ['**']).some(p => matches(p, path)) && !(push['paths-ignore'] || []).some(p => matches(p, path)))) continue;
    reached.add(file); names.add(workflow.name);
  }
  let advanced = true;
  while (advanced) {
    advanced = false;
    for (const [file, workflow] of Object.entries(workflows)) {
      if (reached.has(file) || !(workflow.on?.workflow_run?.workflows || []).some(name => names.has(name))) continue;
      reached.add(file); names.add(workflow.name); advanced = true;
    }
  }
  // These were inspected: fixture/local CI, local dry-runs, or unauthenticated GET-only health/renewal checks.
  const readOnly = new Set(['admin-workflow-safety-ci.yml', 'deploy-member-dashboard-stack.yml', 'kenji-line-transport-health-ci.yml',
    'liff-dashboard-foundation-ci.yml', 'my-mmd-fast-trust-ci.yml', 'node.js.yml', 'posthog-phase0-health-smoke.yml',
    'smoke-member-renewal-production.yml', 'my-mmd-mutation-safety-ci.yml', 'my-mmd-model-payment-contract.yml']);
  assert.ok(reached.has('deploy-member-pages-worker.yml'));
  assert.ok(reached.has('deploy-my-mmd-standby-worker.yml'));
  assert.ok(reached.has('hype-shop-production-smoke.yml'));
  for (const file of reached) {
    if (readOnly.has(file)) continue;
    assert.ok(protectedJobs[file] || file === 'smoke-my-mmd-liff-start.yml' || file === 'retire-mmd-redirect-worker-once.yml',
      'Review newly reachable workflow: ' + file);
    for (const [id, job] of Object.entries(workflows[file].jobs)) {
      if (file === 'deploy-my-mmd-standby-worker.yml' && id === 'validate') continue;
      for (const event of ['push', 'workflow_run', 'pull_request']) assert.equal(allows(job.if, event), false, `${file}:${id}:${event}`);
    }
  }
});

test('cross-app contract workflow has only local tests and no production authority', () => {
  const workflow = workflows['my-mmd-model-payment-contract.yml'];
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  const job = workflow.jobs['cross-app-contract'];
  assert.equal(job.environment, null);
  assert.equal(job.uses, null);
  assert.deepEqual(job.runs, [
    'npm ci --ignore-scripts --no-audit --no-fund',
    'npm run test:my-mmd-model-payment',
    'npm run test:payment-delivery',
    'npm run test:blackcard-member-payment',
  ]);
  for (const checkout of job.checkouts) assert.equal(checkout['persist-credentials'], false);
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  for (const name of ['test:my-mmd-model-payment', 'test:payment-delivery', 'test:blackcard-member-payment']) {
    assert.match(pkg.scripts[name], /^node (?:--experimental-global-webcrypto )?--test [A-Za-z0-9_./ -]+$/);
    for (const hook of ['pre', 'post']) assert.equal(pkg.scripts[hook + name], undefined);
  }
});

test('dedicated safety CI is read-only and independent of the unmerged Admin release PR', () => {
  const safety = workflows['my-mmd-mutation-safety-ci.yml'];
  assert.deepEqual(safety.permissions, { contents: 'read' });
  assert.equal(safety.jobs.contracts.environment, null);
  assert.ok(safety.jobs.contracts.runs.some(run => run.includes('redirect-route-retirement-execution.test.mjs')));
  assert.ok(safety.jobs.contracts.runs.some(run => run.includes('redirect-route-retirement-scope.test.mjs')));
  for (const run of safety.jobs.contracts.runs) assert.doesNotMatch(run, /secrets\.|wrangler|curl |admin-current-session-code-only|admin-production-validation/);
});
