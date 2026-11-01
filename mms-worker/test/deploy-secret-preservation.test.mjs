import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { uploadMmsVersion } from '../../scripts/upload-mms-worker-version.mjs';

const workflow = readFileSync(new URL('../../.github/workflows/deploy-mms-worker.yml', import.meta.url), 'utf8');

test('secret rotation and therapist secret initialization require explicit dispatch inputs', () => {
  assert.match(workflow, /rotate_telegram_secret:[\s\S]*?type: boolean[\s\S]*?default: false/);
  assert.match(workflow, /initialize_therapist_auth_secrets:[\s\S]*?type: boolean[\s\S]*?default: false/);
  assert.match(workflow, /name: Rotate MMS-to-Telegram service secret\n\s+if: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.rotate_telegram_secret == true \}\}/);
  assert.match(workflow, /name: Ensure persistent Therapist auth secrets\n\s+id: therapist-secrets\n\s+if: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.initialize_therapist_auth_secrets == true \}\}/);
});

test('ordinary deployment cannot create buckets or write Airtable and LINE values as Worker secrets', () => {
  assert.match(workflow, /npx wrangler r2 bucket info mms-private-uploads/);
  assert.doesNotMatch(workflow, /wrangler r2 bucket create/);
  assert.match(workflow, /name: Prepare optional runtime secrets\n\s+id: runtime-secrets\n\s+if: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.rotate_telegram_secret == true \}\}/);
  assert.match(workflow, /writeFileSync\(path, `AUTH_SERVICE_MMS_TO_TELEGRAM=\$\{routerSecret\}\\n`/);
  assert.doesNotMatch(workflow, /lines\.push\(`(?:AIRTABLE_API_TOKEN|LINE_CHANNEL_SECRET|LINE_CHANNEL_ACCESS_TOKEN)=/);
  assert.match(workflow, /args=\(\)[\s\S]*?if \[ "\$\{\{ steps\.runtime-secrets\.outputs\.configured \}\}" = "true" \]; then[\s\S]*?node \.\.\/scripts\/upload-mms-worker-version\.mjs "\$\{args\[@\]\}"/);
});

test('code-only upload retains vars and does not provide a secrets file', () => {
  const calls = [];
  const result = uploadMmsVersion({
    config: { name: 'mms-worker', migrations: [] },
    tag: 'gha-fixture',
    message: 'fixture',
    run(args) { calls.push(args); return { status: 0, output: 'Worker Version ID: fixture' }; },
  });
  assert.equal(result.migrationApplied, false);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes('--keep-vars'));
  assert.ok(!calls[0].includes('--secrets-file'));
});


test('MMS promotion uses the deployment-only API helper rather than syncing non-versioned settings',()=>{
 const step=workflow.split('      - name: Deploy uploaded mms-worker version')[1].split('      - name:')[0];
 assert.match(step,/node \.\.\/scripts\/deploy-uploaded-worker-version\.mjs mms-worker "\$MMS_WORKER_VERSION_ID"/);
 assert.doesNotMatch(step,/wrangler versions deploy|wrangler deploy|secret|route/);
});

test('only the route-free mms-worker version upload opts into the confirmed migration fallback',()=>{
 const step=workflow.split('      - name: Upload mms-worker version')[1].split('      - name:')[0];
 assert.match(step,/MMS_ALLOW_DURABLE_OBJECT_MIGRATION_DEPLOY: "true"/);
 assert.match(workflow,/config\.name !== "mms-worker"/);
 assert.match(workflow,/custom routes are forbidden in mms-worker/);
});
