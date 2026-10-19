import assert from 'node:assert/strict';
import test from 'node:test';
import notify from './deploy-notify.js';
const VERSION = 'e0e9f103-6678-4269-a1cd-7e95314484c0';

test('formats deployment, post-deploy failure and rollback facts', () => {
  assert.match(notify.formatSuccess({worker:'admin-worker', versionId:VERSION, smokeResult:'PASS'}), /Smoke Test:\nPASS/);
  const failure = notify.formatFailure({command:'smoke', deployState:'DEPLOYED', versionId:VERSION});
  assert.match(failure, /Deploy State:\nDEPLOYED/);
  assert.match(failure, new RegExp(VERSION));
  assert.match(notify.formatRollback({newActiveVersion:VERSION}), /New Active Version:/);
});
test('extracts only explicitly labelled complete Wrangler version IDs', () => {
  assert.equal(notify.extractVersionId(`Current Version ID: ${VERSION}`), VERSION);
  assert.equal(notify.extractVersionId(`Version ID: ${VERSION}`), VERSION);
  assert.equal(notify.extractVersionId(`Deployment ID: ${VERSION}`), '');
  assert.equal(notify.extractVersionId('Version ID: abcd'), '');
});
test('registry rejects missing, unknown and workflow-owned Workers', () => {
  assert.equal(notify.getWorkerConfig('admin-worker').config, 'admin-worker/wrangler.toml');
  assert.throws(() => notify.getWorkerConfig('member-api-worker'), /not present/);
  assert.throws(() => notify.getWorkerConfig('unknown'), /Unknown worker/);
  assert.throws(() => notify.getWorkerConfig('payments-worker'), /canonical deploy-payments-worker/);
});
test('preflight requires credentials and rejects preview mode for deployment', () => {
  assert.throws(() => notify.assertNotificationEnvironment({}), /TELEGRAM_BOT_TOKEN/);
  assert.throws(() => notify.assertNotificationEnvironment({DEPLOY_NOTIFY_DRY_RUN:'1'}), /preview-only/);
  notify.assertNotificationEnvironment({TELEGRAM_BOT_TOKEN:'test', TELEGRAM_DEPLOY_CHAT_ID:'test'});
});
test('Telegram sender uses injected transport, bounded timeout and environment credentials', async () => {
  let request;
  await notify.sendTelegram('hello', {TELEGRAM_BOT_TOKEN:'token', TELEGRAM_DEPLOY_CHAT_ID:'chat'}, async (url, options) => {
    request = {url, options};
    return new Response(JSON.stringify({ok:true}));
  });
  assert.equal(request.url, 'https://api.telegram.org/bottoken/sendMessage');
  assert.ok(request.options.signal);
  assert.deepEqual(JSON.parse(request.options.body), {chat_id:'chat',text:'hello',disable_web_page_preview:true});
  await assert.rejects(notify.sendTelegram('hello', {TELEGRAM_BOT_TOKEN:'token', TELEGRAM_DEPLOY_CHAT_ID:'chat'}, async () => new Response('{}', {status:503})), /HTTP 503/);
});
