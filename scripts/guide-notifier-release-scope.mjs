import {execFileSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'});
const before=process.env.BEFORE_SHA,after=process.env.AFTER_SHA;
const allowed=new Set([
  'member-dashboard-chat-worker/src/guide-notification-entry.mjs',
  'member-dashboard-chat-worker/wrangler.toml',
  'member-dashboard-chat-worker/test/public-care-back-front-gate.test.mjs',
  'member-dashboard-chat-worker/test/my-mmd-single-file-shell.test.mjs',
  'member-dashboard-chat-worker/test/my-mmd-lovable-app-front-gate.test.mjs',
  'member-dashboard-chat-worker/src/guide-owner-notifications.mjs',
  'member-dashboard-chat-worker/src/guide-telegram-notify.mjs',
  'member-dashboard-chat-worker/test/guide-owner-notifications.test.mjs',
  'member-dashboard-chat-worker/src/my-mms-customer-front-gate-entry.js',
  'scripts/check-guide-notifier-bundle.mjs',
  'scripts/guide-notifier-release-scope.mjs',
  '.github/workflows/guide-notifier-ci.yml',
  '.github/workflows/deploy-member-dashboard-chat-worker.yml',
]);
let only=false;
if(/^[a-f0-9]{40}$/.test(before||'')&&!/^0+$/.test(before)){
  const files=git('diff','--name-only',before,after).trim().split('\n').filter(Boolean);
  only=files.length>0&&files.every(file=>allowed.has(file))&&files.some(file=>file.includes('guide-'));
  const entry='member-dashboard-chat-worker/src/my-mms-customer-front-gate-entry.js';
  if(only&&files.includes(entry)){
    const strip=text=>text.replace(/^export \{ GuideOwnerNotifications \} from "\.\/guide-owner-notifications\.mjs";\r?\n/m,'');
    only=strip(git('show',before+':'+entry))===strip(git('show',after+':'+entry));
  }
}
const config='member-dashboard-chat-worker/wrangler.toml';
if(only&&git('diff','--name-only',before,after).split('\n').includes(config)){
  const normalize=text=>text.replace(/^main = "src\/(?:my-mms-customer-front-gate-entry\.js|guide-notification-entry\.mjs)"$/m,'main = "APP_ENTRY"');
  only=normalize(git('show',before+':'+config))===normalize(git('show',after+':'+config));
}
appendFileSync(process.env.GITHUB_OUTPUT,'guide_only='+only+'\n');
