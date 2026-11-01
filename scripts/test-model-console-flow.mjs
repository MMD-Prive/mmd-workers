import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const tests = [
  'admin-worker/customer-change-resolution.test.mjs',
  'admin-worker/job-orchestrator-owner-ops.test.mjs',
  'admin-worker/model-reconfirm-canonical-source.test.mjs',
  'admin-worker/model-reconfirm-freshness.test.mjs',
  'admin-worker/model-reconfirm-guard.test.mjs',
  'admin-worker/model-reconfirm-runtime.test.mjs',
  'admin-worker/model-session-contract-v1.test.mjs',
  'admin-worker/model-session-runtime-v1a.test.mjs',
  'admin-worker/model-session-action-target.test.mjs',
  'admin-worker/model-customer-payment-read.test.mjs',
  'admin-worker/model-payout-read.test.mjs',
  'admin-worker/model-travel-owner.test.mjs',
  'admin-worker/notification-manual-review.test.mjs',
  'admin-worker/session-completion-flow.test.mjs',
  'admin-worker/session-completion-owner-page.test.mjs',
  'admin-worker/telegram-alert-matrix.test.mjs',
  'events-worker/aftercare-v2.test.mjs',
  'events-worker/owner-aftercare-notification.test.mjs',
  'member-pages-worker/test/signed-confirmation-travel.test.mjs',
  'payments-worker/customer-session-v2.test.mjs',
  'payments-worker/final-payment-flow.test.mjs',
  'shared/model-travel-client.test.mjs',
  'shared/model-travel.test.mjs',
  'shared/model-travel-conversation.test.mjs',
  'shared/model-meeting-client.test.mjs',
  'shared/model-meeting-details.test.mjs',
  'shared/telegram-delivery-once.test.mjs',
  'webflow/aftercare/customer-aftercare-bundle.test.mjs',
  'webflow/aftercare/customer-aftercare-v2.test.mjs',
  'webflow/sigil/confirm/customer-confirmation-travel.test.mjs',
  'webflow/sigil/model/model-console-customer-updates.test.mjs',
  'webflow/sigil/model/model-job-brief.test.mjs',
  'webflow/sigil/model/model-nightline.test.mjs',
  'webflow/sigil/model/model-console-atelier-v3.test.mjs',
  'webflow/sigil/model/my-model-workspace-20261016.test.mjs',
  'scripts/prepare-model-session-flow-release.test.mjs',
  'preview/model-console/runtime-flow.test.mjs',
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = spawnSync(process.execPath,
    [...process.execArgv, '--test', '--test-reporter=spec', ...tests],
    {cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'inherit'});
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
