import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { wireMmsApproveUi } from './src/mms-admin-approve-ui.js';
import { wireMmsAdminMobileBundle, MMS_ADMIN_MB_MARKER } from './src/mms-admin-mobile-bundle.js';
import { renderMmsAdminPage } from './src/mms-admin-page.js';

const runtimeSource = readFileSync(new URL('./src/mms-admin-runtime.js', import.meta.url), 'utf8');
const mobileSource = readFileSync(new URL('./src/mms-admin-mobile-bundle.js', import.meta.url), 'utf8');

function rendered() {
  return wireMmsAdminMobileBundle(wireMmsApproveUi(renderMmsAdminPage()));
}

test('MMS Admin MB V1 is served after the approve layer', () => {
  const html = rendered();
  assert.ok(html.includes(MMS_ADMIN_MB_MARKER));
  assert.match(html, /data-mms-admin-mb="v1"/);
  assert.match(html, /MMS · MOBILE BUNDLE V1/);
  assert.match(runtimeSource, /wireMmsAdminMobileBundle\(wireMmsApproveUi\(renderMmsAdminPage\(\)\)\)/);
});

test('MMS Admin MB V1 keeps approval diagnostics intact', () => {
  const html = rendered();
  assert.match(html, /mmsDiagDock/);
  assert.match(html, /ตรวจระบบ MMS/);
  assert.match(html, /mmsApproveDiagnostics/);
  assert.match(html, /Review · Paused · Matching OFF/);
});

test('mobile bundle provides mobile-first operational layers', () => {
  const html = rendered();
  assert.match(html, /mms-mb-topbar/);
  assert.match(html, /mms-mb-rail/);
  assert.match(html, /data-mb-jump/);
  assert.match(html, /pendingApps/);
  assert.match(html, /therCount/);
  assert.match(html, /openPrebookings/);
  assert.match(html, /filter-bar\{position:sticky/);
  assert.match(html, /scroll-snap-type:x mandatory/);
  assert.match(html, /env\(safe-area-inset-top\)/);
  assert.match(html, /env\(safe-area-inset-bottom\)/);
});

test('mobile bundle supports horizontal swipe without hijacking interactive controls', () => {
  const html = rendered();
  assert.match(html, /touchstart/);
  assert.match(html, /touchend/);
  assert.match(html, /Math\.abs\(dx\)<82/);
  assert.match(html, /button,a,input,select,textarea,summary,details/);
  assert.match(html, /move\(dx<0\?1:-1\)/);
});

test('mobile bundle exposes one-tap refresh and production health check', () => {
  const html = rendered();
  assert.match(html, /id="mmsMbRefresh"/);
  assert.match(html, /window\.location\.reload\(\)/);
  assert.match(html, /id="mmsMbHealth"/);
  assert.match(html, /document\.getElementById\('mmsDiagDock'\)/);
});

test('mobile observers watch only source counters and tab state without self-observing generated UI', () => {
  assert.doesNotMatch(mobileSource, /observe\(document\.body/);
  assert.match(mobileSource, /\['pendingApps','therCount','openPrebookings'\]/);
  assert.match(mobileSource, /countObserver\.observe\(source,\{subtree:true,childList:true,characterData:true\}\)/);
  assert.match(mobileSource, /tabObserver\.observe\(source,\{attributes:true,attributeFilter:\['aria-current'\]\}\)/);
  assert.match(mobileSource, /if\(el\.textContent!==next\)el\.textContent=next/);
});

test('mobile bundle respects reduced motion and is idempotent', () => {
  const once = rendered();
  const twice = wireMmsAdminMobileBundle(once);
  assert.equal(twice, once);
  assert.match(once, /prefers-reduced-motion:reduce/);
});
